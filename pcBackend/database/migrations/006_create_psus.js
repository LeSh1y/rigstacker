exports.up = (knex) =>
  knex.schema.createTable('psus', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.integer('wattage').notNullable();
    t.string('efficiency_rating', 20).notNullable();  
    t.string('modular', 20).notNullable();             
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('psus');