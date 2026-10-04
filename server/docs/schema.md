# SafePath LLM Request Schema Specification

This document explains the JSON schema designed for structuring Ollama outputs from natural language requests.

## Field-by-Field Explanation

*   **`origin` (string | null)**: The starting location strictly as stated by the user. If unmentioned, it must be `null` (never invented).
*   **`destination` (string | null)**: The destination strictly as stated by the user. If unmentioned, it must be `null`.
*   **`numberOfStopsRequested` (integer | null)**: An explicit count of stops requested (e.g., "Find 2 petrol pumps" -> `2`). If they simply say "Find a petrol pump", this remains `1`. If they say "Find petrol pumps", it remains `null` as it is not strictly quantified.
*   **`requestedPlaces` (array)**:
    *   **`category` (string | null)**: The natural language category the user wants.
    *   **`hardConstraints` (array)**: Strict non-negotiables (e.g., "must be open now").
    *   **`softPreferences` (array)**: Nice-to-haves (e.g., "minimize extra driving time"). Note: "minimize time" is a soft preference, not a hard mathematical limit.
    *   **`ratingThreshold` (object | null)**: Strict preservation of mathematical bounds. E.g., "above 4" becomes `{ "value": 4, "operator": ">" }`.
*   **`maxAdditionalDrivingTime` (object | null)**: Explicit limits (e.g., "no more than 15 minutes extra"). Saved with `value` and `unit`. `null` if the user just asks to "minimize" time.
*   **`stopOrderRequirements` (array)**: Explicit relationship demands (e.g., "petrol pump then temple").
*   **`ambiguities` (array)**: An array storing reasons why the prompt cannot be fulfilled yet. E.g., `["You did not provide an origin."]`.
*   **`unsupportedRequirements` (array)**: For requests SafePath cannot handle. E.g., `["SafePath cannot currently filter places by review count."]`.

## Examples

### 1. Valid Explicit Request
**Prompt:** *"I want to travel from Ludhiana to Jalandhar. Find a Gurudwara along the way and minimize extra driving time. It must be rated above 4."*
```json
{
  "origin": "Ludhiana",
  "destination": "Jalandhar",
  "numberOfStopsRequested": 1,
  "requestedPlaces": [
    {
      "category": "Gurudwara",
      "hardConstraints": [],
      "softPreferences": ["minimize extra driving time"],
      "ratingThreshold": { "value": 4, "operator": ">" }
    }
  ],
  "maxAdditionalDrivingTime": null,
  "stopOrderRequirements": [],
  "ambiguities": [],
  "unsupportedRequirements": []
}
```

### 2. Valid Request with Order & Strict Time
**Prompt:** *"Delhi to Agra. Need a petrol pump and then a restaurant. Adding no more than 30 minutes."*
```json
{
  "origin": "Delhi",
  "destination": "Agra",
  "numberOfStopsRequested": 2,
  "requestedPlaces": [
    {
      "category": "petrol pump",
      "hardConstraints": [],
      "softPreferences": [],
      "ratingThreshold": null
    },
    {
      "category": "restaurant",
      "hardConstraints": [],
      "softPreferences": [],
      "ratingThreshold": null
    }
  ],
  "maxAdditionalDrivingTime": { "value": 30, "unit": "minutes" },
  "stopOrderRequirements": ["petrol pump before restaurant"],
  "ambiguities": [],
  "unsupportedRequirements": []
}
```

### 3. Ambiguous and Missing Data
**Prompt:** *"Find a hospital near the route."*
```json
{
  "origin": null,
  "destination": null,
  "numberOfStopsRequested": 1,
  "requestedPlaces": [
    {
      "category": "hospital",
      "hardConstraints": ["near the route"],
      "softPreferences": [],
      "ratingThreshold": null
    }
  ],
  "maxAdditionalDrivingTime": null,
  "stopOrderRequirements": [],
  "ambiguities": [
    "Origin location is missing.",
    "Destination location is missing."
  ],
  "unsupportedRequirements": []
}
```

### 4. Invalid/Unsupported Features
**Prompt:** *"Go from Amritsar to Pathankot. Find a museum that has a helicopter pad and at least 500 Google reviews."*
```json
{
  "origin": "Amritsar",
  "destination": "Pathankot",
  "numberOfStopsRequested": 1,
  "requestedPlaces": [
    {
      "category": "museum",
      "hardConstraints": [],
      "softPreferences": [],
      "ratingThreshold": null
    }
  ],
  "maxAdditionalDrivingTime": null,
  "stopOrderRequirements": [],
  "ambiguities": [],
  "unsupportedRequirements": [
    "Cannot filter by helicopter pad.",
    "Cannot filter by Google review counts."
  ]
}
```
