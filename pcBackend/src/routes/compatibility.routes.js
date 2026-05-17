const router = require('express').Router();
const validate = require('../middleware/validate.middleware');
const { buildSchema } = require('../validators/build.validator');
const { check } = require('../controllers/compatibility.controller');

router.post('/', validate(buildSchema, 'body'), check);

module.exports = router;