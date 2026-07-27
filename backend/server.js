require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./dbConnect');

const app = express();

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
    console.error("❌ CRITICAL: Failed during database or dataset initialization:", err);
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
      port: process.env.PORT || 4000,
      mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:5000'
    }
  });
});

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 SafePath AI backend running on port ${PORT}`);
    console.log(`🔗 API Health: http://localhost:${PORT}/health\n`);
  });
}

module.exports = app;
