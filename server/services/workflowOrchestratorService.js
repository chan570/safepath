const { performance } = require('perf_hooks');
const PromptService = require('./promptService');
const BaselineRouteService = require('./baselineRouteService');
const PlaceSearchService = require('./placeSearchService');
const CandidateRoutingService = require('./candidateRoutingService');
const CandidateRankingService = require('./candidateRankingService');
const MultiStopItineraryService = require('./multiStopItineraryService');

class WorkflowOrchestratorService {
  static async planRoute(userRequest) {
    const tStart = performance.now();
    try {
      // 1-3. Prompt Interpretation
      const tPromptStart = performance.now();
      const promptResult = await PromptService.parseIntent(userRequest.prompt, userRequest);
      const tPromptMs = performance.now() - tPromptStart;
      
      if (promptResult.status === 'error') {
        throw new Error(promptResult.message);
      }
      if (promptResult.status === 'clarification_required') {
        return { 
          status: 'clarification_required', 
          ambiguities: [...(promptResult.ambiguities || []), ...(promptResult.unsupportedRequirements || [])] 
        };
      }

      const intent = promptResult.data; 
      if (!intent.origin || !intent.destination) {
        return { status: 'clarification_required', ambiguities: ['Origin and destination are strictly required.'] };
      }
      if (intent.requestedPlaces && intent.requestedPlaces.some(rp => rp.ratingThreshold)) {
        return { status: 'unsupported_constraint', message: 'Requested rating threshold is unverifiable.' };
      }

      // 4-5. Baseline Routing
      const tBaselineStart = performance.now();
      const originInput = userRequest.resolvedOrigin || intent.origin;
      const destInput = userRequest.resolvedDestination || intent.destination;
      const baselineResult = await BaselineRouteService.getBaselineRoute(originInput, destInput);
      const tBaselineMs = performance.now() - tBaselineStart;
      
      if (baselineResult.status === 'clarification_required') return baselineResult; 
      if (baselineResult.status === 'error') return { status: 'provider_error', message: baselineResult.errors.join('; ') };

      const baselineRoute = baselineResult.route;
      const routeGeometry = baselineRoute.geometry;
      const globalConstraints = { maxAdditionalDrivingTime: intent.maxAdditionalDrivingTime };

      if (!intent.requestedPlaces || intent.requestedPlaces.length === 0) {
        console.log(`[Perf] Workflow complete in ${Math.round(performance.now() - tStart)}ms (Baseline only)`);
        return { status: 'success', type: 'baseline_only', baselineRoute };
      }

      // MULTI-STOP
      if (intent.requestedPlaces.length > 1) {
        const orderedCategoryGroups = [];
        const tSearchStart = performance.now();
        for (const reqPlace of intent.requestedPlaces) {
          const searchResult = await PlaceSearchService.searchPlacesAlongRoute(routeGeometry, [reqPlace]);
          orderedCategoryGroups.push({ category: reqPlace.category, candidates: searchResult.candidates });
        }
        const tSearchMs = performance.now() - tSearchStart;
        
        const tItineraryStart = performance.now();
        const itineraryResult = await MultiStopItineraryService.buildItinerary(
          baselineRoute.origin, baselineRoute.destination, baselineRoute, 
          orderedCategoryGroups, intent.stopOrderRequirements, globalConstraints
        );
        const tItineraryMs = performance.now() - tItineraryStart;
        
        if (itineraryResult.status === 'clarification_required') return { status: 'clarification_required', ambiguities: itineraryResult.ambiguities };
        if (itineraryResult.status === 'error') return { status: 'no_results', message: itineraryResult.message };

        console.log(`[Perf] Multi-stop complete in ${Math.round(performance.now() - tStart)}ms (Prompt: ${Math.round(tPromptMs)}ms, Base: ${Math.round(tBaselineMs)}ms, Search: ${Math.round(tSearchMs)}ms, Itinerary: ${Math.round(tItineraryMs)}ms)`);

        return {
           status: 'success',
           type: 'multi-stop',
           baselineRoute,
           itinerary: itineraryResult.bestItinerary,
           alternatives: itineraryResult.alternatives
        };
      } 
      
      // SINGLE-STOP
      const reqPlace = intent.requestedPlaces[0];
      
      const tSearchStart = performance.now();
      const searchResult = await PlaceSearchService.searchPlacesAlongRoute(routeGeometry, [reqPlace]);
      const tSearchMs = performance.now() - tSearchStart;
      
      if (searchResult.candidates.length === 0) {
          return { status: 'no_results', message: `No eligible '${reqPlace.category}' found.` };
      }

      const tRouteStart = performance.now();
      const routingResult = await CandidateRoutingService.calculateCandidateRoutes(
        baselineRoute.origin, baselineRoute.destination, baselineRoute, searchResult.candidates, reqPlace
      );
      const tRouteMs = performance.now() - tRouteStart;

      const searchContext = {
        searchCorridorUsedMeters: searchResult.levelMeters,
        rawCandidatesDiscovered: searchResult.candidates.length,
        limitExceeded: routingResult.limitExceeded
      };
      
      const rankingResult = await CandidateRankingService.rankCandidates(
        [...routingResult.routableCandidates, ...routingResult.unroutableCandidates],
        reqPlace, globalConstraints, searchContext
      );

      console.log(`[Perf] Single-stop complete in ${Math.round(performance.now() - tStart)}ms (Prompt: ${Math.round(tPromptMs)}ms, Base: ${Math.round(tBaselineMs)}ms, Search: ${Math.round(tSearchMs)}ms, Route: ${Math.round(tRouteMs)}ms)`);

      if (rankingResult.results.length === 0) {
          return { 
            status: 'no_results', 
            message: 'Candidates were found, but none met all mandatory constraints or were routable.',
            metadata: rankingResult.metadata 
          };
      }

      return {
        status: 'success',
        type: 'single-stop',
        baselineRoute,
        metadata: rankingResult.metadata,
        results: rankingResult.results
      };
      
    } catch (error) {
       console.error('[WorkflowOrchestrator Error]', error);
       const msg = error.message || '';
       
       if (msg.includes('Ollama network failure') || msg.includes('Ollama daemon unreachable') || msg.includes("not found. Run 'ollama pull")) {
         return { status: 'provider_error', message: 'Ollama is unavailable or the configured local model is missing. Please start the local model. We do not fall back to cloud models.' };
       }
       if (msg.includes('JSON') || msg.includes('Malformed') || msg.includes('Ollama')) {
         return { status: 'internal_error', message: 'The local model returned invalid JSON or an unexpected schema.' };
       }
       if (msg.includes('Overpass') || msg.includes('rate limit')) {
         return { status: 'provider_error', message: 'The OpenStreetMap Overpass search service returned an error, hit a rate limit, or timed out.' };
       }
       if (msg.includes('OSRM') || msg.includes('NoRoute') || msg.includes('unroutable')) {
         return { status: 'provider_error', message: 'The OSRM routing service returned an error, no route, invalid geometry, or timed out.' };
       }
       if (msg.includes('Nominatim') || msg.includes('Geocoding')) {
         return { status: 'provider_error', message: 'The geocoding service returned an error or timed out.' };
       }

       return { status: 'internal_error', message: 'An unexpected internal exception occurred. Please try again.' };
    }
  }
}

module.exports = WorkflowOrchestratorService;
