const OfferModel = require('../models/offer.model');
const apiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getOffers = asyncHandler(async (req, res) => {
  const offers = await OfferModel.findByComponent(req.params.type, req.params.id, req.query);
  return apiResponse.success(res, offers);
});

const getPriceHistory = asyncHandler(async (req, res) => {
  const history = await OfferModel.findPriceHistory(req.params.type, req.params.id, req.query);
  return apiResponse.success(res, history);
});

const getMarketSummary = asyncHandler(async (req, res) => {
  const summary = await OfferModel.getMarketSummary(req.params.type, req.params.id);
  return apiResponse.success(res, summary);
});

const getRecommendation = asyncHandler(async (req, res) => {
  const recommendation = await OfferModel.getRecommendation(req.params.type, req.params.id, req.query.mode);
  return apiResponse.success(res, recommendation);
});

const getRecommendations = asyncHandler(async (req, res) => {
  const { mode = 'new', components = [] } = req.body;

  const settled = await Promise.allSettled(
    components.map(async (component) => {
      const recommendation = await OfferModel.getRecommendation(component.type, component.id, mode);
      return {
        type: component.type,
        id: component.id,
        recommendation,
      };
    })
  );

  const recommendations = settled.map((result, index) => {
    const component = components[index];

    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      type: component.type,
      id: component.id,
      recommendation: null,
      error: result.reason?.message || 'Recommendation unavailable',
    };
  });

  return apiResponse.success(res, { mode, recommendations });
});

module.exports = { getOffers, getPriceHistory, getMarketSummary, getRecommendation, getRecommendations };
