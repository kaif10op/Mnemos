require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { logger, requestLogger } = require('./utils/logger');
const config = require('./config/constants');

// ✅ RELIABILITY: Global error handlers for unhandled rejections (set up FIRST)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});

const app = express();

// ✅ VERCEL PROXY SUPPORT
// Required for reliable IP-based rate limiting behind Vercel's edge network
app.set('trust proxy', 1);

// 🚀 ABSOLUTE PRIORITY: CORS must be the first middleware to handle all preflights/errors
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5050',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5050',
  'https://mnemos-sigma.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// ✅ SECURITY: Content Security Policy & COOP to prevent XSS and enable Auth Popups
app.use((req, res, next) => {
  // 🛡️ Allow Firebase Auth popups to communicate with the main window
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com https://cdn.tailwindcss.com https://unpkg.com https://www.gstatic.com https://*.firebase.com https://*.firebaseapp.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com https://unpkg.com https://cdn.jsdelivr.net; " +
    "connect-src 'self' https://*.firebase.google.com https://*.firebaseapp.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com https://*.google.com; " +
    "frame-src 'self' https://apis.google.com https://*.firebaseapp.com https://*.firebase.com https://www.googletagmanager.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "upgrade-insecure-requests;"
  );
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ LOGGING: Add request logging AFTER CORS/Security
app.use(requestLogger);

// ✅ SECURITY: Rate limiting for API endpoints
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Max 100 requests per 5 minutes (Increased for active editor)
  message: 'Too many sync requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' // Don't rate limit health checks
});

const shareLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Max 100 requests per 5 minutes (Increased)
  message: 'Too many share requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ CONFIG: Expose Firebase Public Config for UI initialization
app.get('/api/config/firebase', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

// ✅ SERVERLESS OPTIMIZATION: Cache DB connection to prevent pool exhaustion
let isConnected = false;
let gfs, gridfsBucket;

const connectDB = async () => {
  if (isConnected) {
    logger.info('Using warm active database connection');
    return;
  }

  try {
    let mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        logger.error('CRITICAL: MONGO_URI is missing in production environment');
        throw new Error('Database connection string required in production');
      }
      
      logger.warn('No MONGO_URI provided in .env');
      logger.info('Starting in-memory MongoDB Server for testing');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      logger.info(`In-memory DB started at: ${mongoUri}`);
    } else {
      logger.info('Using MongoDB URI from .env');
    }

    // 🚀 Disable Mongoose's silent buffering trap. Fail fast in Serverless!
    mongoose.set('bufferCommands', false);

    // ✅ PERFORMANCE: Optimize connection pool for serverless
    // In serverless: smaller pools with shorter timeouts
    // In traditional: larger pools for connection reuse
    const isServerless = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
    const mongoOptions = {
      maxPoolSize: isServerless ? 10 : 50,  // Serverless: low concurrency, Traditional: higher
      minPoolSize: isServerless ? 0 : 5,
      maxIdleTimeMS: isServerless ? 60000 : 600000,  // Serverless: 1min, Traditional: 10min
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,  // Socket timeout 45s (before Vercel's 50s limit)
      retryWrites: true,
      retryReads: true,
      family: 4  // Use IPv4 for better compatibility
    };

    // Connect with optimized pooling limits
    const conn = await mongoose.connect(mongoUri, mongoOptions);
    
    isConnected = !!conn.connections[0].readyState;
    logger.info('MongoDB Connected');

    // Init GridFS
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, {
      bucketName: 'uploads'
    });
    app.set('gridfsBucket', gridfsBucket);
    
    // ✅ PERFORMANCE: Create index on filename for instant GridFS lookups
    conn.connection.db.collection('uploads.files').createIndex({ filename: 1 }, { unique: true })
      .catch(err => logger.error('GridFS Indexing failed', { error: err.message }));
      
    logger.info('GridFS Bucket initialized with performance indexing');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    // DANGEROUS IN SERVERLESS: process.exit(1); 
    // We let the lambda survive so subsequent requests can re-attempt connection.
    isConnected = false;
  }
};
connectDB();

const path = require('path');

// 🚨 VERCEL DIAGNOSTIC: Check DB connection readiness
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    const state = mongoose.connection.readyState;

    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (state !== 1) {
      logger.warn('API request received with non-ready DB connection', { state, path: req.path });

      if (state === 0) {
        // Not connected - attempt one quick reconnect
        if (!process.env.VERCEL) { // Local dev
          try {
            await connectDB();
          } catch (e) {
            logger.error('Reconnect attempt failed', { error: e.message });
          }
        }

        if (mongoose.connection.readyState !== 1) {
          return res.status(503).json({
            msg: 'Database temporarily unavailable',
            code: 'DB_NOT_READY'
          });
        }
      } else if (state === 2) {
        // Connecting - brief wait (max 1 second)
        let retries = 20; // 20 * 50ms = 1 second max
        while (mongoose.connection.readyState !== 1 && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
          retries--;
        }

        if (mongoose.connection.readyState !== 1) {
          return res.status(503).json({
            msg: 'Database connection timeout',
            code: 'DB_CONNECTION_TIMEOUT'
          });
        }
      }
    }
  }
  next();
});

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', syncLimiter, require('./routes/sync'));
app.use('/api/share', shareLimiter, require('./routes/share')); // ✅ Sharing endpoints with rate limiting
app.use('/api/ai', require('./routes/ai')); // ✅ Smart AI endpoints (has own rate limiting)

// ✅ PRO CACHING: Aggressive Browser-Level Caching for Static Assets
const staticOptions = {
  maxAge: '1y',
  immutable: true,
  lastModified: true,
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      // 🛡️ SECURITY: Match COOP with Google's Auth popups for cross-window communication
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
      // Don't cache HTML files — always check for updates
      res.setHeader('Cache-Control', 'no-cache');
    } else if (path.includes('/assets/') || path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.woff2')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
};

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use(express.static(path.join(__dirname, '..'), staticOptions));

// ✅ Redirect old /shared/:token path-based URLs to query-param format
app.get('/shared/:token', (req, res) => {
  res.redirect(`/shared.html?token=${req.params.token}`);
});

// ✅ LOGGING: Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ msg: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5050;

// ✅ VERCEL SERVERLESS SUPPORT
// Only bind to port if running locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`, { env: process.env.NODE_ENV || 'development' });
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;
