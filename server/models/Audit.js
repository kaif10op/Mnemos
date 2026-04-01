const mongoose = require('mongoose');

const AuditSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    enum: ['DELETE_NOTE', 'RESTORE_NOTE', 'DELETE_FOLDER', 'UPDATE_NOTE', 'SHARE_NOTE', 'REVOKE_SHARE'],
    required: true,
  },
  resourceId: {
    type: String,
    required: true,
  },
  resourceType: {
    type: String,
    enum: ['note', 'folder', 'share'],
    required: true,
  },
  details: {
    type: Object,
    default: {},
  },
  ipAddress: String,
  userAgent: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: false });

// ✅ PERFORMANCE: Indexes for audit queries
AuditSchema.index({ userId: 1, createdAt: -1 }); // User's audit history
AuditSchema.index({ userId: 1, action: 1 }); // Filter by action type
AuditSchema.index({ resourceId: 1 }); // Find all actions for a resource
AuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete logs after 90 days

module.exports = mongoose.model('Audit', AuditSchema);
