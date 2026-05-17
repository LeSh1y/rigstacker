exports.seed = async (knex) => {
  await knex('coolers').del();
  await knex('coolers').insert([
    {
      brand_id: 6, name: 'Noctua NH-D15',
      supported_sockets: JSON.stringify(['AM5', 'AM4', 'LGA1700', 'LGA1200']),
      max_tdp: 250, height_mm: 165, type: 'air', price_eur: 99.00,
    },
    {
      brand_id: 5, name: 'be quiet! Dark Rock Pro 4',
      supported_sockets: JSON.stringify(['AM5', 'AM4', 'LGA1700', 'LGA1200']),
      max_tdp: 250, height_mm: 162, type: 'air', price_eur: 89.00,
    },
    {
      brand_id: 4, name: 'Corsair H150i Elite Capellix XT',
      supported_sockets: JSON.stringify(['AM5', 'AM4', 'LGA1700', 'LGA1200']),
      max_tdp: 350, height_mm: 27, type: 'aio_360', price_eur: 179.00,
    },
    {
      brand_id: 5, name: 'be quiet! Pure Rock 2',
      supported_sockets: JSON.stringify(['AM5', 'AM4', 'LGA1700', 'LGA1200']),
      max_tdp: 150, height_mm: 155, type: 'air', price_eur: 39.00,
    },
    {
      brand_id: 4, name: 'Corsair H100i RGB Pro XT',
      supported_sockets: JSON.stringify(['AM5', 'AM4', 'LGA1700', 'LGA1200']),
      max_tdp: 250, height_mm: 27, type: 'aio_240', price_eur: 129.00,
    },
  ]);
};