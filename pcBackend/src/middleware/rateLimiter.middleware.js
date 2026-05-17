const rateLimit = require('express-rate-limit');
const apiResponse = require('../utils/apiResponse');

const limiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 100,            
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (
    req.path === '/api/offers/recommendations'
    || /^\/api\/offers\/[^/]+\/\d+\/recommendation$/.test(req.path)
  ),
  handler: (req, res) => {
    apiResponse.error(res, 'Too many requests, please try again later', 429);
  },
});

module.exports = limiter;
