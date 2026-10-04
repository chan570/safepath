const assert = require('assert');
const OllamaService = require('../services/ollamaService');

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

  console.log('--- MOCKED OLLAMA TESTS ---');

  // 1. Health Check - Completely unreachable
  await test('Health check returns graceful error when daemon is offline', async () => {
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };
    const health = await OllamaService.checkHealth();
    assert.strictEqual(health.isReachable, false);
    assert.strictEqual(health.hasModel, false);
    assert.match(health.details, /unreachable/);
  });

  // 2. Health Check - Reachable but model missing
  await test('Health check detects missing model', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'mistral:latest' }] }) // Wrong model installed
    });
    const health = await OllamaService.checkHealth();
    assert.strictEqual(health.isReachable, true);
    assert.strictEqual(health.hasModel, false);
    assert.match(health.details, /not found/);
  });

  // 3. Health Check - Healthy
  await test('Health check detects correctly configured model', async () => {
    const conf = OllamaService._getProviderConfig();
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ models: [{ name: conf.model }] })
    });
    const health = await OllamaService.checkHealth();
    assert.strictEqual(health.isReachable, true);
    assert.strictEqual(health.hasModel, true);
  });

  // 4. Inference - Handles Timeout (Resource exhaustion)
  await test('Inference properly handles CPU/RAM timeout errors', async () => {
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
      await OllamaService.generateText('Test prompt', { timeoutMs: 50 });
      assert.fail('Should have thrown timeout error');
    } catch (err) {
      assert.match(err.message, /timed out/);
    }
  });

  // 5. Inference - Validates 404 Model Not Found
  await test('Inference properly distinguishes 404 Model Not Found', async () => {
    global.fetch = async () => ({ ok: false, status: 404 });
    try {
      await OllamaService.generateText('Test');
      assert.fail('Should have thrown model not found');
    } catch (err) {
      assert.match(err.message, /not found/);
    }
  });

  // Restore fetch
  global.fetch = originalFetch;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
