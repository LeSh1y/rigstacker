const MainboardModel = require('../models/mainboard.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const items = await MainboardModel.findAll(req.query);
  return apiResponse.success(res, items);
});

const getById = asyncHandler(async (req, res) => {
  const item = await MainboardModel.findById(req.params.id);
  if (!item) return apiResponse.error(res, 'Mainboard not found', 404);
  return apiResponse.success(res, item);
});

module.exports = { getAll, getById };