/**
 * Category Mapper for SafePath
 * Maps natural language place categories and aliases into strictly defined OpenStreetMap tags.
 * 
 * Documentation on incomplete coverage:
 * - "temple" and "gurudwara": Many places of worship in OSM are tagged simply as `amenity=place_of_worship` 
 *   without a specific `religion=hindu` or `religion=sikh` tag. This means some valid temples or gurudwaras 
 *   might be missed if they lack the explicit religion tag.
 * - "tourist_attraction": Highly subjective. While `tourism=attraction` exists, many monuments or historic sites 
 *   might just be `historic=yes` without the tourism tag. We include common variants, but coverage may vary.
 * - "pharmacy": Usually well mapped as `amenity=pharmacy`, but smaller local dispensaries might just be `shop=medical_supply`.
 */

const CATEGORIES = {
  'shop': {
    aliases: ['shops', 'supermarket', 'supermarkets', 'store', 'grocery store', 'convenience store', 'mart'],
    // We target broad shops and specific common ones to ensure coverage.
    tags: [
      { key: 'shop', value: 'supermarket' },
      { key: 'shop', value: 'convenience' },
      { key: 'shop', value: 'general' }
    ],
    description: 'General shops, supermarkets, and convenience stores.'
  },
  'hospital': {
    aliases: ['hospitals', 'clinic', 'clinics', 'medical center'],
    tags: [
      { key: 'amenity', value: 'hospital' },
      { key: 'amenity', value: 'clinic' }
    ],
    description: 'Major medical facilities including hospitals and smaller clinics.'
  },
  'pharmacy': {
    aliases: ['pharmacies', 'medical store', 'chemist', 'drugstore'],
    tags: [
      { key: 'amenity', value: 'pharmacy' }
    ],
    description: 'Stores dispensing medicinal drugs.'
  },
  'restaurant': {
    aliases: ['restaurants', 'cafe', 'cafes', 'place to eat', 'food', 'fast food', 'diner', 'eatery'],
    tags: [
      { key: 'amenity', value: 'restaurant' },
      { key: 'amenity', value: 'cafe' },
      { key: 'amenity', value: 'fast_food' }
    ],
    description: 'Places serving prepared food and drinks.'
  },
  'petrol_pump': {
    aliases: ['petrol pumps', 'fuel station', 'gas station', 'petrol station'],
    tags: [
      { key: 'amenity', value: 'fuel' } // 'fuel' is the official OSM value for petrol pumps
    ],
    description: 'Fuel stations for motor vehicles.'
  },
  'temple': {
    aliases: ['temples', 'hindu temple', 'mandir'],
    tags: [
      // In OSM, a temple is typically a place of worship with religion=hindu
      { key: 'amenity', value: 'place_of_worship', extra: { key: 'religion', value: 'hindu' } }
    ],
    description: 'Hindu places of worship. Note: May miss places without explicit religion tags.'
  },
  'gurudwara': {
    aliases: ['gurudwaras', 'sikh gurudwara', 'sikh temple'],
    tags: [
      // In OSM, a gurudwara is a place of worship with religion=sikh
      { key: 'amenity', value: 'place_of_worship', extra: { key: 'religion', value: 'sikh' } }
    ],
    description: 'Sikh places of worship. Note: May miss places without explicit religion tags.'
  },
  'park': {
    aliases: ['parks', 'garden', 'recreation ground'],
    tags: [
      { key: 'leisure', value: 'park' },
      { key: 'leisure', value: 'garden' }
    ],
    description: 'Public parks and gardens.'
  },
  'tourist_attraction': {
    aliases: ['tourist attractions', 'attraction', 'monument', 'museum', 'places to visit'],
    tags: [
      { key: 'tourism', value: 'attraction' },
      { key: 'tourism', value: 'museum' },
      { key: 'historic', value: 'monument' }
    ],
    description: 'Various points of interest for tourism and heritage.'
  }
};

/**
 * Resolves a natural language input into an official category key.
 * Prevents arbitrary user text from becoming an unrestricted Overpass query.
 * @param {string} input - The user's requested place type (e.g. "fuel station")
 * @returns {string|null} - The canonical category key (e.g. "petrol_pump") or null if not supported.
 */
function resolveCategory(input) {
  if (!input || typeof input !== 'string') return null;
  
  const normalized = input.toLowerCase().trim();
  
  // Direct canonical match
  if (CATEGORIES[normalized]) {
    return normalized;
  }
  
  // Alias match
  for (const [key, config] of Object.entries(CATEGORIES)) {
    if (config.aliases.includes(normalized)) {
      return key;
    }
  }
  
  return null;
}

/**
 * Generates an array of strict OSM tag selectors for a given canonical category.
 * @param {string} categoryKey - The canonical category key
 * @returns {Array<{key: string, value: string, extra?: {key: string, value: string}}>} 
 */
function getCategoryTags(categoryKey) {
  if (CATEGORIES[categoryKey]) {
    return CATEGORIES[categoryKey].tags;
  }
  return [];
}

/**
 * Returns all supported aliases to help LLMs or UI present valid options to users.
 */
function getAllSupportedAliases() {
  const all = [];
  for (const [key, config] of Object.entries(CATEGORIES)) {
    all.push(key, ...config.aliases);
  }
  return [...new Set(all)];
}

module.exports = {
  resolveCategory,
  getCategoryTags,
  getAllSupportedAliases,
  CATEGORIES
};
