const assert = require('assert');
const PromptService = require('../services/promptService');
const OllamaService = require('../services/ollamaService');

// Helper to mock Ollama for specific tests
function mockOllamaJSON(responseObject) {
  OllamaService.generateText = async () => JSON.stringify(responseObject);
}

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

  const originalGenerate = OllamaService.generateText;

  console.log('--- PROMPT SERVICE MOCKED TESTS ---');

  // 1. Ordinary Prompt
  await test('Successfully parses a standard complete request', async () => {
    mockOllamaJSON({
      origin: "Ludhiana",
      destination: "Jalandhar",
      numberOfStopsRequested: 1,
      requestedPlaces: [{
        category: "fuel station", // Will be normalized to 'petrol_pump'
        hardConstraints: [], softPreferences: [], ratingThreshold: null
      }],
      maxAdditionalDrivingTime: null,
      stopOrderRequirements: [],
      ambiguities: [],
      unsupportedRequirements: []
    });

    const result = await PromptService.parseIntent('Ludhiana to Jalandhar, need a fuel station.');
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.data.origin, 'Ludhiana');
    assert.strictEqual(result.data.requestedPlaces[0].category, 'petrol_pump', 'Should normalize category alias');
  });

  // 2. Ambiguous Prompt (Missing Destination)
  await test('Requests clarification for missing destination', async () => {
    mockOllamaJSON({
      origin: "Delhi",
      destination: null, // Missing
      numberOfStopsRequested: 1,
      requestedPlaces: [{ category: "restaurant", hardConstraints: [], softPreferences: [], ratingThreshold: null }],
      maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
    });

    const result = await PromptService.parseIntent('Find a restaurant starting from Delhi.');
    assert.strictEqual(result.status, 'clarification_required');
    assert.ok(result.ambiguities.some(a => a.includes('Destination location is missing')));
  });

  // 3. Unsupported Category
  await test('Safely rejects unsupported categories without unrestricted queries', async () => {
    mockOllamaJSON({
      origin: "A", destination: "B", numberOfStopsRequested: 1,
      requestedPlaces: [{
        category: "spaceship port", // Unrecognized
        hardConstraints: [], softPreferences: [], ratingThreshold: null
      }],
      maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
    });

    const result = await PromptService.parseIntent('A to B, find a spaceship port.');
    assert.strictEqual(result.status, 'clarification_required');
    assert.ok(result.unsupportedRequirements.some(req => req.includes("Category 'spaceship port' is currently unsupported")));
  });

  // 4. Markdown Wrapped JSON
  await test('Strips Markdown fences from JSON output', async () => {
    OllamaService.generateText = async () => '```json\n' + JSON.stringify({
      origin: "A", destination: "B", numberOfStopsRequested: null,
      requestedPlaces: [], maxAdditionalDrivingTime: null,
      stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
    }) + '\n```';
    const result = await PromptService.parseIntent('A to B');
    assert.strictEqual(result.status, 'success');
  });

  // 5. Retries on Malformed JSON
  await test('Retries once on malformed JSON before failing', async () => {
    let callCount = 0;
    OllamaService.generateText = async () => {
      callCount++;
      return 'This is just some text, not JSON.';
    };
    const result = await PromptService.parseIntent('A to B');
    assert.strictEqual(callCount, 2, 'Should have retried exactly once');
    assert.strictEqual(result.status, 'error');
    assert.match(result.message, /malformed JSON/);
  });

  // 6. Schema Violation with Retry
  await test('Retries output that violates strict JSON Schema', async () => {
    let callCount = 0;
    OllamaService.generateText = async () => {
      callCount++;
      return JSON.stringify({
        origin: "A",
        // missing destination completely, breaking schema
        numberOfStopsRequested: 1,
        requestedPlaces: [],
        maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: []
      });
    };
    const result = await PromptService.parseIntent('A to B');
    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.status, 'error');
    assert.match(result.message, /invalid schema structure/);
  });

  // 7. Ollama Service Failure
  await test('Propagates Ollama timeouts and network failures', async () => {
    OllamaService.generateText = async () => { throw new Error('TimeoutError'); };
    const result = await PromptService.parseIntent('A to B');
    assert.strictEqual(result.status, 'error');
    assert.match(result.message, /TimeoutError/);
  });

  OllamaService.generateText = originalGenerate;

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
