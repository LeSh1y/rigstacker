const check = (cpu, mainboard) => {
  if (cpu.socket !== mainboard.socket) {
    return {
      ok: false,
      error: `Socket mismatch: CPU uses ${cpu.socket}, mainboard has ${mainboard.socket}`,
    };
  }
  return { ok: true };
};

module.exports = check;