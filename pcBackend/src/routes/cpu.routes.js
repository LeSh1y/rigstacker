const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const { getAll, getById } = require('../controllers/cpu.controller');

const cpuQuerySchema = z.object({
  socket:   z.string().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  brand:    z.string().optional(),
});

router.get('/', cacheGet(600, 'catalog'), validate(cpuQuerySchema), getAll);
router.get('/:id', getById);

module.exports = router;
