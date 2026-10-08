const OSRMService = require('./osrmService');
const envConfig = require('../config/env');

/**
 * MultiStopItineraryService
 * 
 * Calculates and evaluates complete multi-stop itineraries in a single continuous journey.
 * 
 * Scope Limitation & Selection Strategy:
 * To strictly bound OSRM API requests and prevent combinatorial explosions (e.g. 10x10x10 combinations), 
 * this service assumes candidate places for each category are pre-filtered and pre-ranked. 
 * It constructs and evaluates permutations using only the top 3 candidates per required stop, 
 * strictly enforcing the provided sequential order. It does NOT silently brute-force exhaustively.
 */
class MultiStopItineraryService {
  /**
   * Generates optimal multi-stop itineraries.
   * @param {Object} originCoords - {lat, lon}
   * @param {Object} destCoords - {lat, lon}
   * @param {Object} baselineRoute - Must contain durationSeconds
   * @param {Array<Object>} stopRequirementGroups - Array of { userRequirement: string, candidates: Array }
   * @param {Array<string>} stopOrderRequirements - Raw LLM extracted order constraints
   * @param {Object} globalConstraints - Global prompt constraints (e.g., maxAdditionalDrivingTime)
   */
  static async buildItinerary(originCoords, destCoords, baselineRoute, stopRequirementGroups, stopOrderRequirements, globalConstraints, metrics = null) {
    if (!stopRequirementGroups || stopRequirementGroups.length === 0) {
      return { status: 'error', message: 'No requirements provided for itinerary.' };
    }

    // 1. Enforce Explicit Order Rules or Generate Sequence Permutations
    let sequencePermutations = [stopRequirementGroups]; // Default to user's provided order
    
    if (stopRequirementGroups.length > 1) {
      const needsOrder = !Array.isArray(stopOrderRequirements) || stopOrderRequirements.length === 0;
      if (needsOrder) {
        // If they ask for 4+ stops with no order, that's up to 24+ permutations of sequence, each with 3^4=81 combos (1944 routes).
        // Let's cap unbounded sequencing to 3 stops (6 permutations * 27 combos = 162 routes maximum, usually far fewer due to limits).
        if (stopRequirementGroups.length > 3) {
          return { 
            status: 'clarification_required', 
            ambiguities: ['Multiple stops were requested, but the sequence is ambiguous. Please specify which place to visit first.'] 
          };
        }
        sequencePermutations = this._generateGroupSequencePermutations(stopRequirementGroups);
      }
    }

    // 2. Prevent missing links
    for (const group of stopRequirementGroups) {
      if (!group.candidates || group.candidates.length === 0) {
        return {
          status: 'error',
          message: `No eligible candidates available to satisfy the requested stop.`
        };
      }
    }

    // Heuristic Pre-scoring (matches CandidateRoutingService logic)
    const computePreScore = (candidate) => {
      let score = 0;
      const tags = candidate.tags || {};
      const searchAlts = candidate.searchAlternatives || [];
      const reqAttrs = candidate.requiredAttributes || [];
      if (searchAlts.length > 0) {
        if (searchAlts.some(alt => tags[alt.key] === alt.value)) score += 10;
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

    // 3. Build Permutations (bounded to top 2-3 aggressively scored candidates per stop)
    const maxCandidatesPerGroup = sequencePermutations.length > 1 ? 2 : 3;
    let allCombos = [];
    
    for (const seq of sequencePermutations) {
      // Sort each group's candidates by score and distance to the route, then slice
      const limitedGroups = seq.map(g => {
        const sorted = [...g.candidates].sort((a, b) => {
          const ptA = turf.point([a.lon, a.lat]);
          const ptB = turf.point([b.lon, b.lat]);
          const line = turf.lineString(baselineRoute.geometry.coordinates);
          const distA = turf.pointToLineDistance(ptA, line, { units: 'kilometers' });
          const distB = turf.pointToLineDistance(ptB, line, { units: 'kilometers' });
          const scoreA = computePreScore(a);
          const scoreB = computePreScore(b);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return distA - distB;
        });
        return sorted.slice(0, maxCandidatesPerGroup);
      });
      const combosForSeq = this._generateCartesianProduct(limitedGroups);
      allCombos.push(...combosForSeq);
    }

    const concurrencyLimit = envConfig.maxExternalRequestsPerWorkflow || 5;
    const evaluatedItineraries = [];
    const activePromises = new Set();

    if (metrics) {
      metrics.multiStopCombinationsEvaluated = (metrics.multiStopCombinationsEvaluated || 0) + allCombos.length;
    }

    // 4. Process sliding window concurrency for combos
    const processCombo = async (combo) => {
        // Prevent duplicate physical stops
        const uniqueOsmIds = new Set(combo.map(c => `${c.osmType}-${c.osmId}`));
        if (uniqueOsmIds.size < combo.length) {
          return { isValid: false, reason: 'Duplicate physical stops used.' };
        }

        const routeCoords = [
          originCoords,
          ...combo.map(c => ({ lat: c.lat, lon: c.lon })),
          destCoords
        ];
        
        try {
          const route = await OSRMService.getDrivingRoute(routeCoords, { includeGeometry: false, metrics });
          const tExtra = route.durationSeconds - baselineRoute.durationSeconds;

          if (globalConstraints && globalConstraints.maxAdditionalDrivingTime) {
            const maxExtra = globalConstraints.maxAdditionalDrivingTime;
            let limitSeconds = 0;
            if (maxExtra.unit === 'minutes') limitSeconds = maxExtra.value * 60;
            else if (maxExtra.unit === 'hours') limitSeconds = maxExtra.value * 3600;
            
            if (tExtra > limitSeconds) {
              return { isValid: false, reason: `Exceeds max additional time of ${limitSeconds}s.` };
            }
          }

          return {
            isValid: true,
            orderedStops: combo,
            totalDurationSeconds: route.durationSeconds,
            totalDistanceMeters: route.distanceMeters,
            baselineDurationSeconds: baselineRoute.durationSeconds,
            additionalDurationSeconds: tExtra,
            segmentLegs: route.legs
          };
        } catch (err) {
          return { isValid: false, reason: err.message };
        }
    };

    for (const combo of allCombos) {
      const p = processCombo(combo).then(res => {
        activePromises.delete(p);
        if (res.isValid) evaluatedItineraries.push(res);
      });
      activePromises.add(p);
      if (activePromises.size >= concurrencyLimit) {
        await Promise.race(activePromises);
      }
    }
    await Promise.all(activePromises);

    if (evaluatedItineraries.length === 0) {
      return { status: 'error', message: 'No valid, routable itineraries could be constructed matching all constraints.' };
    }

    // 6. Final Itinerary Ranking (Defaulting to lowest total additional time)
    evaluatedItineraries.sort((a, b) => a.additionalDurationSeconds - b.additionalDurationSeconds);

    const topResults = evaluatedItineraries.slice(0, 3);
    
    // 7. Fetch full geometries only for the best winning results
    await Promise.all(topResults.map(async (itinerary) => {
      const routeCoords = [
        originCoords,
        ...itinerary.orderedStops.map(c => ({ lat: c.lat, lon: c.lon })),
        destCoords
      ];
      try {
        const route = await OSRMService.getDrivingRoute(routeCoords, { includeGeometry: true, metrics });
        itinerary.geometry = route.geometry;
      } catch (err) {
        console.warn('[MultiStopItineraryService] Failed to fetch full geometry:', err.message);
      }
    }));

    return {
      status: 'success',
      bestItinerary: topResults[0],
      alternatives: topResults.slice(1, 3)
    };
  }

  /**
   * Helper to compute cartesian product of arrays.
   */
  static _generateCartesianProduct(arrays, current = [], result = []) {
    if (arrays.length === 0) {
      result.push([...current]);
      return result;
    }
    const [first, ...rest] = arrays;
    for (const item of first) {
      current.push(item);
      this._generateCartesianProduct(rest, current, result);
      current.pop();
    }
    return result;
  }

  /**
   * Helper to generate all sequence permutations of an array.
   */
  static _generateGroupSequencePermutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
      const remainingPermutations = this._generateGroupSequencePermutations(remaining);
      for (let j = 0; j < remainingPermutations.length; j++) {
        result.push([current].concat(remainingPermutations[j]));
      }
    }
    return result;
  }
}

module.exports = MultiStopItineraryService;
