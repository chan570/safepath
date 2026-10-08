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
  static async calculateCandidateRoutes(originCoords, destCoords, baselineRoute, candidates, reqPlace = {}, metrics = null) {
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
      
      const promise = OSRMService.getDrivingRoute([startCoord, endCoord], { includeGeometry: false, metrics }).catch(err => {
        return { error: err.message };
      });
      cache.set(key, promise);
      return promise;
    };

    const routable = [];
    const unroutable = [];

    // Compute a local heuristic score for pre-ranking before OSRM.
    const computePreScore = (candidate) => {
      let score = 0;
      const tags = candidate.tags || {};
      const searchAlts = candidate.searchAlternatives || [];
      const reqAttrs = candidate.requiredAttributes || [];
      
      if (searchAlts.length > 0) {
        const altMatch = searchAlts.some(alt => tags[alt.key] === alt.value);
        if (altMatch) score += 10;
        else if (searchAlts.some(alt => Object.values(tags).includes(alt.value))) score += 5;
      } else {
        score += 5;
      }

      if (reqAttrs.length > 0) {
        reqAttrs.forEach(attr => {
          if (tags[attr.key] === attr.value) score += 3;
          else if (Object.values(tags).includes(attr.value)) score += 1;
        });
      }
      return score;
    };

    // Pre-sort candidates by heuristic distance and local semantic match to ensure we slice the MOST RELEVANT ones.
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
        const line = turf.lineString(baselineRoute.geometry.coordinates);
        distA = turf.pointToLineDistance(ptA, line, { units: 'kilometers' });
        distB = turf.pointToLineDistance(ptB, line, { units: 'kilometers' });
      }
      
      const scoreA = computePreScore(a);
      const scoreB = computePreScore(b);
      
      // Higher score is better. If scores differ, sort by score descending.
      if (scoreA !== scoreB) {
        return scoreB - scoreA; 
      }
      // Otherwise, sort by distance ascending (lower distance is better)
      return distA - distB;
    });

    let candidatesToProcess = sortedCandidates;
    let limitExceeded = false;
    
    if (sortedCandidates.length > envConfig.maxCandidatesToProcess) {
      candidatesToProcess = sortedCandidates.slice(0, envConfig.maxCandidatesToProcess);
      limitExceeded = true;
    }

    if (metrics) {
      metrics.candidatesSentToOsrm = (metrics.candidatesSentToOsrm || 0) + candidatesToProcess.length;
    }

    const processCandidate = async (candidate) => {
        if (typeof candidate.lat !== 'number' || typeof candidate.lon !== 'number') {
          return { ...candidate, isRoutable: false, routingStatus: 'Invalid coordinates' };
        }

        const placeCoords = { lat: candidate.lat, lon: candidate.lon };
        
        const [route1, route2] = await Promise.all([
          getRoute(originCoords, placeCoords),
          getRoute(placeCoords, destCoords)
        ]);

        if (route1.error || route2.error) {
          return {
            ...candidate,
            isRoutable: false,
            routingStatus: `Unroutable: ${route1.error || route2.error}`
          };
        }

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

        if (tExtra < 0) {
          result.routingStatus = 'Success (Routing Inconsistency: via-place route is faster than baseline)';
        }

        return result;
    };

    const activePromises = new Set();
    const batchResults = [];
    
    // Controlled concurrency instead of strictly sequential batches
    for (const candidate of candidatesToProcess) {
      const p = processCandidate(candidate).then(res => {
        activePromises.delete(p);
        batchResults.push(res);
      });
      activePromises.add(p);
      if (activePromises.size >= concurrencyLimit) {
        await Promise.race(activePromises);
      }
    }
    await Promise.all(activePromises);
    
    batchResults.forEach(res => {
      if (res.isRoutable) routable.push(res);
      else unroutable.push(res);
    });

    return {
      routableCandidates: routable,
      unroutableCandidates: unroutable,
      limitExceeded
    };
  }
}

module.exports = CandidateRoutingService;
