const { invalidateCacheByPrefix } = require('../config/redis');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const invalidate = asyncHandler(async (req, res) => {
  const expectedToken = process.env.CACHE_INVALIDATION_TOKEN;
  const providedToken = req.get('x-cache-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (expectedToken && providedToken !== expectedToken) {
    return apiResponse.error(res, 'Forbidden', 403);
  }

  const prefix = String(req.body?.prefix || '').trim();
  if (!prefix || !/^[a-z0-9:_-]+$/i.test(prefix)) {
    return apiResponse.error(res, 'Invalid cache prefix', 400);
  }

  const deleted = await invalidateCacheByPrefix(prefix);
  return apiResponse.success(res, { prefix, deleted });
});

module.exports = { invalidate };
