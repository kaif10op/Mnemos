const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  clientId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: 'folder',
  },
}, { timestamps: true });

FolderSchema.index({ userId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('Folder', FolderSchema);
