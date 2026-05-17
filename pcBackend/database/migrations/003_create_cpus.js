exports.up = (knex) =>
  knex.schema.createTable('cpus', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.string('socket', 50).notNullable();         
    t.integer('tdp').notNullable();
    t.json('supported_ram_types').notNullable();   
    t.integer('benchmark_score').notNullable();
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('cpus');