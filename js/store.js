/* ============================================
   STORE — localStorage CRUD for Notes & Folders
   ============================================ */

const STORAGE_KEYS = {
  NOTES: 'notesaver_notes',
  FOLDERS: 'notesaver_folders',
  SETTINGS: 'notesaver_settings',
  DELETED_NOTES: 'notesaver_deleted_notes',
  DELETED_FOLDERS: 'notesaver_deleted_folders',
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

function getDeletedNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_NOTES) || '[]'); }
  catch { return []; }
}

function saveDeletedNotes(ids) {
  localStorage.setItem(STORAGE_KEYS.DELETED_NOTES, JSON.stringify(ids));
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
    theme: 'default',
    isFullWidth: false,
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

  // Track deletion for explicit cloud sync
  const deleted = getDeletedNotes();
  if (!deleted.includes(id)) {
    deleted.push(id);
    saveDeletedNotes(deleted);
  }
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

  // Apply user-selected sort (Always keeping Pinned first)
  const sortBy = getSettings().sortBy || 'newest';
  
  notes.sort((a, b) => {
    // Pinned always on top
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    
    switch (sortBy) {
      case 'oldest':
      case 'date_asc':
        return new Date(a.createdAt || a.updatedAt) - new Date(b.createdAt || b.updatedAt);
      case 'newest':
      case 'date_desc':
        return new Date(b.updatedAt) - new Date(a.updatedAt);
        
      case 'alpha':
      case 'alpha_asc':
      case 'a-z':
        return (a.title || '').localeCompare(b.title || '');
      case 'alpha_desc':
      case 'z-a':
        return (b.title || '').localeCompare(a.title || '');
        
      case 'length':
      case 'length_desc':
      case 'longest':
        return (b.content || '').length - (a.content || '').length;
      case 'length_asc':
      case 'shortest':
        return (a.content || '').length - (b.content || '').length;
        
      default:
        return new Date(b.updatedAt) - new Date(a.updatedAt); // newest
    }
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

function getDeletedFolders() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_FOLDERS) || '[]'); }
  catch { return []; }
}

function saveDeletedFolders(ids) {
  localStorage.setItem(STORAGE_KEYS.DELETED_FOLDERS, JSON.stringify(ids));
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

  // Track deletion for explicit cloud sync
  const deleted = getDeletedFolders();
  if (!deleted.includes(id)) {
    deleted.push(id);
    saveDeletedFolders(deleted);
  }
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
    // Capture current state fingerprint for comparison
    const beforeNotes = getAllNotes();
    const beforeFolders = getAllFolders();
    const beforeFingerprint = _buildDataFingerprint(beforeNotes, beforeFolders);

    // 🚀 CACHE GUARD: Check version hash first (Silent offline handling)
    let hash = null;
    try {
      const statusRes = await fetch(`${window.API_BASE_URL}/sync/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        hash = data.hash;
        const lastHash = localStorage.getItem('last_sync_hash');
        if (hash === lastHash) {
          console.log('☁️ Sync: Cache HIT (No server changes)');
          return;
        }
      }
    } catch (e) {
      console.log('☁️ Sync: Offline or server unreachable (skipping status check)');
      return; // Silent bypass — keep using local data
    }

    if (hash) localStorage.setItem('last_sync_hash', hash);

    // ✅ Use retry logic for resilience with ETag support
    const res = await window.ErrorHandler.retryWithBackoff(
      () => window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'If-None-Match': localStorage.getItem('last_sync_etag') || ''
        }
      }),
      2
    );

    if (res.status === 304) {
      console.log('☁️ Sync: 304 Not Modified (Payload skip)');
      return;
    }

    // Store new ETag
    const newEtag = res.headers.get('ETag');
    if (newEtag) localStorage.setItem('last_sync_etag', newEtag);

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

    // ✅ SILENT MERGE: Update data without wiping local offline changes
    const deletedNoteIds = getDeletedNotes();
    const deletedFolderIds = getDeletedFolders();
    const serverDeletedIds = data.deletedNoteIds || [];

    // Filter out notes deleted on the server
    let activeNotes = beforeNotes.filter(n => !serverDeletedIds.includes(n.id));

    // Add only new notes from cloud that we haven't deleted locally
    notes.forEach(incoming => {
      if (deletedNoteIds.includes(incoming.id)) return;

      const idx = activeNotes.findIndex(n => n.id === incoming.id);
      if (idx === -1) {
        activeNotes.push(incoming);
      } else if (new Date(incoming.updatedAt) > new Date(activeNotes[idx].updatedAt)) {
        activeNotes[idx] = { ...activeNotes[idx], ...incoming };
        // ✅ PRO SYNC: If this note is currently open, notify the editor
        if (window.Editor && typeof window.Editor.handleRemoteUpdate === 'function') {
          window.Editor.handleRemoteUpdate(incoming.id);
        }
      }
    });

    folders.forEach(incoming => {
      if (deletedFolderIds.includes(incoming.id)) return;

      const idx = beforeFolders.findIndex(f => f.id === incoming.id);
      if (idx === -1) {
        beforeFolders.push(incoming);
      } else {
        beforeFolders[idx] = { ...beforeFolders[idx], ...incoming };
      }
    });

    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(activeNotes));
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(beforeFolders));

    // Only re-render UI if data actually changed
    const afterFingerprint = _buildDataFingerprint(activeNotes, beforeFolders);
    if (afterFingerprint !== beforeFingerprint) {
      window.Sidebar.renderFolders();
      window.Sidebar.renderTags();
      window.NoteList.render(true);
    }
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
  const deletedNoteIds = getDeletedNotes();
  const deletedFolderIds = getDeletedFolders();
  const statusEl = document.getElementById('save-status-label');

  // Track initial state to detect if server returned new data that UI needs to render
  const beforeFingerprint = _buildDataFingerprint(notes, folders);

  try {
    // ✅ Use retry logic for resilience
    const res = await window.ErrorHandler.retryWithBackoff(
      () => window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ notes, folders, deletedNoteIds, deletedFolderIds })
      }),
      2 // Retry 2 times (3 total attempts)
    );

    const data = await res.json();

    // ✅ SUCCESS: Sync finished, wipe only the explicitly processed deleted queues
    const currentDeletedNotes = getDeletedNotes();
    saveDeletedNotes(currentDeletedNotes.filter(id => !deletedNoteIds.includes(id)));

    const currentDeletedFolders = getDeletedFolders();
    saveDeletedFolders(currentDeletedFolders.filter(id => !deletedFolderIds.includes(id)));

    // Merge any remote response seamlessly
    // ✅ SYNC OVERWRITE: For folders, the server's response is the absolute truth.
    // This prunes any folders that were deleted on other devices.
    const currentFolders = data.folders || [];
    
    // For notes, we merge based on updatedAt to avoid overwriting newer local changes
    let currentNotes = getAllNotes();
    const serverDeletedNoteIds = data.deletedNoteIds || [];

    // 1. Prune notes that the server says are deleted
    currentNotes = currentNotes.filter(n => !serverDeletedNoteIds.includes(n.id));

    // 2. Merge incoming updates
    (data.notes || []).forEach(incoming => {
      const idx = currentNotes.findIndex(n => n.id === incoming.id);
      if (idx === -1) {
        // Only add if it's not in our local deleted queue (safety)
        if (!getDeletedNotes().includes(incoming.id)) {
          currentNotes.push(incoming);
        }
      } else if (new Date(incoming.updatedAt) > new Date(currentNotes[idx].updatedAt)) {
        currentNotes[idx] = { ...currentNotes[idx], ...incoming };
      }
    });

    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(currentNotes));
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(currentFolders));

    // If the server gave us new data (like upon initial login), update the UI automatically
    const afterFingerprint = _buildDataFingerprint(currentNotes, currentFolders);
    if (afterFingerprint !== beforeFingerprint) {
      if (window.Sidebar) window.Sidebar.renderFolders();
      if (window.Sidebar) window.Sidebar.renderTags();
      if (window.NoteList) window.NoteList.render(true);
    }

    if (statusEl) statusEl.textContent = 'Saved & Synced';
    setTimeout(() => {
      if (statusEl) statusEl.textContent = '';
    }, 3000);
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
  getDeletedNotes, saveDeletedNotes,
  togglePin, getFilteredNotes, getAllTags, getTagColor,
  getAllFolders, saveAllFolders, createFolder, updateFolder, deleteFolder, getNotesCountByFolder,
  getDeletedFolders, saveDeletedFolders,
  getSettings, saveSetting,
  initSync, syncWithCloud, scheduleSync, fetchFromCloud,
  exportData, importData,
  stripHtml, formatDate, generateId,
  loadMoreNotes, // ✅ Pagination support
};

/* ── Sync Manager — Smart Background Control ── */

window.SyncManager = {
  _timer: null,
  _heartbeat: null,
  _isInitial: true,

  init() {
    this.startHeartbeat();
    this.bindEvents();
  },

  bindEvents() {
    // Sync immediately when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.scheduleBackgroundSync(500); // Quick refresh on focus
      }
    });
  },

  startHeartbeat() {
    if (this._heartbeat) clearInterval(this._heartbeat);
    // Polling interval: 30 seconds for Pro-level background parity
    this._heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible' && window.Auth.getToken()) {
        window.Store.fetchFromCloud();
      }
    }, 30000);
  },

  scheduleBackgroundSync(delay = 2000) {
    if (!window.Auth.getToken()) return;
    clearTimeout(this._timer);

    this._timer = setTimeout(async () => {
      await window.Store.syncWithCloud();
    }, delay);
  }
};

// Start the Pro Sync engine
window.SyncManager.init();

/* ── Data Fingerprint Helper ── */

function _buildDataFingerprint(notes, folders) {
  const notesPart = notes.map(n => `${n.id}:${n.updatedAt}:${n.theme}:${n.isFullWidth}`).sort().join(',');
  const foldersPart = folders.map(f => `${f.id}:${f.name}`).sort().join(',');
  return `N[${notesPart}]F[${foldersPart}]`;
}
