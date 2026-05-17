const db = require('../config/db');

const RamModel = {
  async findAll(filters = {}) {
    let query = db('ram_kits')
      .join('brands', 'ram_kits.brand_id', 'brands.id')
      .select('ram_kits.*', 'brands.name as brand_name')
      .where('ram_kits.is_available', true);

    if (filters.ramType)     query = query.where('ram_kits.ram_type', filters.ramType);
    if (filters.minCapacity) query = query.where('ram_kits.capacity_gb', '>=', filters.minCapacity);
    if (filters.maxPrice)    query = query.where('ram_kits.price_eur', '<=', filters.maxPrice);

    return query.orderBy('ram_kits.price_eur', 'asc');
  },

  async findById(id) {
    return db('ram_kits')
      .join('brands', 'ram_kits.brand_id', 'brands.id')
      .select('ram_kits.*', 'brands.name as brand_name')
      .where('ram_kits.id', id)
      .where('ram_kits.is_available', true)
      .first();
  },
};

module.exports = RamModel;