require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { logger, requestLogger } = require('./utils/logger');

const app = express();

// ✅ SECURITY: Configure CORS with whitelist
const corsOptions = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ LOGGING: Add request logging middleware
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

// ✅ Serve static assets (images, etc)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// ✅ Serve frontend static files
app.use(express.static(path.join(__dirname, '..')));

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

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`, { env: process.env.NODE_ENV || 'development' });
});
