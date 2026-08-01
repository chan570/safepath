const config = require('./config/config');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./dbConnect');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Custom Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

// Custom HTTP Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Initialize Middleware
app.use(cors());
app.use(express.json());

// Connect Database and load safety datasets
const startServer = async () => {
  try {
    await connectDB();
    const datasetManager = require('./utils/datasetManager');
    await datasetManager.initialize();
  } catch (err) {
    logger.error("❌ CRITICAL: Failed during database or dataset initialization:", err);
    process.exit(1);
  }
};
startServer();

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/routing', require('./routes/routing'));
app.use('/api/sos', require('./routes/sos'));

// Root Health Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    env: {
      port: config.port,
      mlServiceUrl: config.mlServiceUrl
    }
  });
});

// Centralized Global Error Handler Middleware
app.use(errorHandler);

const PORT = config.port;

if (config.env !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`🚀 SafePath AI backend running on port ${PORT}`);
    logger.info(`🔗 API Health: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
