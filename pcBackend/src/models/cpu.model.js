const db = require('../config/db');

const CpuModel = {
  async findAll(filters = {}) {
    let query = db('cpus')
      .join('brands', 'cpus.brand_id', 'brands.id')
      .select('cpus.*', 'brands.name as brand_name')
      .where('cpus.is_available', true);

    if (filters.socket)   query = query.where('cpus.socket', filters.socket);
    if (filters.maxPrice) query = query.where('cpus.price_eur', '<=', filters.maxPrice);
    if (filters.brand)    query = query.where('brands.name', 'like', `%${filters.brand}%`);

    return query.orderBy('cpus.price_eur', 'asc');
  },

  async findById(id) {
    return db('cpus')
      .join('brands', 'cpus.brand_id', 'brands.id')
      .select('cpus.*', 'brands.name as brand_name')
      .where('cpus.id', id)
      .where('cpus.is_available', true)
      .first();
  },
};

module.exports = CpuModel;