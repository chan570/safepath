const assert = require('assert');
const GeocodingService = require('../services/geocodingService');
const config = require('../config/env');

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   ${err.message}`);
      failed++;
    }
  }

  console.log('--- GEOCODING MOCKED TESTS ---');
  const originalFetch = global.fetch;

  // 1. Mock: Known Punjab city
  await test('Mock: Known Punjab city (Ludhiana)', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [{ display_name: 'Ludhiana, Punjab', lat: '30.9', lon: '75.8', address: { state: 'Punjab', country_code: 'in' } }]
    });
    const result = await GeocodingService.searchLocation('Ludhiana');
    assert(result.candidates.length > 0, 'Should find at least one candidate for Ludhiana');
    assert(result.candidates[0].displayName.includes('Ludhiana'), 'Should include Ludhiana in display name');
    assert.strictEqual(result.candidates[0].address.state.toLowerCase(), 'punjab', 'State should be validated as Punjab');
  });

  // 2. Mock: Ambiguous place name
  await test('Mock: Ambiguous place name (Model Town)', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [
        { display_name: 'Model Town A, Punjab', lat: '30.1', lon: '75.1', address: { state: 'Punjab', country_code: 'in' } },
        { display_name: 'Model Town B, Punjab', lat: '30.2', lon: '75.2', address: { state: 'Punjab', country_code: 'in' } }
      ]
    });
    const result = await GeocodingService.searchLocation('Model Town');
    assert(result.candidates.length > 1, 'Should find multiple candidates for Model Town, Punjab');
  });

  // 3. Mock: Location outside Punjab
  await test('Mock: Location outside Punjab (Delhi)', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [{ display_name: 'Delhi', lat: '28.7', lon: '77.1', address: { state: 'Delhi', country_code: 'in' } }]
    });
    const result = await GeocodingService.searchLocation('Delhi');
    assert.strictEqual(result.candidates.length, 0, 'Delhi should be strictly filtered out by the geographic Punjab restriction');
  });

  // 4. Mock: Unknown location
  await test('Mock: Unknown location (zzzyyyxxx123456)', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => []
    });
    const result = await GeocodingService.searchLocation('zzzyyyxxx123456');
    assert.strictEqual(result.candidates.length, 0, 'Should return empty candidates for unknown location');
  });

  // 5. Mock: Malformed provider data
  await test('Mock: Malformed provider data', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [{ invalid: 'data' }]
    });
    const result = await GeocodingService.searchLocation('WeirdPlace');
    assert.strictEqual(result.candidates.length, 0, 'Should handle malformed item safely');
  });

  // 6. Mock: Network error
  await test('Mock: Network error', async () => {
    global.fetch = async () => { throw new Error('Network timeout'); };
    try {
      await GeocodingService.searchLocation('AnyPlace');
      assert.fail('Should propagate network error');
    } catch (err) {
      assert.match(err.message, /Geocoding network failure/);
    }
  });

  global.fetch = originalFetch;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests();
