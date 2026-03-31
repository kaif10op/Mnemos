const winston = require('winston');
const path = require('path');

// Define log levels with colors
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
  },
  colors: {
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray'
  }
};

winston.addColors(customLevels.colors);

// Serverless (Vercel) has a Read-Only File System.
// We must ONLY use Console transports in production.
const isServerless = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mnemos-server' },
  transports: isServerless 
    ? [new winston.transports.Console()] // Vercel captures stdout logs automatically
    : [
        // Error logs (Local Only)
        new winston.transports.File({
          filename: path.join(__dirname, '../logs/error.log'),
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        // All logs (Local Only)
        new winston.transports.File({
          filename: path.join(__dirname, '../logs/combined.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        // Console logging in local dev
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
        })
      ]
});

/**
 * HTTP Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id || 'anonymous'
    });
  });

  next();
};

module.exports = { logger, requestLogger, customLevels };
