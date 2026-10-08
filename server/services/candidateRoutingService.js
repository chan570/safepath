const OSRMService = require('./osrmService');
const envConfig = require('../config/env');
const turf = require('@turf/turf');

/**
 * CandidateRoutingService
 * 
 * Calculates actual driving times for each candidate place by fetching true routes
 * from the Origin -> Place, and Place -> Destination.
 */
class CandidateRoutingService {
  /**
   * Calculates driving routes via each candidate place and computes the additional driving time.
   * @param {Object} originCoords - Origin coordinate object {lat, lon}
   * @param {Object} destCoords - Destination coordinate object {lat, lon}
   * @param {Object} baselineRoute - Baseline route data (must contain durationSeconds and distanceMeters)
   * @param {Array<Object>} candidates - Array of normalized OSM candidate places
   * @returns {Promise<Object>} An object containing arrays of `routable` and `unroutable` candidates.
   */
  static async calculateCandidateRoutes(originCoords, destCoords, baselineRoute, candidates, reqPlace = {}) {
    if (!baselineRoute || typeof baselineRoute.durationSeconds !== 'number' || typeof baselineRoute.distanceMeters !== 'number') {
      throw new Error('Valid baseline route data is required.');
    }

    // Reuse a configurable concurrency limit to prevent unbounded parallel requests.
    const concurrencyLimit = envConfig.maxExternalRequestsPerWorkflow || 5;
    
    // In-memory cache to deduplicate identical route requests during this workflow.
    // Maps coordinate-pair strings to Promises.
    const cache = new Map();

    const getRoute = (startCoord, endCoord) => {
      const key = `${startCoord.lat},${startCoord.lon}->${endCoord.lat},${endCoord.lon}`;
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      const promise = OSRMService.getDrivingRoute([startCoord, endCoord], { includeGeometry: false }).catch(err => {
        return { error: err.message };
      });
      cache.set(key, promise);
      return promise;
    };

    const routable = [];
    const unroutable = [];

    const processBatch = async (batch) => {
      const batchPromises = batch.map(async (candidate) => {
        // 1. Validate coordinates
        if (typeof candidate.lat !== 'number' || typeof candidate.lon !== 'number') {
          return { ...candidate, isRoutable: false, routingStatus: 'Invalid coordinates' };
        }

        const placeCoords = { lat: candidate.lat, lon: candidate.lon };
        
        // 2. Fetch both segments concurrently (utilizing the deduplication cache internally)
        const [route1, route2] = await Promise.all([
          getRoute(originCoords, placeCoords),
          getRoute(placeCoords, destCoords)
        ]);

        // 3. Handle unroutable segments (NoRoute, Timeouts, HTTP errors)
        if (route1.error || route2.error) {
          return {
            ...candidate,
            isRoutable: false,
            routingStatus: `Unroutable: ${route1.error || route2.error}`
          };
        }

        // 4. Exact mathematical calculation of extra time & distance
        const tVia = route1.durationSeconds + route2.durationSeconds;
        const dVia = route1.distanceMeters + route2.distanceMeters;
        const tExtra = tVia - baselineRoute.durationSeconds;

        const result = {
          ...candidate,
          isRoutable: true,
          routingStatus: 'Success',
          originToPlaceDurationSeconds: route1.durationSeconds,
          placeToDestinationDurationSeconds: route2.durationSeconds,
          viaPlaceDurationSeconds: tVia,
          baselineDurationSeconds: baselineRoute.durationSeconds,
          additionalDurationSeconds: tExtra,
          
          originToPlaceDistanceMeters: route1.distanceMeters,
          placeToDestinationDistanceMeters: route2.distanceMeters,
          viaPlaceDistanceMeters: dVia,
          baselineDistanceMeters: baselineRoute.distanceMeters,

          route1Geometry: route1.geometry,
          route2Geometry: route2.geometry
        };

        // 5. Handle routing inconsistencies mathematically, DO NOT silently clamp to 0
        if (tExtra < 0) {
          result.routingStatus = 'Success (Routing Inconsistency: via-place route is faster than baseline)';
        }

        return result;
      });
      
      return Promise.all(batchPromises);
    };

    // Pre-sort candidates by heuristic distance to ensure we slice the MOST RELEVANT ones.
    const pref = reqPlace.proximityPreference || 'route';
    const sortedCandidates = [...candidates].sort((a, b) => {
      const ptA = turf.point([a.lon, a.lat]);
      const ptB = turf.point([b.lon, b.lat]);
      let distA, distB;

      if (pref === 'origin') {
        const targetPt = turf.point([originCoords.lon, originCoords.lat]);
        distA = turf.distance(ptA, targetPt, { units: 'kilometers' });
        distB = turf.distance(ptB, targetPt, { units: 'kilometers' });
      } else if (pref === 'destination') {
        const targetPt = turf.point([destCoords.lon, destCoords.lat]);
        distA = turf.distance(ptA, targetPt, { units: 'kilometers' });
        distB = turf.distance(ptB, targetPt, { units: 'kilometers' });
      } else {
        // default to 'route' (on the way)
        const line = turf.lineString(baselineRoute.geometry.coordinates);
        distA = turf.pointToLineDistance(ptA, line, { units: 'kilometers' });
        distB = turf.pointToLineDistance(ptB, line, { units: 'kilometers' });
      }
      
      return distA - distB;
    });

    let candidatesToProcess = sortedCandidates;
    let limitExceeded = false;
    
    if (sortedCandidates.length > envConfig.maxCandidatesToProcess) {
      candidatesToProcess = sortedCandidates.slice(0, envConfig.maxCandidatesToProcess);
      limitExceeded = true;
    }

    // 6. Execute bounded batches to protect provider endpoints
    for (let i = 0; i < candidatesToProcess.length; i += concurrencyLimit) {
      const batch = candidatesToProcess.slice(i, i + concurrencyLimit);
      const batchResults = await processBatch(batch);
      
      // Categorize results. Excludes unroutable candidates from final eligible results.
      batchResults.forEach(res => {
        if (res.isRoutable) routable.push(res);
        else unroutable.push(res);
      });
    }

    return {
      routableCandidates: routable,
      unroutableCandidates: unroutable,
      limitExceeded
    };
  }
}

module.exports = CandidateRoutingService;
