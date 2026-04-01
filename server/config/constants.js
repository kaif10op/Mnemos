/**
 * Centralized Configuration
 * All constants and configuration in one place
 */

module.exports = {
  // API Configuration
  API: {
    DEFAULT_PORT: process.env.PORT || 5050,
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    IS_SERVERLESS: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    ALLOWED_ORIGINS: [
      'http://localhost:3000',
      'http://localhost:5050',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5050',
      'https://mnemos-sigma.vercel.app'
    ]
  },

  // Authentication
  AUTH: {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRY: '7d',
    BCRYPT_ROUNDS: 10,
    RATE_LIMIT: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX_REQUESTS: 5
    }
  },

  // Database
  DATABASE: {
    MONGO_URI: process.env.MONGO_URI,
    MAX_POOL_SIZE_SERVERLESS: 10,
    MAX_POOL_SIZE_TRADITIONAL: 50,
    MIN_POOL_SIZE_SERVERLESS: 0,
    MIN_POOL_SIZE_TRADITIONAL: 5,
    MAX_IDLE_TIME_SERVERLESS: 60000, // 1 minute
    MAX_IDLE_TIME_TRADITIONAL: 600000, // 10 minutes
    SERVER_SELECTION_TIMEOUT_MS: 5000,
    SOCKET_TIMEOUT_MS: 45000 // Before Vercel's 50s limit
  },

  // File Upload
  FILE_UPLOAD: {
    MAX_SIZE: 50 * 1024 * 1024, // 50MB
    SINGLE_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  },

  // Rate Limiting
  RATE_LIMITS: {
    AUTH: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      message: 'Too many auth attempts, please try again later'
    },
    SYNC: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 20,
      message: 'Too many sync requests, please try again later'
    },
    SHARE: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 30,
      message: 'Too many share requests, please try again later'
    },
    AI: {
      windowMs: 60 * 1000, // 1 minute
      max: 30,
      message: 'Too many AI requests, please wait a minute'
    }
  },

  // Cache
  CACHE: {
    SYNC_STATUS_TTL: 60, // 60 seconds
    AI_RESPONSE_TTL: 300 // 5 minutes
  },

  // Validation
  VALIDATION: {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    TITLE_MAX_LENGTH: 500,
    CONTENT_MAX_LENGTH: 50000,
    TAG_MAX_LENGTH: 100
  },

  // Logging
  LOGGING: {
    LEVELS: {
      FATAL: 'fatal',
      ERROR: 'error',
      WARN: 'warn',
      INFO: 'info',
      DEBUG: 'debug',
      TRACE: 'trace'
    },
    LOG_FILE_RETENTION_DAYS: 90
  }
};
