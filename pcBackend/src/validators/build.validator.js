const { z } = require('zod');

 const componentIdsBase = z.object({
  gpu_id:       z.number().int().positive().optional(),
  cpu_id:       z.number().int().positive().optional(),
  mainboard_id: z.number().int().positive().optional(),
  ram_id:       z.number().int().positive().optional(),
  psu_id:       z.number().int().positive().optional(),
  case_id:      z.number().int().positive().optional(),
  cooler_id:    z.number().int().positive().optional(),
  storage_id:   z.number().int().positive().optional(),
});

 const atLeastOneId = (data) =>
  Object.entries(data)
    .filter(([key]) => key !== 'useCase')
    .some(([, val]) => val !== undefined);

 const buildSchema = componentIdsBase.refine(atLeastOneId, {
  message: 'At least one component ID must be provided',
});

const snapshotSaveSchema = z.object({
  build: z.record(z.any()),
  sessionId: z.string().optional(),
  draftBuildId: z.string().optional(),
  totalPrice: z.number().nullable().optional(),
  budgetTotal: z.number().nullable().optional(),
  budgetOverflow: z.number().nullable().optional(),
  useCase: z.enum(['gaming', 'workstation', 'office', 'optimal']).optional(),
  pricingMode: z.enum(['new', 'best_value']).optional(),
  compatible: z.boolean().optional(),
  issues: z.array(z.any()).optional(),
  warnings: z.array(z.any()).optional(),
  bottleneck: z.any().optional(),
  buildHealth: z.any().optional(),
}).passthrough();

const legacySaveSchema = componentIdsBase
  .extend({
    useCase: z.enum(['gaming', 'workstation', 'office', 'optimal']).optional(),
  })
  .refine(atLeastOneId, {
    message: 'At least one component ID must be provided',
  });

 const saveBuildSchema = z.union([snapshotSaveSchema, legacySaveSchema]);

module.exports = { buildSchema, saveBuildSchema };
