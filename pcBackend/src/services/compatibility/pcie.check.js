const check = (gpu, mainboard) => {
  if (gpu.pcie_version > mainboard.pcie_version) {
    return {
      ok: true,
      warning: `GPU is PCIe ${gpu.pcie_version}, mainboard slot is PCIe ${mainboard.pcie_version}. Backward compatible, minor performance impact possible`,
    };
  }

  return { ok: true };
};

module.exports = check;