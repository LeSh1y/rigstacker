const db = require('../config/db');

const MainboardModel = {
  async findAll(filters = {}) {
    let query = db('mainboards')
      .join('brands', 'mainboards.brand_id', 'brands.id')
      .select('mainboards.*', 'brands.name as brand_name')
      .where('mainboards.is_available', true);

    if (filters.socket)     query = query.where('mainboards.socket', filters.socket);
    if (filters.formFactor) query = query.where('mainboards.form_factor', filters.formFactor);
    if (filters.maxPrice)   query = query.where('mainboards.price_eur', '<=', filters.maxPrice);
    // JSON_CONTAINS для поиска внутри JSON-массива
    if (filters.ramType) {
      query = query.whereRaw('JSON_CONTAINS(mainboards.supported_ram_types, ?)', [
        JSON.stringify(filters.ramType),
      ]);
    }

    return query.orderBy('mainboards.price_eur', 'asc');
  },

  async findById(id) {
    return db('mainboards')
      .join('brands', 'mainboards.brand_id', 'brands.id')
      .select('mainboards.*', 'brands.name as brand_name')
      .where('mainboards.id', id)
      .where('mainboards.is_available', true)
      .first();
  },
};

module.exports = MainboardModel;