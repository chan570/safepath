const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/safepath';
  try {
    console.log(`Connecting to MongoDB at: ${mongoURI}...`);
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("❌ CRITICAL: Failed to connect to MongoDB.");
    console.error(`Reason: ${error.message}`);
    process.exit(1);
  }
};

// Database interface wrapper
const db = {
  // USER METHODS
  users: {
    find: async (query = {}) => {
      const User = require('./models/User');
      return await User.find(query);
    },
    
    findOne: async (query) => {
      const User = require('./models/User');
      return await User.findOne(query);
    },
    
    findById: async (id) => {
      const User = require('./models/User');
      return await User.findById(id);
    },
    
    create: async (userData) => {
      const User = require('./models/User');
      const user = new User(userData);
      return await user.save();
    },
    
    updateById: async (id, updateData) => {
      const User = require('./models/User');
      return await User.findByIdAndUpdate(id, updateData, { new: true });
    }
  },
  
  // REPORT METHODS
  reports: {
    find: async (query = {}) => {
      const UnsafeReport = require('./models/UnsafeReport');
      return await UnsafeReport.find(query);
    },
    
    create: async (reportData) => {
      const UnsafeReport = require('./models/UnsafeReport');
      const report = new UnsafeReport({
        ...reportData,
        location: {
          type: 'Point',
          coordinates: [reportData.coordinates.lng, reportData.coordinates.lat]
        }
      });
      return await report.save();
    },
    
    findNearby: async (lat, lng, radiusInKm = 5) => {
      const UnsafeReport = require('./models/UnsafeReport');
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
    },
    
    deleteById: async (id) => {
      const UnsafeReport = require('./models/UnsafeReport');
      return await UnsafeReport.findByIdAndDelete(id);
    }
  }
};

module.exports = { connectDB, db };
