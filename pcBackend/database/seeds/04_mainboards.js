exports.seed = async (knex) => {
  await knex('mainboards').del();
  await knex('mainboards').insert([
    {
      brand_id: 2, name: 'MSI MAG B650 Tomahawk WiFi',
      socket: 'AM5', form_factor: 'ATX', pcie_version: 4.0,
      supported_ram_types: JSON.stringify(['DDR5']),
      max_ram_gb: 128, price_eur: 189.00,
    },
    {
      brand_id: 8, name: 'ASUS ROG Strix B650E-F Gaming WiFi',
      socket: 'AM5', form_factor: 'ATX', pcie_version: 5.0,
      supported_ram_types: JSON.stringify(['DDR5']),
      max_ram_gb: 128, price_eur: 299.00,
    },
    {
      brand_id: 8, name: 'ASUS Prime B650M-A WiFi',
      socket: 'AM5', form_factor: 'mATX', pcie_version: 4.0,
      supported_ram_types: JSON.stringify(['DDR5']),
      max_ram_gb: 128, price_eur: 149.00,
    },
    {
      brand_id: 9, name: 'MSI MAG B760 Tomahawk WiFi DDR5',
      socket: 'LGA1700', form_factor: 'ATX', pcie_version: 4.0,
      supported_ram_types: JSON.stringify(['DDR5']),
      max_ram_gb: 192, price_eur: 199.00,
    },
    {
      brand_id: 8, name: 'ASUS Prime Z790-P WiFi',
      socket: 'LGA1700', form_factor: 'ATX', pcie_version: 5.0,
      supported_ram_types: JSON.stringify(['DDR4', 'DDR5']),
      max_ram_gb: 192, price_eur: 239.00,
    },
  ]);
};