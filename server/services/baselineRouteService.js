const GeocodingService = require('./geocodingService');
const OSRMService = require('./osrmService');

/**
 * BaselineRouteService orchestrates calculating the direct journey between an origin and a destination,
 * resolving ambiguous text queries via the GeocodingService, and generating the baseline
 * driving geometry via OSRMService.
 * 
 * Note: The route duration is strictly the baseline driving time. It does not include time
 * spent at stops, appointments, or traffic variations.
 */
class BaselineRouteService {
  /**
   * Calculates the baseline route between origin and destination.
   * @param {string | object} origin - Origin text or a resolved location object {lat, lon}.
   * @param {string | object} destination - Destination text or a resolved location object {lat, lon}.
   * @returns {Promise<Object>} Status object (success, clarification_required, error) with payload.
   */
  static async getBaselineRoute(origin, destination) {
    if (!origin || !destination) {
      return { status: 'error', errors: ['Both origin and destination are required.'] };
    }

    // Helper to resolve text queries or pass-through already resolved coordinate objects
    const resolveLocation = async (input, label) => {
      if (typeof input === 'string') {
        const result = await GeocodingService.searchLocation(input);
        
        if (result.candidates.length === 0) {
          // Empty means it was outside Punjab or completely unmapped
          return { error: `Could not find a valid, supported location for ${label}: '${input}'. It may be outside the supported Punjab area.` };
        }
        if (result.candidates.length > 1) {
          // Do not silently guess an arbitrary candidate.
          return { ambiguity: true, candidates: result.candidates, label, input };
        }
        return { location: result.candidates[0] };
      }
      
      // If already a resolved object (e.g. user selected from a previous clarification)
      if (input && typeof input.lat === 'number' && typeof input.lon === 'number') {
        return { location: input };
      }
      
      return { error: `Invalid ${label} input format.` };
    };

    const originRes = await resolveLocation(origin, 'origin');
    const destRes = await resolveLocation(destination, 'destination');

    const errors = [];
    const ambiguities = [];

    if (originRes.error) errors.push(originRes.error);
    if (destRes.error) errors.push(destRes.error);
    
    if (originRes.ambiguity) ambiguities.push({ type: 'origin', query: origin, candidates: originRes.candidates });
    if (destRes.ambiguity) ambiguities.push({ type: 'destination', query: destination, candidates: destRes.candidates });

    if (errors.length > 0) {
      return { status: 'error', errors };
    }

    if (ambiguities.length > 0) {
      return { status: 'clarification_required', ambiguities };
    }

    // Both locations are perfectly unambiguous and within the supported region
    const originCoords = originRes.location;
    const destCoords = destRes.location;

    try {
      const route = await OSRMService.getDrivingRoute([
        { lat: originCoords.lat, lon: originCoords.lon },
        { lat: destCoords.lat, lon: destCoords.lon }
      ]);

      // Returns GeoJSON geometry which is natively supported by React Leaflet (<GeoJSON data={geometry} />)
      return {
        status: 'success',
        route: {
          ...route,
          origin: originCoords,
          destination: destCoords
        }
      };
    } catch (error) {
      return {
        status: 'error',
        errors: [`Route calculation failed: ${error.message}`]
      };
    }
  }
}

module.exports = BaselineRouteService;
