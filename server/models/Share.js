const mongoose = require('mongoose');
const crypto = require('crypto');

const ShareSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  noteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note',
    required: true,
  },
  // Generate a unique share token
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex'),
  },
  // Optional expiration for temporary shares
  expiresAt: {
    type: Date,
    default: null, // null = never expires
  },
  // Track share access
  views: {
    type: Number,
    default: 0,
  },
  lastAccessedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// Index for fast token lookups
ShareSchema.index({ token: 1 });
ShareSchema.index({ userId: 1 });

// Query helper: exclude expired shares
ShareSchema.query.active = function() {
  return this.where({
    expiresAt: { $exists: false } || { $gt: new Date() }
  });
};

module.exports = mongoose.model('Share', ShareSchema);
