const envConfig = require('../config/env');

const OVERPASS_ENDPOINT = envConfig.overpassEndpoint || 'https://overpass-api.de/api/interpreter';

class OverpassService {
  /**
   * Fetches POIs from Overpass API within a given bounding box using proper AND/OR tag logic.
   * @param {Array} searchAlternatives - Array of alternative POI tags (OR logic).
   * @param {Array} requiredAttributes - Array of required feature tags (AND logic).
   * @param {object} bbox - Geographic search area { south, west, north, east }.
   * @param {object} options - Optional overrides
   * @returns {Promise<Array>} Array of normalized POI objects.
   */
  static async fetchPlaces(searchAlternatives, requiredAttributes, bbox, options = {}) {
    if ((!Array.isArray(searchAlternatives) || searchAlternatives.length === 0) &&
        (!Array.isArray(requiredAttributes) || requiredAttributes.length === 0)) {
      throw new Error('Invalid or missing OSM tags for place search');
    }

    if (!bbox || bbox.south == null || bbox.west == null || bbox.north == null || bbox.east == null) {
      throw new Error('Invalid geographic search area. Bounding box (south, west, north, east) is required.');
    }

    const timeoutMs = options.timeoutMs || envConfig.requestTimeoutMs;
    const timeoutSec = Math.floor(timeoutMs / 1000) || 10;
    
    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    
    let queryBody = '';
    
    // Build the required attributes string that will be appended (ANDed) to every alternative
    const reqStr = (requiredAttributes || []).map(tag => `["${tag.key}"="${tag.value}"]`).join('');
    
    if (searchAlternatives && searchAlternatives.length > 0) {
      for (const alt of searchAlternatives) {
        queryBody += `  nwr["${alt.key}"="${alt.value}"]${reqStr}(${bboxStr});\\n`;
      }
    } else {
      // If the LLM only gave required attributes (e.g. "find any place that is vegetarian")
      queryBody += `  nwr${reqStr}(${bboxStr});\\n`;
    }

    const query = `[out:json][timeout:${timeoutSec}];\\n(\\n${queryBody});\\nout center;`;

    const endpoints = [
      options.endpoint || envConfig.overpassEndpoint,
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
      'https://overpass.osm.ch/api/interpreter',
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

        if (response.ok) break;
        
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

    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.elements)) {
      throw new Error('Malformed provider data: expected a JSON response with an elements array.');
    }

    const seen = new Set();
    const normalizedPlaces = [];

    for (const el of data.elements) {
      const idKey = `${el.type}-${el.id}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);

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

      if (!placeName) continue;

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
