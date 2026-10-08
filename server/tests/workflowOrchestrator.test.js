const assert = require('assert');
const WorkflowOrchestratorService = require('../services/workflowOrchestratorService');

// Mock all internal services to test orchestration flow exclusively
const PromptService = require('../services/promptService');
const BaselineRouteService = require('../services/baselineRouteService');
const PlaceSearchService = require('../services/placeSearchService');
const CandidateRoutingService = require('../services/candidateRoutingService');
const CandidateRankingService = require('../services/candidateRankingService');
const MultiStopItineraryService = require('../services/multiStopItineraryService');

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

  console.log('--- WORKFLOW ORCHESTRATOR TESTS ---');

  // Backup originals
  const backups = {
    prompt: PromptService.parseIntent,
    baseline: BaselineRouteService.getBaselineRoute,
    search: PlaceSearchService.searchPlacesAlongRoute,
    routing: CandidateRoutingService.calculateCandidateRoutes,
    ranking: CandidateRankingService.rankCandidates,
    multi: MultiStopItineraryService.buildItinerary
  };

  const resetMocks = () => {
    PromptService.parseIntent = async () => ({ status: 'success', data: { origin: 'A', destination: 'B', requestedPlaces: [] } });
    BaselineRouteService.getBaselineRoute = async () => ({ status: 'success', route: { geometry: {} } });
    PlaceSearchService.searchPlacesAlongRoute = async (geom, requested) => {
      if (Array.isArray(requested) && requested.length > 1) {
        return requested.map(req => ({ userRequirement: req.userRequirement, candidates: [{}], levelMeters: 2000 }));
      }
      return { candidates: [{}], levelMeters: 2000 };
    };
    CandidateRoutingService.calculateCandidateRoutes = async () => ({ routableCandidates: [{}], unroutableCandidates: [] });
    CandidateRankingService.rankCandidates = async () => ({ results: [{lat: 0, lon: 0}], metadata: {} });
    MultiStopItineraryService.buildItinerary = async () => ({ status: 'success', bestItinerary: { orderedStops: [] }, alternatives: [] });
  };

  // 1. Successful single-stop request
  await test('Successfully coordinates a complete single-stop route', async () => {
    resetMocks();
    PromptService.parseIntent = async () => ({ status: 'success', data: { origin: 'A', destination: 'B', requestedPlaces: [{ userRequirement: 'cafe' }] } });
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.type, 'single-stop');
    assert.ok(res.results);
  });

  // 2. Clarification-required request
  await test('Halts and returns clarification required for missing origins', async () => {
    resetMocks();
    PromptService.parseIntent = async () => ({ status: 'success', data: { origin: null, destination: 'B' } }); // Missing origin
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'clarification_required');
    assert.match(res.ambiguities[0], /Origin and destination are strictly required/);
  });

  // 3. Geocoding failure (Baseline returns error)
  await test('Propagates provider_error if baseline route/geocoding fails', async () => {
    resetMocks();
    BaselineRouteService.getBaselineRoute = async () => ({ status: 'error', errors: ['Geocoding failed outside Punjab'] });
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'provider_error');
    assert.match(res.message, /Geocoding failed outside Punjab/);
  });

  // 4. Rating thresholds should NOT cause the entire workflow to return unsupported_constraint
  await test('Does not reject the whole request because of ratingThreshold', async () => {
    resetMocks();
    PromptService.parseIntent = async () => ({ status: 'success', data: { 
      origin: 'A', destination: 'B', 
      requestedPlaces: [{ userRequirement: 'cafe', ratingThreshold: { value: 4, operator: '>=' } }] 
    } });
    
    // If it doesn't fail early, it should reach the PlaceSearchService
    let reachedSearch = false;
    PlaceSearchService.searchPlacesAlongRoute = async () => {
        reachedSearch = true;
        return { candidates: [], levelMeters: 2000 };
    };

    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(reachedSearch, true, 'Should have reached PlaceSearchService despite rating threshold');
  });

  // 5. No eligible candidates
  await test('Returns no_results if Overpass expansion loop finds nothing', async () => {
    resetMocks();
    PromptService.parseIntent = async () => ({ status: 'success', data: { origin: 'A', destination: 'B', requestedPlaces: [{ userRequirement: 'alien_base' }] } });
    PlaceSearchService.searchPlacesAlongRoute = async () => ({ candidates: [], levelMeters: 10000 });
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'no_results');
    assert.match(res.message, /No eligible 'alien_base' found/);
  });

  // 6. Multi-stop request
  await test('Successfully coordinates a multi-stop itinerary', async () => {
    resetMocks();
    PromptService.parseIntent = async () => ({ status: 'success', data: { 
      origin: 'A', destination: 'B', 
      requestedPlaces: [{ userRequirement: 'gas' }, { userRequirement: 'shop' }] 
    } });
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.type, 'multi-stop');
    assert.ok(res.itinerary);
  });

  // 7. Internal Server Error (Ollama JSON parsing crash)
  await test('Safely catches and masks internal errors from LLM with specific JSON explanation', async () => {
    resetMocks();
    PromptService.parseIntent = async () => { throw new Error('Ollama failed to parse JSON'); };
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'internal_error');
    assert.match(res.message, /invalid JSON or an unexpected schema/);
  });

  // 8. Ollama missing/unavailable
  await test('Directs user to start Ollama instead of falling back to cloud', async () => {
    resetMocks();
    PromptService.parseIntent = async () => { throw new Error('Ollama network failure'); };
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'provider_error');
    assert.match(res.message, /Ollama is unavailable/);
    assert.match(res.message, /We do not fall back to cloud/);
  });

  // 9. OSRM no route/timeout
  await test('Maps OSRM errors to descriptive public messages', async () => {
    resetMocks();
    PromptService.parseIntent = async () => { throw new Error('OSRM NoRoute'); };
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'provider_error');
    assert.match(res.message, /OSRM routing service/);
    assert.match(res.message, /no route/);
  });

  // 10. Overpass error/rate limit
  await test('Maps Overpass errors to descriptive public messages', async () => {
    resetMocks();
    PromptService.parseIntent = async () => { throw new Error('Overpass hit a rate limit'); };
    
    const res = await WorkflowOrchestratorService.planRoute({ prompt: 'route' });
    assert.strictEqual(res.status, 'provider_error');
    assert.match(res.message, /Overpass search service/);
    assert.match(res.message, /rate limit/);
  });

  // Restore mocks
  Object.assign(PromptService, { parseIntent: backups.prompt });
  Object.assign(BaselineRouteService, { getBaselineRoute: backups.baseline });
  Object.assign(PlaceSearchService, { searchPlacesAlongRoute: backups.search });
  Object.assign(CandidateRoutingService, { calculateCandidateRoutes: backups.routing });
  Object.assign(CandidateRankingService, { rankCandidates: backups.ranking });
  Object.assign(MultiStopItineraryService, { buildItinerary: backups.multi });

  console.log(`\nTests complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
