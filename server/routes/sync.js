const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Folder = require('../models/Folder');
const cache = require('../utils/cache');

// @route   POST api/sync
// @desc    Sync local notes/folders with cloud
// @access  Private
router.post('/', auth, async (req, res) => {
  const { notes, folders } = req.body;
  const userId = req.user.id;

  try {
    // --- FOLDERS ---
    if (folders && Array.isArray(folders)) {
      for (const f of folders) {
        // Find existing folder
        const existing = await Folder.findOne({ userId, clientId: f.id });
        if (!existing) {
          // If it doesn't exist, ignore special IDs like __default__ since they are static
          if (!f.id.startsWith('__')) {
             await new Folder({
               userId,
               clientId: f.id,
               name: f.name,
               icon: f.icon
             }).save();
          }
        } else {
           // Update if needed
           existing.name = f.name;
           existing.icon = f.icon;
           await existing.save();
        }
      }
    }

    // --- NOTES ---
    if (notes && Array.isArray(notes)) {
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
    }

    // After push, check cache or fetch all to return
    let cloudNotes, cloudFolders;
    const cachedData = cache.get(`sync_${userId}`);

    if (cachedData && (!notes || notes.length === 0) && (!folders || folders.length === 0)) {
       // Only use cache if client didn't push any new changes (pure pull)
       cloudNotes = cachedData.notes;
       cloudFolders = cachedData.folders;
    } else {
       const allNotes = await Note.find({ userId });
       const allFolders = await Folder.find({ userId });

       // Map back to client format
       cloudNotes = allNotes.map(n => ({
         id: n.clientId,
         title: n.title,
         content: n.content,
         folderId: n.folderId,
         tags: n.tags,
         pinned: n.pinned,
         updatedAt: n.clientUpdatedAt,
       }));

       cloudFolders = allFolders.map(f => ({
         id: f.clientId,
         name: f.name,
         icon: f.icon
       }));

       // Set Cache
       cache.set(`sync_${userId}`, { notes: cloudNotes, folders: cloudFolders });
    }

    res.json({ notes: cloudNotes, folders: cloudFolders });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
