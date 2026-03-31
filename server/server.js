require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { logger, requestLogger } = require('./utils/logger');

const app = express();

// 🚀 ABSOLUTE PRIORITY: CORS must be the first middleware to handle all preflights/errors
app.use(cors({
  origin: true, // Dynamically reflect the incoming origin in development
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

// Connect Database
let gfs, gridfsBucket;
const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      logger.warn('No MONGO_URI provided in .env');
      logger.info('Starting in-memory MongoDB Server for testing');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      logger.info(`In-memory DB started at: ${mongoUri}`);
    } else {
      logger.info('Using MongoDB URI from .env');
    }

    const conn = await mongoose.connect(mongoUri);
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
    process.exit(1);
  }
};
connectDB();

const path = require('path');

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/share', require('./routes/share')); // ✅ Sharing endpoints

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
