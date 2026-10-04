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
          category: {
            type: ["string", "null"],
            description: "The user-friendly display name of the requested place (e.g., 'ISBT', 'bakery'). Null if ambiguous."
          },
          osmTags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                value: { type: "string" }
              },
              required: ["key", "value"]
            },
            description: "AI-determined OpenStreetMap tags for this place. Must use official OSM tags! e.g., for ISBT/Bus Stand: [{key: 'amenity', value: 'bus_station'}]. For shoe store: [{key: 'shop', value: 'shoes'}]. For mall: [{key: 'shop', value: 'mall'}]."
          },
          hardConstraints: {
            type: "array",
            items: { type: "string" },
            description: "Absolute must-haves (e.g., 'must have parking', 'must be vegetarian')."
          },
          softPreferences: {
            type: "array",
            items: { type: "string" },
            description: "Nice-to-have features (e.g., 'scenic view', 'quiet')."
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
            enum: ["origin", "destination", "any"],
            description: "User preference for location proximity. 'origin' if near the start or unspecified. 'destination' if explicitly requested near destination. 'any' if explicitly anywhere."
          }
        },
        required: ["category", "osmTags", "hardConstraints", "softPreferences", "ratingThreshold", "proximityPreference"],
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
