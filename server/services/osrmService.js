const envConfig = require('../config/env');

const OSRM_ENDPOINT = envConfig.osrmEndpoint || 'http://router.project-osrm.org';

/**
 * Service to interact with the Open Source Routing Machine (OSRM).
 * 
 * Documentation on Data Limits: 
 * - OSRM provides estimated driving durations based on average road speeds. 
 * - It is NOT necessarily live traffic-aware.
 * - The public OSRM demo server is a prototype dependency. 
 * - This service should not be used as a guaranteed high-volume production service without rate limiting or a dedicated instance.
 */
class OSRMService {
  /**
   * Calculates a driving route between multiple coordinates.
   * @param {Array<{lat: number, lon: number}>} coordinates - Array of coordinates in order of travel.
   * @param {object} options - Optional overrides (e.g., timeoutMs).
   * @returns {Promise<Object>} Normalized route details containing distance (meters), duration (seconds), and GeoJSON geometry.
   */
  static async getDrivingRoute(coordinates, options = {}) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('At least two valid coordinates are required to calculate a route.');
    }

    // OSRM expects coordinates in 'lon,lat' format separated by semicolons
    const coordString = coordinates.map(c => {
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') {
        throw new Error('Invalid coordinates: lat and lon must be strictly numeric.');
      }
      return `${c.lon},${c.lat}`;
    }).join(';');

    // Use route/v1/driving profile. Request full geometry as GeoJSON unless explicitly disabled.
    const overviewParam = options.includeGeometry === false ? 'false' : 'full';
    const url = `${options.endpoint || OSRM_ENDPOINT}/route/v1/driving/${coordString}?overview=${overviewParam}&geometries=geojson`;

    const timeoutMs = options.timeoutMs || envConfig.requestTimeoutMs;

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'SafePath-Dev-App/1.0'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new Error('OSRM API request timed out.');
      }
      throw new Error(`OSRM network failure: ${error.message}`);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // OSRM usually returns 400 for NoRoute, InvalidQuery, etc.
      if (data && data.code === 'NoRoute') {
        throw new Error('No driving route could be found between the specified coordinates.');
      }
      throw new Error(`OSRM API returned error status: ${response.status}. ${data ? data.message : ''}`);
    }

    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new Error('Malformed provider data or no route found.');
    }

    const primaryRoute = data.routes[0];

    // Validate numeric returns strictly. Never replace a failed route with straight-line fabrications.
    if (typeof primaryRoute.distance !== 'number' || typeof primaryRoute.duration !== 'number') {
      throw new Error('OSRM returned invalid numeric values for distance or duration.');
    }

    return {
      distanceMeters: primaryRoute.distance, // Kept explicitly in meters.
      durationSeconds: primaryRoute.duration, // Kept explicitly in seconds.
      legs: primaryRoute.legs ? primaryRoute.legs.map(l => ({
        distanceMeters: l.distance,
        durationSeconds: l.duration
      })) : [],
      geometry: primaryRoute.geometry, // GeoJSON LineString
      source: 'Open Source Routing Machine (OSRM)'
    };
  }
}

module.exports = OSRMService;
