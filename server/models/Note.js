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

// Add clientId field
NoteSchema.add({ clientId: { type: String, required: true } });

// ✅ PERFORMANCE: Add indexes for common queries
// Primary index: ensure user doesn't have duplicate client IDs
NoteSchema.index({ userId: 1, clientId: 1 }, { unique: true });

// Secondary indexes for better query performance
NoteSchema.index({ userId: 1, updatedAt: -1 }); // For sorting by recent
NoteSchema.index({ userId: 1, tags: 1 }); // For tag filtering
NoteSchema.index({ userId: 1, folderId: 1 }); // For folder filtering
NoteSchema.index({ userId: 1, pinned: 1 }); // For pinned notes

module.exports = mongoose.model('Note', NoteSchema);
