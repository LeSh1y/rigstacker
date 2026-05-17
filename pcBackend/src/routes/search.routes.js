const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { search } = require('../controllers/search.controller');

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  type: z.enum([
    'cpu',
    'gpu',
    'mobo',
    'motherboard',
    'mainboard',
    'ram',
    'storage',
    'ssd',
    'psu',
    'cooler',
    'case',
    'cases',
  ]).optional(),
});

router.get('/', validate(searchQuerySchema, 'query'), search);

module.exports = router;
