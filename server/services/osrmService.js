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
    if (options.metrics) {
      options.metrics.osrmRequests = (options.metrics.osrmRequests || 0) + 1;
    }
    
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

  /**
   * Retrieves a matrix of durations and distances using the OSRM Table API.
   * @param {Array<{lat: number, lon: number}>} sources - Array of source coordinates.
   * @param {Array<{lat: number, lon: number}>} destinations - Array of destination coordinates.
   * @param {object} options - Optional overrides.
   */
  static async getTable(sources, destinations, options = {}) {
    if (options.metrics) {
      options.metrics.osrmTableRequests = (options.metrics.osrmTableRequests || 0) + 1;
    }
    
    if (!sources || sources.length === 0 || !destinations || destinations.length === 0) {
      throw new Error('Sources and destinations are required for Table API.');
    }

    const allCoords = [...sources, ...destinations];
    const coordString = allCoords.map(c => {
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') {
        throw new Error('Invalid coordinates: lat and lon must be strictly numeric.');
      }
      return `${c.lon},${c.lat}`;
    }).join(';');
    
    const sourceIndices = sources.map((_, i) => i).join(',');
    const destIndices = destinations.map((_, i) => i + sources.length).join(',');

    const url = `${options.endpoint || OSRM_ENDPOINT}/table/v1/driving/${coordString}?sources=${sourceIndices}&destinations=${destIndices}&annotations=duration,distance`;

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
        throw new Error('OSRM Table API request timed out.');
      }
      throw new Error(`OSRM Table network failure: ${error.message}`);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`OSRM Table API returned error status: ${response.status}. ${data ? data.message : ''}`);
    }

    if (!data || data.code !== 'Ok' || !data.durations || !data.distances) {
      throw new Error('Malformed provider data from OSRM Table API.');
    }

    return {
      durations: data.durations, // 2D array [sourceIndex][destIndex] -> seconds
      distances: data.distances  // 2D array [sourceIndex][destIndex] -> meters
    };
  }
}

module.exports = OSRMService;
