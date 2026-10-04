const assert = require('assert');
const { resolveCategory, getCategoryTags, CATEGORIES } = require('../utils/categoryMapper');

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

  // 1. Exact Category Name match
  test('Exact category name returns canonical key', () => {
    assert.strictEqual(resolveCategory('petrol_pump'), 'petrol_pump');
    assert.strictEqual(resolveCategory('hospital'), 'hospital');
  });

  // 2. Alias match
  test('Alias correctly resolves to canonical key', () => {
    assert.strictEqual(resolveCategory('fuel station'), 'petrol_pump');
    assert.strictEqual(resolveCategory('place to eat'), 'restaurant');
    assert.strictEqual(resolveCategory('sikh temple'), 'gurudwara');
  });

  // 3. Case insensitivity and whitespace handling
  test('Resolution is case-insensitive and ignores extra spaces', () => {
    assert.strictEqual(resolveCategory('  FuEl StAtioN  '), 'petrol_pump');
    assert.strictEqual(resolveCategory('MANDIR'), 'temple');
  });

  // 4. Unknown categories block arbitrary queries
  test('Unknown category returns null (prevents unrestricted queries)', () => {
    assert.strictEqual(resolveCategory('spaceship port'), null);
    assert.strictEqual(resolveCategory('random unmapped thing'), null);
    assert.strictEqual(resolveCategory(''), null);
  });

  // 5. Generated tag mappings match exact OSM documented types
  test('Tag mappings are correctly retrieved for canonical keys', () => {
    const gurudwaraTags = getCategoryTags('gurudwara');
    assert.strictEqual(gurudwaraTags.length, 1);
    assert.strictEqual(gurudwaraTags[0].key, 'amenity');
    assert.strictEqual(gurudwaraTags[0].value, 'place_of_worship');
    assert.strictEqual(gurudwaraTags[0].extra.key, 'religion');
    assert.strictEqual(gurudwaraTags[0].extra.value, 'sikh');

    const restaurantTags = getCategoryTags('restaurant');
    assert.strictEqual(restaurantTags.length, 3);
    assert.ok(restaurantTags.some(t => t.value === 'fast_food'));
    assert.ok(restaurantTags.some(t => t.value === 'cafe'));
  });

  // 6. Test coverage of all required categories
  test('All strictly required categories are present', () => {
    const required = [
      'shop', 'hospital', 'pharmacy', 'restaurant', 
      'petrol_pump', 'temple', 'gurudwara', 'park', 'tourist_attraction'
    ];
    required.forEach(req => {
      assert.ok(CATEGORIES[req], `Missing category requirement: ${req}`);
    });
  });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
