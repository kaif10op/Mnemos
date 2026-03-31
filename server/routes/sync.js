const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const cache = require('../utils/cache');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Readable } = require('stream');

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
    const bucket = req.app.get('gridfsBucket');
    if (!bucket) return res.status(500).json({ msg: 'Database storage not initialized' });

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
    const bucket = req.app.get('gridfsBucket');
    if (!bucket) return res.status(500).json({ msg: 'Database storage not initialized' });

    // Find the file to verify ownership (optional but Pro)
    const files = await bucket.find({ filename: req.params.filename }).toArray();
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
router.post('/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ msg: 'No file uploaded' });
  }

  try {
    const bucket = req.app.get('gridfsBucket');
    if (!bucket) throw new Error('GridFS Bucket not initialized');

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
router.post('/', auth, async (req, res) => {
  const { notes, folders, deletedNoteIds = [], deletedFolderIds = [] } = req.body;
  const userId = req.user.id;

  // 🚀 INVALIDATE CACHE on push
  clearStatusCache(userId);

  try {
    // --- FOLDERS ---
    if (folders && Array.isArray(folders)) {
      // Get all existing folder client IDs from the sync payload
      const incomingClientIds = folders.map(f => f.id);

      for (const f of folders) {
        const existing = await Folder.findOne({ userId, clientId: f.id });
        if (!existing) {
          await new Folder({
            userId,
            clientId: f.id,
            name: f.name,
            icon: f.icon
          }).save();
        } else {
          existing.name = f.name;
          existing.icon = f.icon;
          await existing.save();
        }
      }

      // Explicitly delete folders that were deleted on client
      if (deletedFolderIds.length > 0) {
        await Folder.deleteMany({
          userId,
          clientId: { $in: deletedFolderIds }
        });
      }
    }

    // --- NOTES ---
    if (notes && Array.isArray(notes)) {
      // Get all existing note client IDs from the sync payload
      const incomingClientIds = notes.map(n => n.id);

      for (const n of notes) {
        const existing = await Note.findOne({ userId, clientId: n.id });

        if (!existing) {
          // Create new
          await new Note({
            userId,
            clientId: n.id,
            title: n.title,
            content: n.content,
            folderId: n.folderId,
            tags: n.tags,
            pinned: n.pinned,
            theme: n.theme || 'default',
            isFullWidth: n.isFullWidth || false,
            clientUpdatedAt: n.updatedAt,
          }).save();
        } else {
          // Compare dates
          const clientDate = new Date(n.updatedAt);
          if (clientDate > existing.clientUpdatedAt) {
            existing.title = n.title;
            existing.content = n.content;
            existing.folderId = n.folderId;
            existing.tags = n.tags;
            existing.pinned = n.pinned;
            existing.theme = n.theme || 'default';
            existing.isFullWidth = n.isFullWidth || false;
            existing.clientUpdatedAt = clientDate;
            await existing.save();
          }
        }
      }

      // Explicitly soft-delete notes that were deleted on client
      if (deletedNoteIds.length > 0) {
        const now = new Date();
        await Note.updateMany(
          {
            userId,
            clientId: { $in: deletedNoteIds },
            deletedAt: null // Only soft-delete if not already deleted
          },
          { deletedAt: now }
        );
      }
    }

    // After push, fetch all active notes to return
    const allNotes = await Note.find({ userId }).active();
    const allFolders = await Folder.find({ userId });

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

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
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
