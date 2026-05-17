const logger = require('../utils/logger');
const apiResponse = require('../utils/apiResponse');
const { ZodError } = require('zod');

const errorHandler = (err, req, res, next) => {
  logger.error(`${req.method} ${req.path} — ${err.message}`);

  if (err instanceof ZodError) {
    const issues = err.errors || err.issues;

    const message = issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');

    return apiResponse.error(res, message, 400);
  }

  const status = err.statusCode || 500;

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  return apiResponse.error(res, message, status);
};

module.exports = errorHandler;