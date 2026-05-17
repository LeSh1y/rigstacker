exports.up = (knex) =>
  knex.schema.createTable('gpus', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.integer('vram_gb').notNullable();
    t.integer('tdp').notNullable();               
    t.decimal('pcie_version', 3, 1).notNullable();  
    t.integer('length_mm').notNullable();
    t.integer('benchmark_score').notNullable();
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('gpus');