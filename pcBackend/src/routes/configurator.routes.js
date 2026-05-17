const router = require('express').Router();
const validate = require('../middleware/validate.middleware');
const { budgetSchema } = require('../validators/budget.validator');
const { build } = require('../controllers/configurator.controller');

router.post('/', validate(budgetSchema, 'body'), build);

module.exports = router;