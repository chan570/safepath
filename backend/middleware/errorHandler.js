const logger = require('../utils/logger');
const AppError = require('../errors/AppError');

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error using Winston
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    stack: err.stack,
    statusCode: err.statusCode
  });

  // Handle specific MongoDB/Mongoose/JWT errors
  let error = { ...err };
  error.message = err.message;

  // 1. Mongoose Bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found. Invalid ${err.path}: ${err.value}`;
    err = new AppError(message, 400);
  }

  // 2. Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value entered for field: ${field}. Please use another value.`;
    err = new AppError(message, 400);
  }

  // 3. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    err = new AppError(message, 400);
  }

  // 4. JWT Expiry or Invalid Token
  if (err.name === 'JsonWebTokenError') {
    err = new AppError('Invalid authentication token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    err = new AppError('Authentication token has expired. Please log in again.', 401);
  }

  // Send response
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    msg: err.message, // Backwards compatibility for legacy client endpoints
    ...(isProduction ? {} : { stack: err.stack, error: err })
  });
};
