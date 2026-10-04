const PromptService = require('../../services/promptService');
const OllamaService = require('../../services/ollamaService');
const fs = require('fs');

const testCases = [
  { id: 1, prompt: "Ludhiana to Jalandhar, find a Gurudwara.", 
    mockResponse: { origin: "Ludhiana", destination: "Jalandhar", numberOfStopsRequested: 1, requestedPlaces: [{category: "gurudwara", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'gurudwara' },
  
  { id: 2, prompt: "Delhi to Agra, find a mandir.", 
    mockResponse: { origin: "Delhi", destination: "Agra", numberOfStopsRequested: 1, requestedPlaces: [{category: "temple", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'temple' },

  { id: 3, prompt: "Amritsar to Pathankot, I need a supermarket.", 
    mockResponse: { origin: "Amritsar", destination: "Pathankot", numberOfStopsRequested: 1, requestedPlaces: [{category: "supermarket", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'shop' },

  { id: 4, prompt: "Chandigarh to Shimla, medical center.", 
    mockResponse: { origin: "Chandigarh", destination: "Shimla", numberOfStopsRequested: 1, requestedPlaces: [{category: "medical center", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'hospital' },

  { id: 5, prompt: "Rohtak to Hisar, place to eat.", 
    mockResponse: { origin: "Rohtak", destination: "Hisar", numberOfStopsRequested: 1, requestedPlaces: [{category: "place to eat", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'restaurant' },

  { id: 6, prompt: "Find a gas station between Mumbai and Pune.", 
    mockResponse: { origin: "Mumbai", destination: "Pune", numberOfStopsRequested: 1, requestedPlaces: [{category: "gas station", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.category === 'petrol_pump' },

  { id: 7, prompt: "Ludhiana to Jalandhar, Gurudwara rated above 4.", 
    mockResponse: { origin: "Ludhiana", destination: "Jalandhar", numberOfStopsRequested: 1, requestedPlaces: [{category: "gurudwara", hardConstraints: [], softPreferences: [], ratingThreshold: {operator: ">", value: 4}}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.ratingThreshold?.operator === '>' },

  { id: 8, prompt: "Delhi to Agra, restaurant rated exactly 5.", 
    mockResponse: { origin: "Delhi", destination: "Agra", numberOfStopsRequested: 1, requestedPlaces: [{category: "restaurant", hardConstraints: [], softPreferences: [], ratingThreshold: {operator: "==", value: 5}}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.ratingThreshold?.operator === '==' },

  { id: 9, prompt: "Amritsar to Pathankot, hospital less than 15 mins extra driving.", 
    mockResponse: { origin: "Amritsar", destination: "Pathankot", numberOfStopsRequested: 1, requestedPlaces: [{category: "hospital", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: {value: 15, unit: "minutes"}, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.maxAdditionalDrivingTime?.value === 15 },

  { id: 10, prompt: "Chandigarh to Shimla, cafe with least extra driving time.", 
    mockResponse: { origin: "Chandigarh", destination: "Shimla", numberOfStopsRequested: 1, requestedPlaces: [{category: "cafe", hardConstraints: [], softPreferences: ["least extra driving time"], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.softPreferences.length > 0 },

  { id: 11, prompt: "Pune to Goa, find a park and then a restaurant.", 
    mockResponse: { origin: "Pune", destination: "Goa", numberOfStopsRequested: 2, requestedPlaces: [{category: "park", hardConstraints: [], softPreferences: [], ratingThreshold: null}, {category: "restaurant", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: ["park before restaurant"], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.stopOrderRequirements.length > 0 },

  { id: 12, prompt: "Mumbai to Surat, I need fuel and a pharmacy.", 
    mockResponse: { origin: "Mumbai", destination: "Surat", numberOfStopsRequested: 2, requestedPlaces: [{category: "fuel", hardConstraints: [], softPreferences: [], ratingThreshold: null}, {category: "pharmacy", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces.length === 2 },

  { id: 13, prompt: "Find a clinic near my route.", 
    mockResponse: { origin: null, destination: null, numberOfStopsRequested: 1, requestedPlaces: [{category: "clinic", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: ["Origin location is missing.", "Destination location is missing."], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.ambiguities.length >= 2 },

  { id: 14, prompt: "Starting from Delhi, find a temple.", 
    mockResponse: { origin: "Delhi", destination: null, numberOfStopsRequested: 1, requestedPlaces: [{category: "temple", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: ["Destination location is missing."], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.ambiguities.length >= 1 },

  { id: 15, prompt: "Going to Agra, need a shop.", 
    mockResponse: { origin: null, destination: "Agra", numberOfStopsRequested: 1, requestedPlaces: [{category: "shop", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: ["Origin location is missing."], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.ambiguities.length >= 1 },

  { id: 16, prompt: "I want a restaurant with an indoor swimming pool from A to B.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "restaurant", hardConstraints: ["indoor swimming pool"], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: ["Cannot filter by indoor swimming pool"] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.length > 0 },

  { id: 17, prompt: "A to B, need a hospital that sells cars.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "hospital", hardConstraints: ["sells cars"], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: ["Cannot find a hospital that sells cars"] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.length > 0 },

  { id: 18, prompt: "A to B, find a Gurudwara with good Yelp reviews.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "gurudwara", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: ["Yelp reviews are unsupported"] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.length > 0 },

  { id: 19, prompt: "A to B, find a Gurudwara with over 4 TripAdvisor stars.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "gurudwara", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: ["TripAdvisor is unsupported"] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.length > 0 },

  { id: 20, prompt: "Delhi to Agra, find 3 shops.", 
    mockResponse: { origin: "Delhi", destination: "Agra", numberOfStopsRequested: 3, requestedPlaces: [{category: "shop", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.numberOfStopsRequested === 3 },

  { id: 21, prompt: "Delhi to Agra, find a park, a clinic, and a restaurant in that order.", 
    mockResponse: { origin: "Delhi", destination: "Agra", numberOfStopsRequested: 3, requestedPlaces: [{category: "park", hardConstraints: [], softPreferences: [], ratingThreshold: null}, {category: "clinic", hardConstraints: [], softPreferences: [], ratingThreshold: null}, {category: "restaurant", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: ["park then clinic then restaurant"], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.stopOrderRequirements.length > 0 },

  { id: 22, prompt: "A to B, find a place to eat rated below 3.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "restaurant", hardConstraints: [], softPreferences: [], ratingThreshold: {operator: "<", value: 3}}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.ratingThreshold?.operator === '<' },

  { id: 23, prompt: "A to B, need a shop that adds a maximum of 1 hour.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "shop", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: {value: 1, unit: "hours"}, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.maxAdditionalDrivingTime?.unit === 'hours' },

  { id: 24, prompt: "A to B, find a gurudwara adding no more than 45 minutes.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "gurudwara", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: {value: 45, unit: "minutes"}, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.maxAdditionalDrivingTime?.value === 45 },

  { id: 25, prompt: "A to B, find a fuel station with lowest possible time added.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "fuel station", hardConstraints: [], softPreferences: ["lowest time added"], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.softPreferences.length > 0 },

  { id: 26, prompt: "Where is the nearest hospital?", 
    mockResponse: { origin: null, destination: null, numberOfStopsRequested: 1, requestedPlaces: [{category: "hospital", hardConstraints: [], softPreferences: ["nearest"], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: ["Origin location is missing", "Destination location is missing"], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.ambiguities.length >= 2 },

  { id: 27, prompt: "A to B, find a hotel.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "hotel", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.some(r => r.includes('hotel')) },

  { id: 28, prompt: "A to B, find a clinic and a school.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 2, requestedPlaces: [{category: "clinic", hardConstraints: [], softPreferences: [], ratingThreshold: null}, {category: "school", hardConstraints: [], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'clarification_required' && res.unsupportedRequirements.some(r => r.includes('school')) },

  { id: 29, prompt: "A to B, need a hospital that has an emergency room.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "hospital", hardConstraints: ["emergency room"], softPreferences: [], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.hardConstraints.length > 0 },

  { id: 30, prompt: "A to B, find a quiet park.", 
    mockResponse: { origin: "A", destination: "B", numberOfStopsRequested: 1, requestedPlaces: [{category: "park", hardConstraints: [], softPreferences: ["quiet"], ratingThreshold: null}], maxAdditionalDrivingTime: null, stopOrderRequirements: [], ambiguities: [], unsupportedRequirements: [] },
    validate: (res) => res.status === 'success' && res.data.requestedPlaces[0]?.softPreferences.length > 0 }
];

async function runEvals() {
  const originalGenerate = OllamaService.generateText;
  const results = [];

  console.log("=== DETERMINISTIC MOCKED EVALUATION ===");
  let mockPassed = 0;
  for (const tc of testCases) {
    OllamaService.generateText = async () => JSON.stringify(tc.mockResponse);
    const res = await PromptService.parseIntent(tc.prompt);
    const passed = tc.validate(res);
    if (passed) mockPassed++;
    else console.error(`[MOCK FAIL] ID ${tc.id}: ${tc.prompt}\n  Expected logic match, got: ${JSON.stringify(res)}\n`);
  }
  console.log(`Mock Evaluation: ${mockPassed} / ${testCases.length} passed.\n`);

  console.log("=== LIVE OLLAMA EVALUATION ===");
  OllamaService.generateText = originalGenerate;
  
  // Verify health first to avoid waiting for 30 timeouts if Ollama isn't running
  const health = await OllamaService.checkHealth();
  if (!health.hasModel) {
    console.error(`Skipping Live Evaluation: Ollama not ready. Details: ${health.details}`);
    // Save report anyway
  } else {
    let livePassed = 0;
    for (const tc of testCases) {
      try {
        const res = await PromptService.parseIntent(tc.prompt);
        const passed = tc.validate(res);
        results.push({
          id: tc.id,
          prompt: tc.prompt,
          actual: res,
          passed,
          failureReason: passed ? null : "Actual model output failed to meet strict requirements."
        });
        if (passed) livePassed++;
        else console.error(`[LIVE FAIL] ID ${tc.id}: ${tc.prompt}\n  Actual: ${JSON.stringify(res)}\n`);
      } catch (err) {
        console.error(`[LIVE ERROR] ID ${tc.id}: ${err.message}`);
        results.push({ id: tc.id, prompt: tc.prompt, passed: false, failureReason: err.message });
      }
    }
    console.log(`Live Evaluation: ${livePassed} / ${testCases.length} passed.`);
  }

  // Write report
  fs.writeFileSync('eval_report.json', JSON.stringify({
    summary: {
      total: testCases.length,
      mockPassed,
      liveRunComplete: health.hasModel
    },
    results
  }, null, 2));

  console.log("Report generated at 'server/tests/eval/eval_report.json'");
  
  // Return specific recommendations if mock evaluation failed
  if (mockPassed < testCases.length) {
    console.log("\nRECOMMENDATION: Some mock cases failed validation. The PromptService mapping logic may need refinement.");
  }
}

runEvals();
