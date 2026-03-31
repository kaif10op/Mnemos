const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const cache = require('../utils/cache');

// @route   GET api/sync
// @desc    Fetch user's notes and folders from cloud (with pagination)
// @access  Private
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50); // Max 100 per page
  const skip = (page - 1) * limit;

  try {
    // ✅ FEATURE: Pagination with lazy loading
    const allNotes = await Note.find({ userId })
      .active()
      .sort({ pinned: -1, updatedAt: -1 }) // Pinned first, then by date
      .skip(skip)
      .limit(limit);

    const totalNotes = await Note.countDocuments({ userId, deletedAt: null });
    const allFolders = await Folder.find({ userId });

    // Extract soft-deleted IDs for offline sync resolution
    const trashedNotes = await Note.find({ userId, deletedAt: { $ne: null } }).select('clientId');
    const deletedNoteIds = trashedNotes.map(n => n.clientId);

    // Map back to client format
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
