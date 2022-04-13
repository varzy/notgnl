const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.resolve(__dirname, '../../.cache/logs/error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.resolve(__dirname, '../../.cache/logs/info.log'),
      level: 'info',
    }),
    new winston.transports.File({
      filename: path.resolve(__dirname, '../../.cache/logs/combined.log'),
    }),
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.padLevels(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp}  ${level}: ${message}`)
  ),
});

module.exports = { logger };
