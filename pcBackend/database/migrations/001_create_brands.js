exports.up = (knex) =>
  knex.schema.createTable('brands', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique();
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('brands');