const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');
const logger = require('./utils/logger');

process.on('unhandledRejection', (reason) => {
  const message = reason?.message || reason;
  logger.error(`[Process] unhandledRejection: ${message}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[Process] uncaughtException: ${err.message}`);
});

async function checkDatabaseHealth() {
  logger.info('[Startup] DB init/health check');

  try {
    await db.raw('SELECT 1').timeout(5000);
    logger.info('[Startup] Database connected successfully');
  } catch (err) {
    logger.error(`[Startup] Database health check failed: ${err.message}`);
  }
}

const start = () => {
  logger.info('[Startup] server startup');

  app.listen(env.port, () => {
    logger.info(`Server running in ${env.nodeEnv} mode on port ${env.port}`);
    checkDatabaseHealth();
  });
};

start();
