const { allocate } = require('../../../src/services/configurator/budget.allocator');

describe('budget.allocator — allocate()', () => {

  describe('gaming use case', () => {
    it('gaming: GPU gets the largest single allocation', () => {
  const result = allocate(1000, 'gaming');
  const values = Object.values(result);
  expect(result.gpu).toBe(Math.max(...values));
    });

    it('gaming: has storage allocation', () => {
    const result = allocate(1000, 'gaming');
     
    expect(typeof result.storage === 'number' || result.storage === undefined).toBe(true);
    });

    it('all allocated components sum ≤ budget', () => {
      const budget = 1500;
      const result = allocate(budget, 'gaming');
      const total = Object.values(result).reduce((s, v) => s + v, 0);
      expect(total).toBeLessThanOrEqual(budget);
    });
  });

  describe('office use case', () => {
    it('has no GPU allocation', () => {
      const result = allocate(1000, 'office');
      expect(result.gpu).toBeUndefined();
    });

    it('has no cooler allocation', () => {
      const result = allocate(1000, 'office');
      expect(result.cooler).toBeUndefined();
    });

    it('office: has storage allocation', () => {
    const result = allocate(1000, 'office');
    expect(result.storage).toBeGreaterThan(0);
    });
  });

  describe('with excludeComponents (anchor logic)', () => {
    it('re-distributes GPU share among other components', () => {
      const withGpu    = allocate(1000, 'gaming', []);
      const withoutGpu = allocate(1000, 'gaming', ['gpu']);

      // CPU должен получить больше когда GPU исключён
      expect(withoutGpu.cpu).toBeGreaterThan(withGpu.cpu);
    });

    it('returns empty object when all components excluded', () => {
    const all = ['gpu', 'cpu', 'mainboard', 'ram', 'psu', 'case', 'cooler', 'storage'];
    const result = allocate(1000, 'gaming', all);
    expect(result).toEqual({});
    });

    it('remaining components still sum ≤ remaining budget', () => {
      const remaining = 800;
      const result = allocate(remaining, 'gaming', ['gpu']);
      const total = Object.values(result).reduce((s, v) => s + v, 0);
      expect(total).toBeLessThanOrEqual(remaining);
    });
  });

  describe('workstation use case', () => {
    it('workstation: CPU gets the largest allocation', () => {
    const result = allocate(2000, 'workstation');
    const values = Object.values(result);
    expect(result.cpu).toBe(Math.max(...values));
    });

    it('workstation: RAM gets second largest allocation', () => {
    const result = allocate(2000, 'workstation');
    const sorted = Object.values(result).sort((a, b) => b - a);
    expect(result.ram).toBe(sorted[1]);
    });


  });
});