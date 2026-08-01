const AppError = require('../errors/AppError');

/**
 * Schema-based validation middleware creator.
 * @param {object} schema - Schema defining rules for body, query, or params.
 * @returns {Function} Express middleware function
 */
const validate = (schema) => (req, res, next) => {
  const errors = [];

  const checkFields = (reqPart, rules) => {
    if (!rules) return;
    const target = req[reqPart] || {};

    for (const [key, rulesList] of Object.entries(rules)) {
      const val = target[key];

      for (const rule of rulesList) {
        // Required check
        if (rule.required && (val === undefined || val === null || val === '')) {
          errors.push(`${reqPart}.${key} is required`);
          break; // Stop checking other rules for this field
        }

        if (val !== undefined && val !== null && val !== '') {
          // Type check
          if (rule.type && typeof val !== rule.type) {
            errors.push(`${reqPart}.${key} must be a ${rule.type}`);
          }
          // Regex check
          if (rule.pattern && !rule.pattern.test(val)) {
            errors.push(`${reqPart}.${key} format is invalid`);
          }
          // Enum check
          if (rule.enum && !rule.enum.includes(val)) {
            errors.push(`${reqPart}.${key} must be one of: ${rule.enum.join(', ')}`);
          }
          // Custom validation check
          if (rule.custom) {
            const customError = rule.custom(val);
            if (customError) {
              errors.push(`${reqPart}.${key}: ${customError}`);
            }
          }
        }
      }
    }
  };

  checkFields('body', schema.body);
  checkFields('query', schema.query);
  checkFields('params', schema.params);

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

module.exports = validate;
