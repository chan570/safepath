const assert = require('assert');
const OverpassService = require('../services/overpassService');
const config = require('../config/env');

const mockBbox = { south: 31.0, west: 75.0, north: 31.5, east: 75.5 };

const mockOverpassData = {
  elements: [
    { type: 'node', id: 101, lat: 31.1, lon: 75.1, tags: { name: 'City Hospital', amenity: 'hospital' } },
    { type: 'way', id: 202, center: { lat: 31.2, lon: 75.2 }, tags: { amenity: 'clinic' } }, // no name
    { type: 'node', id: 101, lat: 31.1, lon: 75.1, tags: { name: 'City Hospital duplicate', amenity: 'hospital' } }
  ]
};

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

  const originalFetch = global.fetch;

  console.log('--- MOCKED AUTOMATED TESTS ---');

  await test('Rejects invalid or non-array OSM tags', async () => {
    try {
      await OverpassService.fetchPlaces('secret military base', [], mockBbox);
      assert.fail('Should reject invalid tags argument');
    } catch (err) {
      assert.match(err.message, /Invalid or missing OSM tags/);
    }
  });

  await test('Rejects queries missing bounding box', async () => {
    try {
      await OverpassService.fetchPlaces([{key: 'amenity', value: 'hospital'}], [], { south: 31.0 });
      assert.fail('Should require complete bbox');
    } catch (err) {
      assert.match(err.message, /Invalid geographic search area/);
    }
  });

  await test('Parses nodes/ways, handles missing names safely, and deduplicates', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockOverpassData
    });

    const results = await OverpassService.fetchPlaces([{key: 'amenity', value: 'hospital'}], [], mockBbox);
    
    // Check deduplication (3 input elements -> 2 unique IDs -> 1 with name)
    assert.strictEqual(results.length, 1, 'Should deduplicate identical OSM IDs and skip nameless');
    
    const hospital = results.find(r => r.osmType === 'node');
    assert.strictEqual(hospital.name, 'City Hospital');
    assert.strictEqual(hospital.lat, 31.1);
  });

  await test('Handles rate limit 429 status correctly', async () => {
    global.fetch = async () => ({ ok: false, status: 429 });
    try {
      await OverpassService.fetchPlaces([{key: 'leisure', value: 'park'}], [], mockBbox);
      assert.fail('Should throw rate limit error');
    } catch (err) {
      assert.match(err.message, /rate limit exceeded/);
    }
  });

  console.log(`\\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  global.fetch = originalFetch;
}

runTests();
