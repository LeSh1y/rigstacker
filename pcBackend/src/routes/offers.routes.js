const router = require('express').Router();
const { z, ZodError } = require('zod');
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const apiResponse = require('../utils/apiResponse');
const { getOffers, getPriceHistory, getMarketSummary, getRecommendation, getRecommendations } = require('../controllers/offers.controller');

const VALID_TYPES = ['gpu', 'cpu', 'mainboard', 'motherboard', 'mobo', 'ram', 'psu', 'case', 'cases', 'cooler', 'storage', 'ssd'];

const componentParamsSchema = z.object({
  type: z.enum(VALID_TYPES),
  id:   z.coerce.number().int().positive(),
});

const validateParams = (req, res, next) => {
  try {
    req.params = componentParamsSchema.parse(req.params);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return apiResponse.error(res, message || 'Validation error', 400);
    }
    next(err);
  }
};

const offersQuerySchema = z.object({
  condition:  z.enum(['new', 'used', 'open_box', 'refurbished']).optional(),
  source:     z.string().optional(),
  maxPrice:   z.coerce.number().positive().optional(),
  activeOnly: z.coerce.boolean().optional(),
});

const historyQuerySchema = z.object({
  source:    z.string().optional(),
  condition: z.string().optional(),
  days:      z.coerce.number().int().positive().optional(),
});

const recommendationQuerySchema = z.object({
  mode: z.enum(['new', 'best_value']).optional(),
});

const recommendationsBodySchema = z.object({
  mode: z.enum(['new', 'best_value']).optional(),
  components: z.array(z.object({
    type: z.enum(VALID_TYPES),
    id: z.coerce.number().int().positive(),
  })).max(16),
});

router.post('/offers/recommendations', validate(recommendationsBodySchema, 'body'), getRecommendations);
router.get('/offers/:type/:id/recommendation', cacheGet(180, 'recommendation'), validateParams, validate(recommendationQuerySchema), getRecommendation);
router.get('/offers/:type/:id',         validateParams, validate(offersQuerySchema),   getOffers);
router.get('/prices/:type/:id/history', validateParams, validate(historyQuerySchema),  getPriceHistory);
router.get('/market/:type/:id/summary', validateParams,                                getMarketSummary);

module.exports = router;
