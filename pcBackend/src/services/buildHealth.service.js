const socketCheck = require('./compatibility/socket.check');
const ramTypeCheck = require('./compatibility/ramType.check');
const pcieCheck = require('./compatibility/pcie.check');

const SYSTEM_OVERHEAD_W = 100;

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isVirtualGpu(gpu) {
  return gpu?.isVirtual || gpu?.type === 'integrated';
}

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function statusFrom(issues, warnings) {
  if (issues.length > 0) return 'critical';
  if (warnings.length > 0) return 'warning';
  return 'ok';
}

function runCompatibilityCheck(label, issues, warnings, fn) {
  try {
    const result = fn();
    if (result?.error) issues.push(result.error);
    if (result?.warning) warnings.push(result.warning);
  } catch (err) {
    warnings.push(`${label} check skipped: ${err.message}`);
  }
}

function analyzeCompatibility(build) {
  const { cpu, gpu, motherboard, ram, psu, cooler } = build;
  const pcCase = build.case;
  const issues = [];
  const warnings = [];

  if (cpu && motherboard) {
    if (cpu.socket && motherboard.socket) {
      runCompatibilityCheck('Socket compatibility', issues, warnings, () => socketCheck(cpu, motherboard));
    } else {
      warnings.push('Socket compatibility check skipped: missing CPU or motherboard socket data');
    }

    if (cpu.supported_ram_types && motherboard.supported_ram_types) {
      runCompatibilityCheck('RAM compatibility', issues, warnings, () => ramTypeCheck(cpu, motherboard, ram));
    } else {
      warnings.push('RAM compatibility check skipped: missing RAM support data');
    }
  } else {
    warnings.push('Compatibility check skipped: missing CPU or motherboard');
  }

  if (gpu && motherboard && gpu.pcie_version && motherboard.pcie_version) {
    runCompatibilityCheck('PCIe compatibility', issues, warnings, () => pcieCheck(gpu, motherboard));
  }

  if (cooler && cpu) {
    const sockets = parseList(cooler.supported_sockets);
    if (sockets.length > 0 && cpu.socket && !sockets.includes(cpu.socket)) {
      issues.push(`Cooler does not support socket ${cpu.socket}`);
    }
  }

  if (gpu && pcCase) {
    const gpuLength = numberOrNull(gpu.length_mm);
    const caseMaxGpu = numberOrNull(pcCase.max_gpu_length_mm);
    if (gpuLength != null && caseMaxGpu != null && gpuLength > caseMaxGpu) {
      issues.push(`GPU length ${gpuLength}mm exceeds case limit ${caseMaxGpu}mm`);
    }
  }

  if (psu && cpu && gpu) {
    const cpuTdp = numberOrNull(cpu.tdp);
    const gpuTdp = numberOrNull(gpu.tdp);
    const wattage = numberOrNull(psu.wattage);
    if (cpuTdp != null && gpuTdp != null && wattage != null && cpuTdp + gpuTdp + SYSTEM_OVERHEAD_W > wattage) {
      issues.push(`PSU wattage may be insufficient for estimated system draw`);
    }
  }

  return {
    status: statusFrom(issues, warnings),
    message: issues.length
      ? 'Compatibility issues need attention.'
      : warnings.length
        ? 'Compatibility looks usable, but some checks were skipped or produced warnings.'
        : 'Core compatibility checks look good.',
    issues,
    warnings,
  };
}

function analyzePower(build) {
  const cpuTdp = numberOrNull(build.cpu?.tdp);
  const gpuTdp = numberOrNull(build.gpu?.tdp);
  const psuWattage = numberOrNull(build.psu?.wattage);
  const warnings = [];

  if (cpuTdp == null) warnings.push('Missing CPU TDP');
  if (gpuTdp == null) warnings.push('Missing GPU TDP');
  if (psuWattage == null) warnings.push('Missing PSU wattage');

  const estimatedDrawW = cpuTdp != null && gpuTdp != null
    ? cpuTdp + gpuTdp + SYSTEM_OVERHEAD_W
    : null;
  const headroomW = estimatedDrawW != null && psuWattage != null
    ? psuWattage - estimatedDrawW
    : null;
  const headroomPercent = psuWattage > 0 && headroomW != null
    ? (headroomW / psuWattage) * 100
    : null;
  const loadPercent = psuWattage > 0 && estimatedDrawW != null
    ? (estimatedDrawW / psuWattage) * 100
    : null;

  if (warnings.length > 0) {
    return {
      estimatedDrawW,
      psuWattage,
      headroomW,
      headroomPercent: round(headroomPercent),
      loadPercent: round(loadPercent),
      status: 'warning',
      message: `Power check incomplete: ${warnings.join(', ')}.`,
    };
  }

  const status = headroomPercent >= 30 ? 'ok' : headroomPercent >= 15 ? 'warning' : 'critical';
  const message = status === 'ok'
    ? 'PSU has comfortable headroom.'
    : status === 'warning'
      ? 'PSU has limited headroom.'
      : 'PSU headroom is too low for this build.';

  return {
    estimatedDrawW,
    psuWattage,
    headroomW,
    headroomPercent: round(headroomPercent),
    loadPercent: round(loadPercent),
    status,
    message,
  };
}

function analyzeCooling(build) {
  const cpuTdp = numberOrNull(build.cpu?.tdp);
  const coolerMaxTdp = numberOrNull(build.cooler?.max_tdp);
  const issues = [];
  const warnings = [];

  if (cpuTdp == null) warnings.push('Missing CPU TDP');
  if (coolerMaxTdp == null) warnings.push('Missing cooler max TDP');

  const sockets = parseList(build.cooler?.supported_sockets);
  const cpuSocket = build.cpu?.socket;
  if (sockets.length > 0 && cpuSocket && !sockets.includes(cpuSocket)) {
    issues.push(`Cooler does not support socket ${cpuSocket}`);
  } else if (build.cooler && cpuSocket && sockets.length === 0) {
    warnings.push('Cooler socket support data is missing');
  }

  if (cpuTdp == null || coolerMaxTdp == null) {
    return {
      cpuTdp,
      coolerMaxTdp,
      status: issues.length ? 'critical' : 'warning',
      message: issues.length ? issues[0] : `Cooling check incomplete: ${warnings.join(', ')}.`,
      issues,
      warnings,
    };
  }

  const ratio = coolerMaxTdp / cpuTdp;
  if (ratio < 1.2) issues.push('Cooler capacity is below the recommended range for this CPU');
  else if (ratio < 1.5) warnings.push('Cooler capacity is adequate but has limited thermal margin');

  return {
    cpuTdp,
    coolerMaxTdp,
    status: statusFrom(issues, warnings),
    message: issues.length
      ? 'Cooling capacity is not sufficient.'
      : warnings.length
        ? 'Cooling is usable, but thermal margin is limited.'
        : 'Cooling capacity looks good.',
    issues,
    warnings,
  };
}

function analyzeFit(build) {
  const hasDiscreteGpu = build.gpu && !isVirtualGpu(build.gpu);
  const gpuLengthMm = hasDiscreteGpu ? numberOrNull(build.gpu?.length_mm) : null;
  const caseMaxGpuLengthMm = numberOrNull(build.case?.max_gpu_length_mm);
  const coolerHeightMm = numberOrNull(build.cooler?.height_mm);
  const caseMaxCoolerHeightMm = numberOrNull(build.case?.max_cooler_height_mm);
  const supportedFormFactors = parseList(build.case?.supported_form_factors);
  const motherboardFormFactor = build.motherboard?.form_factor ?? null;
  const issues = [];
  const warnings = [];

  if (gpuLengthMm != null && caseMaxGpuLengthMm != null && gpuLengthMm > caseMaxGpuLengthMm) {
    issues.push(`GPU length ${gpuLengthMm}mm exceeds case limit ${caseMaxGpuLengthMm}mm`);
  } else if (hasDiscreteGpu && build.case && (gpuLengthMm == null || caseMaxGpuLengthMm == null)) {
    warnings.push('GPU length fit check skipped: missing GPU or case length data');
  }

  if (coolerHeightMm != null && caseMaxCoolerHeightMm != null && coolerHeightMm > caseMaxCoolerHeightMm) {
    issues.push(`Cooler height ${coolerHeightMm}mm exceeds case limit ${caseMaxCoolerHeightMm}mm`);
  } else if (build.cooler && build.case && (coolerHeightMm == null || caseMaxCoolerHeightMm == null)) {
    warnings.push('Cooler height fit check skipped: missing cooler or case height data');
  }

  if (motherboardFormFactor && supportedFormFactors.length > 0 && !supportedFormFactors.includes(motherboardFormFactor)) {
    issues.push(`Case does not support ${motherboardFormFactor} motherboards`);
  } else if (build.motherboard && build.case && (!motherboardFormFactor || supportedFormFactors.length === 0)) {
    warnings.push('Motherboard form factor fit check skipped: missing form factor data');
  }

  return {
    gpuLengthMm,
    caseMaxGpuLengthMm,
    coolerHeightMm,
    caseMaxCoolerHeightMm,
    motherboardFormFactor,
    supportedFormFactors,
    status: statusFrom(issues, warnings),
    message: issues.length
      ? 'Physical fit issues need attention.'
      : warnings.length
        ? 'Physical fit looks plausible, but some size data is missing.'
        : 'Physical fit checks look good.',
    issues,
    warnings,
  };
}

function analyzeStorage(build, useCase) {
  const storage = build.storage;
  const type = String(storage?.type ?? '').toUpperCase();
  const iface = String(storage?.interface ?? '').toUpperCase();
  const demandingUseCase = ['gaming', 'workstation'].includes(String(useCase || '').toLowerCase());

  if (!storage) {
    return {
      type: null,
      interface: null,
      status: 'warning',
      message: 'Storage check skipped: missing storage component.',
    };
  }

  if (demandingUseCase && type === 'HDD') {
    return {
      type,
      interface: storage.interface ?? null,
      status: 'warning',
      message: 'HDD storage works, but an NVMe SSD is recommended for OS, games, and workstation apps.',
    };
  }

  return {
    type,
    interface: storage.interface ?? null,
    status: 'ok',
    message: type === 'SSD' || iface.includes('NVME')
      ? 'Storage choice is suitable.'
      : 'Storage choice is acceptable.',
  };
}

function overallStatus(checks) {
  const statuses = Object.values(checks).map((check) => check.status);
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

function analyzeBuildHealth(build, useCase) {
  const safeBuild = build || {};
  const checks = {
    compatibility: analyzeCompatibility(safeBuild),
    power: analyzePower(safeBuild),
    cooling: analyzeCooling(safeBuild),
    fit: analyzeFit(safeBuild),
    storage: analyzeStorage(safeBuild, useCase),
  };

  return {
    overallStatus: overallStatus(checks),
    checks,
  };
}

module.exports = { analyzeBuildHealth };
