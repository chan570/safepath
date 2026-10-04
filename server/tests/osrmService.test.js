const assert = require('assert');
const OSRMService = require('../services/osrmService');

// Mock Data
const mockSuccessfulRoute = {
  code: 'Ok',
  routes: [
    {
      distance: 12500.5,
      duration: 1800.2,
      geometry: { type: 'LineString', coordinates: [[75.1, 31.1], [75.2, 31.2]] }
    }
  ]
};

const mockNoRoute = {
  code: 'NoRoute',
  message: 'Impossible route between points'
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
  const mockBboxCoordinates = [{lat: 31.1, lon: 75.1}, {lat: 31.2, lon: 75.2}];

  console.log('--- MOCKED OSRM TESTS ---');

  // 1. Success path
  await test('Successfully retrieves and normalizes driving route', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockSuccessfulRoute
    });

    const res = await OSRMService.getDrivingRoute(mockBboxCoordinates);
    assert.strictEqual(res.distanceMeters, 12500.5, 'Should preserve exact distance in meters');
    assert.strictEqual(res.durationSeconds, 1800.2, 'Should preserve exact duration in seconds');
    assert.strictEqual(res.geometry.type, 'LineString');
    assert.strictEqual(res.source, 'Open Source Routing Machine (OSRM)');
  });

  // 2. Invalid inputs
  await test('Rejects invalid or insufficient coordinates', async () => {
    try {
      await OSRMService.getDrivingRoute([{lat: 31.1, lon: 75.1}]); // Only 1 coord
      assert.fail('Should reject single coordinate');
    } catch (err) {
      assert.match(err.message, /At least two valid coordinates/);
    }

    try {
      await OSRMService.getDrivingRoute([{lat: 31.1, lon: 'bad_string'}, {lat: 31.2, lon: 75.2}]);
      assert.fail('Should reject non-numeric coordinates');
    } catch (err) {
      assert.match(err.message, /lat and lon must be strictly numeric/);
    }
  });

  // 3. No Route Found
  await test('Handles NoRoute response cleanly without fabricating straight lines', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => mockNoRoute
    });

    try {
      await OSRMService.getDrivingRoute(mockBboxCoordinates);
      assert.fail('Should have thrown NoRoute error');
    } catch (err) {
      assert.match(err.message, /No driving route could be found/);
    }
  });

  // 4. Timeout
  await test('Handles OSRM network timeout', async () => {
    global.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const err = new Error('The operation was aborted');
          err.name = 'TimeoutError';
          reject(err);
        }, 100);
      });
    };

    try {
      await OSRMService.getDrivingRoute(mockBboxCoordinates, { timeoutMs: 50 });
      assert.fail('Should have timed out');
    } catch (err) {
      assert.match(err.message, /OSRM API request timed out/);
    }
  });

  // 5. Malformed response
  await test('Handles malformed JSON data safely', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ notRoutes: true }) // Missing 'code' and 'routes'
    });

    try {
      await OSRMService.getDrivingRoute(mockBboxCoordinates);
      assert.fail('Should have rejected malformed data');
    } catch (err) {
      assert.match(err.message, /Malformed provider data/);
    }
  });

  // Restore fetch
  global.fetch = originalFetch;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
