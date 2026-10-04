const assert = require('assert');
const GeocodingService = require('../services/geocodingService');
const config = require('../config/env');

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

  console.log('--- LIVE TESTS ---');
  console.log('Note: Delaying 1.1s between live tests to strictly respect Nominatim usage policy (1 req/sec).');

  // 1. Live: Known Punjab city
  await test('Live: Known Punjab city (Ludhiana)', async () => {
    const result = await GeocodingService.searchLocation('Ludhiana');
    assert(result.candidates.length > 0, 'Should find at least one candidate for Ludhiana');
    assert(result.candidates[0].displayName.includes('Ludhiana'), 'Should include Ludhiana in display name');
    assert.strictEqual(result.candidates[0].address.state.toLowerCase(), 'punjab', 'State should be validated as Punjab');
  });

  await new Promise(r => setTimeout(r, 1100));

  // 2. Live: Ambiguous place name
  await test('Live: Ambiguous place name (Model Town)', async () => {
    const result = await GeocodingService.searchLocation('Model Town');
    assert(result.candidates.length > 1, 'Should find multiple candidates for Model Town, Punjab (avoiding silent arbitrary selection)');
  });

  await new Promise(r => setTimeout(r, 1100));

  // 3. Live: Location outside Punjab
  await test('Live: Location outside Punjab (Delhi)', async () => {
    const result = await GeocodingService.searchLocation('Delhi');
    assert.strictEqual(result.candidates.length, 0, 'Delhi should be strictly filtered out by the geographic Punjab restriction');
  });

  await new Promise(r => setTimeout(r, 1100));

  // 4. Live: Unknown location
  await test('Live: Unknown location (zzzyyyxxx123456)', async () => {
    const result = await GeocodingService.searchLocation('zzzyyyxxx123456');
    assert.strictEqual(result.candidates.length, 0, 'Should return empty candidates for unknown location');
  });

  console.log('\n--- MOCKED TESTS ---');
  const originalFetch = global.fetch;

  // 5. Mock: Malformed provider data
  await test('Mock: Malformed provider data', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ not: "an array" }) // malformed JSON structure
    });

    try {
      await GeocodingService.searchLocation('Fake Place');
      assert.fail('Should have thrown malformed data error');
    } catch (err) {
      assert.match(err.message, /Malformed provider data/);
    }
  });

  // 6. Mock: Timeout
  await test('Mock: Timeout', async () => {
    const originalTimeout = config.requestTimeoutMs;
    config.requestTimeoutMs = 50; // Force immediate timeout in logic
    
    global.fetch = async (url, options) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ ok: true, json: async () => [] });
        }, 500); // Request takes longer than configured timeout
        
        // Listen for abort signal from AbortSignal.timeout
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'TimeoutError';
          reject(err);
        });
      });
    };

    try {
      await GeocodingService.searchLocation('Fake Place');
      assert.fail('Should have thrown timeout error');
    } catch (err) {
      assert.match(err.message, /timed out/);
    } finally {
      config.requestTimeoutMs = originalTimeout;
    }
  });

  // Restore fetch
  global.fetch = originalFetch;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
