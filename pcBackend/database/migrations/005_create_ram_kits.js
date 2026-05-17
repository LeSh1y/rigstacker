exports.up = (knex) =>
  knex.schema.createTable('ram_kits', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.string('ram_type', 10).notNullable();    
    t.integer('capacity_gb').notNullable();
    t.integer('speed_mhz').notNullable();
    t.integer('modules_count').notNullable();  
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('ram_kits');