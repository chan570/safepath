const turf = require('@turf/turf');

/**
 * Route Corridor Utility
 * Calculates geographic search areas along a baseline route geometry.
 * 
 * Accuracy Limits & Documentation:
 * - This utility generates Overpass-compatible Bounding Boxes (bboxes).
 * - Because routes are often diagonal, a bounding box encompassing a route segment 
 *   will invariably cover geographic areas OUTSIDE the true intended corridor.
 * - To ensure accuracy, the downstream candidate-filtering step MUST use the 
 *   `isInsideTrueCorridor` method to verify each place's actual point-to-line distance 
 *   from the exact route geometry, rather than relying solely on bounding box inclusion.
 */
class CorridorUtils {
  /**
   * Generates a set of bounded geographic search areas (bboxes) covering the route padded by corridor width.
   * @param {Object} geometry - GeoJSON LineString of the route.
   * @param {number} widthMeters - Search corridor width in meters.
   * @returns {Array<{south: number, west: number, north: number, east: number}>} Array of bounding boxes.
   */
  static generateSearchAreas(geometry, widthMeters) {
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      throw new Error('Invalid geometry: must be a GeoJSON LineString with at least 2 coordinates.');
    }

    if (typeof widthMeters !== 'number' || widthMeters <= 0) {
      throw new Error('Invalid corridor width: must be a positive number in meters.');
    }

    const line = turf.lineString(geometry.coordinates);
    const totalLengthKm = turf.length(line, { units: 'kilometers' });
    const bufferKm = widthMeters / 1000;

    const searchAreas = [];

    // For most regional routes (< 100km), one padded bounding box is sufficient and prevents unnecessary Overpass queries.
    // For longer routes, we chunk the route to avoid generating a massive diagonal bounding box that captures
    // irrelevant remote areas, reducing payload size and respecting Overpass usage policies.
    if (totalLengthKm <= 100) {
      const buffered = turf.buffer(line, bufferKm, { units: 'kilometers' });
      const [west, south, east, north] = turf.bbox(buffered);
      searchAreas.push({ south, west, north, east });
    } else {
      const segments = turf.lineChunk(line, 100, { units: 'kilometers' });
      segments.features.forEach(segment => {
        const buffered = turf.buffer(segment, bufferKm, { units: 'kilometers' });
        const [west, south, east, north] = turf.bbox(buffered);
        searchAreas.push({ south, west, north, east });
      });
    }

    return searchAreas;
  }

  /**
   * Checks if a point is strictly within the specified distance of the route geometry.
   * @param {number} lat - Latitude of the place
   * @param {number} lon - Longitude of the place
   * @param {Object} geometry - GeoJSON LineString of the baseline route
   * @param {number} widthMeters - Corridor width threshold in meters
   * @returns {boolean} True if the place is within the true route corridor.
   */
  static isInsideTrueCorridor(lat, lon, geometry, widthMeters) {
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      throw new Error('Invalid geometry: must be a GeoJSON LineString with at least 2 coordinates.');
    }

    const pt = turf.point([lon, lat]);
    const line = turf.lineString(geometry.coordinates);
    const distanceKm = turf.pointToLineDistance(pt, line, { units: 'kilometers' });
    
    return (distanceKm * 1000) <= widthMeters;
  }
}

module.exports = CorridorUtils;
