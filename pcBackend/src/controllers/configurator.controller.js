const { buildConfiguration, swapComponent } = require('../services/configurator/configurator.service');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

function isDatabaseUnavailable(err) {
  const message = String(err?.message || err || '');
  return /timeout|timedout|etimedout|econnrefused|pool|connection/i.test(message);
}

const build = asyncHandler(async (req, res) => {
  const { budget, useCase, anchorComponents = {}, pricingMode = 'new' } = req.body;

  logger.info(`[Configurator] request start budget=${budget} useCase=${useCase}`);

  try {
    logger.info('[Configurator] DB query phase');
    const result = await buildConfiguration(budget, useCase, anchorComponents, { pricingMode });

    logger.info('[Configurator] build result phase');
    return apiResponse.success(res, result);
  } catch (err) {
    logger.error(`[Configurator] caught error: ${err.message}`);

    if (isDatabaseUnavailable(err)) {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    return apiResponse.error(res, err.message || 'Build generation failed', err.statusCode || 500);
  }
});

const swap = asyncHandler(async (req, res) => {
  const {
    build: currentBuild,
    componentType,
    budget,
    useCase,
    pricingMode = 'new',
    anchors,
    anchorComponents = {},
  } = req.body;

  try {
    const result = await swapComponent({
      build: currentBuild,
      componentType,
      budget,
      useCase,
      pricingMode,
      anchors: anchors ?? anchorComponents,
    });

    return apiResponse.success(res, result);
  } catch (err) {
    logger.error(`[Configurator] swap caught error: ${err.message}`);

    if (isDatabaseUnavailable(err)) {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    return apiResponse.error(res, err.message || 'Component swap failed', err.statusCode || 500);
  }
});

module.exports = { build, swap };
