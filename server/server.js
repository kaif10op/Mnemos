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
app.use(express.json({ extended: false }));

// ✅ LOGGING: Add request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect Database
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

    await mongoose.connect(mongoUri);
    logger.info('MongoDB Connected');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  }
};
connectDB();

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));

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
