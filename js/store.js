/* ============================================
   STORE — localStorage CRUD for Notes & Folders
   ============================================ */

const STORAGE_KEYS = {
  NOTES: 'notesaver_notes',
  FOLDERS: 'notesaver_folders',
  SETTINGS: 'notesaver_settings',
};

const TAG_COLORS = [
  '#7c5cfc', '#5ce0d6', '#ff6b9d', '#ffb84d', '#4ade80',
  '#f472b6', '#818cf8', '#fb923c', '#a78bfa', '#34d399',
  '#f87171', '#38bdf8', '#fbbf24', '#c084fc', '#22d3ee',
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getTagColor(tagName) {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/* ── Notes ── */

function getAllNotes() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.NOTES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveAllNotes(notes) {
  localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
}

function createNote(folderId = null) {
  const note = {
    id: generateId(),
    title: '',
    content: '',
    folderId: folderId,
    tags: [],
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const notes = getAllNotes();
  notes.unshift(note);
  saveAllNotes(notes);
  return note;
}

function getNote(id) {
  return getAllNotes().find(n => n.id === id) || null;
}

function updateNote(id, updates) {
  const notes = getAllNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return null;
  notes[idx] = { ...notes[idx], ...updates, updatedAt: new Date().toISOString() };
  saveAllNotes(notes);
  return notes[idx];
}

function deleteNote(id) {
  const notes = getAllNotes().filter(n => n.id !== id);
  saveAllNotes(notes);
}

function togglePin(id) {
  const notes = getAllNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return null;
  note.pinned = !note.pinned;
  note.updatedAt = new Date().toISOString();
  saveAllNotes(notes);
  return note;
}

function getFilteredNotes({ folderId = null, tag = null, search = '' } = {}) {
  let notes = getAllNotes();

  if (folderId !== null && folderId !== '__all__') {
    notes = notes.filter(n => n.folderId === folderId);
  }

  if (tag) {
    notes = notes.filter(n => n.tags.includes(tag));
  }

  if (search.trim()) {
    const q = search.toLowerCase().trim();
    notes = notes.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      stripHtml(n.content || '').toLowerCase().includes(q)
    );
  }

  // Pinned first, then by updatedAt
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return notes;
}

function getAllTags() {
  const notes = getAllNotes();
  const tagSet = new Set();
  notes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

/* ── Folders ── */

function getAllFolders() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FOLDERS);
    return data ? JSON.parse(data) : [
      { id: '__default__', name: 'Personal', icon: 'folder' },
      { id: '__work__', name: 'Work', icon: 'briefcase' },
      { id: '__ideas__', name: 'Ideas', icon: 'lightbulb' },
    ];
  } catch {
    return [];
  }
}

function saveAllFolders(folders) {
  localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
}

function createFolder(name, icon = 'folder') {
  const folder = { id: generateId(), name, icon };
  const folders = getAllFolders();
  folders.push(folder);
  saveAllFolders(folders);
  return folder;
}

function updateFolder(id, updates) {
  const folders = getAllFolders();
  const idx = folders.findIndex(f => f.id === id);
  if (idx === -1) return null;
  folders[idx] = { ...folders[idx], ...updates };
  saveAllFolders(folders);
  return folders[idx];
}

function deleteFolder(id) {
  const folders = getAllFolders().filter(f => f.id !== id);
  saveAllFolders(folders);
  // Move orphaned notes to no folder
  const notes = getAllNotes();
  notes.forEach(n => { if (n.folderId === id) n.folderId = null; });
  saveAllNotes(notes);
}

function getNotesCountByFolder(folderId) {
  return getAllNotes().filter(n => n.folderId === folderId).length;
}

/* ── Settings ── */

function getSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : { theme: 'dark', sortBy: 'updated' };
  } catch {
    return { theme: 'dark', sortBy: 'updated' };
  }
}

function saveSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

/* ── Import / Export ── */

function exportData() {
  const data = {
    notes: getAllNotes(),
    folders: getAllFolders(),
    settings: getSettings(),
    exportedAt: new Date().toISOString(),
    version: 1,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.folders) {
          const existingFolders = getAllFolders();
          const toAdd = data.folders.filter(f => !existingFolders.some(ex => ex.id === f.id));
          if (toAdd.length > 0) saveAllFolders([...existingFolders, ...toAdd]);
        }
        if (data.notes) {
          const existingNotes = getAllNotes();
          const toAdd = data.notes.filter(n => !existingNotes.some(ex => ex.id === n.id));
          if (toAdd.length > 0) saveAllNotes([...existingNotes, ...toAdd]);
        }
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ── Helpers ── */

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Make store functions global
window.Store = {
  getAllNotes, saveAllNotes, createNote, getNote, updateNote, deleteNote,
  togglePin, getFilteredNotes, getAllTags, getTagColor,
  getAllFolders, saveAllFolders, createFolder, updateFolder, deleteFolder, getNotesCountByFolder,
  getSettings, saveSetting,
  exportData, importData,
  stripHtml, formatDate, generateId,
};
