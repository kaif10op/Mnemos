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
  // ✅ NEW: Use SyncManager for smart background sync (no re-renders)
  if (window.SyncManager && window.Auth.getToken()) {
    window.SyncManager.scheduleBackgroundSync();
  }
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
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveAllFolders(folders) {
  localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  // ✅ NEW: Use SyncManager for smart background sync (no re-renders)
  if (window.SyncManager && window.Auth.getToken()) {
    window.SyncManager.scheduleBackgroundSync();
  }
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

/* ── Async Sync ── */

let syncTimer = null;

function initSync() {
  // Only sync if logged in
  if (Auth.getToken()) {
    // First, FETCH notes from cloud on startup
    fetchFromCloud();
  }
}

async function fetchFromCloud() {
  const token = Auth.getToken();
  if (!token) return;

  try {
    // ✅ Use retry logic for resilience
    const res = await window.ErrorHandler.retryWithBackoff(
      () => window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      2 // Retry 2 times (3 total attempts)
    );

    const data = await res.json();
    let notes = data.notes || [];
    let folders = data.folders || [];

    // If new user (no notes or folders from cloud), seed defaults
    if (notes.length === 0 && folders.length === 0) {
      // Create default folders
      const defaultFolders = [
        { id: generateId(), name: 'Personal', icon: 'folder' },
        { id: generateId(), name: 'Work', icon: 'briefcase' },
        { id: generateId(), name: 'Ideas', icon: 'lightbulb' },
      ];

      folders = defaultFolders;

      // Create welcome note
      const welcomeNote = {
        id: generateId(),
        title: 'Welcome to Notes Saver ✨',
        content: `<h2>Your Personal Note-Taking Space</h2>
<p>Welcome! This is a powerful, beautiful note-taking application that syncs across devices.</p>
<h3>Features you'll love:</h3>
<ul>
  <li><strong>Rich text editing</strong> — Bold, italic, headings, lists, and more</li>
  <li><strong>Folders</strong> — Organize your notes by category</li>
  <li><strong>Tags</strong> — Add tags for quick filtering</li>
  <li><strong>Search</strong> — Find any note instantly</li>
  <li><strong>Dark &amp; Light themes</strong> — Toggle in the sidebar</li>
  <li><strong>Keyboard shortcuts</strong> — Press <code>Ctrl+/</code> to see all shortcuts</li>
  <li><strong>Auto-save</strong> — Your notes are saved automatically</li>
  <li><strong>Cloud Sync</strong> — Your notes are synced with the cloud!</li>
</ul>`,
        folderId: defaultFolders[0].id,
        tags: ['welcome', 'guide'],
        pinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      notes = [welcomeNote];

      // Save to local storage first
      saveAllNotes(notes);
      saveAllFolders(folders);

      // Then push new data to cloud
      await syncWithCloud();
      return; // UI will be refreshed by syncWithCloud
    }

    // Load cloud data into local storage (source of truth)
    saveAllNotes(notes);
    saveAllFolders(folders);

    // Refresh UI
    window.Sidebar.renderFolders();
    window.Sidebar.renderTags();
    window.NoteList.render();
  } catch (err) {
    window.ErrorHandler.handleNetworkError(err, 'Cloud Fetch');
  }
}

function scheduleSync() {
  if (!Auth.getToken()) return;
  clearTimeout(syncTimer);
  const statusEl = document.getElementById('save-status-label');
  if (statusEl) statusEl.textContent = 'Syncing...';
  syncTimer = setTimeout(() => syncWithCloud(), 2000); // Debounce sync
}

async function syncWithCloud() {
  const token = Auth.getToken();
  if (!token) return;

  const notes = getAllNotes();
  const folders = getAllFolders();
  const statusEl = document.getElementById('save-status-label');

  try {
    // ✅ Use retry logic for resilience
    const res = await window.ErrorHandler.retryWithBackoff(
      () => window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ notes, folders })
      }),
      2 // Retry 2 times (3 total attempts)
    );

    const data = await res.json();

    // Merge back cloud data (server is source of truth)
    saveAllNotes(data.notes || []);
    saveAllFolders(data.folders || []);

    // Refresh UI
    window.Sidebar.renderFolders();
    window.Sidebar.renderTags();
    window.NoteList.render();

    if (statusEl) statusEl.textContent = 'Saved & Synced';
  } catch (err) {
    const errorInfo = window.ErrorHandler.handleNetworkError(err, 'Cloud Sync');
    if (statusEl) {
      statusEl.textContent = errorInfo.offline ? 'Offline (Will sync later)' : 'Sync Failed';
    }
  }
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

/* ── Pagination ── */

let currentPage = 1;
let totalPages = 1;
let hasMore = false;
const NOTES_PER_PAGE = 50;

async function loadMoreNotes() {
  const token = Auth.getToken();
  if (!token || !hasMore) return;

  currentPage++;

  try {
    const res = await window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync?page=${currentPage}&limit=${NOTES_PER_PAGE}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    const notes = getAllNotes();

    // Append new notes
    const newNotes = data.notes.filter(n => !notes.some(existing => existing.id === n.id));
    notes.push(...newNotes);
    saveAllNotes(notes);

    // Update pagination state
    hasMore = data.pagination.hasMore;
    totalPages = data.pagination.pages;

    // Refresh UI
    window.NoteList.render();
    return { success: true, hasMore, loaded: newNotes.length };
  } catch (err) {
    console.error('Load more error:', err);
    return { success: false, hasMore: false };
  }
}

// Make store functions global
window.Store = {
  getAllNotes, saveAllNotes, createNote, getNote, updateNote, deleteNote,
  togglePin, getFilteredNotes, getAllTags, getTagColor,
  getAllFolders, saveAllFolders, createFolder, updateFolder, deleteFolder, getNotesCountByFolder,
  getSettings, saveSetting,
  initSync, syncWithCloud, scheduleSync, fetchFromCloud,
  exportData, importData,
  stripHtml, formatDate, generateId,
  loadMoreNotes, // ✅ NEW: Pagination support
};
