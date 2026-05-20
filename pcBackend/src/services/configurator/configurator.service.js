const { allocate }    = require('./budget.allocator');
const picker          = require('./component.picker');
const { verifyBuild } = require('./build.verifier');
const { computeBottleneck } = require('../bottleneck.service');
const { analyzeBuildHealth } = require('../buildHealth.service');
const logger          = require('../../utils/logger');
const db              = require('../../config/db');

const OVERHEAD_W = 100;
const QUERY_TIMEOUT_MS = 5000;
const OFFICIAL_SOURCES = ['geizhals', 'mindfactory'];
const GAMING_TARGET_OVERFLOW = 0.03;
const GAMING_MAX_OVERFLOW = 0.05;
const CPU_BOTTLENECK_LIMIT = 16;
const OFFER_TYPE_ALIASES = {
  motherboard: 'mainboard',
  mobo: 'mainboard',
  cases: 'case',
  ssd: 'storage',
};

const VIRTUAL_INTEGRATED_GPU = {
  id: null,
  name: 'Integrated graphics',
  type: 'integrated',
  price_eur: 0,
  tdp: 0,
  benchmark_score: 0,
  isVirtual: true,
  source: 'cpu',
};

function offerIsActive(offer) {
  if (!offer) return false;
  return offer?.is_active == null || offer.is_active === true || offer.is_active === 1;
}

async function findActiveOfferRef(componentType, componentId, offerId, externalId) {
  if (!offerId && !externalId) return null;

  const query = db('offers')
    .where({ component_type: componentType, component_id: componentId })
    .where((builder) => {
      builder.where('is_active', true).orWhereNull('is_active');
    });

  if (offerId) {
    query.where('id', offerId);
  } else {
    query.where('external_id', externalId);
  }

  return query.first().timeout(QUERY_TIMEOUT_MS);
}

async function dropInactiveRecommendationRefs(component, componentType) {
  const checks = [
    {
      prefix: 'recommended_new',
      offerId: component.recommended_new_offer_id,
      externalId: component.recommended_new_external_id,
    },
    {
      prefix: 'recommended_used',
      offerId: component.recommended_used_offer_id,
      externalId: component.recommended_used_external_id,
    },
  ];

  for (const check of checks) {
    if (!check.offerId && !check.externalId) continue;

    const activeOffer = await findActiveOfferRef(componentType, component.id, check.offerId, check.externalId);
    if (offerIsActive(activeOffer)) continue;

    component[`${check.prefix}_price`] = null;
    component[`${check.prefix}_source`] = null;
    component[`${check.prefix}_offer_id`] = null;
    component[`${check.prefix}_external_id`] = null;
    if (check.prefix === 'recommended_used') {
      component.recommended_used_discount = null;
    }
  }
}

async function enrichWithOfficialPrices(build) {
  await Promise.all(
    Object.entries(build)
      .filter(([, v]) => v != null && !v.isVirtual)
      .map(async ([key, component]) => {
        const componentType = OFFER_TYPE_ALIASES[key] ?? key;
        await dropInactiveRecommendationRefs(component, componentType);
        const fallbackPrice = component.price_eur ?? component.price ?? null;

        const [row] = await db('offers')
          .where({ component_type: componentType, component_id: component.id, condition: 'new', is_suspicious: false })
          .where((builder) => {
            builder.where('is_active', true).orWhereNull('is_active');
          })
          .whereIn('source', OFFICIAL_SOURCES)
          .min('price_eur as value')
          .timeout(QUERY_TIMEOUT_MS);

        if (row?.value != null) {
          component.price_eur = row.value;
        } else if (component.price_eur == null && fallbackPrice != null) {
          component.price_eur = fallbackPrice;
        }
      })
  );
}

async function refreshGpuDependents(internalBuild, candidateGpu, allocated, pickerContext, anchored) {
  const cpu = internalBuild.cpu;
  const cooler = internalBuild.cooler;
  const next = { ...internalBuild, gpu: candidateGpu };

  if (!anchored.psu) {
    const drawW = (candidateGpu?.tdp ?? 0) + cpu.tdp + OVERHEAD_W;
    next.psu = await picker.pickPsu(allocated.psu ?? 0, Math.ceil(drawW * 1.25), {
      ...pickerContext,
      estimatedDrawW: drawW,
    });
  }

  if (!next.psu) return null;

  if (!anchored.case) {
    next.case = await picker.pickCase(
      allocated.case ?? 0,
      internalBuild.mainboard.form_factor,
      candidateGpu?.length_mm ?? 0,
      {
        ...pickerContext,
        coolerHeightMm: cooler?.height_mm ?? 0,
      }
    );
  }

  if (!next.case) return null;
  await enrichWithOfficialPrices(next);
  return next;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function ramTypeOf(ram) {
  return ram?.ram_type ?? ram?.type ?? null;
}

async function refreshCpuDependents(internalBuild, candidateCpu, allocated, pickerContext, anchored) {
  if (!candidateCpu) return null;
  if (internalBuild.mainboard?.socket !== candidateCpu.socket) return null;

  const cpuRamTypes = parseJsonList(candidateCpu.supported_ram_types);
  const boardRamTypes = parseJsonList(internalBuild.mainboard.supported_ram_types);
  const currentRamType = ramTypeOf(internalBuild.ram);
  if (currentRamType && (!cpuRamTypes.includes(currentRamType) || !boardRamTypes.includes(currentRamType))) {
    return null;
  }

  const next = { ...internalBuild, cpu: candidateCpu };

  if (!anchored.cooler) {
    next.cooler = await picker.pickCooler(allocated.cooler ?? 0, candidateCpu.socket, candidateCpu.tdp, {
      ...pickerContext,
      maxHeightMm: internalBuild.case?.max_cooler_height_mm,
    });
  }

  if (!next.cooler) return null;

  if (!anchored.psu) {
    const drawW = (internalBuild.gpu?.tdp ?? 0) + candidateCpu.tdp + OVERHEAD_W;
    next.psu = await picker.pickPsu(allocated.psu ?? 0, Math.ceil(drawW * 1.25), {
      ...pickerContext,
      estimatedDrawW: drawW,
    });
  }

  if (!next.psu) return null;
  await enrichWithOfficialPrices(next);
  return next;
}

async function improveCpuBalanceIfPossible(internalBuild, budget, useCase, allocated, pickerContext, anchored, pricingMode) {
  if (useCase !== 'gaming' || anchored.cpu || !internalBuild.cpu || !internalBuild.gpu?.id) return internalBuild;

  const bottleneck = computeBottleneck(internalBuild.gpu, internalBuild.cpu, useCase);
  if (bottleneck.status !== 'cpu_bottleneck' || bottleneck.deltaPercent <= CPU_BOTTLENECK_LIMIT) {
    return internalBuild;
  }

  const currentCpuScore = Number(internalBuild.cpu.benchmark_score ?? 0);
  const maxTotal = budget * (1 + GAMING_MAX_OVERFLOW);
  const candidates = await db('cpus')
    .where({ is_available: true, socket: internalBuild.cpu.socket })
    .where('benchmark_score', '>', currentCpuScore)
    .orderBy('benchmark_score', 'asc')
    .timeout(QUERY_TIMEOUT_MS);

  let best = internalBuild;
  let bestScore = -Infinity;

  for (const rawCandidate of candidates) {
    const candidate = {
      ...rawCandidate,
      price_eur: componentPrice(rawCandidate, 'cpu', pricingMode),
    };
    const next = await refreshCpuDependents(internalBuild, candidate, allocated, pickerContext, anchored);
    if (!next) continue;

    const nextTotal = totalBuildPrice(next, pricingMode);
    if (nextTotal > maxTotal) continue;

    const nextBottleneck = computeBottleneck(next.gpu, next.cpu, useCase);
    const score = (Number(candidate.benchmark_score) || 0)
      - (nextBottleneck.status === 'cpu_bottleneck' ? nextBottleneck.deltaPercent * 1000 : 0)
      - Math.max(0, nextTotal - budget) * 4;

    if (score > bestScore) {
      best = next;
      bestScore = score;
    }
  }

  return best;
}

async function findCheaperSafePsu(internalBuild, pricingMode) {
  const currentPrice = componentPrice(internalBuild.psu, 'psu', pricingMode);
  const estimatedDrawW = (internalBuild.gpu?.tdp ?? 0) + (internalBuild.cpu?.tdp ?? 0) + OVERHEAD_W;
  const minWattage = Math.ceil(estimatedDrawW * 1.25);
  const candidates = await db('psus')
    .where('is_available', true)
    .where('wattage', '>=', minWattage)
    .timeout(QUERY_TIMEOUT_MS);

  return candidates
    .map((psu) => ({
      ...psu,
      price_eur: componentPrice(psu, 'psu', pricingMode),
    }))
    .filter((psu) => componentPrice(psu, 'psu', pricingMode) < currentPrice)
    .sort((a, b) => componentPrice(a, 'psu', pricingMode) - componentPrice(b, 'psu', pricingMode))[0] ?? null;
}

async function findCheaperCompatibleCase(internalBuild, pricingMode) {
  const currentPrice = componentPrice(internalBuild.case, 'case', pricingMode);
  const gpuLengthMm = internalBuild.gpu?.length_mm ?? 0;
  const coolerHeightMm = internalBuild.cooler?.height_mm ?? 0;
  const candidates = await db('cases')
    .where('is_available', true)
    .timeout(QUERY_TIMEOUT_MS);

  return candidates
    .map((pcCase) => ({
      ...pcCase,
      price_eur: componentPrice(pcCase, 'case', pricingMode),
    }))
    .filter((pcCase) => {
      const supported = parseJsonList(pcCase.supported_form_factors);
      return supported.includes(internalBuild.mainboard.form_factor)
        && (Number(pcCase.max_gpu_length_mm) || 0) >= gpuLengthMm
        && (Number(pcCase.max_cooler_height_mm) || 0) >= coolerHeightMm
        && componentPrice(pcCase, 'case', pricingMode) < currentPrice;
    })
    .sort((a, b) => componentPrice(a, 'case', pricingMode) - componentPrice(b, 'case', pricingMode))[0] ?? null;
}

async function findCheaperCompatibleRam(internalBuild, pricingMode) {
  const currentPrice = componentPrice(internalBuild.ram, 'ram', pricingMode);
  const currentCapacity = Number(internalBuild.ram?.capacity_gb ?? 0);
  const minimumCapacity = Math.min(Math.max(currentCapacity, 16), 32);
  const currentRamType = ramTypeOf(internalBuild.ram);
  const cpuRamTypes = parseJsonList(internalBuild.cpu?.supported_ram_types);
  const boardRamTypes = parseJsonList(internalBuild.mainboard?.supported_ram_types);

  if (!currentRamType || !cpuRamTypes.includes(currentRamType) || !boardRamTypes.includes(currentRamType)) {
    return null;
  }

  const candidates = await db('ram_kits')
    .where({ is_available: true, ram_type: currentRamType })
    .where('capacity_gb', '>=', minimumCapacity)
    .timeout(QUERY_TIMEOUT_MS);

  return candidates
    .map((ram) => ({
      ...ram,
      price_eur: componentPrice(ram, 'ram', pricingMode),
    }))
    .filter((ram) => componentPrice(ram, 'ram', pricingMode) < currentPrice)
    .sort((a, b) => {
      const priceDiff = componentPrice(a, 'ram', pricingMode) - componentPrice(b, 'ram', pricingMode);
      if (priceDiff !== 0) return priceDiff;
      return Number(b.capacity_gb ?? 0) - Number(a.capacity_gb ?? 0);
    })[0] ?? null;
}

async function trimGamingOverflow(internalBuild, budget, useCase, allocated, pickerContext, anchored, pricingMode, baselineGpuScore) {
  if (useCase !== 'gaming') return internalBuild;

  const targetTotal = budget * (1 + GAMING_TARGET_OVERFLOW);
  const hardTotal = budget * (1 + GAMING_MAX_OVERFLOW);
  let best = internalBuild;

  const acceptIfBetter = async (candidate) => {
    if (!candidate) return;
    await enrichWithOfficialPrices(candidate);
    if (totalBuildPrice(candidate, pricingMode) < totalBuildPrice(best, pricingMode)) {
      best = candidate;
    }
  };

  if (totalBuildPrice(best, pricingMode) <= targetTotal) return best;

  if (!anchored.gpu && best.gpu?.id) {
    const currentGpuScore = Number(best.gpu.benchmark_score ?? 0);
    const candidates = await db('gpus')
      .where('is_available', true)
      .where('benchmark_score', '<', currentGpuScore)
      .orderBy('benchmark_score', 'desc')
      .timeout(QUERY_TIMEOUT_MS);

    for (const rawCandidate of candidates) {
      const candidateScore = Number(rawCandidate.benchmark_score ?? 0);
      if (candidateScore <= baselineGpuScore * 1.18) continue;

      const candidate = {
        ...rawCandidate,
        price_eur: componentPrice(rawCandidate, 'gpu', pricingMode),
      };
      const next = await refreshGpuDependents(best, candidate, allocated, pickerContext, anchored);
      if (!next) continue;
      const improved = await improveCpuBalanceIfPossible(next, budget, useCase, allocated, pickerContext, anchored, pricingMode);
      if (totalBuildPrice(improved, pricingMode) <= hardTotal) {
        await acceptIfBetter(improved);
        if (totalBuildPrice(best, pricingMode) <= targetTotal) return best;
      }
    }
  }

  if (!anchored.ram && totalBuildPrice(best, pricingMode) > targetTotal) {
    const cheaperRam = await findCheaperCompatibleRam(best, pricingMode);
    if (cheaperRam) await acceptIfBetter({ ...best, ram: cheaperRam });
  }

  if (!anchored.psu && totalBuildPrice(best, pricingMode) > targetTotal) {
    const cheaperPsu = await findCheaperSafePsu(best, pricingMode);
    if (cheaperPsu) await acceptIfBetter({ ...best, psu: cheaperPsu });
  }

  if (!anchored.case && totalBuildPrice(best, pricingMode) > targetTotal) {
    const cheaperCase = await findCheaperCompatibleCase(best, pricingMode);
    if (cheaperCase) await acceptIfBetter({ ...best, case: cheaperCase });
  }

  return best;
}

async function upgradeGpuIfBudgetAllows(internalBuild, budget, useCase, allocated, pickerContext, anchored, pricingMode) {
  if (anchored.gpu || !internalBuild.gpu || internalBuild.gpu.isVirtual) return internalBuild;
  if (!['gaming', 'optimal'].includes(useCase)) return internalBuild;

  const currentTotal = totalBuildPrice(internalBuild, pricingMode);
  const utilization = budget > 0 ? currentTotal / budget : 1;
  if (utilization >= 0.85 && useCase !== 'gaming') return internalBuild;

  const currentGpuScore = Number(internalBuild.gpu.benchmark_score ?? 0);
  const maxTotal = budget * (useCase === 'gaming' ? 1 + GAMING_MAX_OVERFLOW : 0.98);

  const candidates = await db('gpus')
    .where('is_available', true)
    .orderBy('benchmark_score', 'desc')
    .timeout(QUERY_TIMEOUT_MS);

  for (const rawCandidate of candidates) {
    if ((Number(rawCandidate.benchmark_score) || 0) <= currentGpuScore * 1.18) continue;

    const candidate = {
      ...rawCandidate,
      price_eur: componentPrice(rawCandidate, 'gpu', pricingMode),
    };
    const next = await refreshGpuDependents(internalBuild, candidate, allocated, pickerContext, anchored);
    if (!next) continue;

    const improved = await improveCpuBalanceIfPossible(next, budget, useCase, allocated, pickerContext, anchored, pricingMode);
    const trimmed = await trimGamingOverflow(improved, budget, useCase, allocated, pickerContext, anchored, pricingMode, currentGpuScore);
    const nextTotal = totalBuildPrice(trimmed, pricingMode);
    if (nextTotal <= maxTotal) return trimmed;
  }

  return internalBuild;
}

function normalizeBuildForResponse(build) {
  const clean = (component) => {
    if (!component) return null;
    const { _effectivePrice, ...rest } = component;
    return rest;
  };

  return {
    cpu: clean(build.cpu),
    gpu: clean(build.gpu),
    motherboard: clean(build.motherboard ?? build.mainboard ?? build.mobo),
    ram: clean(build.ram),
    storage: clean(build.storage ?? build.ssd),
    psu: clean(build.psu),
    cooler: clean(build.cooler),
    case: clean(build.case ?? build.cases),
  };
}

function componentPrice(component, componentType = 'cpu', pricingMode = 'new') {
  if (!component) return 0;
  const value = picker.effectivePrice?.(component, componentType, pricingMode)
    ?? parseFloat(component.recommended_new_price ?? component.price_eur ?? component.price ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function totalBuildPrice(build, pricingMode = 'new') {
  return Object.entries(build)
    .filter(([, component]) => component != null)
    .reduce((sum, [key, component]) => {
      const componentType = OFFER_TYPE_ALIASES[key] ?? key;
      return sum + componentPrice(component, componentType, pricingMode);
    }, 0);
}

const parse = (v) => {
  if (Array.isArray(v)) return v;

  try {
    return JSON.parse(v || '[]');
  } catch {
    return [];
  }
};

async function fetchAnchorComponents(anchorIds = {}) {
  const mapping = [
    ['gpu',       'gpus',       anchorIds.gpu_id],
    ['cpu',       'cpus',       anchorIds.cpu_id],
    ['mainboard', 'mainboards', anchorIds.mainboard_id],
    ['ram',       'ram_kits',   anchorIds.ram_id],
    ['psu',       'psus',       anchorIds.psu_id],
    ['case',      'cases',      anchorIds.case_id],
    ['cooler',    'coolers',    anchorIds.cooler_id],
    ['storage',   'storage',    anchorIds.storage_id],
  ];

  const anchored = {};

  await Promise.all(
    mapping.map(async ([key, table, id]) => {
      if (!id) return;

      const component = await db(table)
        .where({ id, is_available: true })
        .first()
        .timeout(QUERY_TIMEOUT_MS);

      if (!component) {
        const err = new Error(`Anchor component not found: ${key} with id=${id}`);
        err.statusCode = 404;
        throw err;
      }

      anchored[key] = component;
    })
  );

  return anchored;
}

async function buildConfiguration(budget, useCase, anchorIds = {}, options = {}) {
  const pricingMode = options.pricingMode === 'best_value' ? 'best_value' : 'new';
  logger.info(
    `Configurator: budget=€${budget}, useCase=${useCase}, anchors=${JSON.stringify(anchorIds)}`
  );

  const anchored = await fetchAnchorComponents(anchorIds);
  const anchoredKeys = Object.keys(anchored);

  const spentOnAnchors = Object.entries(anchored)
    .reduce((sum, [key, component]) => {
      const componentType = OFFER_TYPE_ALIASES[key] ?? key;
      return sum + componentPrice(component, componentType, pricingMode);
    }, 0);

  const remainingBudget = budget - spentOnAnchors;

  if (remainingBudget < 0) {
    const err = new Error(
      `Anchor components cost €${spentOnAnchors.toFixed(2)}, which exceeds budget of €${budget}`
    );
    err.statusCode = 422;
    throw err;
  }

  const allocated = allocate(remainingBudget, useCase, anchoredKeys);
  const pickerContext = { useCase, pricingMode, budgetTotal: budget };

  const gpuBudget = (allocated.gpu ?? 0)
    + (useCase === 'gaming' ? budget * 0.12 : useCase === 'optimal' ? budget * 0.08 : 0);
  const gpu = anchored.gpu
    ?? (allocated.gpu > 0 ? await picker.pickGpu(gpuBudget, pickerContext) : null);
  const selectedGpu = gpu ?? (useCase === 'office' ? { ...VIRTUAL_INTEGRATED_GPU } : null);

  const requiredSocket = anchored.mainboard?.socket;

  const cpu = anchored.cpu
    ?? await picker.pickCpu(allocated.cpu ?? 0, { ...pickerContext, socket: requiredSocket });

  if (!cpu) {
    const err = new Error('No CPU available for this budget and socket requirements');
    err.statusCode = 422;
    throw err;
  }

  const cpuRamTypes = parse(cpu.supported_ram_types);

  const mainboard = anchored.mainboard
    ?? await picker.pickMainboard(
      allocated.mainboard ?? 0,
      cpu.socket,
      cpuRamTypes,
      pickerContext
    );

  if (!mainboard) {
    const err = new Error(`No mainboard found for socket ${cpu.socket}`);
    err.statusCode = 422;
    throw err;
  }

  const mbRamTypes = parse(mainboard.supported_ram_types);
  const commonTypes = cpuRamTypes.filter((type) => mbRamTypes.includes(type));

  if (commonTypes.length === 0) {
    const err = new Error(
      `No common RAM type between CPU (${cpuRamTypes.join(', ')}) and mainboard (${mbRamTypes.join(', ')})`
    );
    err.statusCode = 422;
    throw err;
  }

  const targetRamType = commonTypes[0];

  const ramBudget = (allocated.ram ?? 0)
    + (useCase === 'office' ? 0 : budget * 0.05);
  const ram = anchored.ram
    ?? await picker.pickRam(ramBudget, targetRamType, pickerContext);

  if (!ram) {
    const err = new Error(`No RAM found for type ${targetRamType}`);
    err.statusCode = 422;
    throw err;
  }

  const cooler = anchored.cooler
    ?? (allocated.cooler > 0
      ? await picker.pickCooler(allocated.cooler, cpu.socket, cpu.tdp, {
        ...pickerContext,
        maxHeightMm: anchored.case?.max_cooler_height_mm,
      })
      : null);

    if (allocated.cooler > 0 && !anchored.cooler && !cooler) {
    const err = new Error(`No cooler found for socket ${cpu.socket} and TDP ${cpu.tdp}W`);
    err.statusCode = 422;
    throw err;
    }

  const estimatedDrawW = (selectedGpu?.tdp ?? 0) + cpu.tdp + OVERHEAD_W;
  const minWattage = Math.ceil(estimatedDrawW * 1.25);

  const psu = anchored.psu
    ?? await picker.pickPsu(allocated.psu ?? 0, minWattage, {
      ...pickerContext,
      estimatedDrawW,
    });

  if (!psu) {
    const err = new Error(`No PSU found with at least ${minWattage}W`);
    err.statusCode = 422;
    throw err;
  }

  const pcCase = anchored.case
    ?? await picker.pickCase(
      allocated.case ?? 0,
      mainboard.form_factor,
      selectedGpu?.length_mm ?? 0,
      {
        ...pickerContext,
        coolerHeightMm: cooler?.height_mm ?? 0,
      }
    );

  if (!pcCase) {
    const err = new Error('No case found for selected GPU, cooler, and mainboard');
    err.statusCode = 422;
    throw err;
  }

  const storage = anchored.storage
    ?? (allocated.storage > 0
      ? await picker.pickStorage(allocated.storage, pickerContext)
      : null);

    if (allocated.storage > 0 && !anchored.storage && !storage) {
    const err = new Error('No storage found for this budget');
    err.statusCode = 422;
    throw err;
    }
  const internalBuild = {
    gpu: selectedGpu,
    cpu,
    mainboard,
    ram,
    psu,
    case: pcCase,
    cooler,
    storage,
  };

  await enrichWithOfficialPrices(internalBuild);

  let preVerificationTotal = totalBuildPrice(internalBuild, pricingMode);
  if (!anchored.gpu && internalBuild.gpu && preVerificationTotal > budget + Math.max(50, budget * 0.05)) {
    const currentGpuPrice = componentPrice(internalBuild.gpu, 'gpu', pricingMode);
    const nonGpuCost = preVerificationTotal - currentGpuPrice;
    const maxGpuToFit = budget - nonGpuCost;

    if (maxGpuToFit > 0 && maxGpuToFit < currentGpuPrice) {
      const replacementGpu = await picker.pickGpu(maxGpuToFit, { ...pickerContext, strictBudget: true });
      if (replacementGpu && replacementGpu.id !== internalBuild.gpu.id) {
        internalBuild.gpu = replacementGpu;

        if (!anchored.psu) {
          const revisedDrawW = (internalBuild.gpu?.tdp ?? 0) + cpu.tdp + OVERHEAD_W;
          internalBuild.psu = await picker.pickPsu(allocated.psu ?? 0, Math.ceil(revisedDrawW * 1.25), {
            ...pickerContext,
            estimatedDrawW: revisedDrawW,
          });
        }

        if (!anchored.case) {
          internalBuild.case = await picker.pickCase(
            allocated.case ?? 0,
            mainboard.form_factor,
            internalBuild.gpu?.length_mm ?? 0,
            {
              ...pickerContext,
              coolerHeightMm: cooler?.height_mm ?? 0,
            }
          );
        }

        await enrichWithOfficialPrices(internalBuild);
      }
    }
  }

  const upgradedBuild = await upgradeGpuIfBudgetAllows(
    internalBuild,
    budget,
    useCase,
    allocated,
    pickerContext,
    anchored,
    pricingMode
  );
  Object.assign(internalBuild, upgradedBuild);

  const verification = await verifyBuild(internalBuild);
  const bottleneck = computeBottleneck(internalBuild.gpu, internalBuild.cpu, useCase);
  const build = normalizeBuildForResponse(internalBuild);

  const totalPrice = Object.values(build)
    .filter(Boolean)
    .reduce((sum, component) => sum + parseFloat(component.price_eur ?? component.price ?? 0), 0);

 // configurator.service.js — конец buildConfiguration()

const roundedTotalPrice = Math.round(totalPrice * 100) / 100;
const budgetOverflow = Math.round((roundedTotalPrice - budget) * 100) / 100;

// Мерджим warnings от compatibility check + возможный budget overflow
const allWarnings = [...verification.warnings];
if (budgetOverflow > 0) {
  allWarnings.push(`Build exceeds budget by €${budgetOverflow}`);
}

return {
  build,
  totalPrice:         roundedTotalPrice,
  budgetTotal:        budget,
  budgetSpentAnchors: Math.round(spentOnAnchors * 100) / 100,
  budgetOverflow: budgetOverflow > 0 ? budgetOverflow : 0,
  compatible:         verification.compatible,
  issues:             verification.issues,
  warnings:           allWarnings,             // ← было verification.warnings
  bottleneck,
  buildHealth:        analyzeBuildHealth(build, useCase),
  anchoredComponents: anchoredKeys,
};
}

module.exports = { buildConfiguration };
