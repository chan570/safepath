/**
 * ConstraintEvaluationService
 * 
 * Independently evaluates hard mandatory constraints for routed candidates. 
 * Separates strict eligibility from preference-based ranking.
 */
class ConstraintEvaluationService {
  /**
   * Evaluates if a routed candidate satisfies all mandatory constraints.
   * @param {Object} candidate - The routed candidate object.
   * @param {Object} reqPlace - The specific place request object from the prompt intent.
   * @param {Object} globalConstraints - Global constraints from prompt intent (e.g., maxAdditionalDrivingTime).
   * @returns {Object} { isEligible: boolean, checks: Array }
   */
  static evaluate(candidate, reqPlace, globalConstraints = {}) {
    const checks = [];
    let isEligible = true;

    // 1. Maximum Additional Driving Time
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
             reason: 'Candidate is missing required routing information.'
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

    // 2. Minimum Rating Threshold (Unsupported natively by OSM)
    if (reqPlace.ratingThreshold && reqPlace.ratingThreshold.value != null) {
      checks.push({
        constraint: 'Minimum Rating',
        status: 'unsupported',
        actualValue: null,
        reason: 'OpenStreetMap does not reliably provide star ratings. Cannot evaluate.'
      });
      // We mark as unsupported but continue processing so the user still gets results
    }

    // 3. Structured Hard Constraints vs OSM Tags
    if (Array.isArray(reqPlace.hardConstraints) && reqPlace.hardConstraints.length > 0) {
      const tags = candidate.tags || {};
      
      reqPlace.hardConstraints.forEach(constraint => {
        // e.g., { type: 'diet', value: 'vegetarian' }
        if (constraint.type === 'diet') {
          const dietKey = `diet:${constraint.value.toLowerCase()}`;
          if (tags[dietKey] === 'yes') {
            checks.push({ constraint: `Diet: ${constraint.value}`, status: 'passed', reason: 'Explicitly verified in OSM tags.' });
          } else if (tags[dietKey] === 'no') {
            checks.push({ constraint: `Diet: ${constraint.value}`, status: 'failed', reason: 'Explicitly stated as unavailable in OSM.' });
            isEligible = false;
          } else {
            checks.push({ constraint: `Diet: ${constraint.value}`, status: 'unverifiable', reason: 'OSM tag missing. Cannot confirm or deny.' });
          }
        } 
        else if (constraint.type === 'amenity' || constraint.type === 'facility') {
          const val = String(constraint.value).toLowerCase();
          if (Object.values(tags).some(v => String(v).toLowerCase() === val)) {
            checks.push({ constraint: `Facility: ${val}`, status: 'passed', reason: 'Found matching tag value.' });
          } else {
            checks.push({ constraint: `Facility: ${val}`, status: 'unverifiable', reason: 'OSM tag missing. Cannot confirm or deny.' });
          }
        }
        else {
          checks.push({
            constraint: `Constraint: ${constraint.type}=${constraint.value}`,
            status: 'unverifiable',
            reason: 'Cannot reliably evaluate this constraint against basic OSM tags.'
          });
        }
      });
    }

    // 4. Requirement Match Scoring (Using precise translated OSM concepts)
    let requirementMatchScore = 0;
    const tags = candidate.tags || {};
    
    const searchAlts = candidate.searchAlternatives || [];
    const reqAttrs = candidate.requiredAttributes || [];
    
    // Check if any of the search alternatives (OR condition) explicitly matched
    if (searchAlts.length > 0) {
      const altMatch = searchAlts.some(alt => tags[alt.key] === alt.value);
      if (altMatch) {
        requirementMatchScore += 10;
      } else {
        // Fallback: the value might exist under a different key but still match semantically
        const hasVal = searchAlts.some(alt => Object.values(tags).includes(alt.value));
        if (hasVal) requirementMatchScore += 5;
      }
    } else {
      // If there were no OR alternatives, but the candidate was fetched, it's a baseline match
      requirementMatchScore += 5; 
    }

    // Check if the required attributes (AND conditions) explicitly matched
    if (reqAttrs.length > 0) {
      let attrMatches = 0;
      reqAttrs.forEach(attr => {
        if (tags[attr.key] === attr.value) {
          attrMatches++;
        }
      });
      requirementMatchScore += (attrMatches * 5);
    }

    return {
      isEligible,
      checks,
      requirementMatchScore
    };
  }
}

module.exports = ConstraintEvaluationService;
