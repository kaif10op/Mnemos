const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    default: '',
  },
  folderId: {
    type: String,
    default: null,
  },
  tags: {
    type: [String],
    default: [],
  },
  pinned: {
    type: Boolean,
    default: false,
  },
  clientUpdatedAt: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

// Prevent duplicate syncs with unique user + node ID (if we wanted to use client IDs. For now, clientID is helpful)
NoteSchema.add({ clientId: { type: String, required: true } });
// Ensure a user doesn't have multiple notes with the same client ID
NoteSchema.index({ userId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('Note', NoteSchema);
