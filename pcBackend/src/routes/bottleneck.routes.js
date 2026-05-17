const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { getBottleneck } = require('../controllers/bottleneck.controller');

const bottleneckQuerySchema = z.object({
  gpu_id: z.coerce.number().int().positive({ message: 'gpu_id must be a positive integer' }),
  cpu_id: z.coerce.number().int().positive({ message: 'cpu_id must be a positive integer' }),
  useCase: z.string().optional(),
});

router.get('/', validate(bottleneckQuerySchema, 'query'), getBottleneck);

module.exports = router;
