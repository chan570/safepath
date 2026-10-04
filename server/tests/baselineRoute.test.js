const assert = require('assert');
const BaselineRouteService = require('../services/baselineRouteService');
const GeocodingService = require('../services/geocodingService');
const OSRMService = require('../services/osrmService');

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

  const originalGeocode = GeocodingService.searchLocation;
  const originalOSRM = OSRMService.getDrivingRoute;

  console.log('--- BASELINE ROUTE TESTS ---');

  // 1. Valid Journey
  await test('Calculates a valid journey with unambiguous points', async () => {
    GeocodingService.searchLocation = async (query) => {
      if (query === 'Ludhiana') return { candidates: [{ lat: 30.9, lon: 75.8, displayName: 'Ludhiana, Punjab' }] };
      if (query === 'Jalandhar') return { candidates: [{ lat: 31.3, lon: 75.5, displayName: 'Jalandhar, Punjab' }] };
      return { candidates: [] };
    };
    OSRMService.getDrivingRoute = async () => ({
      distanceMeters: 60000,
      durationSeconds: 3600,
      geometry: { type: 'LineString', coordinates: [[75.8, 30.9], [75.5, 31.3]] },
      source: 'OSRM'
    });

    const result = await BaselineRouteService.getBaselineRoute('Ludhiana', 'Jalandhar');
    assert.strictEqual(result.status, 'success');
    assert.ok(result.route.geometry);
    assert.strictEqual(result.route.distanceMeters, 60000);
  });

  // 2. Ambiguous Origin
  await test('Requests clarification for an ambiguous origin', async () => {
    GeocodingService.searchLocation = async (query) => {
      if (query === 'Model Town') return { candidates: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }; // Ambiguous
      if (query === 'Jalandhar') return { candidates: [{ lat: 31.3, lon: 75.5 }] };
      return { candidates: [] };
    };

    const result = await BaselineRouteService.getBaselineRoute('Model Town', 'Jalandhar');
    assert.strictEqual(result.status, 'clarification_required');
    assert.strictEqual(result.ambiguities[0].type, 'origin');
    assert.strictEqual(result.ambiguities[0].candidates.length, 2);
  });

  // 3. Ambiguous Destination
  await test('Requests clarification for an ambiguous destination', async () => {
    GeocodingService.searchLocation = async (query) => {
      if (query === 'Ludhiana') return { candidates: [{ lat: 30.9, lon: 75.8 }] };
      if (query === 'Sector 22') return { candidates: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] }; // Ambiguous
      return { candidates: [] };
    };

    const result = await BaselineRouteService.getBaselineRoute('Ludhiana', 'Sector 22');
    assert.strictEqual(result.status, 'clarification_required');
    assert.strictEqual(result.ambiguities[0].type, 'destination');
  });

  // 4. Location outside Punjab (or unmapped)
  await test('Rejects locations outside supported area (empty geocoding candidates)', async () => {
    GeocodingService.searchLocation = async (query) => {
      if (query === 'Ludhiana') return { candidates: [{ lat: 30.9, lon: 75.8 }] };
      if (query === 'Delhi') return { candidates: [] }; // Rejected by Punjab restriction in geocoder
      return { candidates: [] };
    };

    const result = await BaselineRouteService.getBaselineRoute('Ludhiana', 'Delhi');
    assert.strictEqual(result.status, 'error');
    assert.match(result.errors[0], /outside the supported Punjab area/);
  });

  // 5. Invalid Coordinates / No-Route Response
  await test('Gracefully stops workflow if OSRM returns NoRoute', async () => {
    GeocodingService.searchLocation = async (query) => {
      if (query === 'A') return { candidates: [{ lat: 30.9, lon: 75.8 }] };
      if (query === 'B') return { candidates: [{ lat: 31.3, lon: 75.5 }] };
      return { candidates: [] };
    };
    OSRMService.getDrivingRoute = async () => {
      throw new Error('No driving route could be found between the specified coordinates.');
    };

    const result = await BaselineRouteService.getBaselineRoute('A', 'B');
    assert.strictEqual(result.status, 'error');
    assert.match(result.errors[0], /No driving route could be found/);
  });

  // 6. Pre-resolved coordinates support
  await test('Accepts previously resolved coordinate objects to bypass geocoding', async () => {
    // Both mocked to skip geocoding
    GeocodingService.searchLocation = async () => assert.fail('Should not call geocoder');
    OSRMService.getDrivingRoute = async () => ({
      distanceMeters: 100, durationSeconds: 10, geometry: { type: 'LineString', coordinates: [] }
    });

    const result = await BaselineRouteService.getBaselineRoute({ lat: 10, lon: 10 }, { lat: 20, lon: 20 });
    assert.strictEqual(result.status, 'success');
  });

  GeocodingService.searchLocation = originalGeocode;
  OSRMService.getDrivingRoute = originalOSRM;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
