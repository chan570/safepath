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

    const routableCandidates = [];
    const unroutableCandidates = [];

    if (candidatesToProcess.length === 0) {
      return { routableCandidates, unroutableCandidates, limitExceeded };
    }

    const candidateCoords = candidatesToProcess.map(c => ({ lat: c.lat, lon: c.lon }));
    let tableSuccess = false;
    let tableDurations = [];
    let tableDistances = [];

    try {
      const tTableStart = Date.now();
      const sources = [originCoords, ...candidateCoords];
      const destinations = [...candidateCoords, destCoords];
      
      const tableData = await OSRMService.getTable(sources, destinations, { metrics });
      tableDurations = tableData.durations;
      tableDistances = tableData.distances;
      tableSuccess = true;
      if (metrics) metrics.tOsrmTableMs = (metrics.tOsrmTableMs || 0) + (Date.now() - tTableStart);
    } catch (err) {
      console.warn(`[CandidateRoutingService] Table API failed, falling back to individual route requests: ${err.message}`);
    }

    if (tableSuccess) {
      candidatesToProcess.forEach((candidate, idx) => {
        if (typeof candidate.lat !== 'number' || typeof candidate.lon !== 'number') {
          unroutableCandidates.push({ ...candidate, isRoutable: false, routingStatus: 'Invalid coordinates' });
          return;
        }

        const sourceOriginIdx = 0;
        const destCandIdx = idx;
        const sourceCandIdx = idx + 1;
        const destDestIdx = candidateCoords.length;

        const dur1 = tableDurations[sourceOriginIdx]?.[destCandIdx];
        const dist1 = tableDistances[sourceOriginIdx]?.[destCandIdx];
        const dur2 = tableDurations[sourceCandIdx]?.[destDestIdx];
        const dist2 = tableDistances[sourceCandIdx]?.[destDestIdx];

        if (dur1 == null || dist1 == null || dur2 == null || dist2 == null) {
          unroutableCandidates.push({ ...candidate, isRoutable: false, routingStatus: 'Unroutable: No valid table duration' });
          return;
        }

        const tVia = dur1 + dur2;
        const dVia = dist1 + dist2;
        const tExtra = tVia - baselineRoute.durationSeconds;

        routableCandidates.push({
          ...candidate,
          isRoutable: true,
          routingStatus: tExtra < 0 ? 'Success (Routing Inconsistency)' : 'Success',
          originToPlaceDurationSeconds: dur1,
          placeToDestinationDurationSeconds: dur2,
          viaPlaceDurationSeconds: tVia,
          baselineDurationSeconds: baselineRoute.durationSeconds,
          additionalDurationSeconds: tExtra,
          originToPlaceDistanceMeters: dist1,
          placeToDestinationDistanceMeters: dist2,
          viaPlaceDistanceMeters: dVia,
          baselineDistanceMeters: baselineRoute.distanceMeters
        });
      });
    } else {
      // Fallback: Individual requests (Origin -> Candidate -> Dest)
      const tRouteStart = Date.now();
      const processCandidate = async (candidate) => {
          if (typeof candidate.lat !== 'number' || typeof candidate.lon !== 'number') {
            return { ...candidate, isRoutable: false, routingStatus: 'Invalid coordinates' };
          }
          const placeCoords = { lat: candidate.lat, lon: candidate.lon };
          
          try {
            const route = await OSRMService.getDrivingRoute([originCoords, placeCoords, destCoords], { includeGeometry: false, metrics });
            if (!route.legs || route.legs.length < 2) {
              return { ...candidate, isRoutable: false, routingStatus: 'Unroutable: Legs missing' };
            }
            const leg1 = route.legs[0];
            const leg2 = route.legs.slice(1).reduce((acc, l) => ({ 
              durationSeconds: acc.durationSeconds + l.durationSeconds, 
              distanceMeters: acc.distanceMeters + l.distanceMeters 
            }), { durationSeconds: 0, distanceMeters: 0 });

            const tVia = route.durationSeconds;
            const dVia = route.distanceMeters;
            const tExtra = tVia - baselineRoute.durationSeconds;

            return {
              ...candidate,
              isRoutable: true,
              routingStatus: tExtra < 0 ? 'Success (Routing Inconsistency)' : 'Success',
              originToPlaceDurationSeconds: leg1.durationSeconds,
              placeToDestinationDurationSeconds: leg2.durationSeconds,
              viaPlaceDurationSeconds: tVia,
              baselineDurationSeconds: baselineRoute.durationSeconds,
              additionalDurationSeconds: tExtra,
              originToPlaceDistanceMeters: leg1.distanceMeters,
              placeToDestinationDistanceMeters: leg2.distanceMeters,
              viaPlaceDistanceMeters: dVia,
              baselineDistanceMeters: baselineRoute.distanceMeters
            };
          } catch (err) {
            return { ...candidate, isRoutable: false, routingStatus: `Unroutable: ${err.message}` };
          }
      };

      const activePromises = new Set();
      const batchResults = [];
      const concurrencyLimit = envConfig.maxExternalRequestsPerWorkflow || 5;

      for (const candidate of candidatesToProcess) {
        const p = processCandidate(candidate).then(res => {
          activePromises.delete(p);
          batchResults.push(res);
        });
        activePromises.add(p);
        if (activePromises.size >= concurrencyLimit) await Promise.race(activePromises);
      }
      await Promise.all(activePromises);
      
      if (metrics) metrics.tOsrmRouteMs = (metrics.tOsrmRouteMs || 0) + (Date.now() - tRouteStart);

      for (const res of batchResults) {
        if (res.isRoutable) routableCandidates.push(res);
        else unroutableCandidates.push(res);
      }
    }

    return { routableCandidates, unroutableCandidates, limitExceeded };
  }
}

module.exports = CandidateRoutingService;
