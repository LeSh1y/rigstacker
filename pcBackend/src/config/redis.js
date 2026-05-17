const logger = require('../utils/logger');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const OP_TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS || 250);

let redisPackage = null;
try {
  redisPackage = require('redis');
} catch (err) {
  logger.warn('[Redis] redis package not installed; cache disabled');
}

let client = null;
let connectPromise = null;
let disabled = !redisPackage;
let failureCooldownUntil = 0;

function buildRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD
    ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@`
    : '';

  return `redis://${password}${host}:${port}`;
}

function withTimeout(promise, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), OP_TIMEOUT_MS)),
  ]);
}

function getClient() {
  if (disabled || !redisPackage) return null;
  if (Date.now() < failureCooldownUntil) return null;

  if (!client) {
    client = redisPackage.createClient({
      url: buildRedisUrl() || DEFAULT_REDIS_URL,
      socket: {
        connectTimeout: OP_TIMEOUT_MS,
        reconnectStrategy: false,
      },
    });

    client.on('error', (err) => {
      logger.warn(`[Redis] ${err.message}`);
    });
    client.on('connect', () => logger.info('[Redis] connecting'));
    client.on('ready', () => logger.info('[Redis] ready'));
    client.on('end', () => logger.warn('[Redis] connection closed'));
  }

  return client;
}

async function ensureConnected() {
  const redis = getClient();
  if (!redis) return null;
  if (redis.isReady) return redis;

  if (!connectPromise) {
    connectPromise = redis.connect()
      .then(() => redis)
      .catch((err) => {
        logger.warn(`[Redis] unavailable; bypassing cache: ${err.message}`);
        failureCooldownUntil = Date.now() + 5000;
        return null;
      })
      .finally(() => {
        connectPromise = null;
      });
  }

  return withTimeout(connectPromise, null);
}

async function cacheGet(key) {
  const redis = await ensureConnected();
  if (!redis) return null;

  try {
    return await withTimeout(redis.get(key), null);
  } catch (err) {
    logger.warn(`[Redis] GET bypass ${key}: ${err.message}`);
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  const redis = await ensureConnected();
  if (!redis) return false;

  try {
    await withTimeout(redis.set(key, value, { EX: ttlSeconds }), null);
    return true;
  } catch (err) {
    logger.warn(`[Redis] SET bypass ${key}: ${err.message}`);
    return false;
  }
}

async function invalidateCacheByPrefix(prefix) {
  const redis = await ensureConnected();
  if (!redis) return 0;

  const pattern = `cache:${prefix}:*`;
  let cursor = '0';
  let count = 0;

  try {
    do {
      const result = await withTimeout(redis.scan(cursor, { MATCH: pattern, COUNT: 100 }), null);
      if (!result) return count;

      cursor = String(result.cursor);
      const keys = result.keys || [];
      if (keys.length > 0) {
        count += await redis.del(keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(`[Redis] invalidation bypass ${pattern}: ${err.message}`);
  }

  return count;
}

async function closeRedis() {
  if (client?.isOpen) {
    await client.quit();
  }
}

module.exports = {
  cacheGet,
  cacheSet,
  closeRedis,
  ensureConnected,
  invalidateCacheByPrefix,
};
