exports.up = (knex) =>
  knex.schema.createTable('builds', (t) => {
    t.increments('id').primary();
    t.uuid('build_id').notNullable().unique();       
    t.string('use_case', 20).nullable();

     t.integer('gpu_id').unsigned().nullable()
      .references('id').inTable('gpus').onDelete('SET NULL');
    t.integer('cpu_id').unsigned().nullable()
      .references('id').inTable('cpus').onDelete('SET NULL');
    t.integer('mainboard_id').unsigned().nullable()
      .references('id').inTable('mainboards').onDelete('SET NULL');
    t.integer('ram_id').unsigned().nullable()
      .references('id').inTable('ram_kits').onDelete('SET NULL');
    t.integer('psu_id').unsigned().nullable()
      .references('id').inTable('psus').onDelete('SET NULL');
    t.integer('case_id').unsigned().nullable()
      .references('id').inTable('cases').onDelete('SET NULL');
    t.integer('cooler_id').unsigned().nullable()
      .references('id').inTable('coolers').onDelete('SET NULL');
    t.integer('storage_id').unsigned().nullable()
      .references('id').inTable('storage').onDelete('SET NULL');

    t.decimal('total_price', 8, 2).nullable();
    t.boolean('compatible').defaultTo(false);
    t.json('issues').nullable();
    t.json('warnings').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

exports.down = (knex) => knex.schema.dropTable('builds');