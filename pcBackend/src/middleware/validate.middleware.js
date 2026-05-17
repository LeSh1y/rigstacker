const { ZodError } = require('zod');
const apiResponse = require('../utils/apiResponse');

const validate = (schema, source = 'query') => (req, res, next) => {
  try {
    const data = source === 'body' ? req.body : req.query;
    const parsed = schema.parse(data);

    if (source === 'body') {
      req.body = parsed;
    } else {
      req.query = parsed;
    }

    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.errors || err.issues || [];

      const message = issues
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

      return apiResponse.error(res, message || 'Validation error', 400);
    }

    next(err);
  }
};

module.exports = validate;