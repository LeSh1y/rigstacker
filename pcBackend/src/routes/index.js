const router = require('express').Router();

router.use('/brands',     require('./brands.routes'));
router.use('/gpus',       require('./gpu.routes'));
router.use('/cpus',       require('./cpu.routes'));
router.use('/mainboards', require('./mainboard.routes'));
router.use('/ram',        require('./ram.routes'));
router.use('/psus',       require('./psu.routes'));
router.use('/cases',      require('./cases.routes'));
router.use('/coolers',    require('./cooler.routes'));
router.use('/storage',    require('./storage.routes'));
router.use('/compatibility', require('./compatibility.routes'));
router.use('/configurator', require('./configurator.routes'));
router.use('/builds',       require('./builds.routes'));
router.use('/bottleneck',   require('./bottleneck.routes'));
router.use('/cache',        require('./cache.routes'));
router.use('/',             require('./offers.routes'));
router.use('/search', require('./search.routes'));

module.exports = router;
