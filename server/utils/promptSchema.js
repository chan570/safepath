const promptSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
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
            description: "A list of discrete semantic capabilities required at this place (e.g., ['tea', 'light food', 'phone charging', 'bicycle repair'])."
          }
        },
        required: ["userRequirement", "semanticIntent", "requirements"],
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
    "requestedPlaces",
    "maxAdditionalDrivingTime",
    "stopOrderRequirements",
    "ambiguities",
    "unsupportedRequirements"
  ],
  additionalProperties: false
};

module.exports = promptSchema;
