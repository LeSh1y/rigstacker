exports.seed = async (knex) => {
  await knex('cpus').del();
  await knex('cpus').insert([
    {
      brand_id: 2, name: 'Ryzen 5 7600',
      socket: 'AM5', tdp: 65,
      supported_ram_types: JSON.stringify(['DDR5']),
      benchmark_score: 22000, price_eur: 199.00,
    },
    {
      brand_id: 2, name: 'Ryzen 7 9700X',
      socket: 'AM5', tdp: 65,
      supported_ram_types: JSON.stringify(['DDR5']),
      benchmark_score: 32000, price_eur: 329.00,
    },
    {
      brand_id: 2, name: 'Ryzen 9 9900X',
      socket: 'AM5', tdp: 120,
      supported_ram_types: JSON.stringify(['DDR5']),
      benchmark_score: 38000, price_eur: 449.00,
    },
    {
      brand_id: 3, name: 'Core i5-13600K',
      socket: 'LGA1700', tdp: 125,
      supported_ram_types: JSON.stringify(['DDR4', 'DDR5']),
      benchmark_score: 28000, price_eur: 249.00,
    },
    {
      brand_id: 3, name: 'Core i9-14900K',
      socket: 'LGA1700', tdp: 125,
      supported_ram_types: JSON.stringify(['DDR4', 'DDR5']),
      benchmark_score: 40000, price_eur: 399.00,
    },
  ]);
};