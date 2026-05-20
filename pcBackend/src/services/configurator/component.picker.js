const db = require('../../config/db');

const QUERY_TIMEOUT_MS = 5000;
const USED_ALLOWED_TYPES = new Set(['cpu', 'gpu', 'ram', 'mainboard', 'motherboard', 'case', 'cooler']);

const USE_CASE_PROFILE = {
  gaming: {
    perf: 0.45,
    value: 0.4,
    price: 0.15,
    gpuPerf: 0.58,
    avoidWaste: 0.35,
  },
  workstation: {
    perf: 0.5,
    value: 0.35,
    price: 0.15,
    avoidWaste: 0.25,
  },
  office: {
    perf: 0.16,
    value: 0.34,
    price: 0.5,
    avoidWaste: 0.75,
  },
  optimal: {
    perf: 0.32,
    value: 0.48,
    price: 0.2,
    avoidWaste: 0.4,
  },
};

function parse(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumberOrNull(value) {
  const n = numberOrNull(value);
  return n != null && n > 0 ? n : null;
}

function effectivePrice(component, componentType, pricingMode = 'new') {
  const used = positiveNumberOrNull(component.recommended_used_price);
  const usedDiscount = numberOrNull(component.recommended_used_discount);
  if (
    pricingMode === 'best_value'
    && USED_ALLOWED_TYPES.has(componentType)
    && used != null
    && (usedDiscount == null || usedDiscount >= 0.08)
  ) {
    return used;
  }

  return positiveNumberOrNull(component.recommended_new_price)
    ?? positiveNumberOrNull(component.price_eur)
    ?? positiveNumberOrNull(component.price)
    ?? Infinity;
}

function annotatePrice(component, componentType, pricingMode) {
  const price = effectivePrice(component, componentType, pricingMode);
  return {
    ...component,
    _effectivePrice: price,
    price_eur: price,
  };
}

function profile(useCase) {
  return USE_CASE_PROFILE[useCase] ?? USE_CASE_PROFILE.optimal;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function priceFit(price, maxBudget, budgetTotal, useCase) {
  if (!Number.isFinite(price)) return 0;
  if (!maxBudget || maxBudget <= 0) return 1;
  if (price <= maxBudget) return 1;

  const tolerance = useCase === 'gaming'
    ? Math.max(60, budgetTotal * 0.04)
    : useCase === 'workstation'
      ? Math.max(80, budgetTotal * 0.05)
      : Math.max(30, budgetTotal * 0.025);

  return clamp(1 - ((price - maxBudget) / tolerance));
}

function chooseByScore(candidates, componentType, useCase, context = {}, scoreExtra = () => 0) {
  if (!candidates.length) return null;

  const priced = candidates
    .map((component) => annotatePrice(component, componentType, context.pricingMode))
    .filter((component) => Number.isFinite(component._effectivePrice));

  if (!priced.length) return null;

  const sliceLimit = context.maxBudget > 0
    ? context.maxBudget * (context.strictBudget ? 1 : (
      componentType === 'gpu' && useCase === 'gaming' ? 1.25
        : useCase === 'office' ? 1.12
          : 1.35
    ))
    : Infinity;
  const nearBudget = priced.filter((c) => c._effectivePrice <= sliceLimit || c._effectivePrice <= (context.maxBudget ?? 0) + 45);
  const pool = nearBudget.length > 0 ? nearBudget : priced;

  const maxBenchmark = Math.max(...pool.map((c) => numberOrNull(c.benchmark_score) ?? 0), 1);
  const maxValue = Math.max(
    ...pool.map((c) => ((numberOrNull(c.benchmark_score) ?? 0) / Math.max(c._effectivePrice, 1))),
    0.0001
  );
  const minPrice = Math.min(...pool.map((c) => c._effectivePrice));
  const p = profile(useCase);
  const perfWeight = componentType === 'gpu' && useCase === 'gaming' ? p.gpuPerf : p.perf;
  const valueWeight = componentType === 'gpu' && useCase === 'gaming' ? 0.25 : p.value;
  const budgetTotal = context.budgetTotal ?? context.maxBudget ?? 0;

  return pool
    .map((component) => {
      const price = component._effectivePrice;
      const benchmark = numberOrNull(component.benchmark_score) ?? 0;
      const perf = benchmark / maxBenchmark;
      const value = (benchmark / Math.max(price, 1)) / maxValue;
      const cheapness = minPrice / Math.max(price, minPrice, 1);
      const fit = priceFit(price, context.maxBudget, budgetTotal, useCase);
      const overkillPenalty = p.avoidWaste * clamp((price - (context.maxBudget ?? price)) / Math.max(context.maxBudget ?? price, 1), 0, 1);

      const score =
        perf * perfWeight +
        value * valueWeight +
        cheapness * p.price +
        fit * 0.25 +
        scoreExtra(component, { price, benchmark, perf, value, cheapness, fit }) -
        overkillPenalty;

      return { component, score };
    })
    .sort((a, b) => b.score - a.score || a.component._effectivePrice - b.component._effectivePrice)[0]
    ?.component ?? null;
}

function isNvme(storage) {
  return String(storage.interface ?? '').toLowerCase().includes('nvme');
}

function efficiencyScore(psu) {
  const text = String(psu.efficiency_rating ?? '').toLowerCase();
  if (text.includes('titanium')) return 1;
  if (text.includes('platinum')) return 0.92;
  if (text.includes('gold')) return 0.82;
  if (text.includes('bronze')) return 0.55;
  return 0.35;
}

async function allAvailable(table) {
  return db(table)
    .where('is_available', true)
    .timeout(QUERY_TIMEOUT_MS);
}

async function pickGpu(maxBudget, options = {}) {
  const candidates = await allAvailable('gpus');
  const useCase = options.useCase ?? 'optimal';

  if (useCase === 'office') {
    return null;
  }

  return chooseByScore(candidates, 'gpu', useCase, {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
    strictBudget: options.strictBudget,
  }, (gpu, { price, perf }) => {
    let score = 0;
    if (useCase === 'gaming') score += Math.min((numberOrNull(gpu.vram_gb) ?? 0) / 16, 1) * 0.08;
    if (useCase === 'workstation') score += Math.min((numberOrNull(gpu.vram_gb) ?? 0) / 16, 1) * 0.06;
    if (useCase === 'gaming' && (options.budgetTotal ?? 0) >= 1500) score += perf * 0.22;
    if (useCase === 'optimal' && (options.budgetTotal ?? 0) >= 1800) score += perf * 0.16;
    if (price > (options.budgetTotal ?? maxBudget) * 0.65) score -= 0.2;
    return score;
  });
}

async function pickCpu(maxBudget, { socket, useCase = 'optimal', budgetTotal, pricingMode } = {}) {
  let query = db('cpus').where('is_available', true);
  if (socket) query = query.where('socket', socket);
  const candidates = await query.timeout(QUERY_TIMEOUT_MS);

  return chooseByScore(candidates, 'cpu', useCase, { maxBudget, budgetTotal, pricingMode }, (cpu, { price, perf }) => {
    let score = 0;
    const tdp = numberOrNull(cpu.tdp) ?? 0;
    if (useCase === 'office') {
      score -= clamp((tdp - 65) / 100, 0, 1) * 0.15;
      if (price > (budgetTotal ?? maxBudget) * 0.28) score -= 0.18;
    }
    if (useCase === 'gaming' && perf > 0.82 && price > (budgetTotal ?? maxBudget) * 0.22) score -= 0.08;
    return score;
  });
}

async function pickMainboard(maxBudget, cpuSocket, cpuRamTypes, options = {}) {
  const candidates = await db('mainboards')
    .where('is_available', true)
    .where('socket', cpuSocket)
    .timeout(QUERY_TIMEOUT_MS);

  const compatible = candidates.filter((mb) => {
    const mbTypes = parse(mb.supported_ram_types);
    return cpuRamTypes.some((type) => mbTypes.includes(type));
  });

  return chooseByScore(compatible, 'motherboard', options.useCase ?? 'optimal', {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (mb, { price }) => {
    let score = 0;
    const maxRam = numberOrNull(mb.max_ram_gb) ?? 0;
    if (maxRam >= 128) score += 0.04;
    if (String(mb.form_factor).toUpperCase() === 'ATX') score += 0.03;
    if (options.useCase === 'office' && price > maxBudget) score -= 0.2;
    return score;
  });
}

async function pickRam(maxBudget, ramType, options = {}) {
  const useCase = options.useCase ?? 'optimal';
  const candidates = await db('ram_kits')
    .where('is_available', true)
    .where('ram_type', ramType)
    .timeout(QUERY_TIMEOUT_MS);

  const targetCapacity = useCase === 'office'
    ? 16
    : useCase === 'workstation' && (options.budgetTotal ?? 0) >= 2200
      ? 64
      : 32;

  return chooseByScore(candidates, 'ram', useCase, {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (ram, { price }) => {
    const capacity = numberOrNull(ram.capacity_gb) ?? 0;
    const speed = numberOrNull(ram.speed_mhz) ?? 0;
    let score = 0;

    if (capacity >= targetCapacity) score += 0.25;
    else score -= (targetCapacity - capacity) / targetCapacity * 0.35;

    if (useCase === 'office' && capacity > 32) score -= 0.18;
    if (useCase === 'gaming' && capacity > 32 && price > maxBudget * 0.9) score -= 0.2;
    if (useCase === 'workstation' && capacity >= 64) score += (options.budgetTotal ?? 0) >= 2200 ? 0.12 : -0.08;
    if (String(ramType).toUpperCase() === 'DDR5') score += 0.06;
    score += clamp((speed - 4800) / 2400, 0, 1) * 0.08;

    return score;
  });
}

async function pickPsu(maxBudget, minWattage, options = {}) {
  const estimatedDraw = numberOrNull(options.estimatedDrawW) ?? minWattage;
  const minRequired = Math.ceil(estimatedDraw * 1.25);
  const target = Math.ceil(estimatedDraw * 1.35);

  const candidates = await db('psus')
    .where('is_available', true)
    .where('wattage', '>=', Math.max(minWattage, minRequired))
    .timeout(QUERY_TIMEOUT_MS);

  return chooseByScore(candidates, 'psu', options.useCase ?? 'optimal', {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (psu, { price }) => {
    const wattage = numberOrNull(psu.wattage) ?? 0;
    const headroom = estimatedDraw > 0 ? (wattage - estimatedDraw) / wattage : 0.3;
    let score = efficiencyScore(psu) * 0.2;

    if (headroom >= 0.25 && headroom <= 0.45) score += 0.35;
    else if (headroom < 0.2) score -= 0.5;
    else if (headroom > 0.55) score -= 0.22;

    score -= clamp((wattage - target) / 500, 0, 1) * 0.18;
    if (price > maxBudget * 1.25) score -= 0.2;
    return score;
  });
}

async function pickCase(maxBudget, mbFormFactor, gpuLengthMm, options = {}) {
  const coolerHeightMm = numberOrNull(options.coolerHeightMm) ?? 0;
  const candidates = await allAvailable('cases');

  const compatible = candidates.filter((pcCase) => {
    const supported = parse(pcCase.supported_form_factors);
    const gpuFits = (numberOrNull(pcCase.max_gpu_length_mm) ?? 0) >= gpuLengthMm;
    const coolerFits = (numberOrNull(pcCase.max_cooler_height_mm) ?? 0) >= coolerHeightMm;
    return supported.includes(mbFormFactor) && gpuFits && coolerFits;
  });

  return chooseByScore(compatible, 'case', options.useCase ?? 'optimal', {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (pcCase, { price }) => {
    let score = 0;
    const gpuClearance = (numberOrNull(pcCase.max_gpu_length_mm) ?? 0) - gpuLengthMm;
    const coolerClearance = (numberOrNull(pcCase.max_cooler_height_mm) ?? 0) - coolerHeightMm;
    if (gpuClearance >= 25) score += 0.08;
    if (coolerClearance >= 8) score += 0.06;
    if ((options.useCase === 'office' || options.useCase === 'optimal') && price > maxBudget * 1.2) score -= 0.18;
    return score;
  });
}

async function pickCooler(maxBudget, cpuSocket, cpuTdp, options = {}) {
  const targetTdp = Math.ceil(cpuTdp * 1.35);
  const maxHeight = numberOrNull(options.maxHeightMm);
  const candidates = await db('coolers')
    .where('is_available', true)
    .where('max_tdp', '>=', Math.ceil(cpuTdp * 1.15))
    .timeout(QUERY_TIMEOUT_MS);

  const compatible = candidates.filter((cooler) => {
    const sockets = parse(cooler.supported_sockets);
    const height = numberOrNull(cooler.height_mm) ?? Infinity;
    return sockets.includes(cpuSocket) && (maxHeight == null || height <= maxHeight);
  });

  return chooseByScore(compatible, 'cooler', options.useCase ?? 'optimal', {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (cooler) => {
    const maxTdp = numberOrNull(cooler.max_tdp) ?? 0;
    const ratio = cpuTdp > 0 ? maxTdp / cpuTdp : 1.5;
    let score = 0;
    if (maxTdp >= targetTdp) score += 0.25;
    if (ratio > 2.5 && (options.useCase === 'office' || cpuTdp <= 90)) score -= 0.18;
    if (ratio < 1.2) score -= 0.5;
    return score;
  });
}

async function pickStorage(maxBudget, options = {}) {
  if (!maxBudget || maxBudget <= 0) return null;

  const useCase = options.useCase ?? 'optimal';
  const candidates = await allAvailable('storage');

  return chooseByScore(candidates, 'storage', useCase, {
    maxBudget,
    budgetTotal: options.budgetTotal,
    pricingMode: options.pricingMode,
  }, (storage, { price }) => {
    const type = String(storage.type ?? '').toUpperCase();
    const capacity = numberOrNull(storage.capacity_gb) ?? 0;
    const read = numberOrNull(storage.read_speed_mbps) ?? 0;
    let score = 0;

    if (isNvme(storage)) score += useCase === 'office' ? 0.18 : 0.35;
    else if (type === 'SSD') score += 0.14;
    else if (type === 'HDD') score -= useCase === 'office' ? 0.35 : 0.7;

    if (useCase === 'workstation' && capacity >= 1000) score += 0.12;
    if (useCase === 'gaming' && capacity >= 1000) score += 0.1;
    if (useCase === 'office' && capacity >= 500) score += 0.08;
    if (capacity < 500) score -= 0.15;
    score += clamp(read / 7000, 0, 1) * 0.12;
    if (price > maxBudget * 1.25) score -= 0.2;

    return score;
  });
}

function scoreComponent(component, componentType, useCase = 'optimal', budgetContext = {}) {
  if (!component) return 0;

  const price = effectivePrice(component, componentType, budgetContext.pricingMode);
  if (!Number.isFinite(price) || price <= 0) return 0;

  const p = profile(useCase);
  const benchmark = numberOrNull(component.benchmark_score) ?? 0;
  const budget = budgetContext.maxBudget ?? budgetContext.budgetTotal ?? price;
  const perf = benchmark > 0 ? Math.log10(benchmark + 10) / 5 : 0.35;
  const value = benchmark > 0 ? Math.log10((benchmark / price) + 1) : 1 / Math.max(price, 1);
  const fit = priceFit(price, budget, budgetContext.budgetTotal ?? budget, useCase);

  let score = perf * p.perf + value * p.value + fit * p.price;

  if (componentType === 'storage') {
    if (isNvme(component)) score += useCase === 'office' ? 0.12 : 0.25;
    if (String(component.type ?? '').toUpperCase() === 'HDD') score -= useCase === 'office' ? 0.2 : 0.5;
  }
  if (componentType === 'ram') {
    const capacity = numberOrNull(component.capacity_gb) ?? 0;
    if (useCase === 'office' && capacity > 32) score -= 0.15;
    if (useCase !== 'office' && capacity >= 32) score += 0.15;
  }

  return Math.round(score * 1000) / 1000;
}

module.exports = {
  pickGpu,
  pickCpu,
  pickMainboard,
  pickRam,
  pickPsu,
  pickCase,
  pickCooler,
  pickStorage,
  scoreComponent,
  effectivePrice,
};
