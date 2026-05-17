const winston = require('winston');
const env = require('../config/env');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

const transports = [];

if (env.nodeEnv === 'development') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    })
  );
}
if (env.nodeEnv === 'test') {
  transports.push(
    new winston.transports.Console({
      silent: true,
    })
  );
}

if (env.nodeEnv === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports,
});

module.exports = logger;