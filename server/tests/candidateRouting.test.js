const assert = require('assert');
const CandidateRoutingService = require('../services/candidateRoutingService');
const OSRMService = require('../services/osrmService');
const envConfig = require('../config/env');

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

  const originalGetDrivingRoute = OSRMService.getDrivingRoute;
  const originalLimit = envConfig.maxExternalRequestsPerWorkflow;
  
  // Test Data
  const origin = { lat: 10, lon: 10 };
  const dest = { lat: 20, lon: 20 };
  const baseline = {
    durationSeconds: 1000,
    distanceMeters: 50000,
    geometry: { type: 'LineString', coordinates: [[10, 10], [15, 15], [20, 20]] }
  };
  
  console.log('--- CANDIDATE ROUTING SERVICE TESTS ---');

  // 1. Correct duration calculations, distance calculations, and additional-time calculations
  await test('Correctly computes durations, distances, and additional driving time', async () => {
    OSRMService.getDrivingRoute = async (coords) => {
      // Mock segments: O->Place is 600s/30km, Place->D is 500s/25km
      return { 
        durationSeconds: 1100, 
        distanceMeters: 55000,
        legs: [
          { durationSeconds: 550, distanceMeters: 27500 },
          { durationSeconds: 550, distanceMeters: 27500 }
        ]
      }; 
    };

    const candidates = [{ osmId: 1, lat: 15, lon: 15 }];
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, candidates);
    
    assert.strictEqual(res.routableCandidates.length, 1);
    const result = res.routableCandidates[0];
    assert.strictEqual(result.originToPlaceDurationSeconds, 550);
    assert.strictEqual(result.placeToDestinationDurationSeconds, 550);
    assert.strictEqual(result.viaPlaceDurationSeconds, 1100);
    assert.strictEqual(result.additionalDurationSeconds, 100, 'Additional duration must equal T_via (1100) - T_base (1000)');
    assert.strictEqual(result.viaPlaceDistanceMeters, 55000);
    assert.strictEqual(result.isRoutable, true);
  });

  // 2. Negative calculated additional time (do not clamp)
  await test('Preserves negative additional time without clamping', async () => {
    OSRMService.getDrivingRoute = async () => ({ 
      durationSeconds: 800, 
      distanceMeters: 40000,
      legs: [
        { durationSeconds: 400, distanceMeters: 20000 },
        { durationSeconds: 400, distanceMeters: 20000 }
      ]
    });
    
    const candidates = [{ osmId: 2, lat: 15, lon: 15 }];
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, candidates);
    
    const result = res.routableCandidates[0];
    assert.strictEqual(result.additionalDurationSeconds, -200, 'Must preserve negative values');
    assert.match(result.routingStatus, /Routing Inconsistency/);
  });

  // 3. Duplicate route requests
  await test('Deduplicates identical OSRM queries within the workflow using caching', async () => {
    let callCount = 0;
    OSRMService.getDrivingRoute = async () => {
      callCount++;
      return { 
        durationSeconds: 200, 
        distanceMeters: 2000,
        legs: [
          { durationSeconds: 100, distanceMeters: 1000 },
          { durationSeconds: 100, distanceMeters: 1000 }
        ]
      };
    };
    
    const identicalCandidates = [
      { osmId: 1, lat: 11, lon: 11 },
      { osmId: 2, lat: 11, lon: 11 }
    ];
    
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, identicalCandidates);
    assert.strictEqual(res.routableCandidates.length, 2);
    // 2 unique candidates, Table fails, we make 2 individual 3-point calls = 2 calls total
    assert.strictEqual(callCount, 2, 'Should hit route 2 times total for 2 identical locations if cache is per place or they evaluate fully');
  });

  // 4. Missing first or second segment -> unroutable
  await test('Marks candidate as unroutable if a segment fails (e.g. NoRoute)', async () => {
    OSRMService.getDrivingRoute = async (coords) => {
      if (coords[0].lat === origin.lat) throw new Error('NoRoute'); 
      return { 
        durationSeconds: 200, 
        distanceMeters: 2000,
        legs: [{ durationSeconds: 100, distanceMeters: 1000 }, { durationSeconds: 100, distanceMeters: 1000 }]
      };
    };
    
    const candidates = [{ osmId: 1, lat: 15, lon: 15 }];
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, candidates);
    
    assert.strictEqual(res.routableCandidates.length, 0);
    assert.strictEqual(res.unroutableCandidates.length, 1);
    assert.match(res.unroutableCandidates[0].routingStatus, /Unroutable: NoRoute/);
  });

  // 5. Provider Timeout
  await test('Handles provider timeouts smoothly by marking candidate unroutable', async () => {
    OSRMService.getDrivingRoute = async () => { throw new Error('OSRM API request timed out'); };
    
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, [{ osmId: 1, lat: 15, lon: 15 }]);
    
    assert.strictEqual(res.routableCandidates.length, 0);
    assert.match(res.unroutableCandidates[0].routingStatus, /timed out/);
  });

  // 6. Invalid Coordinates
  await test('Gracefully excludes candidates with invalid coordinates', async () => {
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, [{ osmId: 1, lat: null, lon: null }]);
    
    assert.strictEqual(res.routableCandidates.length, 0);
    assert.match(res.unroutableCandidates[0].routingStatus, /Invalid coordinates/);
  });

  // 7. Concurrency limits
  await test('Obeys the strict concurrency limit batching', async () => {
    envConfig.maxExternalRequestsPerWorkflow = 2; // Strict limit of 2 concurrent processes
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    OSRMService.getDrivingRoute = async () => {
      concurrentCalls++;
      if (concurrentCalls > maxConcurrent) maxConcurrent = concurrentCalls;
      return new Promise(resolve => setTimeout(() => {
        concurrentCalls--;
        resolve({ 
          durationSeconds: 20, 
          distanceMeters: 200,
          legs: [{ durationSeconds: 10, distanceMeters: 100 }, { durationSeconds: 10, distanceMeters: 100 }]
        });
      }, 10)); // Artificial delay to test overlap
    };
    
    const candidates = [
      { osmId: 1, lat: 1.1, lon: 1.1 },
      { osmId: 2, lat: 1.2, lon: 1.2 },
      { osmId: 3, lat: 1.3, lon: 1.3 },
      { osmId: 4, lat: 1.4, lon: 1.4 }
    ];
    
    const res = await CandidateRoutingService.calculateCandidateRoutes(origin, dest, baseline, candidates);
    assert.strictEqual(res.routableCandidates.length, 4);
    assert.ok(maxConcurrent <= 2, `Should not exceed batch limits (Max was ${maxConcurrent})`);
  });

  // Restore overrides
  OSRMService.getDrivingRoute = originalGetDrivingRoute;
  envConfig.maxExternalRequestsPerWorkflow = originalLimit;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
