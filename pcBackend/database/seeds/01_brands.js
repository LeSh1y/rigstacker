exports.seed = async (knex) => {
  await knex('brands').del();
  await knex('brands').insert([
    { id: 1, name: 'Nvidia' },
    { id: 2, name: 'AMD' },
    { id: 3, name: 'Intel' },
    { id: 4, name: 'Corsair' },
    { id: 5, name: 'be quiet!' },
    { id: 6, name: 'Noctua' },
    { id: 7, name: 'Samsung' },
    { id: 8, name: 'ASUS' },
    { id: 9, name: 'MSI' },
    { id: 10, name: 'Fractal Design' },
    { id: 11, name: 'Seagate' },
    { id: 12, name: 'Western Digital' },
  ]);
};