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
      if (intent.requestedPlaces && intent.requestedPlaces.length > 3) {
        return { status: 'unsupported_constraint', message: 'You can request a maximum of 3 different stops in a single journey to ensure fast route processing.' };
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
        const tSearchStart = performance.now();
        // Run independent multi-stop place searches concurrently using the array mode
        const searchResults = await PlaceSearchService.searchPlacesAlongRoute(routeGeometry, intent.requestedPlaces);
        const stopRequirementGroups = searchResults.map(res => ({
          userRequirement: res.userRequirement,
          candidates: res.candidates
        }));
        const tSearchMs = performance.now() - tSearchStart;
        
        const tItineraryStart = performance.now();
        const itineraryResult = await MultiStopItineraryService.buildItinerary(
          baselineRoute.origin, baselineRoute.destination, baselineRoute, 
          stopRequirementGroups, intent.stopOrderRequirements, globalConstraints
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
      const displayName = reqPlace.userRequirement || 'Place';
      
      const tSearchStart = performance.now();
      const searchResult = await PlaceSearchService.searchPlacesAlongRoute(routeGeometry, [reqPlace]);
      const tSearchMs = performance.now() - tSearchStart;
      
      if (searchResult.candidates.length === 0) {
          return { status: 'no_results', message: `No eligible '${displayName}' found.` };
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
      
      const tRankStart = performance.now();
      const rankingResult = await CandidateRankingService.rankCandidates(
        [...routingResult.routableCandidates, ...routingResult.unroutableCandidates],
        reqPlace, globalConstraints, searchContext
      );
      const tRankMs = performance.now() - tRankStart;

      if (rankingResult.results.length === 0) {
          return { 
            status: 'no_results', 
            message: 'Candidates were found, but none met all mandatory constraints or were routable.',
            metadata: rankingResult.metadata 
          };
      }

      // OPTIMIZATION: Fetch detailed GeoJSON geometries ONLY for the top 3 winning candidates.
      // Fetch final top-candidate route geometries concurrently instead of sequentially.
      const OSRMService = require('./osrmService');
      const originCoords = baselineRoute.origin;
      const destCoords = baselineRoute.destination;
      
      const tGeoStart = performance.now();
      await Promise.all(rankingResult.results.map(async (candidate) => {
        const candidateCoords = { lat: candidate.lat, lon: candidate.lon };
        try {
          const [r1, r2] = await Promise.all([
            OSRMService.getDrivingRoute([originCoords, candidateCoords], { includeGeometry: true }),
            OSRMService.getDrivingRoute([candidateCoords, destCoords], { includeGeometry: true })
          ]);
          candidate.route1Geometry = r1.geometry;
          candidate.route2Geometry = r2.geometry;
        } catch (err) {
          console.warn(`[WorkflowOrchestrator] Failed to fetch full geometry for candidate ${candidate.name}:`, err.message);
        }
      }));
      const tGeoMs = performance.now() - tGeoStart;

      console.log(`[Perf] Single-stop complete in ${Math.round(performance.now() - tStart)}ms (Prompt: ${Math.round(tPromptMs)}ms, Base: ${Math.round(tBaselineMs)}ms, Search: ${Math.round(tSearchMs)}ms, Route: ${Math.round(tRouteMs)}ms, Rank: ${Math.round(tRankMs)}ms, Geo: ${Math.round(tGeoMs)}ms)`);

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
