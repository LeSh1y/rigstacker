const db = require('../config/db');

const CasesModel = {
  async findAll(filters = {}) {
    let query = db('cases')
      .join('brands', 'cases.brand_id', 'brands.id')
      .select('cases.*', 'brands.name as brand_name')
      .where('cases.is_available', true);

    if (filters.maxPrice) query = query.where('cases.price_eur', '<=', filters.maxPrice);
    if (filters.formFactor) {
      query = query.whereRaw('JSON_CONTAINS(cases.supported_form_factors, ?)', [
        JSON.stringify(filters.formFactor),
      ]);
    }

    return query.orderBy('cases.price_eur', 'asc');
  },

  async findById(id) {
    return db('cases')
      .join('brands', 'cases.brand_id', 'brands.id')
      .select('cases.*', 'brands.name as brand_name')
      .where('cases.id', id)
      .where('cases.is_available', true)
      .first();
  },
};

module.exports = CasesModel;