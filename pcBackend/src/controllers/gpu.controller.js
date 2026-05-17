const GpuModel = require('../models/gpu.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const gpus = await GpuModel.findAll(req.query);
  return apiResponse.success(res, gpus);
});

const getById = asyncHandler(async (req, res) => {
  const gpu = await GpuModel.findById(req.params.id);
  if (!gpu) return apiResponse.error(res, 'GPU not found', 404);
  return apiResponse.success(res, gpu);
});

module.exports = { getAll, getById };