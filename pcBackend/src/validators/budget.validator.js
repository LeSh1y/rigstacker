const { z } = require('zod');

const anchorComponentsSchema = z.object({
  gpu_id: z.number().int().positive().optional(),
  cpu_id: z.number().int().positive().optional(),
  mainboard_id: z.number().int().positive().optional(),
  ram_id: z.number().int().positive().optional(),
  psu_id: z.number().int().positive().optional(),
  case_id: z.number().int().positive().optional(),
  cooler_id: z.number().int().positive().optional(),
  storage_id: z.number().int().positive().optional(),
}).optional();

const budgetSchema = z.object({
  budget: z
    .number({ invalid_type_error: 'budget must be a number' })
    .positive()
    .min(200, 'Budget must be at least €200')
    .max(20000, 'Budget must not exceed €20,000'),

  useCase: z.enum(['gaming', 'workstation', 'office', 'optimal'], {
    errorMap: () => ({
      message: 'useCase must be: gaming, workstation, office, or optimal',
    }),
  }),

  pricingMode: z.enum(['new', 'best_value']).optional(),

  anchorComponents: anchorComponentsSchema,
});

const looseComponentSchema = z.object({ id: z.number().int().positive().nullable().optional() }).passthrough().nullable().optional();

const swapSchema = z.object({
  budget: z.number({ invalid_type_error: 'budget must be a number' }).positive().min(200).max(20000),
  useCase: z.enum(['gaming', 'workstation', 'office', 'optimal']),
  pricingMode: z.enum(['new', 'best_value']).optional(),
  componentType: z.enum(['cpu', 'gpu', 'motherboard', 'mainboard', 'mobo', 'ram', 'storage', 'ssd', 'psu', 'cooler', 'case']),
  anchors: anchorComponentsSchema,
  anchorComponents: anchorComponentsSchema,
  build: z.object({
    cpu: looseComponentSchema,
    gpu: looseComponentSchema,
    motherboard: looseComponentSchema,
    mainboard: looseComponentSchema,
    mobo: looseComponentSchema,
    ram: looseComponentSchema,
    storage: looseComponentSchema,
    ssd: looseComponentSchema,
    psu: looseComponentSchema,
    cooler: looseComponentSchema,
    case: looseComponentSchema,
    cases: looseComponentSchema,
  }).passthrough(),
});

module.exports = { budgetSchema, swapSchema };
