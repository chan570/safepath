const assert = require('assert');
const Ajv = require('ajv');
const schema = require('../utils/promptSchema');

const ajv = new Ajv();
const validate = ajv.compile(schema);

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

  console.log('--- SCHEMA VALIDATION TESTS ---');

  // 1. Valid Explicit Request
  test('Validates a complete explicit request', () => {
    const data = {
      origin: "Ludhiana",
      destination: "Jalandhar",
      numberOfStopsRequested: 1,
      requestedPlaces: [
        {
          category: "Gurudwara",
          hardConstraints: [],
          softPreferences: ["minimize extra driving time"],
          ratingThreshold: { value: 4, operator: ">" }
        }
      ],
      maxAdditionalDrivingTime: null,
      stopOrderRequirements: [],
      ambiguities: [],
      unsupportedRequirements: []
    };
    
    const valid = validate(data);
    assert.ok(valid, `Schema validation failed: ${ajv.errorsText(validate.errors)}`);
  });

  // 2. Reject Missing Required Fields
  test('Rejects request missing required top-level fields', () => {
    const data = {
      origin: "Delhi"
      // Missing destination, etc.
    };
    const valid = validate(data);
    assert.strictEqual(valid, false, 'Should be invalid due to missing required fields');
  });

  // 3. Prevent Invented Values (Must be null, not defaults)
  test('Validates appropriately when missing fields are properly marked as null', () => {
    const data = {
      origin: null,
      destination: null,
      numberOfStopsRequested: null,
      requestedPlaces: [],
      maxAdditionalDrivingTime: null,
      stopOrderRequirements: [],
      ambiguities: ["Where are you going?"],
      unsupportedRequirements: []
    };
    const valid = validate(data);
    assert.ok(valid, `Schema validation failed: ${ajv.errorsText(validate.errors)}`);
  });

  // 4. Rating Threshold Validation
  test('Rejects invalid operators in rating threshold', () => {
    const data = {
      origin: "A", destination: "B",
      numberOfStopsRequested: 1,
      requestedPlaces: [{
        category: "restaurant",
        hardConstraints: [], softPreferences: [],
        ratingThreshold: { value: 4, operator: "roughly" } // Invalid operator
      }],
      maxAdditionalDrivingTime: null,
      stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
    };
    const valid = validate(data);
    assert.strictEqual(valid, false, 'Should reject invalid operator string');
  });

  // 5. Max Additional Driving Time Validation
  test('Rejects max time without unit', () => {
    const data = {
      origin: "A", destination: "B",
      numberOfStopsRequested: null,
      requestedPlaces: [],
      maxAdditionalDrivingTime: { value: 10 }, // Missing 'unit'
      stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
    };
    const valid = validate(data);
    assert.strictEqual(valid, false, 'Should reject missing time unit');
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
