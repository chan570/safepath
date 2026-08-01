require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/safepath',
  jwtSecret: process.env.JWT_SECRET || 'safepath_secret_key_jwt',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:5000',
  smtp: {
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true'
  }
};

module.exports = config;
