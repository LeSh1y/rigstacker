const db = require('../../config/db');
const socketCheck     = require('./socket.check');
const ramTypeCheck    = require('./ramType.check');
const powerCheck      = require('./power.check');
const dimensionsCheck = require('./dimensions.check');
const formFactorCheck = require('./formFactor.check');
const coolerCheck     = require('./cooler.check');
const pcieCheck       = require('./pcie.check');

const QUERY_TIMEOUT_MS = 5000;

function hasAll(component, fields) {
  return component && fields.every((field) => component[field] !== null && component[field] !== undefined && component[field] !== '');
}

function runCheck(label, issues, warnings, fn) {
  try {
    const result = fn();
    if (result?.error) issues.push(result.error);
    if (result?.warning) warnings.push(result.warning);
  } catch (err) {
    warnings.push(`${label} compatibility check skipped: ${err.message}`);
  }
}

 async function fetchComponents(ids) {
  const [gpu, cpu, mainboard, ram, psu, pcCase, cooler, storage] = await Promise.all([
    ids.gpu_id       ? db('gpus').where({ id: ids.gpu_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS)       : null,
    ids.cpu_id       ? db('cpus').where({ id: ids.cpu_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS)       : null,
    ids.mainboard_id ? db('mainboards').where({ id: ids.mainboard_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS) : null,
    ids.ram_id       ? db('ram_kits').where({ id: ids.ram_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS)   : null,
    ids.psu_id       ? db('psus').where({ id: ids.psu_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS)       : null,
    ids.case_id      ? db('cases').where({ id: ids.case_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS)     : null,
    ids.cooler_id    ? db('coolers').where({ id: ids.cooler_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS) : null,
    ids.storage_id   ? db('storage').where({ id: ids.storage_id, is_available: true }).first().timeout(QUERY_TIMEOUT_MS) : null,
  ]);

  return { gpu, cpu, mainboard, ram, psu, pcCase, cooler, storage };
}

 function validateFound(ids, components) {
  const map = {
    gpu_id:       ['gpu',       'GPU'],
    cpu_id:       ['cpu',       'CPU'],
    mainboard_id: ['mainboard', 'Mainboard'],
    ram_id:       ['ram',       'RAM kit'],
    psu_id:       ['psu',       'PSU'],
    case_id:      ['pcCase',    'Case'],
    cooler_id:    ['cooler',    'Cooler'],
    storage_id:   ['storage',   'Storage'],
  };

  const notFound = [];
  for (const [idKey, [compKey, label]] of Object.entries(map)) {
    if (ids[idKey] && !components[compKey]) {
      notFound.push(`${label} with id=${ids[idKey]} not found`);
    }
  }

  return notFound;
}

async function checkCompatibility(ids) {
  const components = await fetchComponents(ids);
  const { gpu, cpu, mainboard, ram, psu, pcCase, cooler } = components;

   const notFound = validateFound(ids, components);
  if (notFound.length > 0) {
    const err = new Error(notFound.join('; '));
    err.statusCode = 404;
    throw err;
  }

  const issues   = [];
  const warnings = [];

  if (cpu && mainboard) {
    if (hasAll(cpu, ['socket']) && hasAll(mainboard, ['socket'])) {
      runCheck('Socket', issues, warnings, () => socketCheck(cpu, mainboard));
    } else {
      warnings.push('Socket compatibility check skipped: missing CPU or mainboard socket data');
    }

    if (hasAll(cpu, ['supported_ram_types']) && hasAll(mainboard, ['supported_ram_types'])) {
      runCheck('RAM type', issues, warnings, () => ramTypeCheck(cpu, mainboard, ram));
    } else {
      warnings.push('RAM compatibility check skipped: missing RAM support data');
    }
  }

  if (gpu && cpu && psu) {
    if (hasAll(gpu, ['tdp']) && hasAll(cpu, ['tdp']) && hasAll(psu, ['wattage'])) {
      runCheck('Power', issues, warnings, () => powerCheck(gpu, cpu, psu));
    } else {
      warnings.push('Power compatibility check skipped: missing TDP or PSU wattage data');
    }
  }

  if (gpu && pcCase) {
    if (hasAll(gpu, ['length_mm']) && hasAll(pcCase, ['max_gpu_length_mm'])) {
      runCheck('GPU clearance', issues, warnings, () => dimensionsCheck(gpu, pcCase));
    } else {
      warnings.push('GPU clearance check skipped: missing GPU or case length data');
    }
  }

  if (mainboard && pcCase) {
    if (hasAll(mainboard, ['form_factor']) && hasAll(pcCase, ['supported_form_factors'])) {
      runCheck('Case form factor', issues, warnings, () => formFactorCheck(mainboard, pcCase));
    } else {
      warnings.push('Case form factor check skipped: missing form factor data');
    }
  }

  if (cooler && cpu) {
    if (hasAll(cooler, ['supported_sockets']) && hasAll(cpu, ['socket'])) {
      runCheck('Cooler socket', issues, warnings, () => coolerCheck(cooler, cpu));
    } else {
      warnings.push('Cooler compatibility check skipped: missing cooler socket or CPU socket data');
    }
  }

  if (gpu && mainboard) {
    if (hasAll(gpu, ['pcie_version']) && hasAll(mainboard, ['pcie_version'])) {
      runCheck('PCIe', issues, warnings, () => pcieCheck(gpu, mainboard));
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
    warnings,
    components: {
      gpu:       gpu       ? { id: gpu.id,       name: gpu.name }       : null,
      cpu:       cpu       ? { id: cpu.id,       name: cpu.name }       : null,
      mainboard: mainboard ? { id: mainboard.id, name: mainboard.name } : null,
      ram:       ram       ? { id: ram.id,       name: ram.name }       : null,
      psu:       psu       ? { id: psu.id,       name: psu.name }       : null,
      case:      pcCase    ? { id: pcCase.id,    name: pcCase.name }    : null,
      cooler:    cooler    ? { id: cooler.id,    name: cooler.name }    : null,
      storage:   components.storage ? { id: components.storage.id, name: components.storage.name } : null,
    },
  };
}

module.exports = { checkCompatibility };
