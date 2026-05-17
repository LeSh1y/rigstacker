const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const { getAll, getById } = require('../controllers/cooler.controller');

const schema = z.object({
  socket:   z.string().optional(),
  type:     z.enum(['air', 'aio_120', 'aio_240', 'aio_360']).optional(),
  maxPrice: z.coerce.number().positive().optional(),
});

router.get('/', cacheGet(600, 'catalog'), validate(schema), getAll);
router.get('/:id', getById);
module.exports = router;
