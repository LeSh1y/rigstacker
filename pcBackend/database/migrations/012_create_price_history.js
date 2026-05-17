exports.up = function (knex) {
  return knex.schema.createTable('price_history', (table) => {
    table.increments('id').primary();
    table.integer('offer_id').unsigned().notNullable().references('id').inTable('offers').onDelete('CASCADE');
    table.string('component_type', 20).notNullable();
    table.integer('component_id').unsigned().notNullable();
    table.string('source', 50).notNullable();
    table.string('condition', 20).notNullable();
    table.decimal('price_eur', 8, 2).notNullable();
    table.timestamp('recorded_at').defaultTo(knex.fn.now());

    table.index(['component_type', 'component_id']);
    table.index(['offer_id']);
    table.index(['recorded_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('price_history');
};
