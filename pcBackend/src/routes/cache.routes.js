const router = require('express').Router();
const { invalidate } = require('../controllers/cache.controller');

router.post('/invalidate', invalidate);

module.exports = router;
