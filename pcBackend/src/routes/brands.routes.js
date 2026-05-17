const router = require('express').Router();
const { getAll, getById } = require('../controllers/brands.controller');

router.get('/', getAll);
router.get('/:id', getById);

module.exports = router;