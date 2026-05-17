const { checkCompatibility } = require('../services/compatibility/compatibility.service');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const check = asyncHandler(async (req, res) => {
  const result = await checkCompatibility(req.body);
  return apiResponse.success(res, result);
});

module.exports = { check };