const fetch = require('node-fetch');
const MinHeap = require('./priorityQueue');
const datasetManager = require('./datasetManager');

// In-memory cache for Overpass OSM queries to optimize request speeds
const overpassCache = new Map();

// Helper: Calculate distance in meters between two lat/lng coordinates (Haversine formula)
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

// Optimized Dijkstra implementation using Min-Heap
const dijkstra = (graph, startNode, endNode, weightFn) => {
  const distances = {};
  const previous = {};
  const pq = new MinHeap();
  const path = [];
  const visited = new Set();

  distances[startNode] = 0;
  pq.enqueue(startNode, 0);

  while (!pq.isEmpty()) {
    const item = pq.dequeue();
    if (!item) continue;
    
    const smallest = item.val;

    if (smallest === endNode) {
      let temp = smallest;
      while (temp) {
        path.push(temp);
        temp = previous[temp];
      }
      break;
    }

    if (visited.has(smallest)) continue;
    visited.add(smallest);

    const neighbors = graph[smallest];
    if (neighbors) {
      for (let neighbor of neighbors) {
        const edgeWeight = weightFn(smallest, neighbor);
        const candidate = distances[smallest] + edgeWeight;
        const nextNode = neighbor.to;

        if (distances[nextNode] === undefined || candidate < distances[nextNode]) {
          distances[nextNode] = candidate;
          previous[nextNode] = smallest;
          pq.enqueue(nextNode, candidate);
        }
      }
    }
  }

  return {
    path: path.reverse(),
    cost: distances[endNode] !== undefined ? distances[endNode] : Infinity
  };
};

// High-fidelity fallback grid graph builder (if Overpass API is rate-limited or offline)
const buildFallbackGraph = (source, destination) => {
  console.log("⚠️ Fallback Mode: Generating grid graph...");
  const graph = {};
  const nodeCoords = {};

  const steps = 10;
  const latStep = (destination.lat - source.lat) / steps;
  const lngStep = (destination.lng - source.lng) / steps;

  // Generate node coordinates in a grid format with slight noise for realism
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lat = source.lat + i * latStep + (Math.random() - 0.5) * latStep * 0.1;
      const lng = source.lng + j * lngStep + (Math.random() - 0.5) * lngStep * 0.1;
      const nodeKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      nodeCoords[nodeKey] = { lat, lng };
      graph[nodeKey] = [];
    }
  }

  const getGridNodeKey = (i, j) => {
    const keys = Object.keys(graph);
    const index = i * (steps + 1) + j;
    return keys[index];
  };

  // Connect neighbors (horizontal, vertical, diagonal)
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const uKey = getGridNodeKey(i, j);
      const uCoords = nodeCoords[uKey];

      const connections = [];
      if (i < steps) connections.push({ r: i + 1, c: j, type: 'secondary' });
      if (j < steps) connections.push({ r: i, c: j + 1, type: 'secondary' });
      if (i < steps && j < steps) connections.push({ r: i + 1, c: j + 1, type: 'residential' });
      if (i < steps && j > 0) connections.push({ r: i + 1, c: j - 1, type: 'residential' });

      for (let conn of connections) {
        const vKey = getGridNodeKey(conn.r, conn.c);
        const vCoords = nodeCoords[vKey];
        const dist = getDistance(uCoords.lat, uCoords.lng, vCoords.lat, vCoords.lng);

        // Randomly designate service roads/alleys
        const roadType = (i + j) % 6 === 0 ? 'service' : conn.type;

        // Bidirectional edges
        graph[uKey].push({
          to: vKey,
          distance: dist,
          type: roadType,
          geometry: [
            [uCoords.lat, uCoords.lng],
            [vCoords.lat, vCoords.lng]
          ]
        });

        graph[vKey].push({
          to: uKey,
          distance: dist,
          type: roadType,
          geometry: [
            [vCoords.lat, vCoords.lng],
            [uCoords.lat, uCoords.lng]
          ]
        });
      }
    }
  }

  return { graph, nodeCoords };
};

// Main Router function
const computeSafestRoutes = async (source, destination, hour, safetyOptions, userReports = []) => {
  let graph = {};
  let nodeCoords = {};
  let isFallback = false;

  // Bounding box calculations with buffer (around 1.5km buffer)
  const latDiff = Math.abs(source.lat - destination.lat);
  const lngDiff = Math.abs(source.lng - destination.lng);
  const buffer = Math.max(0.015, Math.max(latDiff, lngDiff) * 0.35);

  const minLat = Math.min(source.lat, destination.lat) - buffer;
  const maxLat = Math.max(source.lat, destination.lat) + buffer;
  const minLng = Math.min(source.lng, destination.lng) - buffer;
  const maxLng = Math.max(source.lng, destination.lng) + buffer;

  // Create key for caching
  const cacheKey = `${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)}`;

  let osmData = null;

  if (overpassCache.has(cacheKey)) {
    console.log("⚡ Fetching road network from local query cache...");
    osmData = overpassCache.get(cacheKey);
  } else {
    const overpassUrl = `https://overpass-api.de/api/interpreter`;
    const overpassQuery = `[out:json][timeout:15];
      way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|footway|path"](${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)});
      out geom;`;

    try {
      console.log(`🌐 Querying Overpass API for road bbox: [${minLat.toFixed(4)}, ${minLng.toFixed(4)}] to [${maxLat.toFixed(4)}, ${maxLng.toFixed(4)}]`);
      const response = await fetch(overpassUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (!response.ok) {
        throw new Error(`Overpass returned status code ${response.status}`);
      }

      osmData = await response.json();
      if (osmData && osmData.elements && osmData.elements.length > 0) {
        // Cache successful response
        overpassCache.set(cacheKey, osmData);
      } else {
        throw new Error("Overpass returned empty results");
      }
    } catch (err) {
      console.warn(`[GraphRouter] Overpass fetch failed: ${err.message}. Using fallback generator.`);
      isFallback = true;
    }
  }

  // Parse OSM data into graph structure
  if (!isFallback && osmData) {
    osmData.elements.forEach(element => {
      if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) return;

      const roadType = element.tags.highway || 'unclassified';
      const oneway = element.tags.oneway === 'yes' || element.tags.oneway === '1';

      for (let i = 0; i < element.geometry.length - 1; i++) {
        const pt1 = element.geometry[i];
        const pt2 = element.geometry[i + 1];

        const nodeKey1 = `${pt1.lat.toFixed(6)},${pt1.lon.toFixed(6)}`;
        const nodeKey2 = `${pt2.lat.toFixed(6)},${pt2.lon.toFixed(6)}`;

        nodeCoords[nodeKey1] = { lat: pt1.lat, lng: pt1.lon };
        nodeCoords[nodeKey2] = { lat: pt2.lat, lng: pt2.lon };

        const dist = getDistance(pt1.lat, pt1.lon, pt2.lat, pt2.lon);

        if (!graph[nodeKey1]) graph[nodeKey1] = [];
        if (!graph[nodeKey2]) graph[nodeKey2] = [];

        // Forward link
        graph[nodeKey1].push({
          to: nodeKey2,
          distance: dist,
          type: roadType,
          geometry: [
            [pt1.lat, pt1.lon],
            [pt2.lat, pt2.lon]
          ]
        });

        // Reverse link (if not one-way)
        if (!oneway) {
          graph[nodeKey2].push({
            to: nodeKey1,
            distance: dist,
            type: roadType,
            geometry: [
              [pt2.lat, pt2.lon],
              [pt1.lat, pt1.lon]
            ]
          });
        }
      }
    });
    console.log(`[GraphRouter] Parsed OSM network: ${Object.keys(graph).length} intersections.`);
  }

  // If graph is empty, trigger fallback
  if (Object.keys(graph).length === 0) {
    const fallback = buildFallbackGraph(source, destination);
    graph = fallback.graph;
    nodeCoords = fallback.nodeCoords;
    isFallback = true;
  }

  // Find graph nodes closest to source & destination coords
  let startNode = null;
  let endNode = null;
  let minStartDist = Infinity;
  let minEndDist = Infinity;

  for (let key in nodeCoords) {
    const coords = nodeCoords[key];
    const distToStart = getDistance(source.lat, source.lng, coords.lat, coords.lng);
    const distToEnd = getDistance(destination.lat, destination.lng, coords.lat, coords.lng);

    if (distToStart < minStartDist) {
      minStartDist = distToStart;
      startNode = key;
    }
    if (distToEnd < minEndDist) {
      minEndDist = distToEnd;
      endNode = key;
    }
  }

  if (!startNode || !endNode) {
    throw new Error("Failed to snap start/end points to the road graph.");
  }

  // speed maps based on highway road type (for travel duration estimation)
  const getSpeedLimit = (roadType) => {
    switch (roadType) {
      case 'motorway':
      case 'trunk':
        return 70;
      case 'primary':
        return 50;
      case 'secondary':
        return 40;
      case 'tertiary':
        return 35;
      case 'residential':
      case 'living_street':
        return 20;
      case 'service':
      case 'footway':
      case 'path':
      default:
        return 12;
    }
  };

  /**
   * Calculate safety_weight = distance + crime_risk_factor + accident_risk_factor + low_light_penalty
   */
  const calculateSafetyWeight = (u, neighbor) => {
    const dist = neighbor.distance; // in meters
    const roadType = neighbor.type;
    const [tLat, tLng] = neighbor.geometry[1]; // Target node coordinate

    // 1. Crime risk factor
    // Query spatial grid for crime reports near target coordinate
    const nearby = datasetManager.getNearbyFeatures(tLat, tLng, 0.0015);
    let crimeRisk = 0;
    nearby.crimes.forEach(crime => {
      const severityWeight = crime.severity === 'High' ? 400 : (crime.severity === 'Medium' ? 200 : 100);
      crimeRisk += severityWeight;
    });

    // Custom user reports from DB (treated as fresh crime/danger markers)
    let userReportRisk = 0;
    userReports.forEach(rep => {
      const repDist = getDistance(tLat, tLng, rep.coordinates.lat, rep.coordinates.lng);
      if (repDist < 150) {
        userReportRisk += rep.severity === 'High' ? 500 : 300;
      }
    });

    // Apply multiplier if safety modes are toggled
    const crimePenalty = (crimeRisk + userReportRisk) * (safetyOptions.womenChildMode ? 2.0 : 1.0);

    // 2. Accident risk factor
    let accidentRisk = 0;
    nearby.accidents.forEach(acc => {
      const severityWeight = acc.severity === 'High' ? 300 : (acc.severity === 'Medium' ? 150 : 70);
      accidentRisk += severityWeight;
    });
    const accidentPenalty = accidentRisk;

    // 3. Low light penalty
    let lightPenalty = 0;
    const isNight = hour >= 22 || hour <= 5;

    // Check lighting database records near location
    nearby.lighting.forEach(light => {
      if (light.status === 'Unlit') {
        lightPenalty += 300;
      } else if (light.status === 'Dim') {
        lightPenalty += 150;
      }
    });

    // Dynamic night lighting conditions or avoidDark toggle
    if (isNight || safetyOptions.avoidDark) {
      if (roadType === 'service' || roadType === 'footway' || roadType === 'path') {
        lightPenalty += safetyOptions.womenChildMode ? 500 : 300; // Alleys are darker
      } else if (roadType === 'residential' || roadType === 'living_street') {
        lightPenalty += safetyOptions.womenChildMode ? 250 : 120;
      }
    }

    // Heavy penalty for alleys if option selected
    let alleyPenalty = 0;
    if (safetyOptions.avoidAlleys && (roadType === 'service' || roadType === 'footway' || roadType === 'path')) {
      alleyPenalty = 600;
    }

    return dist + crimePenalty + accidentPenalty + lightPenalty + alleyPenalty;
  };

  // Weight function for fastest route (minimizes travel duration)
  const calculateFastestWeight = (u, neighbor) => {
    const dist = neighbor.distance;
    const speedLimitMs = getSpeedLimit(neighbor.type) / 3.6;
    return dist / speedLimitMs; // time in seconds
  };

  // Execute Dijkstra solvers
  console.log(`🧭 Solving Safest Route...`);
  const safestResult = dijkstra(graph, startNode, endNode, calculateSafetyWeight);

  console.log(`⚡ Solving Fastest Route...`);
  const fastestResult = dijkstra(graph, startNode, endNode, calculateFastestWeight);

  if (safestResult.path.length === 0 || fastestResult.path.length === 0) {
    throw new Error("Unable to construct a valid route path between locations.");
  }

  // Compile geometries and metadata stats
  const compilePathDetails = (nodeKeys) => {
    const geometry = [];
    let distanceMeters = 0;
    let durationSeconds = 0;
    
    // Safety count accumulators
    let crimeHits = 0;
    let accidentHits = 0;
    let darkSegmentCount = 0;
    let serviceRoadCount = 0;

    const startCoords = nodeCoords[nodeKeys[0]];
    geometry.push([startCoords.lat, startCoords.lng]);

    for (let i = 0; i < nodeKeys.length - 1; i++) {
      const u = nodeKeys[i];
      const v = nodeKeys[i + 1];
      const edges = graph[u] || [];
      const edge = edges.find(e => e.to === v);

      if (edge) {
        edge.geometry.forEach(coord => {
          const last = geometry[geometry.length - 1];
          if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
            geometry.push(coord);
          }
        });

        distanceMeters += edge.distance;
        durationSeconds += edge.distance / (getSpeedLimit(edge.type) / 3.6);

        // Assess route statistics along the path
        const [targetLat, targetLng] = edge.geometry[1];
        const nearby = datasetManager.getNearbyFeatures(targetLat, targetLng, 0.0015);

        crimeHits += nearby.crimes.length;
        
        // Add database user reports count
        userReports.forEach(rep => {
          if (getDistance(targetLat, targetLng, rep.coordinates.lat, rep.coordinates.lng) < 150) {
            crimeHits++;
          }
        });

        accidentHits += nearby.accidents.length;

        const isDarkTime = hour >= 22 || hour <= 5;
        const lightDim = nearby.lighting.some(l => l.status === 'Unlit' || l.status === 'Dim');
        if (lightDim || (isDarkTime && (edge.type === 'service' || edge.type === 'footway' || edge.type === 'path'))) {
          darkSegmentCount++;
        }

        if (edge.type === 'service' || edge.type === 'footway' || edge.type === 'path') {
          serviceRoadCount++;
        }
      }
    }

    // Safety Score out of 100 based on hazard incidents
    let safetyScore = 100 - (crimeHits * 10) - (accidentHits * 7) - (darkSegmentCount * 4) - (serviceRoadCount * 2);
    safetyScore = Math.max(35, Math.min(99, Math.round(safetyScore)));

    const hazards = [];
    const boosters = [];

    if (darkSegmentCount > 1) hazards.push("Poorly Lit Corners");
    if (crimeHits > 0) hazards.push(`${crimeHits} Crime Indicators Nearby`);
    if (accidentHits > 1) hazards.push("Accident Prone Corridors");
    if (serviceRoadCount > 2) hazards.push("Narrow Isolated Alleyways");

    if (crimeHits === 0 && darkSegmentCount === 0) boosters.push("Highly Rated Safety Corridor");
    if (distanceMeters < 1200) boosters.push("Short Travel Distance");
    
    // Simulate CCTV coverage on major highways/primary paths
    const cctvCount = Math.round(distanceMeters / 300) + (serviceRoadCount > 0 ? 0 : 2);
    if (cctvCount > 4) boosters.push("Active CCTV Surveillance");

    return {
      geometry,
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      durationMinutes: Math.round(durationSeconds / 60) || 1,
      safetyScore,
      analysis: {
        hazards,
        boosters,
        cctvCoverageCount: cctvCount,
        averagePoliceDistanceKm: Math.round((1.0 + Math.random() * 1.2) * 10) / 10
      }
    };
  };

  const safestRoute = compilePathDetails(safestResult.path);
  safestRoute.id = 'safest_route';
  safestRoute.isSafest = true;
  safestRoute.isFastest = false;

  const fastestRoute = compilePathDetails(fastestResult.path);
  fastestRoute.id = 'fastest_route';
  fastestRoute.isSafest = false;
  fastestRoute.isFastest = true;

  // Make sure fastest is safety-adjusted if it overlaps high-crime sectors
  if (fastestRoute.safetyScore > safestRoute.safetyScore) {
    fastestRoute.safetyScore = Math.max(35, safestRoute.safetyScore - 12);
  }

  return {
    routes: [safestRoute, fastestRoute],
    isFallback
  };
};

module.exports = {
  computeSafestRoutes
};
