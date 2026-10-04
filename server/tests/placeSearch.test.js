const assert = require('assert');
const PlaceSearchService = require('../services/placeSearchService');
const OverpassService = require('../services/overpassService');

const mockRouteGeometry = {
  type: 'LineString',
  coordinates: [[0, 0], [0, 0.1]] // ~11km line along longitude 0
};
const widthMeters = 2000; // 2km

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

  console.log('--- PLACE SEARCH SERVICE TESTS ---');

  // 1. Valid place inside the 2km route corridor
  await test('Keeps candidates that physically fall inside the true corridor', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 1, lat: 0.05, lon: 0.01, name: 'True Corridor Clinic' }
    ];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }]);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].name, 'True Corridor Clinic');
  });

  // 2. Place inside bbox but outside true corridor
  await test('Rejects candidates inside the bounding box but outside the true mathematical corridor', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 2, lat: -0.018, lon: -0.018, name: 'Bbox Corner Imposter' }
    ];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }]);
    assert.strictEqual(candidates.length, 0, 'Should mathematically reject the bounding box corner outlier');
  });

  // 3. OSM Nodes, Ways, Relations supported natively
  await test('Supports Node, Way, and Relation types extracted by Overpass', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 10, lat: 0.05, lon: 0.005, name: 'Node' },
      { osmType: 'way', osmId: 20, lat: 0.05, lon: 0.005, name: 'Way' },
      { osmType: 'relation', osmId: 30, lat: 0.05, lon: 0.005, name: 'Relation' }
    ];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }]);
    assert.strictEqual(candidates.length, 3);
  });

  // 4. Duplicate elements from overlapping queries
  await test('Deduplicates elements using stable OSM identifiers', async () => {
    let callCount = 0;
    OverpassService.fetchPlaces = async () => {
      callCount++;
      return [
        { osmType: 'node', osmId: 100, lat: 0.05, lon: 0.005, name: 'Duplicated Point' }
      ];
    };
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }, { category: 'clinic' }]);
    // In expansion loop (2km, 5km, 10km) if we get 3 it stops. Wait, here we only return 1, so it expands 3 times for 2 categories!
    // So 3 levels * 2 categories = 6 calls!
    assert.strictEqual(candidates.length, 1, 'Should deduplicate identical osmId elements');
  });

  // 5. Multiple places sharing the same name
  await test('Does not incorrectly deduplicate different places that share the same name', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 1, lat: 0.01, lon: 0.001, name: 'Starbucks' },
      { osmType: 'node', osmId: 2, lat: 0.09, lon: 0.001, name: 'Starbucks' }
    ];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'cafe' }]);
    assert.strictEqual(candidates.length, 2, 'Should keep both independent Starbucks nodes');
  });

  // 6. Missing coordinates
  await test('Drops candidates with missing or corrupted coordinates', async () => {
    OverpassService.fetchPlaces = async () => [
      { osmType: 'node', osmId: 1, lat: null, lon: null, name: 'Missing Coords' },
      { osmType: 'node', osmId: 2, lat: 0.05, lon: 0.01, name: 'Good Coords' }
    ];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'park' }]);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].name, 'Good Coords');
  });

  // 7. Empty Overpass results
  await test('Gracefully handles empty responses', async () => {
    OverpassService.fetchPlaces = async () => [];
    
    const { candidates } = await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }]);
    assert.ok(Array.isArray(candidates));
    assert.strictEqual(candidates.length, 0);
  });

  // 8. Overpass timeout / failure
  await test('Propagates provider timeouts and network failures', async () => {
    OverpassService.fetchPlaces = async () => { throw new Error('Overpass network failure'); };
    
    try {
      await PlaceSearchService.searchPlacesAlongRoute(mockRouteGeometry, [{ category: 'hospital' }]);
      assert.fail('Should have propagated error');
    } catch (err) {
      assert.match(err.message, /Place search failed/);
      assert.match(err.message, /Overpass network failure/);
    }
  });

  // 9. Invalid route geometry
  await test('Rejects empty or invalid baseline route geometry', async () => {
    try {
      await PlaceSearchService.searchPlacesAlongRoute(null, [{ category: 'hospital' }]);
      assert.fail('Should reject null geometry');
    } catch (err) {
      assert.match(err.message, /Invalid route geometry/);
    }
  });

  // Restore fetch
  OverpassService.fetchPlaces = originalFetchPlaces;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
