const { cacheGet: redisGet, cacheSet } = require('../config/redis');
const logger = require('../utils/logger');

function cacheKey(req, namespace = 'default') {
  return `cache:${namespace}:${req.method}:${req.originalUrl}`;
}

function debug(message) {
  if (process.env.CACHE_DEBUG === '1' || process.env.CACHE_DEBUG === 'true') {
    logger.info(`[Cache] ${message}`);
  }
}

function cacheGet(ttlSeconds, namespace = 'default') {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      debug(`BYPASS ${req.method} ${req.originalUrl}`);
      return next();
    }

    const key = cacheKey(req, namespace);

    try {
      const cached = await redisGet(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          debug(`HIT ${key}`);
          return res.status(parsed.statusCode || 200).json(parsed.body);
        } catch (err) {
          debug(`BYPASS invalid JSON ${key}`);
        }
      } else {
        debug(`MISS ${key}`);
      }
    } catch (err) {
      debug(`BYPASS ${key}: ${err.message}`);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode || 200;
      if (statusCode >= 200 && statusCode < 300) {
        cacheSet(key, JSON.stringify({ statusCode, body }), ttlSeconds)
          .catch((err) => debug(`BYPASS set ${key}: ${err.message}`));
      }

      return originalJson(body);
    };

    return next();
  };
}

module.exports = {
  cacheGet,
};
