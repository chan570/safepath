# SafePath

SafePath is a privacy-first, locally-intelligent route planning application that interprets natural language requests to find optimized stops (e.g., "Find a petrol pump along my route") without relying on paid cloud AI providers. It orchestrates local LLM intent extraction with OpenStreetMap mapping services.

## Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **Ollama**: Installed locally (see Local LLM Setup)
- **Git**: For source control (optional)

---

## 1. Local LLM Setup (Ollama)

SafePath defaults to using a completely local Large Language Model (LLM) to interpret user requests securely.

1. **Install Ollama**: Download and install Ollama from [ollama.com](https://ollama.com).
2. **Start the Daemon**: Ensure the Ollama background daemon is running.
3. **Download the Model**: Open your terminal and pull the default model:
   ```bash
   ollama pull llama3
   ```
4. **Confirm Availability**: Verify the model is installed by running:
   ```bash
   ollama list
   ```

---

## 2. Cloud LLM Setup (Optional)

SafePath supports a cloud fallback mode if you prefer offloading prompt interpretation to Ollama Cloud. 
**Privacy Warning:** When cloud mode is enabled, your natural-language prompt is sent to `ollama.com/api`. If your prompt contains location names, they will be transmitted to the cloud provider. SafePath does not send explicit routing coordinates, but the prompt text is sent verbatim.

To enable cloud mode, set the following variables in your `server/.env`:
```env
OLLAMA_PROVIDER_MODE=cloud
OLLAMA_API_KEY=your_api_key_here
OLLAMA_CLOUD_MODEL_NAME=gemma4:31b
```

---

## 3. Environment Configuration

### Backend Setup
Navigate to the `server/` directory and configure the environment:
1. Create a `.env` file from the example:
   ```bash
   cd server
   cp .env.example .env
   ```
2. The `.env` file exposes the following operational configurations:
   - `PORT=3001` (Backend server port)
   - `FRONTEND_ORIGIN=http://localhost:5173` (CORS restriction)
   - `OLLAMA_ENDPOINT=http://localhost:11434` (Ollama daemon URL)
   - `OLLAMA_MODEL_NAME=llama3` (Configured model)
   - `GEOCODING_ENDPOINT=https://nominatim.openstreetmap.org`
   - `OVERPASS_ENDPOINT=https://overpass-api.de/api/interpreter`
   - `OSRM_ENDPOINT=http://router.project-osrm.org`

### Frontend Setup
Navigate to the `client/` directory and configure the environment:
1. Create a `.env` file from the example:
   ```bash
   cd client
   cp .env.example .env
   ```
2. Ensure it connects to your local backend:
   - `VITE_API_URL=http://localhost:3001/api`

---

## 3. Installation & Startup

### Start the Backend
```bash
cd server
npm install
npm start
```
*(The server will start on `http://localhost:3001`)*

### Start the Frontend
```bash
cd client
npm install
npm run dev
```
*(The React application will start on `http://localhost:5173`)*

---

## 4. Route-Planning Workflow

When a user submits a request, SafePath executes the following orchestration sequence:
1. **Interpretation**: The prompt is sent to the local Ollama instance to extract origins, destinations, and a normalized schema of requested categories (e.g., "fuel", "hospital").
2. **Geocoding**: The origin and destination are securely geocoded via Nominatim.
3. **Baseline Route**: OSRM calculates the standard driving route.
4. **Corridor Expansion**: The application projects a 2km mathematical corridor along the route and queries Overpass. If fewer than 3 eligible candidates exist, it expands safely to 5km, then up to 10km.
5. **Deterministic Routing**: OSRM calculates exact detour routes through the eligible discovered nodes.
6. **Ranking**: Candidates are strictly mathematically ranked by extra driving time without LLM hallucinations.
7. **Display**: Multi-leg segments and markers are mapped in the React Leaflet UI.

---

## 5. Testing

The application features strict test boundaries. Mocked tests execute instantaneously without stressing public mapping networks.

### Run Automated Unit & Integration Tests (Mocked)
**Backend:**
```bash
cd server
node --test
```
**Frontend:**
```bash
cd client
npm run test
```

### Run Optional Live-Provider Smoke Tests
To verify live connectivity with Nominatim/Overpass/OSRM, explicitly enable the smoke testing flag:
```bash
cd server
RUN_LIVE_OVERPASS_TESTS=1 node --test
```
*(Use sparingly to respect provider policies).*

---

## 6. Provider Limitations & Policies

- **OpenStreetMap Data**: Categories rely on crowd-sourced OSM tags. Missing addresses or names on nodes reflect the true state of OSM data.
- **Provider Usage Policies**: Nominatim and Overpass public endpoints are strictly rate-limited. SafePath respects this by caching queries and utilizing bounded expansions. Do not hammer the search endpoint rapidly.
- **OSRM Public Demo**: The default OSRM endpoint (`router.project-osrm.org`) is a prototype service. It **does not** contain live real-time traffic data, turn-by-turn alerts, or road closure awareness. All estimates are theoretical driving averages.
- **Ratings Constraint**: Because OSM does not verify star ratings natively, any user request demanding a "minimum rating" is deterministically rejected as `unsupported_constraint`. We do not fabricate ratings.
- **Geographic Scope**: To protect against runaway LLM parsing ("Drive from London to Sydney"), the application is currently statically locked to **Punjab, India**. To expand this, update the bounding box metrics inside `server/config/env.js` and `server/services/baselineRouteService.js`.

---

## 7. Known Limitations & Troubleshooting

- **"Ollama is unavailable or the local model is missing."**
  - *Fix:* Ensure the Ollama daemon is running in the background and you have run `ollama pull llama3`.
- **"The OpenStreetMap Overpass search service returned an error..."**
  - *Fix:* You may have hit a public API rate limit. Wait a few moments before retrying. Consider deploying a private Overpass mirror for production environments.
- **"Language model returned invalid JSON or an unexpected schema."**
  - *Fix:* The requested model might be too small to strictly adhere to the prompt schema (e.g., `llama3:8b` can occasionally drift). Retry the request or pull a larger model if hardware permits.
- **Missing route detours on multi-stops**
  - *Fix:* If the routing engine fails to calculate a valid physical road mapping to an OSM node, the UI safely falls back to drawing just the baseline route while tagging the stop segment as "unroutable". This is expected behavior when physical map routing data is incomplete.
