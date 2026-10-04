const Ajv = require('ajv');
const ajv = new Ajv();
const OllamaService = require('./ollamaService');
const promptSchema = require('../utils/promptSchema');
const { resolveCategory, getAllSupportedAliases } = require('../utils/categoryMapper');

const validateSchema = ajv.compile(promptSchema);

const SYSTEM_PROMPT = `You are the prompt-understanding agent for SafePath, a route planner. 
Your ONLY job is to extract travel intent into a strict JSON format. 
DO NOT invent coordinates, place names, ratings, times, distances, or business data. 
If a value is not explicitly provided, output null or an empty array.

Output strict JSON matching this exact schema structure:
{
  "origin": "string or null",
  "destination": "string or null",
  "numberOfStopsRequested": number or null,
  "requestedPlaces": [
    {
      "category": "string (Display name, e.g. ISBT, ATM, Bakery) or null",
      "osmTags": [{"key": "amenity|shop|tourism|etc", "value": "exact_osm_value"}],
      "hardConstraints": ["array of strings"],
      "softPreferences": ["array of strings"],
      "ratingThreshold": { "value": number, "operator": ">|>=|<|<=|==" } or null,
      "proximityPreference": "string ('origin', 'destination', 'any'). Default to 'origin' if unspecified."
    }
  ],
  "maxAdditionalDrivingTime": { "value": number, "unit": "minutes|hours" } or null,
  "stopOrderRequirements": ["array of strings"],
  "ambiguities": ["missing origin", "missing destination", etc.],
  "unsupportedRequirements": ["things you can't fulfill"]
}

You are an expert at mapping natural language to OpenStreetMap tags. 
CRITICAL: You must understand the deep semantic context of the user's request, including regional terms (like 'kirana shop', 'dhaba') or intent (like 'sweet shop', 'place to relax'). Do not rely on literal keyword matching! Understand what the user wants and map it to the correct official OSM tags (e.g. 'kirana shop' -> shop=convenience/general, 'sweet shop' -> shop=confectionery/pastry).
OSM tagging is inconsistent, so you MUST provide an array of MULTIPLE synonymous OSM key-value tags in 'osmTags' to ensure maximum recall (e.g., for "bus stand", provide [{"key":"amenity","value":"bus_station"}, {"key":"highway","value":"bus_stop"}]).
If origin or destination is missing, add an explanation to "ambiguities".

CRITICAL INSTRUCTION: Your output MUST be EXACTLY ONE valid JSON object and nothing else. DO NOT wrap it in Markdown fences (like \`\`\`json). DO NOT output conversational text before or after the JSON.`;

function cleanMarkdownJSON(text) {
  let cleaned = text.trim();
  // Strip starting ```json or ``` 
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\`\`\`(json)?/, '').trim();
  }
  // Strip ending ```
  if (cleaned.endsWith('\`\`\`')) {
    cleaned = cleaned.replace(/\`\`\`$/, '').trim();
  }
  return cleaned;
}

class PromptService {
  /**
   * Processes a natural language request into a validated JSON intent.
   * Keeps prompt interpretation strictly separated from external routing algorithms.
   * @param {string} userPrompt 
   * @param {Object} context Optional context (like resolvedOrigin, resolvedDestination)
   * @returns {Promise<Object>} Status payload (success, clarification_required, error)
   */
  static async parseIntent(userPrompt, context = {}) {
    if (!userPrompt || userPrompt.trim() === '') {
      return { status: 'error', message: 'Prompt cannot be empty.' };
    }

    let contextualPrompt = userPrompt;
    if (context.resolvedOrigin) {
      contextualPrompt = `Origin: ${context.resolvedOrigin}\n` + contextualPrompt;
    }
    if (context.resolvedDestination) {
      contextualPrompt = `Destination: ${context.resolvedDestination}\n` + contextualPrompt;
    }

    const baseFullPrompt = `${SYSTEM_PROMPT}\n\nUser Request: "${contextualPrompt}"\n\nOutput only valid JSON:`;
    
    return await this._attemptParse(baseFullPrompt, 0);
  }

  static async _attemptParse(fullPrompt, attempt) {
    let rawOutput;
    try {
      rawOutput = await OllamaService.generateText(fullPrompt, { format: 'json' });
    } catch (err) {
      return { status: 'error', message: `Ollama inference failed: ${err.message}` };
    }

    const cleanedText = cleanMarkdownJSON(rawOutput);

    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (err) {
      if (attempt < 1) {
        const retryPrompt = `${fullPrompt}\n\n${rawOutput}\n\nERROR: The above response was not valid JSON. You MUST output strictly valid JSON without Markdown formatting. Try again:`;
        return await this._attemptParse(retryPrompt, attempt + 1);
      }
      return { status: 'error', message: 'Model returned malformed JSON.' };
    }

    // 1. Validate against strictly approved AJV schema
    const isValid = validateSchema(parsed);
    if (!isValid) {
      if (attempt < 1) {
        const errorsStr = JSON.stringify(validateSchema.errors);
        const retryPrompt = `${fullPrompt}\n\n${rawOutput}\n\nERROR: The above JSON failed schema validation with these errors: ${errorsStr}. Fix the JSON structure to strictly match the requested schema. Try again:`;
        return await this._attemptParse(retryPrompt, attempt + 1);
      }
      return { 
        status: 'error', 
        message: 'Model returned invalid schema structure.', 
        errors: validateSchema.errors 
      };
    }

    // Categories and OSM tags are now fully determined by the LLM (No static whitelists!)
    // We trust the osmTags provided by the AI.

    // 3. Safety checks for essential missing fields preventing calculation
    if (!parsed.origin && !parsed.ambiguities.some(a => a.toLowerCase().includes('origin'))) {
      parsed.ambiguities.push('Origin location is missing or ambiguous.');
    }
    if (!parsed.destination && !parsed.ambiguities.some(a => a.toLowerCase().includes('destination'))) {
      parsed.ambiguities.push('Destination location is missing or ambiguous.');
    }
    
    // 4. Determine state
    if (parsed.ambiguities.length > 0 || parsed.unsupportedRequirements.length > 0) {
      return {
        status: 'clarification_required',
        ambiguities: parsed.ambiguities,
        unsupportedRequirements: parsed.unsupportedRequirements,
        partialData: parsed
      };
    }

    return {
      status: 'success',
      data: parsed
    };
  }
}

module.exports = PromptService;
