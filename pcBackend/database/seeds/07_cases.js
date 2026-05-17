exports.seed = async (knex) => {
  await knex('cases').del();
  await knex('cases').insert([
    {
      brand_id: 10, name: 'Fractal Design Meshify 2',
      max_gpu_length_mm: 467,
      supported_form_factors: JSON.stringify(['ATX', 'mATX', 'ITX']),
      max_cooler_height_mm: 185, price_eur: 139.00,
    },
    {
      brand_id: 10, name: 'Fractal Design Pop Air',
      max_gpu_length_mm: 405,
      supported_form_factors: JSON.stringify(['ATX', 'mATX', 'ITX']),
      max_cooler_height_mm: 170, price_eur: 89.00,
    },
    {
      brand_id: 4, name: 'Corsair 4000D Airflow',
      max_gpu_length_mm: 360,
      supported_form_factors: JSON.stringify(['ATX', 'mATX', 'ITX']),
      max_cooler_height_mm: 170, price_eur: 94.00,
    },
    {
      brand_id: 10, name: 'Fractal Design North',
      max_gpu_length_mm: 355,
      supported_form_factors: JSON.stringify(['ATX', 'mATX']),
      max_cooler_height_mm: 170, price_eur: 119.00,
    },
    {
      brand_id: 9, name: 'MSI MAG Pano 100R PZ',
      max_gpu_length_mm: 400,
      supported_form_factors: JSON.stringify(['ATX', 'mATX', 'ITX']),
      max_cooler_height_mm: 175, price_eur: 109.00,
    },
  ]);
};