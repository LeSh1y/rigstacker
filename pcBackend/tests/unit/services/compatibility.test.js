const socketCheck     = require('../../../src/services/compatibility/socket.check');
const ramTypeCheck    = require('../../../src/services/compatibility/ramType.check');
const powerCheck      = require('../../../src/services/compatibility/power.check');
const dimensionsCheck = require('../../../src/services/compatibility/dimensions.check');
const formFactorCheck = require('../../../src/services/compatibility/formFactor.check');
const coolerCheck     = require('../../../src/services/compatibility/cooler.check');
const pcieCheck       = require('../../../src/services/compatibility/pcie.check');

// socketCheck  
describe('socketCheck', () => {
  it('ok when sockets match', () => {
    expect(socketCheck({ socket: 'AM5' }, { socket: 'AM5' })).toEqual({ ok: true });
  });

  it('error when sockets mismatch', () => {
    const result = socketCheck({ socket: 'LGA1700' }, { socket: 'AM5' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('LGA1700');
    expect(result.error).toContain('AM5');
  });
});

// ramTypeCheck 
describe('ramTypeCheck', () => {
  it('ok when CPU and MB share a RAM type', () => {
    const cpu = { supported_ram_types: ['DDR5'] };
    const mb  = { supported_ram_types: ['DDR5'] };
    expect(ramTypeCheck(cpu, mb)).toEqual({ ok: true });
  });

  it('ok when CPU supports both DDR4/DDR5 and MB supports DDR5', () => {
    const cpu = { supported_ram_types: ['DDR4', 'DDR5'] };
    const mb  = { supported_ram_types: ['DDR5'] };
    expect(ramTypeCheck(cpu, mb)).toEqual({ ok: true });
  });

  it('error when no common RAM type', () => {
    const cpu = { supported_ram_types: ['DDR5'] };
    const mb  = { supported_ram_types: ['DDR4'] };
    const result = ramTypeCheck(cpu, mb);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DDR5');
    expect(result.error).toContain('DDR4');
  });

  it('error when RAM kit type does not match common types', () => {
    const cpu = { supported_ram_types: ['DDR5'] };
    const mb  = { supported_ram_types: ['DDR5'] };
    const ram = { ram_type: 'DDR4' };
    const result = ramTypeCheck(cpu, mb, ram);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DDR4');
  });

  it('ok when RAM kit type matches', () => {
    const cpu = { supported_ram_types: ['DDR5'] };
    const mb  = { supported_ram_types: ['DDR5'] };
    const ram = { ram_type: 'DDR5' };
    expect(ramTypeCheck(cpu, mb, ram)).toEqual({ ok: true });
  });

  it('handles JSON strings from DB', () => {
    const cpu = { supported_ram_types: '["DDR5"]' };
    const mb  = { supported_ram_types: '["DDR5"]' };
    expect(ramTypeCheck(cpu, mb)).toEqual({ ok: true });
  });
});

// powerCheck 
describe('powerCheck', () => {
  it('ok when PSU has enough wattage', () => {
    const gpu = { tdp: 285 };
    const cpu = { tdp: 65 };
    const psu = { wattage: 750 }; // 285 + 65 + 80 = 430 ≤ 750
    expect(powerCheck(gpu, cpu, psu)).toEqual({ ok: true });
  });

  it('error when PSU is insufficient', () => {
    const gpu = { tdp: 355 };
    const cpu = { tdp: 125 };
    const psu = { wattage: 500 }; // 355 + 125 + 80 = 560 > 500
    const result = powerCheck(gpu, cpu, psu);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('560');
    expect(result.error).toContain('500');
  });

  it('error on exact edge case (required === wattage is ok, required > wattage is not)', () => {
    const gpu = { tdp: 285, name: 'GPU' };
    const cpu = { tdp: 65, name: 'CPU' };
    const psu = { wattage: 430 }; // exactly 430W → ok
    expect(powerCheck(gpu, cpu, psu).ok).toBe(true);

    const psuWeak = { wattage: 429 };
    expect(powerCheck(gpu, cpu, psuWeak).ok).toBe(false);
  });
});

//  dimensionsCheck 
describe('dimensionsCheck', () => {
  it('ok when GPU fits in case', () => {
    expect(dimensionsCheck({ length_mm: 287 }, { max_gpu_length_mm: 467 })).toEqual({ ok: true });
  });

  it('ok on exact match', () => {
    expect(dimensionsCheck({ length_mm: 336 }, { max_gpu_length_mm: 336 })).toEqual({ ok: true });
  });

  it('error when GPU is too long', () => {
    const result = dimensionsCheck({ length_mm: 400 }, { max_gpu_length_mm: 355 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('400');
    expect(result.error).toContain('355');
  });
});

// formFactorCheck 
describe('formFactorCheck', () => {
  it('ok when form factor is supported', () => {
    const mb   = { form_factor: 'ATX' };
    const case_ = { supported_form_factors: ['ATX', 'mATX', 'ITX'] };
    expect(formFactorCheck(mb, case_)).toEqual({ ok: true });
  });

  it('error when form factor not supported', () => {
    const mb   = { form_factor: 'ATX' };
    const case_ = { supported_form_factors: ['mATX', 'ITX'] };
    const result = formFactorCheck(mb, case_);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ATX');
  });

  it('handles JSON string from DB', () => {
    const mb    = { form_factor: 'mATX' };
    const case_ = { supported_form_factors: '["ATX","mATX"]' };
    expect(formFactorCheck(mb, case_)).toEqual({ ok: true });
  });
});

// coolerCheck  
describe('coolerCheck', () => {
  const cooler = {
    name: 'Noctua NH-D15',
    supported_sockets: ['AM5', 'AM4', 'LGA1700'],
    max_tdp: 250,
  };

  it('ok when socket matches and TDP is sufficient', () => {
    const cpu = { socket: 'AM5', tdp: 120 };
    expect(coolerCheck(cooler, cpu)).toEqual({ ok: true });
  });

  it('error when socket not supported', () => {
    const cpu = { socket: 'LGA1851', tdp: 65 };
    const result = coolerCheck(cooler, cpu);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('LGA1851');
  });

  it('error when CPU TDP exceeds cooler max_tdp', () => {
    const cpu = { socket: 'AM5', tdp: 300 }; // cooler max is 250W
    const result = coolerCheck(cooler, cpu);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('250');
    expect(result.error).toContain('300');
  });
});

//  pcieCheck  
describe('pcieCheck', () => {
  it('no warning when GPU PCIe <= MB PCIe', () => {
    const result = pcieCheck({ pcie_version: 4.0 }, { pcie_version: 5.0 });
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('no warning when versions match', () => {
    const result = pcieCheck({ pcie_version: 4.0 }, { pcie_version: 4.0 });
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('warning when GPU PCIe > MB PCIe', () => {
    const result = pcieCheck({ pcie_version: 5.0 }, { pcie_version: 4.0 });
    expect(result.ok).toBe(true);          
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('5');
    expect(result.warning).toContain('4');
  });
});