const { getCategoryTags, resolveCategory } = require('../utils/categoryMapper');
const envConfig = require('../config/env');

const OVERPASS_ENDPOINT = envConfig.overpassEndpoint || 'https://overpass-api.de/api/interpreter';

/**
 * Data Limitations and Integrity Rules for OverpassService:
 * 1. OpenStreetMap does not provide Google-style star ratings. We never generate fake ratings or reviews.
 * 2. An Overpass response guarantees a place was mapped, but does not guarantee the business is currently open.
 * 3. Coordinates for 'ways' and 'relations' are centroids. This centroid is not guaranteed to be an actual building entrance or suitable vehicle access point.
 * 4. We do not invent names for unnamed locations (returns null instead).
 */
class OverpassService {
  /**
   * Fetches POIs from Overpass API within a given bounding box.
   * @param {string} rawCategory - User's category request (must map to an approved category).
   * @param {object} bbox - Geographic search area { south, west, north, east }.
   * @param {object} options - Optional overrides { timeoutMs, endpoint }
   * @returns {Promise<Array>} Array of normalized POI objects.
   */
  static async fetchPlaces(osmTags, bbox, options = {}) {
    // 1. Validate Tags
    if (!Array.isArray(osmTags) || osmTags.length === 0) {
      throw new Error(`Invalid or missing OSM tags for place search`);
    }

    // 2. Validate Geographic Area
    if (!bbox || bbox.south == null || bbox.west == null || bbox.north == null || bbox.east == null) {
      throw new Error('Invalid geographic search area. Bounding box (south, west, north, east) is required.');
    }

    const timeoutMs = options.timeoutMs || envConfig.requestTimeoutMs;
    const timeoutSec = Math.floor(timeoutMs / 1000) || 10;
    
    // 3. Construct Overpass QL
    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    
    let queryBody = '';
    for (const tag of osmTags) {
      let tagStr = `["${tag.key}"="${tag.value}"]`;
      if (tag.extra) {
        tagStr += `["${tag.extra.key}"="${tag.extra.value}"]`;
      }
      queryBody += `  nwr${tagStr}(${bboxStr});\n`;
    }

    // The query requests JSON, defines a strict server-side timeout, and uses 'out center' 
    // to retrieve centroid coordinates for ways and relations.
    const query = `[out:json][timeout:${timeoutSec}];\n(\n${queryBody});\nout center;`;

    const endpoints = [
      options.endpoint || OVERPASS_ENDPOINT,
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    let response;
    let lastError;

    for (const endpoint of endpoints) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SafePath-Dev-App/1.0'
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (response.ok) {
          break; // Success!
        }
        
        if (response.status === 429) {
          lastError = new Error('Overpass API rate limit exceeded.');
        } else {
          lastError = new Error(`Overpass API returned error status: ${response.status}`);
        }
      } catch (error) {
        if (error.name === 'TimeoutError') {
          lastError = new Error('Overpass API request timed out.');
        } else {
          lastError = new Error(`Overpass network failure: ${error.message}`);
        }
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Overpass API requests failed on all endpoints.');
    }

    // 4. Parse and normalize results
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.elements)) {
      throw new Error('Malformed provider data: expected a JSON response with an elements array.');
    }

    const seen = new Set();
    const normalizedPlaces = [];

    for (const el of data.elements) {
      // Deduplicate elements using stable OSM identity
      const idKey = `${el.type}-${el.id}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);

      // Extract coordinates safely
      let lat = null;
      let lon = null;
      
      if (el.type === 'node') {
        lat = el.lat;
        lon = el.lon;
      } else if ((el.type === 'way' || el.type === 'relation') && el.center) {
        lat = el.center.lat;
        lon = el.center.lon;
      }

      if (lat == null || lon == null) continue;

      const tags = el.tags || {};
      const placeName = tags.name || tags['name:en'] || tags.brand || tags.operator || tags.network || null;

      // Filter out completely unnamed nodes (e.g. random bus stop poles without names/operators)
      // The user wants recognized, trustworthy places.
      if (!placeName) continue;

      // Ensure no ratings, reviews, or unverified operational statuses are generated.
      normalizedPlaces.push({
        osmType: el.type,
        osmId: el.id,
        name: placeName,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        tags: tags,
        attribution: '© OpenStreetMap contributors'
      });
    }

    return normalizedPlaces;
  }
}

module.exports = OverpassService;
