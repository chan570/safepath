const assert = require('assert');
const MultiStopItineraryService = require('../services/multiStopItineraryService');
const OSRMService = require('../services/osrmService');

const origin = { lat: 10, lon: 10 };
const dest = { lat: 20, lon: 20 };
const baseline = { durationSeconds: 1000, distanceMeters: 50000 };

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

  const originalOSRM = OSRMService.getDrivingRoute;

  console.log('--- MULTI-STOP ITINERARY TESTS ---');

  // 1. One-stop itinerary
  await test('Successfully routes and calculates a 1-stop itinerary', async () => {
    OSRMService.getDrivingRoute = async () => ({
      durationSeconds: 1100, distanceMeters: 55000, legs: [{}, {}]
    });
    
    const groups = [{ category: 'cafe', candidates: [{ osmId: 1, lat: 11, lon: 11 }] }];
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, [], {});
    
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.bestItinerary.orderedStops.length, 1);
    assert.strictEqual(res.bestItinerary.additionalDurationSeconds, 100);
  });

  // 2. Ambiguous stop order
  await test('Demands clarification if multiple stops are requested without explicit sequence', async () => {
    const groups = [
      { category: 'cafe', candidates: [{ osmId: 1, lat: 11, lon: 11 }] },
      { category: 'park', candidates: [{ osmId: 2, lat: 12, lon: 12 }] }
    ];
    // Empty stopOrderRequirements triggers ambiguity
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, [], {});
    
    assert.strictEqual(res.status, 'clarification_required');
    assert.match(res.ambiguities[0], /sequence is ambiguous/);
  });

  // 3. Two stops in a specified order
  await test('Respects explicit order and combines multi-stop route accurately', async () => {
    let requestedCoords;
    OSRMService.getDrivingRoute = async (coords) => {
      requestedCoords = coords;
      return { durationSeconds: 1500, distanceMeters: 60000, legs: [{}, {}, {}] };
    };
    
    const groups = [
      { category: 'cafe', candidates: [{ osmId: 1, lat: 11, lon: 11 }] },
      { category: 'park', candidates: [{ osmId: 2, lat: 12, lon: 12 }] }
    ];
    
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, ['cafe before park'], {});
    
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.bestItinerary.totalDurationSeconds, 1500);
    assert.strictEqual(res.bestItinerary.additionalDurationSeconds, 500);
    // Ensure coords passed to OSRM were: Origin, Cafe(11), Park(12), Dest
    assert.strictEqual(requestedCoords[1].lat, 11);
    assert.strictEqual(requestedCoords[2].lat, 12);
  });

  // 4. Missing required category
  await test('Halts itinerary generation if a required category has no eligible candidates', async () => {
    const groups = [
      { category: 'cafe', candidates: [{ osmId: 1 }] },
      { category: 'hospital', candidates: [] } // Missing!
    ];
    
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, ['cafe before hospital'], {});
    
    assert.strictEqual(res.status, 'error');
    assert.match(res.message, /No eligible candidates available/);
  });

  // 5. Duplicate stop prevention
  await test('Prevents routing a multi-stop itinerary that uses the exact same physical place twice', async () => {
    OSRMService.getDrivingRoute = async () => ({ durationSeconds: 1500, distanceMeters: 60000 });
    
    const groups = [
      { category: 'gas', candidates: [{ osmId: 99, osmType: 'node', lat: 15, lon: 15 }] },
      { category: 'shop', candidates: [{ osmId: 99, osmType: 'node', lat: 15, lon: 15 }] } // Same place
    ];
    
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, ['gas before shop'], {});
    
    assert.strictEqual(res.status, 'error');
    assert.match(res.message, /No valid, routable itineraries/); // The permutation was discarded
  });

  // 6. Unroutable middle segment
  await test('Marks itinerary unroutable if OSRM rejects the multi-waypoint graph', async () => {
    OSRMService.getDrivingRoute = async () => { throw new Error('NoRoute'); };
    
    const groups = [{ category: 'cafe', candidates: [{ osmId: 1, lat: 11, lon: 11 }] }];
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, [], {});
    
    assert.strictEqual(res.status, 'error');
    assert.match(res.message, /No valid, routable itineraries/);
  });

  // 7. Multi-stop hard constraints
  await test('Discards itineraries that exceed the global maximum additional driving time limit', async () => {
    // Baseline is 1000s. OSRM returns 1800s. Extra is 800s.
    OSRMService.getDrivingRoute = async () => ({ durationSeconds: 1800, distanceMeters: 70000 });
    
    const groups = [{ category: 'cafe', candidates: [{ osmId: 1, lat: 11, lon: 11 }] }];
    const globalReq = { maxAdditionalDrivingTime: { value: 10, unit: 'minutes' } }; // 600s limit
    
    const res = await MultiStopItineraryService.buildItinerary(origin, dest, baseline, groups, [], globalReq);
    
    assert.strictEqual(res.status, 'error');
    // Result was discarded because 800s > 600s limit
  });

  // Restore overrides
  OSRMService.getDrivingRoute = originalOSRM;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
