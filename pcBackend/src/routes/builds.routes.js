const router = require('express').Router();
const validate = require('../middleware/validate.middleware');
const { cacheGet } = require('../middleware/cache.middleware');
const { saveBuildSchema } = require('../validators/build.validator');
const { list, save, getById, getShare, remove } = require('../controllers/builds.controller');

router.post('/', validate(saveBuildSchema, 'body'), save);
router.get('/', list);
router.get('/:id/share', getShare);
router.get('/:id', cacheGet(1800, 'build'), getById);
router.delete('/:id', remove);

module.exports = router;
