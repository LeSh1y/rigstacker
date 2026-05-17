const db = require('../config/db');

const SMALL_DELTA = 12;
const WEIGHT_BY_USE_CASE = {
  gaming: { cpu: 1.0, gpu: 1.0 },
  workstation: { cpu: 1.1, gpu: 0.9 },
  office: { cpu: 1.05, gpu: 0.95 },
  optimal: { cpu: 1.0, gpu: 1.0 },
};

function scoreOf(component) {
  const score = Number(component?.benchmark_score ?? component?.performance_score ?? component?.perf);
  return Number.isFinite(score) && score > 0 ? score : null;
}

function computeBottleneck(gpu, cpu, useCase = 'gaming') {
  if (gpu?.isVirtual || gpu?.type === 'integrated' || (useCase === 'office' && !gpu)) {
    const rawCpuScore = scoreOf(cpu);
    return {
      status: 'integrated_graphics',
      deltaPercent: 0,
      cpuScore: rawCpuScore ?? 0,
      gpuScore: 0,
      message: 'Office build uses integrated graphics; discrete GPU bottleneck analysis is not applicable.',
    };
  }

  const rawCpuScore = scoreOf(cpu);
  const rawGpuScore = scoreOf(gpu);

  if (rawCpuScore == null || rawGpuScore == null) {
    return {
      status: 'balanced',
      deltaPercent: 0,
      cpuScore: rawCpuScore ?? 0,
      gpuScore: rawGpuScore ?? 0,
      message: 'Bottleneck analysis unavailable: missing CPU or GPU performance score.',
    };
  }

  const weights = WEIGHT_BY_USE_CASE[useCase] ?? WEIGHT_BY_USE_CASE.optimal;
  const cpuScore = Math.round(rawCpuScore * weights.cpu);
  const gpuScore = Math.round(rawGpuScore * weights.gpu);
  const stronger = Math.max(cpuScore, gpuScore);
  const weaker = Math.min(cpuScore, gpuScore);
  const deltaPercent = stronger > 0
    ? Math.round(((stronger - weaker) / stronger) * 100)
    : 0;

  let status;
  let message;
  if (deltaPercent <= SMALL_DELTA) {
    status = 'balanced';
    message = 'CPU and GPU are broadly balanced for this use case.';
  } else if (cpuScore < gpuScore) {
    status = 'cpu_bottleneck';
    message = useCase === 'gaming'
      ? 'GPU headroom is higher than CPU headroom; CPU may limit peak FPS in some games.'
      : 'CPU performance is the weaker side for this workload.';
  } else {
    status = 'gpu_bottleneck';
    message = useCase === 'workstation'
      ? 'GPU performance is the weaker side for GPU-accelerated workloads.'
      : 'CPU headroom is higher than GPU headroom; graphics performance is likely the main limit.';
  }

  return {
    status,
    deltaPercent,
    cpuScore,
    gpuScore,
    message,
  };
}

async function calculateBottleneck(gpuId, cpuId, useCase = 'gaming') {
  const [gpu, cpu] = await Promise.all([
    db('gpus').where({ id: gpuId, is_available: true }).first(),
    db('cpus').where({ id: cpuId, is_available: true }).first(),
  ]);

  if (!gpu) { const e = new Error(`GPU id=${gpuId} not found`); e.statusCode = 404; throw e; }
  if (!cpu) { const e = new Error(`CPU id=${cpuId} not found`); e.statusCode = 404; throw e; }

  return computeBottleneck(gpu, cpu, useCase);
}

module.exports = { calculateBottleneck, computeBottleneck };  
