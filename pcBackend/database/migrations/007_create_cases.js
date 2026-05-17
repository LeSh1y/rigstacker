exports.up = (knex) =>
  knex.schema.createTable('cases', (t) => {
    t.increments('id').primary();
    t.integer('brand_id').unsigned().notNullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.string('name', 150).notNullable();
    t.integer('max_gpu_length_mm').notNullable();
    t.json('supported_form_factors').notNullable();  
    t.integer('max_cooler_height_mm').notNullable();
    t.decimal('price_eur', 8, 2).notNullable();
    t.boolean('is_available').defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('cases');