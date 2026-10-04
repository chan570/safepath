const ConstraintEvaluationService = require('./constraintEvaluationService');

/**
 * CandidateRankingService
 * 
 * Final phase of candidate selection.
 * Enforces hard constraints, filters ineligible candidates, and applies deterministic
 * ranking based on strict data values (not arbitrary score weights).
 */
class CandidateRankingService {
  /**
   * Ranks candidates deterministically and formats the final result.
   * @param {Array<Object>} candidates - List of routed candidates (routable and unroutable).
   * @param {Object} reqPlace - The parsed LLM request constraints for this place.
   * @param {Object} globalConstraints - Global constraints from the LLM prompt (max extra time).
   * @param {Object} searchContext - Metadata from earlier steps (corridor width, raw counts).
   * @returns {Object} { metadata, results } up to 3 best candidates.
   */
  static rankCandidates(candidates, reqPlace, globalConstraints, searchContext) {
    const rawDiscovered = searchContext.rawCandidatesDiscovered || candidates.length;
    const successfullyRouted = candidates.filter(c => c.isRoutable);
    
    const eligible = [];
    let rejectedCount = 0;
    const unsupportedAttributes = new Set();

    // 1. Mandatory Hard-Constraint Filtering
    successfullyRouted.forEach(c => {
      const evaluation = ConstraintEvaluationService.evaluate(c, reqPlace, globalConstraints);
      
      if (evaluation.isEligible) {
        eligible.push(c);
      } else {
        rejectedCount++;
        // Collect unsupported reasons for metadata transparency
        evaluation.checks
          .filter(chk => chk.status === 'unverifiable')
          .forEach(chk => unsupportedAttributes.add(chk.reason));
      }
    });

    // 2. Ranking Preference Determination
    let rankingCriterion = 'Proximity to Origin (Default)';
    if (reqPlace.proximityPreference === 'destination') {
      rankingCriterion = 'Proximity to Destination';
    } else if (reqPlace.proximityPreference === 'any') {
      rankingCriterion = 'Ascending additional driving time';
    }

    if (Array.isArray(reqPlace.softPreferences) && reqPlace.softPreferences.length > 0) {
      const prefText = reqPlace.softPreferences.join(' ').toLowerCase();
      
      if (prefText.includes('time') || prefText.includes('least') || prefText.includes('fastest')) {
        rankingCriterion += ' + Ascending additional driving time (User Requested)';
      } else if (prefText.includes('rating') || prefText.includes('best') || prefText.includes('highest')) {
        unsupportedAttributes.add('Preference based on subjective ratings is unsupported. Falling back to default ranking.');
      } else {
        unsupportedAttributes.add(`Preference '${reqPlace.softPreferences[0]}' is ambiguous or unsupported. Falling back to default ranking.`);
      }
    }

    // 3. Deterministic Tie-Breaking & Sorting
    // Primary: Proximity to origin, destination, or minimal extra time based on preference
    // Secondary: Lowest extra driving time
    // Tertiary: Lowest total via-place distance
    // Quaternary: Lexicographical sort on stable OSM ID
    eligible.sort((a, b) => {
      // 1. Proximity Preference
      const pref = reqPlace.proximityPreference || 'origin';
      if (pref === 'origin') {
        if (a.originToPlaceDurationSeconds !== b.originToPlaceDurationSeconds) {
          return a.originToPlaceDurationSeconds - b.originToPlaceDurationSeconds;
        }
      } else if (pref === 'destination') {
        if (a.placeToDestinationDurationSeconds !== b.placeToDestinationDurationSeconds) {
          return a.placeToDestinationDurationSeconds - b.placeToDestinationDurationSeconds;
        }
      }
      
      // 2. Additional Time
      if (a.additionalDurationSeconds !== b.additionalDurationSeconds) {
        return a.additionalDurationSeconds - b.additionalDurationSeconds;
      }
      
      // 3. Total Via Distance
      if (a.viaPlaceDistanceMeters !== b.viaPlaceDistanceMeters) {
        return a.viaPlaceDistanceMeters - b.viaPlaceDistanceMeters;
      }
      
      // 4. Stable Identifier (guarantees absolutely deterministic lists on duplicate data)
      const idA = `${a.osmType}-${a.osmId}`;
      const idB = `${b.osmType}-${b.osmId}`;
      return idA.localeCompare(idB);
    });

    // 4. Bounded Delivery
    // Never fabricate extra results to fill three slots.
    const finalResults = eligible.slice(0, 3);

    return {
      metadata: {
        disclaimer: "These are the best eligible candidates found within the searched corridor under the available data and routing results. The routing backend calculates estimated driving times (by car) and is not strictly real-time traffic aware. No external rating providers are utilized.",
        searchCorridorUsedMeters: searchContext.searchCorridorUsedMeters || null,
        rawCandidatesDiscovered: rawDiscovered,
        candidatesSuccessfullyRouted: successfullyRouted.length,
        candidatesRejectedByHardConstraints: rejectedCount,
        eligibleCandidatesReturned: finalResults.length,
        rankingCriterion,
        unsupportedAttributes: Array.from(unsupportedAttributes)
      },
      results: finalResults
    };
  }
}

module.exports = CandidateRankingService;
