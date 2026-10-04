const validateBody = (schema) => {
  return (req, res, next) => {
    // Basic validation stub to fulfill requirements before business logic is added.
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && Object.keys(req.body).length === 0) {
      const err = new Error('Request body cannot be empty');
      err.statusCode = 400;
      err.isOperational = true;
      return next(err);
    }
    
    // In a real implementation, we would validate req.body against the provided schema (e.g. Joi or Zod)
    next();
  };
};

module.exports = validateBody;
