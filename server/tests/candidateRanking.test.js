const assert = require('assert');
const CandidateRankingService = require('../services/candidateRankingService');

async function runTests() {
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

  console.log('--- CANDIDATE RANKING SERVICE TESTS ---');

  const baseCandidates = [
    { osmType: 'node', osmId: 1, category: 'hospital', isRoutable: true, additionalDurationSeconds: 600, viaPlaceDistanceMeters: 55000 },
    { osmType: 'node', osmId: 2, category: 'hospital', isRoutable: true, additionalDurationSeconds: 120, viaPlaceDistanceMeters: 51000 },
    { osmType: 'node', osmId: 3, category: 'hospital', isRoutable: true, additionalDurationSeconds: 300, viaPlaceDistanceMeters: 53000 },
    { osmType: 'node', osmId: 4, category: 'hospital', isRoutable: true, additionalDurationSeconds: 900, viaPlaceDistanceMeters: 59000 },
    { osmType: 'node', osmId: 5, category: 'hospital', isRoutable: false } // Unroutable
  ];

  const searchContext = { searchCorridorUsedMeters: 5000, rawCandidatesDiscovered: 10 };

  // 1. Ranking by minimum extra driving time
  test('Ranks candidates by ascending additional driving time natively', () => {
    const reqPlace = { category: 'hospital', hardConstraints: [], softPreferences: [] }; // No preference -> default time
    const res = CandidateRankingService.rankCandidates(baseCandidates, reqPlace, {}, searchContext);
    
    assert.strictEqual(res.results.length, 3);
    assert.strictEqual(res.results[0].osmId, 2); // 120s
    assert.strictEqual(res.results[1].osmId, 3); // 300s
    assert.strictEqual(res.results[2].osmId, 1); // 600s
    assert.match(res.metadata.rankingCriterion, /Default/);
  });

  // 2. Hard-constraint filtering before ranking
  test('Excludes candidates failing mandatory constraints before ranking', () => {
    const reqPlace = { category: 'hospital', hardConstraints: [] };
    const globalReq = { maxAdditionalDrivingTime: { value: 4, unit: 'minutes' } }; // 240 seconds limit
    
    const res = CandidateRankingService.rankCandidates(baseCandidates, reqPlace, globalReq, searchContext);
    
    // Only osmId 2 (120s) should pass the strict time limit
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].osmId, 2);
    assert.strictEqual(res.metadata.candidatesRejectedByHardConstraints, 3); // 1, 3, 4 rejected
  });

  // 3. Deterministic tie-breaking
  test('Applies deterministic tie-breaking: extra time -> via distance -> OSM ID', () => {
    const tiedCandidates = [
      { osmType: 'way', osmId: 99, category: 'hospital', isRoutable: true, additionalDurationSeconds: 100, viaPlaceDistanceMeters: 1000 },
      { osmType: 'node', osmId: 55, category: 'hospital', isRoutable: true, additionalDurationSeconds: 100, viaPlaceDistanceMeters: 1000 },
      { osmType: 'node', osmId: 10, category: 'hospital', isRoutable: true, additionalDurationSeconds: 100, viaPlaceDistanceMeters: 800 } // Should be first (shortest distance)
    ];
    
    const res = CandidateRankingService.rankCandidates(tiedCandidates, { category: 'hospital' }, {}, searchContext);
    
    assert.strictEqual(res.results[0].osmId, 10); // Wins via shorter distance
    assert.strictEqual(res.results[1].osmId, 55); // Ties on distance, wins lexicographical ID sort (node-55 vs way-99)
    assert.strictEqual(res.results[2].osmId, 99); 
  });

  // 4. Fewer than three eligible candidates
  test('Returns exactly what is available when fewer than 3 candidates exist', () => {
    const shortList = baseCandidates.slice(0, 1);
    const res = CandidateRankingService.rankCandidates(shortList, { category: 'hospital' }, {}, searchContext);
    assert.strictEqual(res.results.length, 1);
  });

  // 5. Unsupported ranking attributes
  test('Flags unsupported subjective ranking preferences and falls back safely', () => {
    const reqPlace = { category: 'hospital', softPreferences: ['find the highest rated'] };
    const res = CandidateRankingService.rankCandidates(baseCandidates, reqPlace, {}, searchContext);
    
    assert.strictEqual(res.metadata.unsupportedAttributes.length, 1);
    assert.match(res.metadata.unsupportedAttributes[0], /ratings is unsupported/);
    assert.strictEqual(res.results[0].osmId, 2); // Falls back to default time-sorting safely
  });

  // 6. Correct result metadata / Wording
  test('Constructs precise and honest search metadata without exaggerations', () => {
    const reqPlace = { category: 'hospital' };
    const res = CandidateRankingService.rankCandidates(baseCandidates, reqPlace, {}, searchContext);
    
    assert.ok(res.metadata.disclaimer.includes('under the available data and routing results'), 'Must include honest disclaimer');
    assert.ok(res.metadata.disclaimer.includes('not strictly real-time traffic aware'), 'Must disclaim routing limits');
    assert.strictEqual(res.metadata.searchCorridorUsedMeters, 5000);
    assert.strictEqual(res.metadata.rawCandidatesDiscovered, 10);
    assert.strictEqual(res.metadata.candidatesSuccessfullyRouted, 4); // 5 elements total, 1 is unroutable
    assert.strictEqual(res.metadata.eligibleCandidatesReturned, 3);
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
