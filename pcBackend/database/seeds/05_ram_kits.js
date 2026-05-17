exports.seed = async (knex) => {
  await knex('ram_kits').del();
  await knex('ram_kits').insert([
    {
      brand_id: 4, name: 'Corsair Vengeance DDR5-6000 32GB',
      ram_type: 'DDR5', capacity_gb: 32, speed_mhz: 6000,
      modules_count: 2, price_eur: 89.00,
    },
    {
      brand_id: 4, name: 'Corsair Vengeance DDR5-6000 16GB',
      ram_type: 'DDR5', capacity_gb: 16, speed_mhz: 6000,
      modules_count: 2, price_eur: 49.00,
    },
    {
      brand_id: 4, name: 'Corsair Vengeance DDR4-3600 32GB',
      ram_type: 'DDR4', capacity_gb: 32, speed_mhz: 3600,
      modules_count: 2, price_eur: 69.00,
    },
    {
      brand_id: 4, name: 'Corsair Vengeance DDR4-3200 16GB',
      ram_type: 'DDR4', capacity_gb: 16, speed_mhz: 3200,
      modules_count: 2, price_eur: 39.00,
    },
    {
      brand_id: 6, name: 'G.Skill Trident Z5 DDR5-6400 32GB',
      ram_type: 'DDR5', capacity_gb: 32, speed_mhz: 6400,
      modules_count: 2, price_eur: 109.00,
    },
  ]);
};