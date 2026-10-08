const OllamaService = require('./ollamaService');

const ALLOWED_OSM_KEYS = new Set([
  'amenity', 'shop', 'leisure', 'tourism', 'cuisine', 'diet:vegetarian', 
  'diet:vegan', 'internet_access', 'wheelchair', 'outdoor_seating', 
  'parking', 'drive_through', 'service:bicycle:repair', 'craft', 'emergency',
  'healthcare', 'office', 'highway', 'public_transport',
  'historic', 'sport', 'natural', 'man_made', 'aeroway', 'railway', 'waterway',
  'building', 'landuse', 'place', 'brand', 'operator', 'religion', 'denomination',
  'atm', 'toilets', 'fee', 'opening_hours', 'smoking', 'takeaway', 'delivery',
  'payment:cash', 'payment:credit_cards', 'phone', 'website', 'vending', 'beauty'
]);

const SYSTEM_PROMPT = `You are an expert OpenStreetMap (OSM) data translator.
Your job is to translate semantic user requirements into official OSM key-value tags.
Distinguish between primary POI types (alternatives) and required attributes (must-haves).

Input JSON:
{
  "semanticIntent": "...",
  "requirements": ["...", "..."]
}

Output MUST be a strict JSON object with three fields:
- "searchAlternatives": array of {key, value} for broad POI types (e.g. amenity=cafe OR amenity=restaurant)
- "requiredAttributes": array of {key, value} for mandatory features (e.g. diet:vegetarian=yes, internet_access=wlan). These will be ANDed to the search.
- "unsupportedRequirements": array of strings for subjective/unverifiable requirements (e.g. "peaceful", "beautiful").

Example for "peaceful vegetarian cafe":
{
  "searchAlternatives": [
    {"key": "amenity", "value": "cafe"}
  ],
  "requiredAttributes": [
    {"key": "diet:vegetarian", "value": "yes"}
  ],
  "unsupportedRequirements": ["peaceful"]
}

Example for "chai and snacks":
{
  "searchAlternatives": [
    {"key": "amenity", "value": "cafe"},
    {"key": "amenity", "value": "restaurant"},
    {"key": "shop", "value": "tea"}
  ],
  "requiredAttributes": [],
  "unsupportedRequirements": []
}

RULES:
1. ONLY use real OSM tags.
2. Put subjective requirements in "unsupportedRequirements".
3. ONLY output valid JSON.`;

class OsmTranslationService {
  static async translateToOsmTags(reqPlace) {
    if (!reqPlace || (!reqPlace.semanticIntent && (!reqPlace.requirements || reqPlace.requirements.length === 0))) {
      return { searchAlternatives: [], requiredAttributes: [], unsupportedRequirements: [] };
    }

    const payload = JSON.stringify({
      semanticIntent: reqPlace.semanticIntent,
      requirements: reqPlace.requirements
    });

    const fullPrompt = `${SYSTEM_PROMPT}\n\nInput:\n${payload}\n\nOutput strict JSON:`;

    try {
      const rawOutput = await OllamaService.generateText(fullPrompt, { format: 'json' });
      let cleaned = rawOutput.trim();
      if (cleaned.startsWith('\`\`\`')) cleaned = cleaned.replace(/^\`\`\`(json)?/, '').trim();
      if (cleaned.endsWith('\`\`\`')) cleaned = cleaned.replace(/\`\`\`$/, '').trim();

      const parsed = JSON.parse(cleaned);
      
      const filterTags = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.filter(t => t && typeof t.key === 'string' && typeof t.value === 'string' && ALLOWED_OSM_KEYS.has(t.key.toLowerCase()));
      };

      return {
        searchAlternatives: filterTags(parsed.searchAlternatives),
        requiredAttributes: filterTags(parsed.requiredAttributes),
        unsupportedRequirements: Array.isArray(parsed.unsupportedRequirements) ? parsed.unsupportedRequirements.filter(r => typeof r === 'string') : []
      };
    } catch (error) {
      console.error(`OsmTranslationService Error: ${error.message}`);
      return { searchAlternatives: [], requiredAttributes: [], unsupportedRequirements: [] };
    }
  }
}

module.exports = OsmTranslationService;
