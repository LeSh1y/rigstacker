const db = require('../config/db');

const PsuModel = {
  async findAll(filters = {}) {
    let query = db('psus')
      .join('brands', 'psus.brand_id', 'brands.id')
      .select('psus.*', 'brands.name as brand_name')
      .where('psus.is_available', true);

    if (filters.minWattage) query = query.where('psus.wattage', '>=', filters.minWattage);
    if (filters.maxPrice)   query = query.where('psus.price_eur', '<=', filters.maxPrice);

    return query.orderBy('psus.wattage', 'asc');
  },

  async findById(id) {
    return db('psus')
      .join('brands', 'psus.brand_id', 'brands.id')
      .select('psus.*', 'brands.name as brand_name')
      .where('psus.id', id)
      .where('psus.is_available', true)
      .first();
  },
};

module.exports = PsuModel;