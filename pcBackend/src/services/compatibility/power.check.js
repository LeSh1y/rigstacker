const OVERHEAD_W = 80;  

const check = (gpu, cpu, psu) => {
  const required = gpu.tdp + cpu.tdp + OVERHEAD_W;

  if (required > psu.wattage) {
    return {
      ok: false,
      error: `PSU too weak: need ${required}W (GPU ${gpu.tdp}W + CPU ${cpu.tdp}W + ${OVERHEAD_W}W overhead), PSU provides ${psu.wattage}W`,
    };
  }

  return { ok: true };
};

module.exports = check;