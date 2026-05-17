const BrandsModel = require('../models/brands.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
  const brands = await BrandsModel.findAll();
  return apiResponse.success(res, brands);
});

const getById = asyncHandler(async (req, res) => {
  const brand = await BrandsModel.findById(req.params.id);
  if (!brand) return apiResponse.error(res, 'Brand not found', 404);
  return apiResponse.success(res, brand);
});

module.exports = { getAll, getById };