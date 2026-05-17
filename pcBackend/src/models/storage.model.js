const db = require('../config/db');

const StorageModel = {
  async findAll(filters = {}) {
    let query = db('storage')
      .join('brands', 'storage.brand_id', 'brands.id')
      .select('storage.*', 'brands.name as brand_name')
      .where('storage.is_available', true);

    if (filters.type)        query = query.where('storage.type', filters.type);
    if (filters.minCapacity) query = query.where('storage.capacity_gb', '>=', filters.minCapacity);
    if (filters.maxPrice)    query = query.where('storage.price_eur', '<=', filters.maxPrice);

    return query.orderBy('storage.price_eur', 'asc');
  },

  async findById(id) {
    return db('storage')
      .join('brands', 'storage.brand_id', 'brands.id')
      .select('storage.*', 'brands.name as brand_name')
      .where('storage.id', id)
      .where('storage.is_available', true)
      .first();
  },
};

module.exports = StorageModel;