const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const cache = require('../utils/cache');

// @route   GET api/sync
// @desc    Fetch user's notes and folders from cloud
// @access  Private
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const allNotes = await Note.find({ userId });
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
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   POST api/sync
// @desc    Sync local notes/folders with cloud
// @access  Private
router.post('/', auth, async (req, res) => {
  const { notes, folders } = req.body;
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

      // Delete folders not in the sync payload (they were deleted on client)
      await Folder.deleteMany({
        userId,
        clientId: { $nin: incomingClientIds }
      });
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
            existing.clientUpdatedAt = clientDate;
            await existing.save();
          }
        }
      }

      // Delete notes not in the sync payload (they were deleted on client)
      await Note.deleteMany({
        userId,
        clientId: { $nin: incomingClientIds }
      });
    }

    // After push, fetch all to return
    const allNotes = await Note.find({ userId });
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

module.exports = router;
