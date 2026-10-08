const assert = require('assert');
const ConstraintEvaluationService = require('../services/constraintEvaluationService');

function runTests() {
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
    additionalDurationSeconds: 600, // 10 mins extra
    tags: { amenity: 'hospital', 'diet:vegetarian': 'yes', name: 'City Med' }
  };

  test('Passes candidate when verifiable constraints are met', () => {
    const reqPlace = { hardConstraints: [{type: 'diet', value: 'vegetarian'}] };
    const globalReq = { maxAdditionalDrivingTime: { value: 15, unit: 'minutes' } };
    
    const result = ConstraintEvaluationService.evaluate(baseCandidate, reqPlace, globalReq);
    assert.strictEqual(result.isEligible, true);
    assert.strictEqual(result.checks.some(c => c.status === 'passed'), true);
  });

  test('Fails candidate that explicitly violates diet constraint', () => {
    const candidate = { ...baseCandidate, tags: { 'diet:vegetarian': 'no' } };
    const reqPlace = { hardConstraints: [{type: 'diet', value: 'vegetarian'}] };
    
    const result = ConstraintEvaluationService.evaluate(candidate, reqPlace, {});
    assert.strictEqual(result.isEligible, false);
    assert.strictEqual(result.checks.some(c => c.status === 'failed'), true);
  });

  test('Calculates requirement match score using OSM concepts', () => {
    const candidate = {
      ...baseCandidate,
      searchAlternatives: [{ key: 'amenity', value: 'hospital' }],
      requiredAttributes: [{ key: 'diet:vegetarian', value: 'yes' }]
    };
    const reqPlace = {}; // No longer uses reqPlace.requirements
    const result = ConstraintEvaluationService.evaluate(candidate, reqPlace, {});
    
    // score: 10 (explicit OR match) + 5 (explicit AND match) = 15
    assert.strictEqual(result.requirementMatchScore, 15);
  });

  console.log(`Tests complete. Passed: ${passed}, Failed: ${failed}`);
}

runTests();
