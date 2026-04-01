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

// ✅ PERFORMANCE: Indexes for common queries
ShareSchema.index({ userId: 1 }); // Find user's shares
ShareSchema.index({ token: 1 }, { unique: true }); // Find by share token (unique)
ShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-deletion of expired shares
ShareSchema.index({ userId: 1, noteId: 1 }); // Find existing share for a note

// Query helper: exclude expired shares
ShareSchema.query.active = function() {
  return this.or([
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } }
  ]);
};

module.exports = mongoose.model('Share', ShareSchema);
