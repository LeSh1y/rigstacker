const PsuModel = require('../models/psu.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  return apiResponse.success(res, await PsuModel.findAll(req.query));
});

const getById = asyncHandler(async (req, res) => {
  const item = await PsuModel.findById(req.params.id);
  if (!item) return apiResponse.error(res, 'PSU not found', 404);
  return apiResponse.success(res, item);
});

module.exports = { getAll, getById };