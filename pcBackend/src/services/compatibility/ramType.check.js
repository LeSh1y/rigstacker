const parse = (v) => (Array.isArray(v) ? v : JSON.parse(v || '[]'));

const check = (cpu, mainboard, ram = null) => {
  const cpuTypes = parse(cpu.supported_ram_types);
  const mbTypes  = parse(mainboard.supported_ram_types);
  const common   = cpuTypes.filter((t) => mbTypes.includes(t));

  if (common.length === 0) {
    return {
      ok: false,
      error: `No common RAM type: CPU supports [${cpuTypes.join(', ')}], mainboard supports [${mbTypes.join(', ')}]`,
    };
  }

  if (ram && !common.includes(ram.ram_type)) {
    return {
      ok: false,
      error: `RAM kit is ${ram.ram_type}, but CPU+MB combination only supports [${common.join(', ')}]`,
    };
  }

  return { ok: true };
};

module.exports = check;