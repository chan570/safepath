const { nodeEnv } = require('../config/env');

const errorHandler = (err, req, res, next) => {
  // Handle invalid JSON parsing from express.json
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload format'
    });
  }

  // Do not log full request to avoid leaking sensitive information
  console.error(`[Error] ${err.message}`);

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    // Do not expose stack traces in production mode
    ...(nodeEnv === 'development' && { stack: err.stack }) 
  });
};

module.exports = errorHandler;
