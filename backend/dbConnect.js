const mongoose = require('mongoose');
const config = require('./config/config');
const logger = require('./utils/logger');

const connectDB = async () => {
  const mongoURI = config.mongodbUri;
  
  try {
    logger.info(`Connecting to MongoDB at: ${mongoURI}...`);
    
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connection established successfully.');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`Mongoose connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose connection disconnected.');
    });

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000
    });
    
    logger.info('MongoDB connected successfully!');
  } catch (error) {
    logger.error(`❌ CRITICAL: Failed to connect to MongoDB. Reason: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { connectDB };
