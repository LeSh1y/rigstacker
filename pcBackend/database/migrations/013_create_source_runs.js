exports.up = function (knex) {
  return knex.schema.createTable('source_runs', (table) => {
    table.increments('id').primary();
    table.string('source', 50).notNullable();
    table.string('component_type', 20).nullable();
    table.string('status', 20).notNullable();
    table.integer('offers_found').defaultTo(0);
    table.integer('offers_new').defaultTo(0);
    table.integer('offers_updated').defaultTo(0);
    table.integer('offers_inactive').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamp('started_at').notNullable();
    table.timestamp('finished_at').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('source_runs');
};
