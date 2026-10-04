const OverpassService = require('./overpassService');
const CorridorUtils = require('../utils/corridorUtils');
const envConfig = require('../config/env');

/**
 * PlaceSearchService
 * 
 * Orchestrates fetching real places from OpenStreetMap that exist near the exact baseline route.
 * Features controlled geographic corridor expansion (e.g. 2km -> 5km -> 10km) if insufficient 
 * eligible candidates are found.
 */
class PlaceSearchService {
  /**
   * Searches for real places matching the required constraints with progressive corridor expansion.
   * @param {Object} routeGeometry - GeoJSON LineString of the baseline route.
   * @param {Array<Object>} requestedPlaces - Array of requested place objects from the LLM prompt schema.
   * @returns {Promise<Object>} Object containing the expansion level reached and final eligible candidates.
   */
  static async searchPlacesAlongRoute(routeGeometry, requestedPlaces) {
    if (!routeGeometry || routeGeometry.type !== 'LineString' || !Array.isArray(routeGeometry.coordinates) || routeGeometry.coordinates.length < 2) {
      throw new Error('Invalid route geometry provided.');
    }
    
    if (!Array.isArray(requestedPlaces) || requestedPlaces.length === 0) {
      return { levelMeters: 0, candidates: [] };
    }

    const corridors = envConfig.searchCorridors;
    const allSeenOsmIds = new Set();
    const finalEligibleCandidates = [];
    let stoppedAtLevel = corridors[0];
    
    // Deduplicate requested places based on their combined osmTags string
    const uniqueTags = new Set();
    const deduplicatedPlaces = [];
    for (const req of requestedPlaces) {
      if (!req.osmTags || !Array.isArray(req.osmTags)) continue;
      const tagStr = JSON.stringify(req.osmTags);
      if (!uniqueTags.has(tagStr)) {
        uniqueTags.add(tagStr);
        deduplicatedPlaces.push(req);
      }
    }

    // In-memory cache for this specific workflow request to avoid duplicate identical Overpass queries
    const queryCache = new Map();

    // Expansion loop
    for (const widthMeters of corridors) {
      stoppedAtLevel = widthMeters;
      const searchAreas = CorridorUtils.generateSearchAreas(routeGeometry, widthMeters);

      for (const reqPlace of deduplicatedPlaces) {
        if (!reqPlace.osmTags || reqPlace.osmTags.length === 0) continue;
        
        const orderedAreas = [...searchAreas];
        if (reqPlace.proximityPreference === 'destination') {
          orderedAreas.reverse();
        }

        for (const bbox of orderedAreas) {
          try {
            const cacheKey = `${JSON.stringify(reqPlace.osmTags)}-${JSON.stringify(bbox)}`;
            let places;
            if (queryCache.has(cacheKey)) {
              places = queryCache.get(cacheKey);
            } else {
              // Add a 1 second delay to respect Overpass public API rate limits
              await new Promise(resolve => setTimeout(resolve, 1000));
              places = await OverpassService.fetchPlaces(reqPlace.osmTags, bbox);
              queryCache.set(cacheKey, places);
            }
            
            for (const place of places) {
              place.category = reqPlace.category || 'Unnamed Place'; // Restore the display string
              const uniqueId = `${place.osmType}-${place.osmId}`;
              
              if (!allSeenOsmIds.has(uniqueId)) {
                allSeenOsmIds.add(uniqueId);
                
                if (typeof place.lat === 'number' && typeof place.lon === 'number') {
                  if (CorridorUtils.isInsideTrueCorridor(place.lat, place.lon, routeGeometry, widthMeters)) {
                    if (this._isEligible(place, reqPlace)) {
                      finalEligibleCandidates.push(place);
                    }
                  }
                }
              }
            }

            // OPTIMIZATION: If we already found plenty of valid candidates in this chunk,
            // stop querying Overpass for the rest of the route chunks to prevent 
            // timeouts, rate-limits, and massive unnecessary API payloads.
            if (finalEligibleCandidates.length >= 25) {
              break;
            }
          } catch (error) {
            throw new Error(`Place search failed during ${widthMeters}m expansion: ${error.message}`);
          }
        }
      }

      if (finalEligibleCandidates.length >= 3) {
        break;
      }
    }

    return {
      levelMeters: stoppedAtLevel,
      candidates: finalEligibleCandidates
    };
  }

  /**
   * Evaluates if a raw OSM element genuinely satisfies the user's hard constraints.
   * Do not silently treat unsupported constraints as satisfied.
   */
  static _isEligible(place, requirements) {
    // If the user requested a strict rating, but our current system has no rating provider,
    // this candidate CANNOT be proven to satisfy the constraint, thus it fails eligibility.
    if (requirements.ratingThreshold && requirements.ratingThreshold.value != null) {
      return false;
    }

    // If the user supplied arbitrary hard constraints that we aren't equipped to map to OSM tags yet,
    // we cannot guarantee the place meets them. Fail eligibility.
    if (requirements.hardConstraints && requirements.hardConstraints.length > 0) {
      return false;
    }

    // Place passes eligibility (either no constraints, or we eventually implement tag-matching here)
    return true;
  }
}

module.exports = PlaceSearchService;
