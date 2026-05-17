const { calculateBottleneck } = require('../services/bottleneck.service');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getBottleneck = asyncHandler(async (req, res) => {
  const { gpu_id, cpu_id, useCase } = req.query;
  const result = await calculateBottleneck(gpu_id, cpu_id, useCase);
  return apiResponse.success(res, result);
});

module.exports = { getBottleneck };
