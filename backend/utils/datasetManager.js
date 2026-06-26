const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'data')
  : path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CRIME_PATH = path.join(DATA_DIR, 'crime.json');
const ACCIDENTS_PATH = path.join(DATA_DIR, 'accidents.json');
const LIGHTING_PATH = path.join(DATA_DIR, 'lighting.json');

/**
 * Generate mock safety data centered around Delhi (Leaflet's initial view)
 * to ensure immediate visual interaction and routing testing.
 */
const generateMockData = () => {
  const delhiLat = 28.6139;
  const delhiLng = 77.2090;

  const crimes = [];
  const accidents = [];
  const lighting = [];

  // Generate 80 mock entries for rich heatmap visualization
  for (let i = 0; i < 80; i++) {
    const latOffset = (Math.random() - 0.5) * 0.15;
    const lngOffset = (Math.random() - 0.5) * 0.15;

    const lat = delhiLat + latOffset;
    const lng = delhiLng + lngOffset;

    // Crime incident seed
    const crimeTypes = ['Theft', 'Assault', 'Harassment', 'Vandalism', 'Bag Snatching'];
    crimes.push({
      id: `crime_${i}`,
      coordinates: { lat, lng },
      severity: Math.random() > 0.6 ? 'High' : (Math.random() > 0.3 ? 'Medium' : 'Low'),
      type: crimeTypes[Math.floor(Math.random() * crimeTypes.length)],
      description: `Reported area for ${crimeTypes[Math.floor(Math.random() * crimeTypes.length)].toLowerCase()}.`
    });

    // Accident hotspot seed
    const accidentTypes = ['Vehicle Collision', 'Pedestrian Crash', 'Over speeding Accident', 'Blind Spot Collision'];
    accidents.push({
      id: `accident_${i}`,
      coordinates: { lat: lat + 0.008, lng: lng - 0.008 },
      severity: Math.random() > 0.7 ? 'High' : (Math.random() > 0.3 ? 'Medium' : 'Low'),
      type: accidentTypes[Math.floor(Math.random() * accidentTypes.length)],
      description: `Traffic incident at intersection.`
    });

    // Low lighting street seed
    const lightStatus = ['Unlit', 'Dim'];
    lighting.push({
      id: `light_${i}`,
      coordinates: { lat: lat - 0.008, lng: lng + 0.008 },
      status: lightStatus[Math.floor(Math.random() * lightStatus.length)],
      description: 'Street light malfunction reported by community.'
    });
  }

  fs.writeFileSync(CRIME_PATH, JSON.stringify(crimes, null, 2));
  fs.writeFileSync(ACCIDENTS_PATH, JSON.stringify(accidents, null, 2));
  fs.writeFileSync(LIGHTING_PATH, JSON.stringify(lighting, null, 2));
  console.log("🚀 Custom safety datasets successfully seeded to backend/data/");
};

// Seed data files if they do not exist
if (!fs.existsSync(CRIME_PATH) || !fs.existsSync(ACCIDENTS_PATH) || !fs.existsSync(LIGHTING_PATH)) {
  generateMockData();
}

class DatasetManager {
  constructor() {
    this.crimes = [];
    this.accidents = [];
    this.lighting = [];
    
    // Spatial grid indexing
    // Mapping: "latIdx,lngIdx" -> { crimes: [], accidents: [], lighting: [] }
    this.grid = {};
    this.cellSize = 0.004; // ~400m cell size for fine-grained indexing
    
    this.loadDatasets();
  }

  /**
   * Load datasets from disk and rebuild spatial index.
   */
  loadDatasets() {
    try {
      this.crimes = JSON.parse(fs.readFileSync(CRIME_PATH, 'utf8'));
      this.accidents = JSON.parse(fs.readFileSync(ACCIDENTS_PATH, 'utf8'));
      this.lighting = JSON.parse(fs.readFileSync(LIGHTING_PATH, 'utf8'));
      
      console.log(`[DatasetManager] Loaded: ${this.crimes.length} crimes, ${this.accidents.length} accidents, ${this.lighting.length} lighting logs.`);
      this.buildSpatialIndex();
    } catch (err) {
      console.error("[DatasetManager] Error reading datasets:", err);
    }
  }

  /**
   * Build 2D spatial grid mapping for O(1) grid bucket lookups.
   */
  buildSpatialIndex() {
    this.grid = {};
    
    const indexItem = (item, type) => {
      if (!item.coordinates || !item.coordinates.lat || !item.coordinates.lng) return;
      const latIdx = Math.floor(item.coordinates.lat / this.cellSize);
      const lngIdx = Math.floor(item.coordinates.lng / this.cellSize);
      const key = `${latIdx},${lngIdx}`;
      
      if (!this.grid[key]) {
        this.grid[key] = { crimes: [], accidents: [], lighting: [] };
      }
      this.grid[key][type].push(item);
    };

    this.crimes.forEach(item => indexItem(item, 'crimes'));
    this.accidents.forEach(item => indexItem(item, 'accidents'));
    this.lighting.forEach(item => indexItem(item, 'lighting'));
    
    console.log(`[DatasetManager] Spatial index created with ${Object.keys(this.grid).length} active cells.`);
  }

  /**
   * Queries safety features within a bounding box defined by a point and degree offsets.
   * Runs in O(1) time complexity by querying grid buckets.
   * @param {number} lat 
   * @param {number} lng 
   * @param {number} radiusDegrees (~0.002 degrees is approx 200 meters)
   */
  getNearbyFeatures(lat, lng, radiusDegrees = 0.002) {
    const latIdxStart = Math.floor((lat - radiusDegrees) / this.cellSize);
    const latIdxEnd = Math.floor((lat + radiusDegrees) / this.cellSize);
    const lngIdxStart = Math.floor((lng - radiusDegrees) / this.cellSize);
    const lngIdxEnd = Math.floor((lng + radiusDegrees) / this.cellSize);

    const result = { crimes: [], accidents: [], lighting: [] };

    for (let l = latIdxStart; l <= latIdxEnd; l++) {
      for (let g = lngIdxStart; g <= lngIdxEnd; g++) {
        const key = `${l},${g}`;
        const cell = this.grid[key];
        if (cell) {
          result.crimes.push(...cell.crimes);
          result.accidents.push(...cell.accidents);
          result.lighting.push(...cell.lighting);
        }
      }
    }

    return result;
  }
}

const managerInstance = new DatasetManager();
module.exports = managerInstance;
