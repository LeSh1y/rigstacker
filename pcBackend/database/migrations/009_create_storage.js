exports.up = (knex) =>
  knex.schema.createTable('storage', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.string('type', 10).notNullable();         
    t.integer('capacity_gb').notNullable();
    t.string('interface', 30).notNullable();    
    t.integer('read_speed_mbps').notNullable();
    t.integer('write_speed_mbps').notNullable();
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('storage');