const ALLOCATIONS = {
  gaming: {
    gpu: 0.45, cpu: 0.17, mainboard: 0.11, ram: 0.08,
    storage: 0.07, psu: 0.06, case: 0.04, cooler: 0.02,
  },

  workstation: {
    cpu: 0.28, gpu: 0.20, ram: 0.18, storage: 0.12,
    mainboard: 0.10, psu: 0.05, case: 0.04, cooler: 0.03,
  },

  office: {
    cpu: 0.25, mainboard: 0.20, storage: 0.18, ram: 0.14,
    psu: 0.10, case: 0.08, cooler: 0.05, gpu: 0,
  },

  optimal: {
    gpu: 0.32, cpu: 0.22, mainboard: 0.12, ram: 0.10,
    storage: 0.08, psu: 0.07, case: 0.05, cooler: 0.04,
  },
};

function allocate(budget, useCase, excludeComponents = []) {
  const ratios = ALLOCATIONS[useCase];

  if (!ratios) {
    throw new Error(`Unknown useCase: ${useCase}`);
  }

  const active = {};

  for (const [component, ratio] of Object.entries(ratios)) {
    if (ratio > 0 && !excludeComponents.includes(component)) {
      active[component] = ratio;
    }
  }

  const totalRatio = Object.values(active).reduce((sum, ratio) => sum + ratio, 0);

  if (totalRatio === 0) {
    return {};
  }

  const result = {};

  for (const [component, ratio] of Object.entries(active)) {
    result[component] = Math.floor(budget * (ratio / totalRatio));
  }

  return result;
}

module.exports = { allocate, ALLOCATIONS };
