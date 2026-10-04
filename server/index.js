const express = require('express');
const cors = require('cors');
const { port, frontendOrigin } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

// Configure CORS to only allow the frontendOrigin
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin for testing (e.g., curl) or exact match
    if (!origin || origin === frontendOrigin) {
      callback(null, true);
    } else {
      const error = new Error('Not allowed by CORS');
      error.statusCode = 403;
      error.isOperational = true;
      callback(error);
    }
  }
}));

// Configure JSON parser with a reasonable body-size limit (100kb)
app.use(express.json({ limit: '100kb' }));

// Register routes
app.use('/api/health', healthRoutes);
app.use('/api/route', require('./routes/planRoutes'));

// Centralized error handler
app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
