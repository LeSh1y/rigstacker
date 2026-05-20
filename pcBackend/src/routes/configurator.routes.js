const router = require('express').Router();
const validate = require('../middleware/validate.middleware');
const { budgetSchema, swapSchema } = require('../validators/budget.validator');
const { build, swap } = require('../controllers/configurator.controller');

router.post('/', validate(budgetSchema, 'body'), build);
router.post('/swap', validate(swapSchema, 'body'), swap);

module.exports = router;
