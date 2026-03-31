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
  // ✅ FEATURE: Soft delete support (trash/recovery)
  deletedAt: {
    type: Date,
    default: null,
  },
  // ✅ NEW: Premium Editor Preferences
  theme: {
    type: String,
    default: 'default', // sepia, cyberpunk, solarized, midnight
  },
  isFullWidth: {
    type: Boolean,
    default: false,
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
NoteSchema.index({ userId: 1, deletedAt: 1 }); // For trash queries

// Query helper: exclude deleted notes by default
NoteSchema.query.active = function() {
  return this.where({ deletedAt: null });
};

NoteSchema.query.inTrash = function() {
  return this.where({ deletedAt: { $ne: null } });
};

module.exports = mongoose.model('Note', NoteSchema);
