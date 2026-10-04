const config = require('../config/env');

const GEOCODING_ENDPOINT = config.geocodingEndpoint || 'https://nominatim.openstreetmap.org';
// Required by Nominatim policy: a unique User-Agent identifying the application
const USER_AGENT = 'SafePath-Dev-App/1.0';

class GeocodingService {
  /**
   * Search for a location using the geocoding provider.
   * @param {string} query - The natural language location string.
   * @returns {Promise<{candidates: Array}>} - An object containing validated geographic candidates.
   */
  static async searchLocation(query) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
      throw new Error('Invalid query: location name must be a non-empty string.');
    }

    const url = new URL(`${GEOCODING_ENDPOINT}/search`);
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'jsonv2');
    url.searchParams.append('addressdetails', '1');
    // Pre-filtering by country improves accuracy, though we enforce administrative boundaries strictly later.
    url.searchParams.append('countrycodes', 'in');

    let response;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'en'
          },
          signal: AbortSignal.timeout(config.requestTimeoutMs)
        });
        
        if (response.ok) {
          break; // Success
        }
        
        lastError = new Error(`Geocoding provider returned error status: ${response.status}`);
        if (response.status === 429) {
          // If rate limited, wait a bit before retrying
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (error) {
        if (error.name === 'TimeoutError') {
          lastError = new Error('Geocoding service request timed out.');
        } else {
          lastError = new Error(`Geocoding network failure: ${error.message}`);
        }
        // Wait briefly on network errors before retrying
        await new Promise(res => setTimeout(res, 500 * attempt));
      }
    }

    if (!response || !response.ok) {
      throw lastError || new Error('Geocoding service failed after multiple attempts.');
    }

    // Attempt to parse JSON; catch errors to treat as malformed data.
    const data = await response.json().catch(() => null);
    
    if (!Array.isArray(data)) {
      throw new Error('Malformed provider data: expected a JSON array.');
    }

    if (data.length === 0) {
      return { candidates: [] };
    }

    // Parse and normalize results
    const candidates = data.map(item => {
      if (!item.lat || !item.lon) return null;

      return {
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        address: item.address,
        placeId: item.place_id,
        osmType: item.osm_type,
        osmId: item.osm_id
      };
    }).filter(Boolean);

    // Apply strict administrative restriction to Punjab and Chandigarh.
    const validCandidates = candidates.filter(candidate => {
      const addr = candidate.address || {};
      const state = addr.state ? addr.state.toLowerCase() : '';
      return (state === 'punjab' || state === 'chandigarh') && addr.country_code === 'in';
    });

    // Deduplicate overlapping entities (e.g., node vs relation for the same city like 'Ludhiana')
    // We group them by their primary name (first segment of display name) and keep the most prominent one.
    const uniqueCandidatesMap = new Map();
    validCandidates.forEach(candidate => {
      const primaryName = candidate.displayName.split(',')[0].trim().toLowerCase();
      // If we don't have it, or if this new candidate is a 'relation' (often better for boundaries), we can prefer it.
      // But actually, just keeping the first one Nominatim returned (highest importance) per primary name is best.
      if (!uniqueCandidatesMap.has(primaryName)) {
        uniqueCandidatesMap.set(primaryName, candidate);
      }
    });

    const deduplicatedCandidates = Array.from(uniqueCandidatesMap.values());

    return { candidates: deduplicatedCandidates };
  }
}

module.exports = GeocodingService;
