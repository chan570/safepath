const ConstraintEvaluationService = require('./constraintEvaluationService');

/**
 * CandidateRankingService
 * 
 * Final phase of candidate selection.
 * Enforces hard constraints, filters ineligible candidates, and applies deterministic
 * ranking based on strict data values and actual route costs.
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

    // 1. Mandatory Hard-Constraint Filtering & Scoring
    successfullyRouted.forEach(c => {
      const evaluation = ConstraintEvaluationService.evaluate(c, reqPlace, globalConstraints);
      
      if (evaluation.isEligible) {
        c.requirementMatchScore = evaluation.requirementMatchScore;
        eligible.push(c);
      } else {
        rejectedCount++;
      }
      
      // Collect unsupported reasons for metadata transparency
      evaluation.checks
        .filter(chk => chk.status === 'unverifiable' || chk.status === 'unsupported')
        .forEach(chk => unsupportedAttributes.add(chk.reason));
    });

    // 2. Ranking Preference Determination
    let rankingCriterion = 'Requirement Match Score -> Minimal Detour (Default)';
    
    // Parse structured soft preferences
    let prefersMinTime = false;
    let prefersMinDist = false;
    
    if (Array.isArray(reqPlace.softPreferences)) {
      reqPlace.softPreferences.forEach(pref => {
        if (pref.type === 'minimize_additional_driving_time') prefersMinTime = true;
        if (pref.type === 'minimize_distance') prefersMinDist = true;
        
        if (pref.type !== 'minimize_additional_driving_time' && pref.type !== 'minimize_distance') {
          unsupportedAttributes.add(`Preference '${pref.type}' is unsupported. Falling back to default ranking.`);
        }
      });
    }

    if (prefersMinTime) rankingCriterion = 'Requirement Match Score -> Minimize Additional Driving Time';
    if (prefersMinDist) rankingCriterion = 'Requirement Match Score -> Minimize Total Route Distance';

    // 3. Deterministic Tie-Breaking & Sorting
    eligible.sort((a, b) => {
      // 1. Requirement Match Score (Higher is better)
      if (a.requirementMatchScore !== b.requirementMatchScore) {
        return b.requirementMatchScore - a.requirementMatchScore; // DESC
      }

      // 2. Soft Preferences or "On the way" Default (Minimize detour)
      if (prefersMinDist) {
        if (a.viaPlaceDistanceMeters !== b.viaPlaceDistanceMeters) {
          return a.viaPlaceDistanceMeters - b.viaPlaceDistanceMeters;
        }
      } else if (prefersMinTime || reqPlace.proximityPreference === 'on_the_way' || !reqPlace.proximityPreference) {
        if (a.additionalDurationSeconds !== b.additionalDurationSeconds) {
          return a.additionalDurationSeconds - b.additionalDurationSeconds;
        }
      } else if (reqPlace.proximityPreference === 'origin') {
        if (a.originToPlaceDurationSeconds !== b.originToPlaceDurationSeconds) {
          return a.originToPlaceDurationSeconds - b.originToPlaceDurationSeconds;
        }
      } else if (reqPlace.proximityPreference === 'destination') {
        if (a.placeToDestinationDurationSeconds !== b.placeToDestinationDurationSeconds) {
          return a.placeToDestinationDurationSeconds - b.placeToDestinationDurationSeconds;
        }
      }
      
      // 3. Fallback to Total Via Distance
      if (a.viaPlaceDistanceMeters !== b.viaPlaceDistanceMeters) {
        return a.viaPlaceDistanceMeters - b.viaPlaceDistanceMeters;
      }
      
      // 4. Stable Identifier
      const idA = `${a.osmType}-${a.osmId}`;
      const idB = `${b.osmType}-${b.osmId}`;
      return idA.localeCompare(idB);
    });

    const finalResults = eligible.slice(0, 3);

    return {
      metadata: {
        disclaimer: "These are the best eligible candidates found. The routing backend calculates estimated driving times (by car) and is not strictly real-time traffic aware. OSM is the source of truth.",
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
