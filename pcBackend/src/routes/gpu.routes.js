const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const { getAll, getById } = require('../controllers/gpu.controller');

const gpuQuerySchema = z.object({
  maxPrice: z.coerce.number().positive().optional(),
  minVram:  z.coerce.number().positive().optional(),
  brand:    z.string().optional(),
});

router.get('/', cacheGet(600, 'catalog'), validate(gpuQuerySchema), getAll);
router.get('/:id', getById);

module.exports = router;
