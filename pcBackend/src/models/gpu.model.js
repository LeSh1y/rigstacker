const db = require('../config/db');

const GpuModel = {
  async findAll(filters = {}) {
    let query = db('gpus')
      .join('brands', 'gpus.brand_id', 'brands.id')
      .select('gpus.*', 'brands.name as brand_name')
      .where('gpus.is_available', true);

    if (filters.maxPrice) {
      query = query.where('gpus.price_eur', '<=', filters.maxPrice);
    }
    if (filters.minVram) {
      query = query.where('gpus.vram_gb', '>=', filters.minVram);
    }
    if (filters.brand) {
      query = query.where('brands.name', 'like', `%${filters.brand}%`);
    }

    return query.orderBy('gpus.price_eur', 'asc');
  },

  async findById(id) {
    return db('gpus')
      .join('brands', 'gpus.brand_id', 'brands.id')
      .select('gpus.*', 'brands.name as brand_name')
      .where('gpus.id', id)
      .where('gpus.is_available', true)
      .first(); // вернёт объект или undefined
  },
};

module.exports = GpuModel;