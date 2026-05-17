exports.up = function (knex) {
  return knex.schema.createTable('offers', (table) => {
    table.increments('id').primary();
    table.string('component_type', 20).notNullable();
    table.integer('component_id').unsigned().notNullable();
    table.string('source', 50).notNullable();
    table.string('external_id', 255).nullable();
    table.string('title', 500).notNullable();
    table.string('condition', 20).notNullable();
    table.decimal('price_eur', 8, 2).notNullable();
    table.string('url', 1000).nullable();
    table.string('seller_name', 255).nullable();
    table.decimal('seller_rating', 3, 2).nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_suspicious').defaultTo(false);
    table.boolean('is_overpriced').defaultTo(false);
    table.json('risk_flags').nullable();
    table.decimal('confidence_score', 4, 3).nullable();
    table.timestamp('last_seen_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['component_type', 'component_id']);
    table.index(['source']);
    table.index(['is_active']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('offers');
};
