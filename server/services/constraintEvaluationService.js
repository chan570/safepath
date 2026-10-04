/**
 * ConstraintEvaluationService
 * 
 * Independently evaluates hard mandatory constraints for routed candidates. 
 * Separates strict eligibility from preference-based ranking.
 * 
 * Verified Constraints:
 * - Category matching (Verified against canonical category tags)
 * - Maximum additional driving time (Verified strictly against OSRM route output)
 * 
 * Unverifiable Constraints:
 * - Rating thresholds (OpenStreetMap does not reliably supply 1-5 star ratings or review counts, and no external provider is integrated).
 * - Arbitrary natural language constraints (e.g. "indoor swimming pool", "must be vegetarian") which cannot be safely evaluated against basic map tags.
 */
class ConstraintEvaluationService {
  /**
   * Evaluates if a routed candidate satisfies all mandatory constraints.
   * @param {Object} candidate - The routed candidate object (must include additionalDurationSeconds).
   * @param {Object} reqPlace - The specific place request object from the prompt intent.
   * @param {Object} globalConstraints - Global constraints from prompt intent (e.g., maxAdditionalDrivingTime).
   * @returns {Object} { isEligible: boolean, checks: Array }
   */
  static evaluate(candidate, reqPlace, globalConstraints = {}) {
    const checks = [];
    let isEligible = true;

    // 1. Category Matching
    if (reqPlace.category) {
      if (candidate.category === reqPlace.category) {
        checks.push({
          constraint: 'Category Match',
          status: 'passed',
          actualValue: candidate.category,
          reason: 'Candidate matches the requested canonical category.'
        });
      } else {
        checks.push({
          constraint: 'Category Match',
          status: 'failed',
          actualValue: candidate.category,
          reason: `Expected '${reqPlace.category}'.`
        });
        isEligible = false;
      }
    }

    // 2. Maximum Additional Driving Time
    if (globalConstraints.maxAdditionalDrivingTime) {
      const maxExtra = globalConstraints.maxAdditionalDrivingTime;
      let limitSeconds = null;

      if (maxExtra.unit === 'minutes') limitSeconds = maxExtra.value * 60;
      else if (maxExtra.unit === 'hours') limitSeconds = maxExtra.value * 3600;
      else if (maxExtra.unit === 'seconds') limitSeconds = maxExtra.value;

      if (limitSeconds != null) {
        if (typeof candidate.additionalDurationSeconds !== 'number') {
           checks.push({
             constraint: 'Max Additional Time',
             status: 'failed',
             actualValue: null,
             reason: 'Candidate is missing required routing information (additionalDurationSeconds).'
           });
           isEligible = false;
        } else if (candidate.additionalDurationSeconds <= limitSeconds) {
           checks.push({
             constraint: 'Max Additional Time',
             status: 'passed',
             actualValue: candidate.additionalDurationSeconds,
             reason: `Within the strict limit of ${limitSeconds} seconds.`
           });
        } else {
           checks.push({
             constraint: 'Max Additional Time',
             status: 'failed',
             actualValue: candidate.additionalDurationSeconds,
             reason: `Exceeds strict limit of ${limitSeconds} seconds.`
           });
           isEligible = false;
        }
      }
    }

    // 3. Minimum Rating Threshold (Unsupported natively by OSM)
    if (reqPlace.ratingThreshold && reqPlace.ratingThreshold.value != null) {
      checks.push({
        constraint: 'Minimum Rating',
        status: 'unverifiable',
        actualValue: null,
        reason: 'OpenStreetMap does not reliably provide star ratings. No paid trusted rating API is configured to verify this constraint.'
      });
      isEligible = false; // We do NOT silently pass unverifiable mandatory constraints
    }

    // 4. Arbitrary Natural Language Hard Constraints
    if (Array.isArray(reqPlace.hardConstraints) && reqPlace.hardConstraints.length > 0) {
      reqPlace.hardConstraints.forEach(constraintText => {
        checks.push({
          constraint: `Custom Condition: "${constraintText}"`,
          status: 'unverifiable',
          actualValue: JSON.stringify(candidate.tags || {}),
          reason: 'Cannot reliably evaluate arbitrary natural-language constraints against basic OpenStreetMap tags.'
        });
        isEligible = false; // We do NOT silently pass unverifiable mandatory constraints
      });
    }

    return {
      isEligible,
      checks
    };
  }
}

module.exports = ConstraintEvaluationService;
