const CpuModel = require('../models/cpu.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const cpus = await CpuModel.findAll(req.query);
  return apiResponse.success(res, cpus);
});

const getById = asyncHandler(async (req, res) => {
  const cpu = await CpuModel.findById(req.params.id);
  if (!cpu) return apiResponse.error(res, 'CPU not found', 404);
  return apiResponse.success(res, cpu);
});

module.exports = { getAll, getById };