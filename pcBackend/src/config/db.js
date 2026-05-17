const knex = require('knex');
const env = require('./env');
const logger = require('../utils/logger');

logger.info(
  `[DB] config host=${env.db.host} port=${env.db.port} database=${env.db.name} user=${env.db.user}`
);

const db = knex({
  client: 'mysql2',
  acquireConnectionTimeout: 5000,
  connection: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    connectTimeout: 5000,
  },
  pool: {
    min: 0,
    max: 10,
    acquireTimeoutMillis: 5000,
    createTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
});

module.exports = db;
