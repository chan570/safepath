const promptSchema = {
  $id: "https://safepath.example.com/llm-request.schema.json",
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SafePath LLM Prompt Schema",
  type: "object",
  properties: {
    origin: {
      type: ["string", "null"],
      description: "Starting location text exactly as phrased by user. Null if unmentioned."
    },
    destination: {
      type: ["string", "null"],
      description: "Ending location text exactly as phrased by user. Null if unmentioned."
    },
    numberOfStopsRequested: {
      type: ["integer", "null"],
      description: "Explicitly requested number of stops (e.g., 'Find 2 petrol pumps'). Null if not quantified."
    },
    requestedPlaces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          userRequirement: {
            type: ["string", "null"],
            description: "The exact phrase or term used by the user for this stop (e.g., 'T point', 'place for chai')."
          },
          semanticIntent: {
            type: ["string", "null"],
            description: "The holistic semantic meaning of the stop (e.g., 'A roadside establishment suitable for drinking tea and having light food/snacks')."
          },
          requirements: {
            type: "array",
            items: { type: "string" },
            description: "A list of discrete semantic capabilities required at this place (e.g., ['tea', 'light food', 'phone charging', 'bicycle repair']). Do NOT use predefined categories."
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence (0.0 to 1.0) in understanding the user's semantic intent."
          },
          hardConstraints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Constraint type (e.g., 'diet', 'amenity', 'accessibility', 'max_detour')" },
                value: { type: ["string", "number", "boolean"], description: "Constraint value (e.g., 'vegetarian', 'parking', true, 15)" }
              },
              required: ["type", "value"],
              additionalProperties: false
            },
            description: "Absolute must-haves derived directly from the prompt."
          },
          softPreferences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Preference type (e.g., 'minimize_additional_driving_time', 'minimize_distance', 'scenic', 'quiet')" },
                weight: { type: "number", description: "Importance weight from 0.1 to 1.0" }
              },
              required: ["type", "weight"],
              additionalProperties: false
            },
            description: "Nice-to-have features or optimizations with relative weights."
          },
          ratingThreshold: {
            type: ["object", "null"],
            properties: {
              value: { type: "number" },
              operator: { type: "string", enum: [">", ">=", "<", "<=", "=="] }
            },
            required: ["value", "operator"],
            additionalProperties: false,
            description: "Explicit rating requirement. E.g., 'above 4' -> { operator: '>', value: 4 }."
          },
          proximityPreference: {
            type: "string",
            enum: ["origin", "destination", "on_the_way", "any"],
            description: "User preference for location proximity. 'origin' near start, 'destination' near end, 'on_the_way' (default) minimal detour, 'any' everywhere."
          }
        },
        required: ["userRequirement", "semanticIntent", "requirements", "confidence", "hardConstraints", "softPreferences", "ratingThreshold", "proximityPreference"],
        additionalProperties: false
      },
      description: "List of places requested along the route."
    },
    maxAdditionalDrivingTime: {
      type: ["object", "null"],
      properties: {
        value: { type: "number" },
        unit: { type: "string", enum: ["minutes", "hours"] }
      },
      required: ["value", "unit"],
      additionalProperties: false,
      description: "Maximum additional driving time if explicitly specified (e.g., 'no more than 10 mins' -> { value: 10, unit: 'minutes' })."
    },
    stopOrderRequirements: {
      type: "array",
      items: { type: "string" },
      description: "Specific ordering required (e.g., ['petrol pump before temple']). Empty array if none."
    },
    ambiguities: {
      type: "array",
      items: { type: "string" },
      description: "Missing or vague elements preventing route calculation (e.g., 'No destination provided')."
    },
    unsupportedRequirements: {
      type: "array",
      items: { type: "string" },
      description: "Conflicting or currently impossible requirements."
    }
  },
  required: [
    "origin",
    "destination",
    "numberOfStopsRequested",
    "requestedPlaces",
    "maxAdditionalDrivingTime",
    "stopOrderRequirements",
    "ambiguities",
    "unsupportedRequirements"
  ],
  additionalProperties: false
};

module.exports = promptSchema;
