const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const { getAll, getById } = require('../controllers/cases.controller');

const schema = z.object({
  formFactor: z.string().optional(),
  maxPrice:   z.coerce.number().positive().optional(),
});

router.get('/', cacheGet(600, 'catalog'), validate(schema), getAll);
router.get('/:id', getById);
module.exports = router;
