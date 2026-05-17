const db = require('../config/db');

const BrandsModel = {
  async findAll() {
    return db('brands').select('*').orderBy('name', 'asc');
  },

  async findById(id) {
    return db('brands').where({ id }).first();
  },
};

module.exports = BrandsModel;