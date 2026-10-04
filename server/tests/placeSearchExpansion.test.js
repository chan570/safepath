const assert = require('assert');
const PlaceSearchService = require('../services/placeSearchService');
const OverpassService = require('../services/overpassService');
const CorridorUtils = require('../utils/corridorUtils');

const mockRouteGeometry = {
  type: 'LineString',
  coordinates: [[0, 0], [0, 0.1]] // ~11km line along longitude 0
};

// Default requested places with no constraints
const reqPlaces = [{ category: 'hospital', hardConstraints: [], softPreferences: [], ratingThreshold: null }];

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

  const originalFetchPlaces = OverpassService.fetchPlaces;

  console.log('--- PLACE SEARCH EXPANSION TESTS ---');

  // 1. Three eligible candidates found at 2 km (Stops early)
  await test('Stops at 2km if 3 eligible candidates are found', async () => {
    let calls = 0;
    OverpassService.fetchPlaces = async () => {
      calls++;
      return [
        { osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0, name: 'H1' },
        { osmType: 'node', osmId: 2, lat: 0.0, lon: 0.0, name: 'H2' },
        { osmType: 'node', osmId: 3, lat: 0.0, lon: 0.0, name: 'H3' }
      ];
    };
    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
    assert.strictEqual(result.levelMeters, 2000, 'Should stop at 2km');
    assert.strictEqual(result.candidates.length, 3);
    assert.strictEqual(calls, 1, 'Should only call Overpass once (for the 2km bbox)');
  });

  // 2. Two candidates at 2km, followed by at least three at 5km
  await test('Expands to 5km if only 2 candidates found at 2km', async () => {
    let bboxWidths = [];
    OverpassService.fetchPlaces = async (cat, bbox) => {
      // bbox width is a proxy for the expansion loop. 
      // 5km bbox will be larger than 2km bbox.
      bboxWidths.push(bbox.east - bbox.west); 
      
      // If it's the first call (2km), return 2 elements
      if (bboxWidths.length === 1) {
        return [
          { osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0, name: 'H1' },
          { osmType: 'node', osmId: 2, lat: 0.0, lon: 0.0, name: 'H2' }
        ];
      }
      // If it's the 5km call, return new elements
      return [
        { osmType: 'node', osmId: 3, lat: 0.0, lon: 0.0, name: 'H3' }
      ];
    };

    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
    assert.strictEqual(result.levelMeters, 5000, 'Should stop at 5km');
    assert.strictEqual(result.candidates.length, 3);
    assert.strictEqual(bboxWidths.length, 2, 'Should have queried 2km and 5km');
    assert.ok(bboxWidths[1] > bboxWidths[0], '5km bbox should be wider than 2km bbox');
  });

  // 3. Fewer than 3 at 5km, expands to 10km
  await test('Expands to 10km if fewer than 3 candidates found by 5km', async () => {
    let calls = 0;
    OverpassService.fetchPlaces = async () => {
      calls++;
      if (calls === 1) return [{ osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0 }];
      if (calls === 2) return [{ osmType: 'node', osmId: 2, lat: 0.0, lon: 0.0 }];
      if (calls === 3) return [{ osmType: 'node', osmId: 3, lat: 0.0, lon: 0.0 }];
      return [];
    };

    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
    assert.strictEqual(result.levelMeters, 10000, 'Should reach max 10km expansion');
    assert.strictEqual(result.candidates.length, 3);
    assert.strictEqual(calls, 3);
  });

  // 4. Fewer than three eligible candidates at every level
  await test('Stops after 10km even if fewer than 3 candidates exist', async () => {
    OverpassService.fetchPlaces = async () => [];
    
    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
    assert.strictEqual(result.levelMeters, 10000, 'Should stop at max 10km');
    assert.strictEqual(result.candidates.length, 0);
  });

  // 5. Duplicate results across levels
  await test('Deduplicates results found in both 2km and 5km queries', async () => {
    let calls = 0;
    OverpassService.fetchPlaces = async () => {
      calls++;
      // Return the exact same elements on every expansion
      return [
        { osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0 },
        { osmType: 'node', osmId: 2, lat: 0.0, lon: 0.0 }
      ];
    };
    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
    // Since only 2 unique elements exist, it will exhaust 2km, 5km, and 10km
    assert.strictEqual(result.levelMeters, 10000);
    assert.strictEqual(result.candidates.length, 2, 'Should deduplicate duplicates across levels');
  });

  // 6. Raw candidates that fail hard constraints
  await test('Does not stop early if raw elements fail strict constraints', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0 },
      { osmType: 'node', osmId: 2, lat: 0.0, lon: 0.0 },
      { osmType: 'node', osmId: 3, lat: 0.0, lon: 0.0 },
      { osmType: 'node', osmId: 4, lat: 0.0, lon: 0.0 }
    ];
    // Request a place with a rating threshold (which we cannot fulfill currently)
    const strictReq = [{ category: 'hospital', ratingThreshold: { value: 4, operator: ">" } }];
    
    const result = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, strictReq);
    
    // It finds 4 raw elements at 2km, but 0 are eligible. It should expand to 5km and 10km trying to find eligible ones.
    assert.strictEqual(result.levelMeters, 10000);
    assert.strictEqual(result.candidates.length, 0, 'Should reject all elements failing eligibility');
  });

  // 7. A provider failure during expansion
  await test('Handles provider failure gracefully during expansion without fabricating successes', async () => {
    let calls = 0;
    OverpassService.fetchPlaces = async () => {
      calls++;
      if (calls === 1) return [{ osmType: 'node', osmId: 1, lat: 0.0, lon: 0.0 }];
      throw new Error('Overpass network failure'); // 5km expansion fails
    };

    try {
      await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, reqPlaces);
      assert.fail('Should have propagated error');
    } catch (err) {
      assert.match(err.message, /Place search failed during 5000m expansion: Overpass network failure/);
    }
  });

  // Restore fetch
  OverpassService.fetchPlaces = originalFetchPlaces;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
