const jwt = require('jsonwebtoken');
const config = require('../config/config');
const AppError = require('../errors/AppError');

module.exports = (req, res, next) => {
  const token = req.header('x-auth-token');

  if (!token) {
    return next(new AppError('No token, authorization denied', 401));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded.user;
    next();
  } catch (err) {
    next(new AppError('Token is not valid', 401));
  }
};
