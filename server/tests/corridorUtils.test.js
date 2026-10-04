const assert = require('assert');
const CorridorUtils = require('../utils/corridorUtils');

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

  console.log('--- CORRIDOR UTILS TESTS ---');

  const shortGeometry = {
    type: 'LineString',
    coordinates: [[0, 0], [0, 0.1]] // Approx 11km line along longitude 0
  };

  const longGeometry = {
    type: 'LineString',
    coordinates: [[0, 0], [0, 1]] // Approx 111km line
  };
  
  const bendyGeometry = {
    type: 'LineString',
    coordinates: [[0, 0], [0.1, 0.1], [0, 0.2]] 
  };

  const widthMeters = 2000; // 2km radius around the route

  // 1. Short Route
  test('Short route returns a single padded bounding box', () => {
    const areas = CorridorUtils.generateSearchAreas(shortGeometry, widthMeters);
    assert.strictEqual(areas.length, 1);
    assert.ok(areas[0].south < areas[0].north);
    assert.ok(areas[0].west < areas[0].east);
  });

  // 2. Long Route
  test('Long route chunks into multiple bounding boxes for efficient Overpass usage', () => {
    const areas = CorridorUtils.generateSearchAreas(longGeometry, widthMeters);
    assert.ok(areas.length > 1, 'Should chunk a 111km route into multiple bboxes');
  });

  // 3. Route with several bends
  test('Route with bends generates appropriate areas and evaluates correctly', () => {
    const areas = CorridorUtils.generateSearchAreas(bendyGeometry, widthMeters);
    assert.ok(areas.length > 0);
  });

  // 4. Invalid geometry
  test('Rejects malformed or empty route geometry', () => {
    try {
      CorridorUtils.generateSearchAreas({ type: 'LineString', coordinates: [] }, widthMeters);
      assert.fail('Should reject empty coordinates');
    } catch (err) {
      assert.match(err.message, /Invalid geometry/);
    }
    
    try {
      CorridorUtils.isInsideTrueCorridor(0, 0, null, widthMeters);
      assert.fail('Should reject null geometry');
    } catch (err) {
      assert.match(err.message, /Invalid geometry/);
    }
  });

  // 5. Place near the route
  test('Returns true for a place physically located inside the 2km true corridor', () => {
    // A point 0.01 degrees North of origin [0,0] is approx 1.1km away.
    // The route line starts at [0,0] and goes North to [0,0.1]. 
    // Thus it is directly on the line (distance 0) and inside the 2km limit.
    const isInside = CorridorUtils.isInsideTrueCorridor(0.01, 0, shortGeometry, widthMeters);
    assert.strictEqual(isInside, true);
  });

  // 6. Geographic Bounding Box vs True Corridor verification
  test('Place inside the bounding box but outside intended corridor returns false', () => {
    const areas = CorridorUtils.generateSearchAreas(shortGeometry, widthMeters);
    const bbox = areas[0];

    // The bounding box is created by drawing a 2km radius (circle) around the line segment,
    // and then drawing a rectangular box that encompasses that capsule shape.
    // The extreme corner of the rectangular bounding box (bbox.south, bbox.west) 
    // is geometrically further away from the origin [0,0] than 2km (approx 2.82km due to Pythagoras).
    
    const cornerLat = bbox.south;
    const cornerLon = bbox.west;

    // Assert the point is technically inside the rectangular bounding box limits returned for Overpass
    assert.ok(cornerLat >= bbox.south && cornerLat <= bbox.north, 'Point is within bbox lat bounds');
    assert.ok(cornerLon >= bbox.west && cornerLon <= bbox.east, 'Point is within bbox lon bounds');

    // Assert the point is mathematically rejected from the true corridor
    const isInsideTrue = CorridorUtils.isInsideTrueCorridor(cornerLat, cornerLon, shortGeometry, widthMeters);
    assert.strictEqual(isInsideTrue, false, 'The bounding box corner is outside the true 2km radial corridor, proving the necessity of the downstream distance filter.');
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
