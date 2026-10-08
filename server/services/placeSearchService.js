const OverpassService = require('./overpassService');
const CorridorUtils = require('../utils/corridorUtils');
const envConfig = require('../config/env');
const OsmTranslationService = require('./osmTranslationService');

/**
 * PlaceSearchService
 * 
 * Orchestrates fetching real places from OpenStreetMap that exist near the exact baseline route.
 * Translates semantic requirements dynamically into OSM tags using OsmTranslationService.
 */
class PlaceSearchService {
  static async searchPlacesAlongRoute(routeGeometry, requestedPlaces) {
    if (!routeGeometry || routeGeometry.type !== 'LineString' || !Array.isArray(routeGeometry.coordinates) || routeGeometry.coordinates.length < 2) {
      throw new Error('Invalid route geometry provided.');
    }
    
    if (!Array.isArray(requestedPlaces) || requestedPlaces.length === 0) {
      return { levelMeters: 0, candidates: [] };
    }

    const corridors = envConfig.searchCorridors;
    const queryCache = new Map();
    const results = [];

    // Process each requirement independently
    for (const reqPlace of requestedPlaces) {
      const seenOsmIds = new Set();
      const eligibleCandidates = [];
      let stoppedAtLevel = corridors[0];
      
      const translation = await OsmTranslationService.translateToOsmTags(reqPlace);
      
      if (!reqPlace.unsupportedRequirements) {
         reqPlace.unsupportedRequirements = [];
      }
      if (translation.unsupportedRequirements) {
         reqPlace.unsupportedRequirements.push(...translation.unsupportedRequirements);
      }

      const hasSearchAlternatives = Array.isArray(translation.searchAlternatives) && translation.searchAlternatives.length > 0;
      const hasRequiredAttributes = Array.isArray(translation.requiredAttributes) && translation.requiredAttributes.length > 0;

      if (!hasSearchAlternatives && !hasRequiredAttributes) {
         console.log(`[PlaceSearchService] No OSM tags could be determined for semantic requirement: ${reqPlace.semanticIntent}`);
         results.push({ userRequirement: reqPlace.userRequirement || 'Place', levelMeters: stoppedAtLevel, candidates: [] });
         continue;
      }

      // Expand corridor for this specific requirement
      for (const widthMeters of corridors) {
        stoppedAtLevel = widthMeters;
        const searchAreas = CorridorUtils.generateSearchAreas(routeGeometry, widthMeters);
        
        const orderedAreas = [...searchAreas];
        if (reqPlace.proximityPreference === 'destination') {
          orderedAreas.reverse();
        }

        let foundEnoughForPlace = false;

        for (const bbox of orderedAreas) {
          try {
            const cacheKey = `${JSON.stringify(translation.searchAlternatives)}-${JSON.stringify(translation.requiredAttributes)}-${JSON.stringify(bbox)}`;
            let places;
            if (queryCache.has(cacheKey)) {
              places = queryCache.get(cacheKey);
            } else {
              await new Promise(resolve => setTimeout(resolve, 200));
              places = await OverpassService.fetchPlaces(translation.searchAlternatives, translation.requiredAttributes, bbox);
              queryCache.set(cacheKey, places);
            }
            
            for (const place of places) {
              place.userRequirement = reqPlace.userRequirement || 'Requested Place';
              place.searchAlternatives = translation.searchAlternatives || [];
              place.requiredAttributes = translation.requiredAttributes || [];
              const uniqueId = `${place.osmType}-${place.osmId}`;
              
              if (!seenOsmIds.has(uniqueId)) {
                seenOsmIds.add(uniqueId);
                
                if (typeof place.lat === 'number' && typeof place.lon === 'number') {
                  if (CorridorUtils.isInsideTrueCorridor(place.lat, place.lon, routeGeometry, widthMeters)) {
                    eligibleCandidates.push(place);
                  }
                }
              }
            }

            if (eligibleCandidates.length >= 5) {
              foundEnoughForPlace = true;
              break;
            }
          } catch (error) {
            throw new Error(`Place search failed during ${widthMeters}m expansion: ${error.message}`);
          }
        }
        
        if (eligibleCandidates.length >= 3) {
          break; // Stop expanding for this requirement
        }
      }
      
      results.push({
        userRequirement: reqPlace.userRequirement || 'Place',
        levelMeters: stoppedAtLevel,
        candidates: eligibleCandidates
      });
    }

    if (requestedPlaces.length === 1) {
      return {
        levelMeters: results[0].levelMeters,
        candidates: results[0].candidates
      };
    }

    return results;
  }
}

module.exports = PlaceSearchService;
