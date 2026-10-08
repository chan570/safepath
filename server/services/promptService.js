const Ajv = require('ajv');
const ajv = new Ajv();
const OllamaService = require('./ollamaService');
const promptSchema = require('../utils/promptSchema');

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
      "userRequirement": "string or null (e.g., 'T point', 'place for chai')",
      "semanticIntent": "string or null (e.g., 'A roadside establishment suitable for drinking tea and having light food/snacks')",
      "requirements": ["array of strings representing pure semantic capabilities (e.g. 'tea', 'light food', 'phone charging', 'bicycle repair')"],
      "confidence": number (0.0 to 1.0),
      "hardConstraints": [{"type": "string (e.g. 'diet', 'accessibility')", "value": "string/number/boolean"}],
      "softPreferences": [{"type": "string (e.g. 'minimize_additional_driving_time', 'scenic')", "weight": "number (0.1-1.0)"}],
      "ratingThreshold": { "value": number, "operator": ">|>=|<|<=|==" } or null,
      "proximityPreference": "string ('origin', 'destination', 'on_the_way', 'any'). Default to 'on_the_way' if unspecified."
    }
  ],
  "maxAdditionalDrivingTime": { "value": number, "unit": "minutes|hours" } or null,
  "stopOrderRequirements": ["array of strings"],
  "ambiguities": ["missing origin", "missing destination", etc.],
  "unsupportedRequirements": ["things you can't fulfill"]
}

You are an expert at understanding semantic travel intents. 
CRITICAL: You must extract the pure *meaning* of what the user wants to do or find. DO NOT use predefined database categories (e.g. do not just output 'tea_shop' or 'restaurant'). Break down the user's request into discrete semantic capabilities in the 'requirements' array (e.g. ['tea', 'food', 'Wi-Fi']).
Do not rely on literal keyword matching! Do not fail just because a term is unknown. Try to interpret the intended meaning.

If origin or destination is missing, add an explanation to "ambiguities".
If the prompt is genuinely ambiguous and you cannot infer a reasonable intent (e.g. 'Find me a nice place'), add to "ambiguities".

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
      const o = typeof context.resolvedOrigin === 'object' ? JSON.stringify(context.resolvedOrigin) : context.resolvedOrigin;
      contextualPrompt = `Origin: ${o}\n` + contextualPrompt;
    }
    if (context.resolvedDestination) {
      const d = typeof context.resolvedDestination === 'object' ? JSON.stringify(context.resolvedDestination) : context.resolvedDestination;
      contextualPrompt = `Destination: ${d}\n` + contextualPrompt;
    }

    const baseFullPrompt = `${SYSTEM_PROMPT}\n\nUser Request: "${contextualPrompt}"\n\nOutput only valid JSON:`;
    
    return await this._attemptParse(baseFullPrompt, 0, context);
  }

  static async _attemptParse(fullPrompt, attempt, context) {
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
    const hasOrigin = parsed.origin || (context && context.resolvedOrigin);
    const hasDest = parsed.destination || (context && context.resolvedDestination);

    if (!hasOrigin && !parsed.ambiguities.some(a => a.toLowerCase().includes('origin'))) {
      parsed.ambiguities.push('Origin location is missing or ambiguous.');
    }
    if (!hasDest && !parsed.ambiguities.some(a => a.toLowerCase().includes('destination'))) {
      parsed.ambiguities.push('Destination location is missing or ambiguous.');
    }

    if (hasOrigin) {
      parsed.ambiguities = parsed.ambiguities.filter(a => !a.toLowerCase().includes('origin'));
    }
    if (hasDest) {
      parsed.ambiguities = parsed.ambiguities.filter(a => !a.toLowerCase().includes('destination'));
    }
    
    // 4. Determine state
    if (parsed.ambiguities.length > 0) {
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
