const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Note = require('../models/Note');
const Share = require('../models/Share');
const { validate } = require('../utils/validation');
const { logger } = require('../utils/logger');

// @route   POST api/share/:noteId
// @desc    Create a share link for a note (generate or get existing)
// @access  Private
router.post('/:noteId', auth, validate('shareNote'), async (req, res) => {
  const userId = req.user.id;
  const { noteId } = req.params;
  const { expiresIn, title, content, tags } = req.body; // Accept note data for auto-create

  try {
    // Verify the note belongs to the user
    let note = await Note.findOne({ userId, clientId: noteId });

    // If note not in DB yet (not synced), create it on the fly
    if (!note && (title !== undefined || content !== undefined)) {
      note = new Note({
        userId,
        clientId: noteId,
        title: title || '',
        content: content || '',
        tags: tags || [],
        folderId: null,
        pinned: false,
        clientUpdatedAt: new Date(),
      });
      await note.save();
    }

    if (!note) {
      return res.status(404).json({ msg: 'Note not found. Please sync your notes first.' });
    }

    // Check if share already exists
    let share = await Share.findOne({ userId, noteId: note._id });

    if (share) {
      return res.json({
        msg: 'Share already exists',
        token: share.token,
        url: `${req.protocol}://${req.get('host')}/shared.html?token=${share.token}`,
        expiresAt: share.expiresAt
      });
    }

    // Create new share
    const expiresAt = expiresIn ?
      new Date(Date.now() + parseDuration(expiresIn)) :
      null;

    share = new Share({
      userId,
      noteId: note._id,
      expiresAt
    });

    await share.save();

    res.json({
      msg: 'Share link created',
      token: share.token,
      url: `${req.protocol}://${req.get('host')}/shared.html?token=${share.token}`,
      expiresAt: share.expiresAt
    });
  } catch (err) {
    logger.error('Share creation failed', { error: err.message, userId, noteId });
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/share/:token
// @desc    Get a shared note (public endpoint, no auth required)
// @access  Public
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    // Find the share
    const share = await Share.findOne({ token });

    if (!share) {
      return res.status(404).json({ msg: 'Share not found or expired' });
    }

    // Check if expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(404).json({ msg: 'Share link has expired' });
    }

    // Get the note
    const note = await Note.findById(share.noteId);

    if (!note || note.deletedAt !== null) {
      return res.status(404).json({ msg: 'Note not found' });
    }

    // Update access stats
    share.views = (share.views || 0) + 1;
    share.lastAccessedAt = new Date();
    await share.save();

    // Return note without user details
    res.json({
      id: note.clientId,
      title: note.title,
      content: note.content,
      tags: note.tags,
      createdAt: note.createdAt,
      updatedAt: note.clientUpdatedAt,
      views: share.views,
      sharedAt: share.createdAt
    });
  } catch (err) {
    logger.error('Share retrieval failed', { error: err.message, token: req.params.token });
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/share/shares/list
// @desc    Get all shares for logged-in user
// @access  Private
router.get('/shares/list', auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const shares = await Share.find({ userId }).populate('noteId', 'title clientId');

    const sharesList = shares.map(s => ({
      token: s.token,
      noteId: s.noteId.clientId,
      noteTitle: s.noteId.title,
      url: `${req.protocol}://${req.get('host')}/shared.html?token=${s.token}`,
      expiresAt: s.expiresAt,
      views: s.views,
      lastAccessedAt: s.lastAccessedAt,
      createdAt: s.createdAt
    }));

    res.json({ shares: sharesList });
  } catch (err) {
    logger.error('Share list retrieval failed', { error: err.message, userId });
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   DELETE api/share/:token
// @desc    Revoke a share link
// @access  Private
router.delete('/:token', auth, async (req, res) => {
  const userId = req.user.id;
  const { token } = req.params;

  try {
    const share = await Share.findOne({ token, userId });

    if (!share) {
      return res.status(404).json({ msg: 'Share not found' });
    }

    await Share.deleteOne({ _id: share._id });
    res.json({ msg: 'Share revoked' });
  } catch (err) {
    logger.error('Share deletion failed', { error: err.message, userId, token });
    res.status(500).json({ msg: 'Server Error' });
  }
});

/**
 * Helper: Parse duration string (e.g., '7d' -> milliseconds)
 */
function parseDuration(str) {
  const match = str.match(/(\d+)([dhms])/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default: 7 days

  const [, num, unit] = match;
  const n = parseInt(num);

  switch (unit) {
    case 'd': return n * 24 * 60 * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'm': return n * 60 * 1000;
    case 's': return n * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

module.exports = router;
