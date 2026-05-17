exports.seed = async (knex) => {
  await knex('gpus').del();
  await knex('gpus').insert([
    {
      brand_id: 1, name: 'GeForce RTX 4060',
      vram_gb: 8, tdp: 115, pcie_version: 4.0,
      length_mm: 240, benchmark_score: 14200, price_eur: 299.00,
    },
    {
      brand_id: 1, name: 'GeForce RTX 4070 Ti Super',
      vram_gb: 16, tdp: 285, pcie_version: 4.0,
      length_mm: 336, benchmark_score: 23500, price_eur: 549.00,
    },
    {
      brand_id: 1, name: 'GeForce RTX 5080',
      vram_gb: 16, tdp: 360, pcie_version: 5.0,
      length_mm: 336, benchmark_score: 36000, price_eur: 999.00,
    },
    {
      brand_id: 2, name: 'Radeon RX 7600',
      vram_gb: 8, tdp: 165, pcie_version: 4.0,
      length_mm: 235, benchmark_score: 12100, price_eur: 229.00,
    },
    {
      brand_id: 2, name: 'Radeon RX 7900 XTX',
      vram_gb: 24, tdp: 355, pcie_version: 4.0,
      length_mm: 287, benchmark_score: 28400, price_eur: 799.00,
    },
  ]);
};