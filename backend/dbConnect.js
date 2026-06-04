const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'db.json');

let useLocalFallback = false;

// Ensure local data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial default JSON DB structure
if (!fs.existsSync(JSON_DB_PATH)) {
  fs.writeFileSync(JSON_DB_PATH, JSON.stringify({ users: [], reports: [] }, null, 2));
}

// Helper functions for reading/writing local JSON DB
const readLocalDB = () => {
  try {
    const data = fs.readFileSync(JSON_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading JSON db:", err);
    return { users: [], reports: [] };
  }
};

const writeLocalDB = (data) => {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing JSON db:", err);
  }
};

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/safepath';
  try {
    console.log(`Connecting to MongoDB at: ${mongoURI}...`);
    // Connect with a 3-second timeout so it fails quickly if local MongoDB service is offline
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log("MongoDB connected successfully!");
    useLocalFallback = false;
  } catch (error) {
    console.warn("\n==============================================================");
    console.warn("⚠️  WARNING: Failed to connect to MongoDB.");
    console.warn(`Reason: ${error.message}`);
    console.warn("==============================================================");
    console.warn("🔄 FALLBACK: SafePath AI is running in HIGH-FIDELITY MOCK DATABASE mode.");
    console.warn(`All user profiles, trusted contacts, and unsafe area reports`);
    console.warn(`will be persisted in: ${JSON_DB_PATH}`);
    console.warn("This allows the app to run completely out-of-the-box!");
    console.warn("==============================================================\n");
    useLocalFallback = true;
  }
};

// Database interface wrapper to unify Mongoose and Local JSON DB
const db = {
  isFallback: () => useLocalFallback,
  
  // USER METHODS
  users: {
    find: async (query = {}) => {
      if (!useLocalFallback) {
        const User = require('./models/User');
        return await User.find(query);
      }
      const dbData = readLocalDB();
      return dbData.users.filter(u => {
        for (let key in query) {
          if (u[key] !== query[key]) return false;
        }
        return true;
      });
    },
    
    findOne: async (query) => {
      if (!useLocalFallback) {
        const User = require('./models/User');
        return await User.findOne(query);
      }
      const dbData = readLocalDB();
      return dbData.users.find(u => {
        for (let key in query) {
          if (u[key] !== query[key]) return false;
        }
        return true;
      }) || null;
    },
    
    findById: async (id) => {
      if (!useLocalFallback) {
        const User = require('./models/User');
        return await User.findById(id);
      }
      const dbData = readLocalDB();
      return dbData.users.find(u => u._id === id) || null;
    },
    
    create: async (userData) => {
      if (!useLocalFallback) {
        const User = require('./models/User');
        const user = new User(userData);
        return await user.save();
      }
      const dbData = readLocalDB();
      const newUser = {
        _id: 'u_' + Math.random().toString(36).substr(2, 9),
        trustedContacts: [],
        savedRoutes: [],
        createdAt: new Date().toISOString(),
        ...userData
      };
      dbData.users.push(newUser);
      writeLocalDB(dbData);
      return newUser;
    },
    
    updateById: async (id, updateData) => {
      if (!useLocalFallback) {
        const User = require('./models/User');
        return await User.findByIdAndUpdate(id, updateData, { new: true });
      }
      const dbData = readLocalDB();
      const index = dbData.users.findIndex(u => u._id === id);
      if (index === -1) return null;
      dbData.users[index] = { ...dbData.users[index], ...updateData };
      writeLocalDB(dbData);
      return dbData.users[index];
    }
  },
  
  // REPORT METHODS
  reports: {
    find: async (query = {}) => {
      if (!useLocalFallback) {
        const UnsafeReport = require('./models/UnsafeReport');
        return await UnsafeReport.find(query);
      }
      const dbData = readLocalDB();
      return dbData.reports.filter(r => {
        for (let key in query) {
          if (r[key] !== query[key]) return false;
        }
        return true;
      });
    },
    
    create: async (reportData) => {
      if (!useLocalFallback) {
        const UnsafeReport = require('./models/UnsafeReport');
        const report = new UnsafeReport({
          ...reportData,
          location: {
            type: 'Point',
            coordinates: [reportData.coordinates.lng, reportData.coordinates.lat]
          }
        });
        return await report.save();
      }
      const dbData = readLocalDB();
      const newReport = {
        _id: 'r_' + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString(),
        severity: 'Medium',
        ...reportData,
        location: {
          type: 'Point',
          coordinates: [reportData.coordinates.lng, reportData.coordinates.lat]
        }
      };
      dbData.reports.push(newReport);
      writeLocalDB(dbData);
      return newReport;
    },
    
    findNearby: async (lat, lng, radiusInKm = 5) => {
      // Approx conversion: 1 degree latitude ~= 111km, 1 degree longitude ~= 111 * cos(lat)
      if (!useLocalFallback) {
        const UnsafeReport = require('./models/UnsafeReport');
        // Find reports within radius (in meters)
        return await UnsafeReport.find({
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [lng, lat]
              },
              $maxDistance: radiusInKm * 1000
            }
          }
        });
      }
      
      const dbData = readLocalDB();
      return dbData.reports.filter(report => {
        const r_lng = report.location.coordinates[0];
        const r_lat = report.location.coordinates[1];
        
        // Haversine distance formula
        const R = 6371; // Radius of Earth in km
        const dLat = (r_lat - lat) * Math.PI / 180;
        const dLon = (r_lng - lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat * Math.PI / 180) * Math.cos(r_lat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return distance <= radiusInKm;
      });
    },
    
    deleteById: async (id) => {
      if (!useLocalFallback) {
        const UnsafeReport = require('./models/UnsafeReport');
        return await UnsafeReport.findByIdAndDelete(id);
      }
      const dbData = readLocalDB();
      const index = dbData.reports.findIndex(r => r._id === id);
      if (index === -1) return null;
      const removed = dbData.reports.splice(index, 1);
      writeLocalDB(dbData);
      return removed[0];
    }
  }
};

module.exports = { connectDB, db };
