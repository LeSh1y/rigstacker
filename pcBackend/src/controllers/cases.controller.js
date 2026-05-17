const CasesModel = require('../models/cases.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  return apiResponse.success(res, await CasesModel.findAll(req.query));
});

const getById = asyncHandler(async (req, res) => {
  const item = await CasesModel.findById(req.params.id);
  if (!item) return apiResponse.error(res, 'Case not found', 404);
  return apiResponse.success(res, item);
});

module.exports = { getAll, getById };