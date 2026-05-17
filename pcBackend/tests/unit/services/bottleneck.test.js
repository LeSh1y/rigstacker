const { computeBottleneck } = require('../../../src/services/bottleneck.service');

const makeGpu = (score) => ({ id: 1, name: 'Test GPU', benchmark_score: score });
const makeCpu = (score) => ({ id: 1, name: 'Test CPU', benchmark_score: score, socket: 'AM5' });

describe('computeBottleneck', () => {
  it('detects CPU bottleneck when ratio > 1.4', () => {
    // ratio = 36000 / 22000 = 1.636 → CPU bottleneck
    const result = computeBottleneck(makeGpu(36000), makeCpu(22000));
    expect(result.verdict).toBe('cpu_bottleneck');
    expect(result.ratio).toBeGreaterThan(1.4);
    expect(result.resolution).not.toBeNull();
  });

  it('detects GPU bottleneck when ratio < 0.7', () => {
    // ratio = 14200 / 40000 = 0.355 → GPU bottleneck
    const result = computeBottleneck(makeGpu(14200), makeCpu(40000));
    expect(result.verdict).toBe('gpu_bottleneck');
    expect(result.ratio).toBeLessThan(0.7);
    expect(result.resolution).not.toBeNull();
  });

  it('detects balanced when 0.7 <= ratio <= 1.4', () => {
    // ratio = 23500 / 32000 = 0.734 → balanced
    const result = computeBottleneck(makeGpu(23500), makeCpu(32000));
    expect(result.verdict).toBe('balanced');
    expect(result.ratio).toBeGreaterThanOrEqual(0.7);
    expect(result.ratio).toBeLessThanOrEqual(1.4);
    expect(result.resolution).toBeNull();
  });

  it('returns correctly rounded ratio', () => {
    // 22000 / 22000 = 1.0
    const result = computeBottleneck(makeGpu(22000), makeCpu(22000));
    expect(result.ratio).toBe(1.0);
  });

  it('returns gpu and cpu info in result', () => {
    const gpu = makeGpu(20000);
    const cpu = makeCpu(20000);
    const result = computeBottleneck(gpu, cpu);
    expect(result.gpu).toMatchObject({ id: 1, benchmark_score: 20000 });
    expect(result.cpu).toMatchObject({ id: 1, benchmark_score: 20000 });
  });
});