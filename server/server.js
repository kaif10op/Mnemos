require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Init Middleware
app.use(cors());
app.use(express.json({ extended: false }));

// Connect Database
const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      console.warn('⚠️ WARNING: No MONGO_URI provided in .env.');
      console.log('🔄 Starting an in-memory MongoDB Server for testing...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      console.log(`✅ Started in-memory DB at: ${mongoUri}`);
    } else {
      console.log('✅ Using MongoDB URI from .env');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};
connectDB();

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
