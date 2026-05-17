exports.up = (knex) =>
  knex.schema.createTable('mainboards', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.string('socket', 50).notNullable();
    t.string('form_factor', 20).notNullable();      
    t.decimal('pcie_version', 3, 1).notNullable();
    t.json('supported_ram_types').notNullable();    
    t.integer('max_ram_gb').notNullable();
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('mainboards');