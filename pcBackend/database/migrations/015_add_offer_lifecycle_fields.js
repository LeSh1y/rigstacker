exports.up = async function (knex) {
  const hasInactiveReason = await knex.schema.hasColumn('offers', 'inactive_reason');
  const hasInactiveCheckedAt = await knex.schema.hasColumn('offers', 'inactive_checked_at');
  const hasIsActive = await knex.schema.hasColumn('offers', 'is_active');
  const hasLastSeenAt = await knex.schema.hasColumn('offers', 'last_seen_at');

  await knex.schema.alterTable('offers', (table) => {
    if (!hasIsActive) {
      table.boolean('is_active').defaultTo(true).index();
    }
    if (!hasInactiveReason) {
      table.string('inactive_reason', 255).nullable();
    }
    if (!hasInactiveCheckedAt) {
      table.timestamp('inactive_checked_at').nullable();
    }
    if (!hasLastSeenAt) {
      table.timestamp('last_seen_at').nullable();
    }
  });
};

exports.down = async function (knex) {
  const hasInactiveReason = await knex.schema.hasColumn('offers', 'inactive_reason');
  const hasInactiveCheckedAt = await knex.schema.hasColumn('offers', 'inactive_checked_at');

  await knex.schema.alterTable('offers', (table) => {
    if (hasInactiveReason) {
      table.dropColumn('inactive_reason');
    }
    if (hasInactiveCheckedAt) {
      table.dropColumn('inactive_checked_at');
    }
  });
};
