require('dotenv').config();

const requiredEnvs = [
  'GEOCODING_ENDPOINT',
  'OVERPASS_ENDPOINT',
  'OSRM_ENDPOINT',
  'OLLAMA_ENDPOINT',
  'OLLAMA_MODEL_NAME'
];

// Validate required environment variables and throw clear errors if missing
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
if (missingEnvs.length > 0) {
  console.error(`[Error] Startup failed. Missing essential environment variables:`);
  missingEnvs.forEach(env => console.error(` - ${env}`));
  console.error('Please configure them in your .env file (see .env.example).');
  process.exit(1);
}

const config = {
  // Server Config
  port: parseInt(process.env.PORT || '3001', 10),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Geographic Scope (defaulting to Punjab, India)
  geoScope: {
    name: process.env.GEO_SCOPE_NAME || 'Punjab, India',
    lat: parseFloat(process.env.GEO_SCOPE_LAT || '31.1471'),
    lng: parseFloat(process.env.GEO_SCOPE_LNG || '75.3412')
  },

  // External API Endpoints
  geocodingEndpoint: process.env.GEOCODING_ENDPOINT,
  overpassEndpoint: process.env.OVERPASS_ENDPOINT,
  osrmEndpoint: process.env.OSRM_ENDPOINT,
  
  // Local LLM Config (Ollama)
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT,
  ollamaModelName: process.env.OLLAMA_MODEL_NAME,

  // Cloud LLM Config (Ollama Cloud)
  ollamaProviderMode: process.env.OLLAMA_PROVIDER_MODE || 'local', // 'local' or 'cloud'
  ollamaCloudEndpoint: process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com/api',
  ollamaCloudModelName: process.env.OLLAMA_CLOUD_MODEL_NAME,
  ollamaApiKey: process.env.OLLAMA_API_KEY,

  // Business Logic Limits & Thresholds
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10),
  searchCorridors: process.env.SEARCH_CORRIDORS 
    ? process.env.SEARCH_CORRIDORS.split(',').map(n => parseInt(n.trim(), 10))
    : [2000, 5000, 10000],
  maxExternalRequestsPerWorkflow: parseInt(process.env.MAX_EXTERNAL_REQUESTS || '5', 10),
  maxCandidatesToProcess: parseInt(process.env.MAX_CANDIDATES_TO_PROCESS || '5', 10)
};

module.exports = config;
