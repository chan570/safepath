const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CRIME_PATH = path.join(DATA_DIR, 'crime.json');
const ACCIDENTS_PATH = path.join(DATA_DIR, 'accidents.json');
const LIGHTING_PATH = path.join(DATA_DIR, 'lighting.json');

class DatasetManager {
  constructor() {
    this.crimes = [];
    this.accidents = [];
    this.lighting = [];
    
    // Spatial grid indexing
    // Mapping: "latIdx,lngIdx" -> { crimes: [], accidents: [], lighting: [] }
    this.grid = {};
    this.cellSize = 0.004; // ~400m cell size for fine-grained indexing
  }

  /**
   * Initialize from MongoDB. Seeds collections if they are empty.
   */
  async initialize() {
    try {
      const Crime = require('../models/Crime');
      const Accident = require('../models/Accident');
      const StreetLight = require('../models/StreetLight');
      const User = require('../models/User');
      const bcrypt = require('bcryptjs');

      // Check counts
      const crimeCount = await Crime.countDocuments();
      const accidentCount = await Accident.countDocuments();
      const lightCount = await StreetLight.countDocuments();

      if (crimeCount === 0 || accidentCount === 0 || lightCount === 0) {
        logger.info("📂 MongoDB safety collections are empty. Seeding from local files / generator...");
        await this.seedToMongoDB(Crime, Accident, StreetLight);
      }

      // Load all records from MongoDB
      this.crimes = await Crime.find({}).lean();
      this.accidents = await Accident.find({}).lean();
      this.lighting = await StreetLight.find({}).lean();

      logger.info(`[DatasetManager] Loaded from MongoDB: ${this.crimes.length} crimes, ${this.accidents.length} accidents, ${this.lighting.length} lighting logs.`);
      
      // Build index
      this.buildSpatialIndex();

      // Seed Default Demo User for Interviews
      const demoEmail = 'demo@gmail.com';
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Password123!', salt);
      const existingDemo = await User.findOne({ email: demoEmail });

      if (!existingDemo) {
        logger.info(`Seeding default demo user account (${demoEmail}) for interviews...`);
        const demoUser = new User({
          username: 'demouser',
          email: demoEmail,
          password: hashedPassword,
          trustedContacts: [
            {
              name: 'Guardian Alpha',
              phone: '+919876543210',
              email: 'guardian.alpha@gmail.com',
              isSOSContact: true
            },
            {
              name: 'Guardian Beta',
              phone: '+919876543211',
              email: 'guardian.beta@gmail.com',
              isSOSContact: true
            }
          ],
          savedRoutes: [
            {
              name: 'Delhi University to Connaught Place',
              sourceName: 'Delhi University',
              destName: 'Connaught Place',
              sourceCoords: { lat: 28.6904, lng: 77.2066 },
              destCoords: { lat: 28.6304, lng: 77.2177 },
              safetyScore: 92
            }
          ]
        });

        await demoUser.save();
        logger.info(`✅ Default demo user account seeded successfully! Email: ${demoEmail} | Password: Password123!`);
      } else {
        // Enforce password update to match user request "Password123!"
        existingDemo.password = hashedPassword;
        await existingDemo.save();
        logger.info(`✅ Default demo user account password updated to Password123!`);
      }
    } catch (err) {
      logger.error("❌ [DatasetManager] Initialization failed:", err);
      throw err; // Fail-fast, propagate error
    }
  }

  /**
   * Seed collections in MongoDB from local files or generated data.
   */
  async seedToMongoDB(Crime, Accident, StreetLight) {
    let crimesSeed = [];
    let accidentsSeed = [];
    let lightingSeed = [];

    // Try reading local JSON files first
    try {
      if (fs.existsSync(CRIME_PATH) && fs.existsSync(ACCIDENTS_PATH) && fs.existsSync(LIGHTING_PATH)) {
        logger.info("[DatasetManager] Found local dataset files. Reading for seeding...");
        crimesSeed = JSON.parse(fs.readFileSync(CRIME_PATH, 'utf8'));
        accidentsSeed = JSON.parse(fs.readFileSync(ACCIDENTS_PATH, 'utf8'));
        lightingSeed = JSON.parse(fs.readFileSync(LIGHTING_PATH, 'utf8'));
      }
    } catch (err) {
      logger.warn(`[DatasetManager] Failed to read local files, will generate fresh mock data: ${err.message}`);
    }

    // Generate in-memory if files were not read successfully or were empty
    if (crimesSeed.length === 0 || accidentsSeed.length === 0 || lightingSeed.length === 0) {
      logger.info("[DatasetManager] Generating fresh Delhi mock datasets for seeding...");
      const delhiLat = 28.6139;
      const delhiLng = 77.2090;

      crimesSeed = [];
      accidentsSeed = [];
      lightingSeed = [];

      for (let i = 0; i < 80; i++) {
        const latOffset = (Math.random() - 0.5) * 0.15;
        const lngOffset = (Math.random() - 0.5) * 0.15;
        const lat = delhiLat + latOffset;
        const lng = delhiLng + lngOffset;

        const crimeTypes = ['Theft', 'Assault', 'Harassment', 'Vandalism', 'Bag Snatching'];
        crimesSeed.push({
          id: `crime_${i}`,
          coordinates: { lat, lng },
          severity: Math.random() > 0.6 ? 'High' : (Math.random() > 0.3 ? 'Medium' : 'Low'),
          type: crimeTypes[Math.floor(Math.random() * crimeTypes.length)],
          description: `Reported area for ${crimeTypes[Math.floor(Math.random() * crimeTypes.length)].toLowerCase()}.`
        });

        const accidentTypes = ['Vehicle Collision', 'Pedestrian Crash', 'Over speeding Accident', 'Blind Spot Collision'];
        accidentsSeed.push({
          id: `accident_${i}`,
          coordinates: { lat: lat + 0.008, lng: lng - 0.008 },
          severity: Math.random() > 0.7 ? 'High' : (Math.random() > 0.3 ? 'Medium' : 'Low'),
          type: accidentTypes[Math.floor(Math.random() * accidentTypes.length)],
          description: `Traffic incident at intersection.`
        });

        const lightStatus = ['Unlit', 'Dim'];
        lightingSeed.push({
          id: `light_${i}`,
          coordinates: { lat: lat - 0.008, lng: lng + 0.008 },
          status: lightStatus[Math.floor(Math.random() * lightStatus.length)],
          description: 'Street light malfunction reported by community.'
        });
      }
    }

    // Format for Mongoose with GeoJSON structures
    const formatPoint = (item) => ({
      id: item.id,
      coordinates: item.coordinates,
      severity: item.severity,
      type: item.type,
      status: item.status,
      description: item.description,
      location: {
        type: 'Point',
        coordinates: [item.coordinates.lng, item.coordinates.lat] // [lng, lat]
      }
    });

    const crimesToInsert = crimesSeed.map(formatPoint);
    const accidentsToInsert = accidentsSeed.map(formatPoint);
    const lightingToInsert = lightingSeed.map(formatPoint);

    // Save to DB
    if (crimesToInsert.length > 0) {
      await Crime.deleteMany({});
      await Crime.insertMany(crimesToInsert);
      logger.info(`[DatasetManager] Seeded ${crimesToInsert.length} crimes to MongoDB.`);
    }
    if (accidentsToInsert.length > 0) {
      await Accident.deleteMany({});
      await Accident.insertMany(accidentsToInsert);
      logger.info(`[DatasetManager] Seeded ${accidentsToInsert.length} accidents to MongoDB.`);
    }
    if (lightingToInsert.length > 0) {
      await StreetLight.deleteMany({});
      await StreetLight.insertMany(lightingToInsert);
      logger.info(`[DatasetManager] Seeded ${lightingToInsert.length} light logs to MongoDB.`);
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
    
    logger.info(`[DatasetManager] Spatial index created with ${Object.keys(this.grid).length} active cells.`);
  }

  /**
   * Queries safety features within a bounding box.
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
