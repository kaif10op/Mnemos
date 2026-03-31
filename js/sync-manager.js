/* ============================================
   SYNC MANAGER — Smart Background Sync Without Re-renders
   ============================================ */

(function () {
  let lastSyncState = { notes: [], folders: [] };
  let pendingChanges = { notes: new Set(), folders: new Set() };
  let isSyncing = false;
  let syncTimer = null;
  const SYNC_DEBOUNCE = 5000; // 5 seconds between syncs

  window.SyncManager = {
    /**
     * Check if data has actually changed
     */
    hasChanges() {
      const currentNotes = window.Store.getAllNotes();
      const currentFolders = window.Store.getAllFolders();

      // Quick check: compare counts
      if (currentNotes.length !== lastSyncState.notes.length ||
          currentFolders.length !== lastSyncState.folders.length) {
        return true;
      }

      // Deep check: compare IDs and update times
      for (const note of currentNotes) {
        const lastNote = lastSyncState.notes.find(n => n.id === note.id);
        if (!lastNote || lastNote.updatedAt !== note.updatedAt) {
          return true;
        }
      }

      return false;
    },

    /**
     * Schedule background sync without re-rendering
     */
    scheduleBackgroundSync() {
      if (!window.Auth.getToken()) return;

      // Clear existing timer
      if (syncTimer) clearTimeout(syncTimer);

      // Schedule new sync
      const statusEl = document.getElementById('save-status-label');
      if (statusEl) statusEl.textContent = 'Syncing...';

      syncTimer = setTimeout(() => {
        this.performBackgroundSync();
      }, SYNC_DEBOUNCE);
    },

    /**
     * Perform background sync silently (no re-renders)
     */
    async performBackgroundSync() {
      if (isSyncing || !window.Auth.getToken()) return;

      isSyncing = true;
      const statusEl = document.getElementById('save-status-label');

      try {
        // Only sync if there are actual changes
        if (!this.hasChanges()) {
          if (statusEl) statusEl.textContent = 'Already synced';
          setTimeout(() => {
            if (statusEl) statusEl.textContent = '';
          }, 2000);
          return;
        }

        const token = window.Auth.getToken();
        const notes = window.Store.getAllNotes();
        const folders = window.Store.getAllFolders();

        // Perform sync with retry
        const res = await window.ErrorHandler.retryWithBackoff(
          () => window.ErrorHandler.fetchWithRetry(`${window.API_BASE_URL}/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ notes, folders })
          }),
          2
        );

        const data = await res.json();

        // ✅ SILENT UPDATE: Update data without triggering re-renders
        this.silentUpdateData(data);

        // Update sync state
        lastSyncState = {
          notes: JSON.parse(JSON.stringify(data.notes || [])),
          folders: JSON.parse(JSON.stringify(data.folders || []))
        };

        if (statusEl) statusEl.textContent = 'Saved & Synced';
        setTimeout(() => {
          if (statusEl) statusEl.textContent = '';
        }, 3000);
      } catch (err) {
        const errorInfo = window.ErrorHandler.handleNetworkError(err, 'Background Sync');
        if (statusEl) {
          statusEl.textContent = errorInfo.offline ? 'Offline' : 'Sync Failed';
        }
      } finally {
        isSyncing = false;
      }
    },

    /**
     * Silently update data without triggering re-renders
     */
    silentUpdateData(data) {
      const currentNotes = window.Store.getAllNotes();
      const currentFolders = window.Store.getAllFolders();
      const incomingNotes = data.notes || [];
      const incomingFolders = data.folders || [];

      // Update notes silently (localStorage only, no UI render)
      incomingNotes.forEach(incomingNote => {
        const existingIdx = currentNotes.findIndex(n => n.id === incomingNote.id);
        if (existingIdx === -1) {
          currentNotes.push(incomingNote);
        } else {
          // Only update if server has newer version
          if (new Date(incomingNote.updatedAt) > new Date(currentNotes[existingIdx].updatedAt)) {
            currentNotes[existingIdx] = { ...currentNotes[existingIdx], ...incomingNote };
          }
        }
      });

      // Update folders silently
      incomingFolders.forEach(incomingFolder => {
        const existingIdx = currentFolders.findIndex(f => f.id === incomingFolder.id);
        if (existingIdx === -1) {
          currentFolders.push(incomingFolder);
        } else {
          currentFolders[existingIdx] = { ...currentFolders[existingIdx], ...incomingFolder };
        }
      });

      // Save to localStorage WITHOUT triggering sync again
      localStorage.setItem('notesaver_notes', JSON.stringify(currentNotes));
      localStorage.setItem('notesaver_folders', JSON.stringify(currentFolders));
    },

    /**
     * Force a full refresh (used when user makes significant changes)
     */
    forceRefresh() {
      window.Sidebar.renderFolders();
      window.Sidebar.renderTags();
      window.NoteList.render();
    }
  };

  // Initialize sync state on load
  document.addEventListener('DOMContentLoaded', () => {
    if (window.Auth.getToken()) {
      lastSyncState = {
        notes: window.Store.getAllNotes(),
        folders: window.Store.getAllFolders()
      };
    }
  });
})();
