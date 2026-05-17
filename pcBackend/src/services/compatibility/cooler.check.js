const parse = (v) => (Array.isArray(v) ? v : JSON.parse(v || '[]'));

const check = (cooler, cpu) => {
  const sockets = parse(cooler.supported_sockets);

  if (!sockets.includes(cpu.socket)) {
    return {
      ok: false,
      error: `Cooler does not support socket ${cpu.socket}. Supported: [${sockets.join(', ')}]`,
    };
  }

  if (cooler.max_tdp < cpu.tdp) {
    return {
      ok: false,
      error: `Cooler max TDP is ${cooler.max_tdp}W, CPU TDP is ${cpu.tdp}W — cooler will not handle the load`,
    };
  }

  return { ok: true };
};

module.exports = check;