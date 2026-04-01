const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const Audit = require('../models/Audit');
const cache = require('../utils/cache');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { validate } = require('../utils/validation');

const { Readable } = require('stream');
const mongoose = require('mongoose');
// ✅ PERFORMANCE: In-Memory Sync Cache (Fingerprint Cache)
const statusCache = new Map();

// Helper to invalidate cache
const clearStatusCache = (userId) => statusCache.delete(userId.toString());
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per image
});

// @route   GET api/sync/image/:filename
// @desc    Stream an image from GridFS
// @access  Public
router.get('/image/:filename', async (req, res) => {
  try {
    // ✅ SERVERLESS: Wait for MongoDB connection to lock in on cold start
    while (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Natively construct bucket after connection is guaranteed
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

    // ✅ PERFORMANCE: Find file metadata first (Uses index)
    const files = await bucket.find({ filename: req.params.filename }).limit(1).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ msg: 'Image not found' });
    }

    const file = files[0];

    // ✅ PRO HEADERS: Optimize for instant browser rendering
    res.set('Content-Type', file.contentType || 'image/png');
    res.set('Content-Length', file.length);
    res.set('Accept-Ranges', 'bytes');
    res.set('ETag', file._id.toString());
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year caching

    // Stream from GridFS
    bucket.openDownloadStream(file._id).pipe(res);
  } catch (err) {
    logger.error('Streaming fail', { error: err.message, filename: req.params.filename });
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   DELETE api/sync/image/:filename
// @desc    Delete an image from GridFS (Garbage Collection)
// @access  Private
router.delete('/image/:filename', auth, async (req, res) => {
  try {
    while (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

    // ✅ PERFORMANCE: Limit to 1 result since we only need to delete one file
    const files = await bucket.find({ filename: req.params.filename }).limit(1).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ msg: 'Image not found' });
    }

    // Delete the file
    await bucket.delete(files[0]._id);
    res.json({ msg: 'Asset purged successfully' });
  } catch (err) {
    logger.error('Asset deletion failed', { error: err.message });
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   POST api/sync/upload
// @desc    Upload an image for a note
// @access  Private
router.post('/upload', auth, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ msg: 'No file uploaded' });
  }

  try {
    while (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });

    // Generate professional random filename
    const filename = crypto.randomBytes(16).toString('hex') + path.extname(req.file.originalname);
    
    // Create an upload stream
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: { userId: req.user.id }
    });

    // Pipe the memory buffer to GridFS
    const readableFileStream = new Readable();
    readableFileStream.push(req.file.buffer);
    readableFileStream.push(null);
    
    readableFileStream.pipe(uploadStream)
      .on('error', (err) => {
        logger.error('GridFS Upload Stream Error', { error: err.message });
        res.status(500).json({ msg: 'Upload failed during streaming' });
      })
      .on('finish', () => {
        // Return the new professional binary URL
        const imageUrl = `/api/sync/image/${filename}`;
        res.json({ url: imageUrl });
      });
  } catch (err) {
    res.status(500).json({ msg: 'Database connection failed' });
  }
});

// @route   GET api/sync/status
// @desc    Get a tiny version hash of the user's data (for caching)
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check Cache First
    if (statusCache.has(userId.toString())) {
      return res.json({ hash: statusCache.get(userId.toString()), cached: true });
    }
    
    // Performance: Only fetch projected timestamps
    const notes = await Note.find({ userId }).select('updatedAt clientUpdatedAt').sort({ clientUpdatedAt: -1 });
    const folders = await Folder.find({ userId }).select('updatedAt').sort({ updatedAt: -1 });

    // Generate a SHA-1 fingerprint of the entire state
    const fingerprint = crypto.createHash('sha1')
      .update(JSON.stringify({ notes, folders }))
      .digest('hex');

    // Store in cache (1-min max life for safety)
    statusCache.set(userId.toString(), fingerprint);
    setTimeout(() => clearStatusCache(userId), 60000);

    res.json({ hash: fingerprint, cached: false });
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/sync
// @desc    Fetch user's notes and folders from cloud (with ETag caching)
// @access  Private
/**
 * Retrieves all non-deleted notes and folders for the authenticated user.
 * Uses pagination and ETag-based caching to optimize performance.
 *
 * @param {Object} req - Express request object
 * @param {string} req.user.id - User ID from JWT token
 * @param {number} [req.query.page] - Page number for pagination (default: 1)
 * @param {number} [req.query.limit] - Items per page (min: 1, max: 100, default: 50)
 * @returns {Object} { notes: Array, folders: Array, hash: string }
 */
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const skip = (page - 1) * limit;

  try {
    // 🚀 CACHING: Generate ETag from data state
    const notesCount = await Note.countDocuments({ userId, deletedAt: null });
    const latestNote = await Note.findOne({ userId }).sort({ updatedAt: -1 }).select('updatedAt');
    const etag = crypto.createHash('md5')
      .update(`${userId}-${notesCount}-${latestNote?.updatedAt || '0'}`)
      .digest('hex');

    // Browser cache check
    if (req.header('If-None-Match') === etag) {
      return res.status(304).end();
    }

    res.set('ETag', etag);
    res.set('Cache-Control', 'private, max-age=0, must-revalidate');

    const allNotes = await Note.find({ userId })
      .active()
      .sort({ pinned: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalNotes = await Note.countDocuments({ userId, deletedAt: null });
    const allFolders = await Folder.find({ userId });
    const trashedNotes = await Note.find({ userId, deletedAt: { $ne: null } }).select('clientId');
    const deletedNoteIds = trashedNotes.map(n => n.clientId);

    const cloudNotes = allNotes.map(n => ({
      id: n.clientId,
      title: n.title,
      content: n.content,
      folderId: n.folderId,
      tags: n.tags,
      pinned: n.pinned,
      theme: n.theme || 'default',
      isFullWidth: n.isFullWidth || false,
      updatedAt: n.clientUpdatedAt,
    }));

    const cloudFolders = allFolders.map(f => ({
      id: f.clientId,
      name: f.name,
      icon: f.icon
    }));

    res.json({
      notes: cloudNotes,
      folders: cloudFolders,
      deletedNoteIds,
      pagination: {
        page,
        limit,
        total: totalNotes,
        pages: Math.ceil(totalNotes / limit),
        hasMore: page < Math.ceil(totalNotes / limit)
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   POST api/sync
// @desc    Sync local notes/folders with cloud
// @access  Private
router.post('/', auth, validate('syncData'), async (req, res) => {
  const { notes, folders, deletedNoteIds = [], deletedFolderIds = [] } = req.body;
  const userId = req.user.id;

  // 🚀 INVALIDATE CACHE on push
  clearStatusCache(userId);

  // ✅ TRANSACTIONS: Use MongoDB session for atomic operations
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // =========================
    // FOLDERS: Batch Operations
    // =========================
    if (folders && Array.isArray(folders)) {
      const incomingClientIds = folders.map(f => f.id);

      // Fetch ALL existing folders at once (one query, not N queries)
      const existingFolders = await Folder.find({
        userId,
        clientId: { $in: incomingClientIds }
      }).session(session);

      // Create a map for O(1) lookup
      const existingMap = new Map(existingFolders.map(f => [f.clientId, f]));

      // Prepare bulk operations
      const bulkOps = [];
      const newFolders = [];

      for (const f of folders) {
        if (existingMap.has(f.id)) {
          const existing = existingMap.get(f.id);
          // Update existing folder
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: { name: f.name, icon: f.icon } }
            }
          });
        } else {
          // Collect new folders for batch insert
          newFolders.push({
            userId,
            clientId: f.id,
            name: f.name,
            icon: f.icon
          });
        }
      }

      // Execute bulk update (if any)
      if (bulkOps.length > 0) {
        await Folder.bulkWrite(bulkOps, { session });
      }

      // Insert all new folders in one batch (not N individual inserts)
      if (newFolders.length > 0) {
        await Folder.insertMany(newFolders, { session });
      }
    }

    // ✅ ROBUST: Delete folders regardless of incoming 'folders' array
    if (deletedFolderIds && deletedFolderIds.length > 0) {
      await Folder.deleteMany({
        userId,
        clientId: { $in: deletedFolderIds }
      }, { session });
    }

    // =======================
    // NOTES: Batch Operations
    // =======================
    if (notes && Array.isArray(notes)) {
      const incomingClientIds = notes.map(n => n.id);

      // Fetch ALL existing notes at once (one query, not N queries)
      const existingNotes = await Note.find({
        userId,
        clientId: { $in: incomingClientIds }
      }).session(session);

      // Create a map for O(1) lookup
      const existingMap = new Map(existingNotes.map(n => [n.clientId, n]));

      // Prepare bulk operations
      const bulkOps = [];
      const newNotes = [];

      for (const n of notes) {
        if (existingMap.has(n.id)) {
          const existing = existingMap.get(n.id);
          const clientDate = new Date(n.updatedAt);

          // Only update if client version is newer
          if (clientDate > existing.clientUpdatedAt) {
            bulkOps.push({
              updateOne: {
                filter: { _id: existing._id },
                update: {
                  $set: {
                    title: n.title,
                    content: n.content,
                    folderId: n.folderId,
                    tags: n.tags,
                    pinned: n.pinned,
                    theme: n.theme || 'default',
                    isFullWidth: n.isFullWidth || false,
                    clientUpdatedAt: clientDate
                  }
                }
              }
            });
          }
        } else {
          // Collect new notes for batch insert
          newNotes.push({
            userId,
            clientId: n.id,
            title: n.title,
            content: n.content,
            folderId: n.folderId,
            tags: n.tags,
            pinned: n.pinned,
            theme: n.theme || 'default',
            isFullWidth: n.isFullWidth || false,
            clientUpdatedAt: n.updatedAt
          });
        }
      }

      // Execute bulk update (if any)
      if (bulkOps.length > 0) {
        await Note.bulkWrite(bulkOps, { session });
      }

      // Insert all new notes in one batch (not N individual inserts)
      if (newNotes.length > 0) {
        await Note.insertMany(newNotes, { session });
      }
    }

    // ✅ ROBUST: Handle soft-deletions independently
    if (deletedNoteIds && deletedNoteIds.length > 0) {
      const now = new Date();
      await Note.updateMany(
        {
          userId,
          clientId: { $in: deletedNoteIds },
          deletedAt: null
        },
        { deletedAt: now },
        { session }
      );

      // ✅ AUDIT LOGGING: Log all deleted notes
      for (const clientId of deletedNoteIds) {
        await Audit.create([{
          userId,
          action: 'DELETE_NOTE',
          resourceId: clientId,
          resourceType: 'note',
          details: { clientId, deletedAt: now },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }], { session });
      }
    }

    // After push, fetch all active notes to return
    const allNotes = await Note.find({ userId }).active().session(session);
    const allFolders = await Folder.find({ userId }).session(session);

    // Map back to client format
    const cloudNotes = allNotes.map(n => ({
      id: n.clientId,
      title: n.title,
      content: n.content,
      folderId: n.folderId,
      tags: n.tags,
      pinned: n.pinned,
      updatedAt: n.clientUpdatedAt,
    }));

    const cloudFolders = allFolders.map(f => ({
      id: f.clientId,
      name: f.name,
      icon: f.icon
    }));

    res.json({ notes: cloudNotes, folders: cloudFolders });

    // ✅ TRANSACTIONS: Commit on success
    await session.commitTransaction();

  } catch (err) {
    // ✅ TRANSACTIONS: Abort on error
    await session.abortTransaction();
    logger.error('Sync operation failed', { error: err.message, userId });
    res.status(500).json({ msg: 'Sync failed, please try again' });
  } finally {
    // ✅ Always cleanup session
    await session.endSession();
  }
});

// @route   GET api/sync/trash
// @desc    Get deleted notes from trash
// @access  Private
router.get('/trash', auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const trashedNotes = await Note.find({ userId }).inTrash();

    const trashNotes = trashedNotes.map(n => ({
      id: n.clientId,
      title: n.title,
      content: n.content,
      folderId: n.folderId,
      tags: n.tags,
      pinned: n.pinned,
      updatedAt: n.clientUpdatedAt,
      deletedAt: n.deletedAt,
    }));

    res.json({ notes: trashNotes });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   POST api/sync/restore/:noteId
// @desc    Restore a note from trash
// @access  Private
router.post('/restore/:noteId', auth, async (req, res) => {
  const userId = req.user.id;
  const { noteId } = req.params;

  try {
    const note = await Note.findOne({ userId, clientId: noteId });

    if (!note) {
      return res.status(404).json({ msg: 'Note not found' });
    }

    if (note.deletedAt === null) {
      return res.status(400).json({ msg: 'Note is not in trash' });
    }

    // Restore the note
    note.deletedAt = null;
    await note.save();

    res.json({ msg: 'Note restored', note: {
      id: note.clientId,
      title: note.title,
      content: note.content,
      folderId: note.folderId,
      tags: note.tags,
      pinned: note.pinned,
      updatedAt: note.clientUpdatedAt,
    }});
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   DELETE api/sync/trash/:noteId
// @desc    Permanently delete a note from trash
// @access  Private
router.delete('/trash/:noteId', auth, async (req, res) => {
  const userId = req.user.id;
  const { noteId } = req.params;

  try {
    const note = await Note.findOne({ userId, clientId: noteId });

    if (!note) {
      return res.status(404).json({ msg: 'Note not found' });
    }

    await Note.deleteOne({ _id: note._id });
    res.json({ msg: 'Note permanently deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   POST api/sync/cleanup
// @desc    Permanently delete notes in trash for > 30 days
// @access  Private
router.post('/cleanup', auth, async (req, res) => {
  const userId = req.user.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const result = await Note.deleteMany({
      userId,
      deletedAt: { $exists: true, $ne: null, $lt: thirtyDaysAgo }
    });

    res.json({
      msg: `Cleaned up ${result.deletedCount} old deleted notes`,
      count: result.deletedCount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
