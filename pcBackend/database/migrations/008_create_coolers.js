exports.up = (knex) =>
  knex.schema.createTable('coolers', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.json('supported_sockets').notNullable();  
    t.integer('max_tdp').notNullable();
    t.integer('height_mm').notNullable();
    t.string('type', 20).notNullable();         
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('coolers');