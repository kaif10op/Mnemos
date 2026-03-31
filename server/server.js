require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { logger, requestLogger } = require('./utils/logger');

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

// ✅ SECURITY: Set COOP header for Firebase Auth popups
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ LOGGING: Add request logging AFTER CORS/Security
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

    // Connect with optimized Serverless pooling limits
    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    
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

// 🚨 VERCEL DIAGNOSTIC INTERCEPTOR: Prevent 15-second silent timeouts.
// If MongoDB Atlas firewalls Vercel, actively report it rather than crashing the container!
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    let attempts = 0;
    while (mongoose.connection.readyState === 2 && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    if (mongoose.connection.readyState === 0) {
      return res.status(503).json({
        msg: '🚨 FIREWALL ERROR: Vercel cannot reach MongoDB Atlas! You must open Atlas Network Access to 0.0.0.0/0 AND ensure MONGO_URI is properly saved in the Vercel Dashboard.',
        code: 'MONGODB_UNREACHABLE_TIMEOUT'
      });
    }
  }
  next();
});

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/share', require('./routes/share')); // ✅ Sharing endpoints
app.use('/api/ai', require('./routes/ai')); // ✅ Smart AI endpoints

// ✅ PRO CACHING: Aggressive Browser-Level Caching for Static Assets
const staticOptions = {
  maxAge: '1y',
  immutable: true,
  lastModified: true,
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
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
