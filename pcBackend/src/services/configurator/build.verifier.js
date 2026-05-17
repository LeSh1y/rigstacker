const { checkCompatibility } = require('../compatibility/compatibility.service');

async function verifyBuild(build) {
  const ids = {};
  if (build.gpu)      ids.gpu_id       = build.gpu.id;
  if (build.cpu)      ids.cpu_id       = build.cpu.id;
  if (build.mainboard) ids.mainboard_id = build.mainboard.id;
  if (build.ram)      ids.ram_id       = build.ram.id;
  if (build.psu)      ids.psu_id       = build.psu.id;
  if (build.case)     ids.case_id      = build.case.id;
  if (build.cooler)   ids.cooler_id    = build.cooler.id;
  if (build.storage)  ids.storage_id   = build.storage.id;

  return checkCompatibility(ids);
}

module.exports = { verifyBuild };