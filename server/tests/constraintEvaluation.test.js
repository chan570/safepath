const assert = require('assert');
const ConstraintEvaluationService = require('../services/constraintEvaluationService');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.message}`);
      failed++;
    }
  }

  console.log('--- CONSTRAINT EVALUATION TESTS ---');

  const baseCandidate = {
    osmId: 1,
    category: 'hospital',
    additionalDurationSeconds: 600, // 10 mins extra
    tags: { amenity: 'hospital', name: 'City Med' }
  };

  // 1. All hard constraints satisfied
  test('Passes candidate when all verifiable constraints are met', () => {
    const reqPlace = { category: 'hospital' };
    const globalReq = { maxAdditionalDrivingTime: { value: 15, unit: 'minutes' } };
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, true);
    assert.strictEqual(result.checks.length, 2);
    assert.strictEqual(result.checks.every(c => c.status === 'passed'), true);
  });

  // 2. One hard constraint violated (Exceeds max time)
  test('Fails candidate that exceeds max additional driving time', () => {
    const reqPlace = { category: 'hospital' };
    const globalReq = { maxAdditionalDrivingTime: { value: 5, unit: 'minutes' } }; // 5 mins limit, but candidate is 10 mins
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, false);
    
    const timeCheck = result.checks.find(c => c.constraint === 'Max Additional Time');
    assert.strictEqual(timeCheck.status, 'failed');
    assert.match(timeCheck.reason, /Exceeds strict limit/);
  });

  // 3. Excellent travel time but failed mandatory condition
  test('Fails candidate with excellent travel time if category constraint fails', () => {
    const fastCandidate = { ...baseCandidate, additionalDurationSeconds: 0, category: 'clinic' }; // Fast, but wrong category
    const reqPlace = { category: 'hospital' };
    const globalReq = { maxAdditionalDrivingTime: { value: 20, unit: 'minutes' } }; 
    
    const result = ConstraintEvaluationService.evaluate(fastCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, false, 'Should fail despite excellent driving time');
    
    const catCheck = result.checks.find(c => c.constraint === 'Category Match');
    assert.strictEqual(catCheck.status, 'failed');
  });

  // 4. Missing candidate information
  test('Fails max time constraint if routing information is completely missing', () => {
    const brokenCandidate = { category: 'hospital' }; // missing additionalDurationSeconds
    const reqPlace = { category: 'hospital' };
    const globalReq = { maxAdditionalDrivingTime: { value: 10, unit: 'minutes' } };
    
    const result = ConstraintEvaluationService.evaluate(brokenCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, false);
    
    const timeCheck = result.checks.find(c => c.constraint === 'Max Additional Time');
    assert.strictEqual(timeCheck.status, 'failed');
    assert.match(timeCheck.reason, /missing required routing information/);
  });

  // 5. Unverifiable minimum-rating request
  test('Marks candidate ineligible and unverifiable if asked for rating threshold without a provider', () => {
    const reqPlace = { category: 'hospital', ratingThreshold: { value: 4, operator: ">=" } };
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, {});
    assert.strictEqual(result.isEligible, false);
    
    const ratingCheck = result.checks.find(c => c.constraint === 'Minimum Rating');
    assert.strictEqual(ratingCheck.status, 'unverifiable');
    assert.match(ratingCheck.reason, /OpenStreetMap does not reliably provide star ratings/);
  });

  // 6. Unsupported generic constraint handling
  test('Marks candidate ineligible and unverifiable for arbitrary custom constraints', () => {
    const reqPlace = { category: 'hospital', hardConstraints: ['must have indoor pool'] };
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, {});
    assert.strictEqual(result.isEligible, false);
    
    const customCheck = result.checks.find(c => c.constraint.includes('must have indoor pool'));
    assert.strictEqual(customCheck.status, 'unverifiable');
    assert.match(customCheck.reason, /Cannot reliably evaluate arbitrary natural-language constraints/);
  });

  // 7. Multiple constraints with different outcomes
  test('Accurately reports multiple constraints with mixed pass/fail/unverifiable outcomes', () => {
    const reqPlace = { category: 'hospital', hardConstraints: ['has helicopter pad'] };
    const globalReq = { maxAdditionalDrivingTime: { value: 5, unit: 'minutes' } }; // Violates 5 mins (candidate is 10 mins)
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, false);
    
    assert.strictEqual(result.checks.find(c => c.constraint === 'Category Match').status, 'passed');
    assert.strictEqual(result.checks.find(c => c.constraint === 'Max Additional Time').status, 'failed');
    assert.strictEqual(result.checks.find(c => c.constraint.includes('helicopter pad')).status, 'unverifiable');
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
