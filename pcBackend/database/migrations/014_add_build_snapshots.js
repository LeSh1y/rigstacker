exports.up = (knex) =>
  knex.schema.alterTable('builds', (t) => {
    t.json('snapshot').nullable();
  });

exports.down = (knex) =>
  knex.schema.alterTable('builds', (t) => {
    t.dropColumn('snapshot');
  });
