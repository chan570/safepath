const assert = require('assert');
const OverpassService = require('../services/overpassService');
const config = require('../config/env');

const mockBbox = { south: 31.0, west: 75.0, north: 31.5, east: 75.5 };

const mockOverpassData = {
  elements: [
    // Standard node with name
    { type: 'node', id: 101, lat: 31.1, lon: 75.1, tags: { name: 'City Hospital', amenity: 'hospital' } },
    // Way without a name, but with a center coordinate
    { type: 'way', id: 202, center: { lat: 31.2, lon: 75.2 }, tags: { amenity: 'clinic' } },
    // Duplicate node to test deduplication
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

  // 1. Invalid Category Blocked
  await test('Rejects arbitrary unapproved categories', async () => {
    try {
      await OverpassService.fetchPlaces('secret military base', mockBbox);
      assert.fail('Should reject unapproved category');
    } catch (err) {
      assert.match(err.message, /Invalid or unsupported category/);
    }
  });

  // 2. Geographic Area Validation
  await test('Rejects queries missing bounding box', async () => {
    try {
      await OverpassService.fetchPlaces('hospital', { south: 31.0 }); // Missing east/west/north
      assert.fail('Should require complete bbox');
    } catch (err) {
      assert.match(err.message, /Invalid geographic search area/);
    }
  });

  // 3. Normalization, Name Handling, and Deduplication
  await test('Parses nodes/ways, handles missing names safely, and deduplicates', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockOverpassData
    });

    const results = await OverpassService.fetchPlaces('hospital', mockBbox);
    
    // Check deduplication (3 input elements, 2 unique IDs)
    assert.strictEqual(results.length, 2, 'Should deduplicate identical OSM IDs');
    
    // Check Node parsing
    const hospital = results.find(r => r.osmType === 'node');
    assert.strictEqual(hospital.name, 'City Hospital');
    assert.strictEqual(hospital.lat, 31.1);
    
    // Check Way parsing (extracts center, handles missing name without inventing one)
    const clinic = results.find(r => r.osmType === 'way');
    assert.strictEqual(clinic.name, null, 'Should return null for missing name');
    assert.strictEqual(clinic.lat, 31.2, 'Should extract latitude from way center');

    // Check data integrity constraints
    results.forEach(r => {
      assert.ok(!r.rating, 'Ratings should not be generated');
      assert.strictEqual(r.attribution, '© OpenStreetMap contributors', 'Must include OSM attribution');
    });
  });

  // 4. Rate Limits and Timeouts
  await test('Handles rate limit 429 status correctly', async () => {
    global.fetch = async () => ({ ok: false, status: 429 });
    try {
      await OverpassService.fetchPlaces('park', mockBbox);
      assert.fail('Should throw rate limit error');
    } catch (err) {
      assert.match(err.message, /rate limit exceeded/);
    }
  });

  console.log('\n--- LIVE INTEGRATION TEST (Optional) ---');
  if (process.env.RUN_LIVE_OVERPASS_TESTS === '1') {
    global.fetch = originalFetch; // Restore real network fetch
    
    await test('Live query for hospitals in a small bounding box in Punjab', async () => {
      // Small bounding box in Ludhiana to avoid large response
      const liveBbox = { south: 30.89, west: 75.83, north: 30.91, east: 75.85 };
      const results = await OverpassService.fetchPlaces('hospital', liveBbox, { timeoutMs: 15000 });
      assert.ok(Array.isArray(results), 'Must return an array');
      if (results.length > 0) {
        assert.ok(results[0].category === 'hospital');
        assert.ok(results[0].lat != null && results[0].lon != null);
      }
      console.log(`     (Found ${results.length} live records)`);
    });
  } else {
    console.log('Skipping live test to protect public Overpass servers.');
    console.log('Run with RUN_LIVE_OVERPASS_TESTS=1 to execute.');
  }

  // Restore fetch
  global.fetch = originalFetch;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
