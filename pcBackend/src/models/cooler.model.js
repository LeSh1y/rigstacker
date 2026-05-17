const db = require('../config/db');

const CoolerModel = {
  async findAll(filters = {}) {
    let query = db('coolers')
      .join('brands', 'coolers.brand_id', 'brands.id')
      .select('coolers.*', 'brands.name as brand_name')
      .where('coolers.is_available', true);

    if (filters.type)     query = query.where('coolers.type', filters.type);
    if (filters.maxPrice) query = query.where('coolers.price_eur', '<=', filters.maxPrice);
    if (filters.socket) {
      query = query.whereRaw('JSON_CONTAINS(coolers.supported_sockets, ?)', [
        JSON.stringify(filters.socket),
      ]);
    }

    return query.orderBy('coolers.price_eur', 'asc');
  },

  async findById(id) {
    return db('coolers')
      .join('brands', 'coolers.brand_id', 'brands.id')
      .select('coolers.*', 'brands.name as brand_name')
      .where('coolers.id', id)
      .where('coolers.is_available', true)
      .first();
  },
};

module.exports = CoolerModel;