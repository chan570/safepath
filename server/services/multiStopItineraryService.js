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
   * @param {Array<Object>} orderedCategoryGroups - Array of { category: string, candidates: Array }
   * @param {Array<string>} stopOrderRequirements - Raw LLM extracted order constraints
   * @param {Object} globalConstraints - Global prompt constraints (e.g., maxAdditionalDrivingTime)
   */
  static async buildItinerary(originCoords, destCoords, baselineRoute, orderedCategoryGroups, stopOrderRequirements, globalConstraints) {
    if (!orderedCategoryGroups || orderedCategoryGroups.length === 0) {
      return { status: 'error', message: 'No categories provided for itinerary.' };
    }

    // 1. Enforce Explicit Order Rules
    if (orderedCategoryGroups.length > 1) {
      if (!Array.isArray(stopOrderRequirements) || stopOrderRequirements.length === 0) {
        return { 
          status: 'clarification_required', 
          ambiguities: ['Multiple stops were requested, but the sequence is ambiguous. Please specify which place to visit first.'] 
        };
      }
    }

    // 2. Prevent missing links
    for (const group of orderedCategoryGroups) {
      if (!group.candidates || group.candidates.length === 0) {
        return {
          status: 'error',
          message: `No eligible candidates available to satisfy the '${group.category}' stop.`
        };
      }
    }

    // 3. Build Permutations (bounded to top 3 candidates per stop to respect API limits)
    const limitedGroups = orderedCategoryGroups.map(g => g.candidates.slice(0, 3));
    const permutations = this._generatePermutations(limitedGroups);

    const concurrencyLimit = envConfig.maxExternalRequestsPerWorkflow || 5;
    const evaluatedItineraries = [];

    // 4. Batch route the complete sequence for each permutation
    for (let i = 0; i < permutations.length; i += concurrencyLimit) {
      const batch = permutations.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (combo) => {
        // Prevent duplicate physical stops (e.g. using a location that is both a gas station and a store twice)
        const uniqueOsmIds = new Set(combo.map(c => `${c.osmType}-${c.osmId}`));
        if (uniqueOsmIds.size < combo.length) {
          return { isValid: false, reason: 'Duplicate physical stops used.' };
        }

        const routeCoords = [
          originCoords,
          ...combo.map(c => ({ lat: c.lat, lon: c.lon })),
          destCoords
        ];
        
        let route;
        try {
          // OSRM automatically sums segments and returns legs between coordinates
          route = await OSRMService.getDrivingRoute(routeCoords);
        } catch (err) {
          return { isValid: false, reason: `Unroutable: ${err.message}` };
        }

        const tExtra = route.durationSeconds - baselineRoute.durationSeconds;
        
        // 5. Evaluate Multi-stop Mandatory Constraints (Global Time Limit)
        if (globalConstraints && globalConstraints.maxAdditionalDrivingTime) {
          const maxExtra = globalConstraints.maxAdditionalDrivingTime;
          let limitSeconds = 0;
          if (maxExtra.unit === 'minutes') limitSeconds = maxExtra.value * 60;
          else if (maxExtra.unit === 'hours') limitSeconds = maxExtra.value * 3600;
          
          if (tExtra > limitSeconds) {
            return { isValid: false, reason: `Itinerary exceeds maximum additional driving time of ${limitSeconds}s.` };
          }
        }

        return {
          isValid: true,
          orderedStops: combo,
          totalDurationSeconds: route.durationSeconds,
          totalDistanceMeters: route.distanceMeters,
          baselineDurationSeconds: baselineRoute.durationSeconds,
          additionalDurationSeconds: tExtra,
          segmentLegs: route.legs // Granular per-segment data
        };
      });

      const results = await Promise.all(batchPromises);
      evaluatedItineraries.push(...results.filter(r => r.isValid));
    }

    if (evaluatedItineraries.length === 0) {
      return { status: 'error', message: 'No valid, routable itineraries could be constructed matching all constraints.' };
    }

    // 6. Final Itinerary Ranking (Defaulting to lowest total additional time)
    evaluatedItineraries.sort((a, b) => a.additionalDurationSeconds - b.additionalDurationSeconds);

    return {
      status: 'success',
      bestItinerary: evaluatedItineraries[0],
      alternatives: evaluatedItineraries.slice(1, 3)
    };
  }

  /**
   * Helper to compute cartesian product permutations recursively.
   */
  static _generatePermutations(arrays, current = [], result = []) {
    if (arrays.length === 0) {
      result.push([...current]);
      return result;
    }
    const [first, ...rest] = arrays;
    for (const item of first) {
      current.push(item);
      this._generatePermutations(rest, current, result);
      current.pop();
    }
    return result;
  }
}

module.exports = MultiStopItineraryService;
