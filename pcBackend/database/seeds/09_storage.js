exports.seed = async (knex) => {
  await knex('storage').del();
  await knex('storage').insert([
    {
      brand_id: 7, name: 'Samsung 990 Pro 1TB',
      type: 'SSD', capacity_gb: 1000, interface: 'NVMe M.2',
      read_speed_mbps: 7450, write_speed_mbps: 6900, price_eur: 99.00,
    },
    {
      brand_id: 12, name: 'WD Black SN850X 2TB',
      type: 'SSD', capacity_gb: 2000, interface: 'NVMe M.2',
      read_speed_mbps: 7300, write_speed_mbps: 6600, price_eur: 149.00,
    },
    {
      brand_id: 7, name: 'Samsung 870 EVO 1TB',
      type: 'SSD', capacity_gb: 1000, interface: 'SATA',
      read_speed_mbps: 560, write_speed_mbps: 530, price_eur: 79.00,
    },
    {
      brand_id: 11, name: 'Seagate Barracuda 2TB',
      type: 'HDD', capacity_gb: 2000, interface: 'SATA',
      read_speed_mbps: 190, write_speed_mbps: 190, price_eur: 54.00,
    },
    {
      brand_id: 12, name: 'WD Blue 4TB',
      type: 'HDD', capacity_gb: 4000, interface: 'SATA',
      read_speed_mbps: 180, write_speed_mbps: 180, price_eur: 79.00,
    },
  ]);
};