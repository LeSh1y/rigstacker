const check = (gpu, pcCase) => {
  if (gpu.length_mm > pcCase.max_gpu_length_mm) {
    return {
      ok: false,
      error: `GPU too long: ${gpu.length_mm}mm, case maximum is ${pcCase.max_gpu_length_mm}mm`,
    };
  }

  return { ok: true };
};

module.exports = check;