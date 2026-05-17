const db = require('../config/db');
const BuildModel = require('../models/build.model');
const { checkCompatibility } = require('../services/compatibility/compatibility.service');
const { invalidateCacheByPrefix } = require('../config/redis');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
  if (!sessionId) return apiResponse.success(res, []);

  const builds = await BuildModel.listBySession(sessionId);
  return apiResponse.success(res, builds);
});

const save = asyncHandler(async (req, res) => {
  if (req.body.build) {
    const buildId = await BuildModel.save(req.body);
    return apiResponse.success(res, { id: buildId }, 201);
  }

  const { useCase, ...componentIds } = req.body;

   const verification = await checkCompatibility(componentIds);

   const tables = [
    ['gpus',       componentIds.gpu_id],
    ['cpus',       componentIds.cpu_id],
    ['mainboards', componentIds.mainboard_id],
    ['ram_kits',   componentIds.ram_id],
    ['psus',       componentIds.psu_id],
    ['cases',      componentIds.case_id],
    ['coolers',    componentIds.cooler_id],
    ['storage',    componentIds.storage_id],
  ];

  const components = await Promise.all(
    tables.map(([table, id]) => (id ? db(table).where({ id }).first() : null))
  );

  const totalPrice = components
    .filter(Boolean)
    .reduce((sum, c) => sum + parseFloat(c.price_eur), 0);

  // 3. Сохраняем
  const buildId = await BuildModel.save({
    useCase,
    ...componentIds,
    totalPrice:  Math.round(totalPrice * 100) / 100,
    compatible:  verification.compatible,
    issues:      verification.issues,
    warnings:    verification.warnings,
  });

  return apiResponse.success(
    res,
    {
      id: buildId,
      totalPrice:  Math.round(totalPrice * 100) / 100,
      compatible:  verification.compatible,
      issues:      verification.issues,
      warnings:    verification.warnings,
    },
    201
  );
});

const getById = asyncHandler(async (req, res) => {
  const build = await BuildModel.findExpanded(req.params.id);
  if (!build) return apiResponse.error(res, 'Build not found', 404);
  return apiResponse.success(res, build);
});

const getShare = asyncHandler(async (req, res) => {
  const build = await BuildModel.findExpanded(req.params.id);
  if (!build) return apiResponse.error(res, 'Build not found', 404);

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return apiResponse.success(res, {
    shareUrl: `${frontendUrl}/build/${build.id}`,
  });
});

const remove = asyncHandler(async (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string'
    ? req.query.sessionId.trim()
    : (typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '');

  const build = await BuildModel.findSessionId(req.params.id);
  if (!build) return apiResponse.error(res, 'Build not found', 404);
  if (!sessionId || build.sessionId !== sessionId) {
    return apiResponse.error(res, 'Forbidden', 403);
  }

  await BuildModel.deleteById(req.params.id);
  try {
    await invalidateCacheByPrefix('build');
  } catch {}

  return apiResponse.success(res, {
    deleted: true,
    id: req.params.id,
  });
});

module.exports = { list, save, getById, getShare, remove };
