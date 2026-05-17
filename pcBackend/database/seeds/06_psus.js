exports.seed = async (knex) => {
  await knex('psus').del();
  await knex('psus').insert([
    {
      brand_id: 5, name: 'be quiet! Pure Power 12M 650W',
      wattage: 650, efficiency_rating: '80+ Gold', modular: 'semi', price_eur: 99.00,
    },
    {
      brand_id: 4, name: 'Corsair RM850x',
      wattage: 850, efficiency_rating: '80+ Gold', modular: 'full', price_eur: 139.00,
    },
    {
      brand_id: 5, name: 'be quiet! Dark Power 13 1000W',
      wattage: 1000, efficiency_rating: '80+ Titanium', modular: 'full', price_eur: 229.00,
    },
    {
      brand_id: 4, name: 'Corsair RM750e',
      wattage: 750, efficiency_rating: '80+ Gold', modular: 'full', price_eur: 109.00,
    },
    {
      brand_id: 5, name: 'be quiet! Straight Power 12 1000W',
      wattage: 1000, efficiency_rating: '80+ Platinum', modular: 'full', price_eur: 189.00,
    },
  ]);
};