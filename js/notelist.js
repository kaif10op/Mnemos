/* ============================================
   NOTE LIST — Rendering Note Cards
   ============================================ */

(function () {
  // Data fingerprint to detect actual changes and skip unnecessary renders
  let _lastRenderFingerprint = '';

  window.NoteList = {
    init() {
      this._bindNewNote();
      this._bindSort();
      this.render();
    },

    /**
     * Full re-render of the notes list.
     * Uses fingerprinting to skip if data hasn't actually changed.
     * @param {boolean} force - Skip fingerprint check and force render
     */
    render(force = false) {
      const container = document.getElementById('notes-container');
      const emptyState = document.getElementById('notelist-empty');
      const countEl = document.getElementById('notelist-count');
      if (!container) return;

      const filter = window.Sidebar.getFilter();
      const tag = window.Sidebar.getActiveTag();
      const search = window.SearchManager.getQuery();

      const folderId = filter.type === 'folder' ? filter.id : '__all__';
      const notes = window.Store.getFilteredNotes({ folderId, tag, search });

      // Build a fingerprint from note IDs, titles, tags, pins, and update times
      const currentId = window.Editor.getCurrentId();
      const fingerprint = notes.map(n =>
        `${n.id}|${n.title}|${n.pinned}|${n.tags.join(',')}|${n.updatedAt}|${n.id === currentId}`
      ).join('::') + `__count:${notes.length}`;

      // Skip render if nothing meaningful changed
      if (!force && fingerprint === _lastRenderFingerprint) {
        return;
      }
      _lastRenderFingerprint = fingerprint;

      if (countEl) countEl.textContent = notes.length;

      if (notes.length === 0) {
        container.style.display = 'none';
        if (emptyState) {
          emptyState.style.display = 'flex';
          emptyState.innerHTML = this._getEmptyStateHtml(search, tag, filter);
        }
        return;
      }

      container.style.display = 'block';
      if (emptyState) emptyState.style.display = 'none';

      // Use smooth renderer instead of full innerHTML replacement
      window.Renderer.smartRender(container, notes, (note, idx) => {
        const title = note.title || 'Untitled Note';
        const preview = window.Store.stripHtml(note.content || '').substring(0, 100) || 'No content';
        const date = window.Store.formatDate(note.updatedAt);
        const tagDots = note.tags.slice(0, 4).map(t =>
          `<span class="note-card-tag" style="background: ${window.Store.getTagColor(t)}" title="${t}"></span>`
        ).join('');

        // Apply highlighting if searching
        const highlightedTitle = this._highlightText(this._escapeHtml(title), search);
        const highlightedPreview = this._highlightText(this._escapeHtml(preview), search);

        return `
          <div class="note-card ${note.id === currentId ? 'active' : ''}"
               data-note-id="${note.id}"
               data-render-key="${note.id}"
               style="animation-delay: ${idx * 30}ms">
            <div class="note-card-header">
              <span class="note-card-title">${highlightedTitle}</span>
              ${note.pinned ? '<span class="note-card-pin"><i class="ph-fill ph-push-pin" style="font-size:14px;fill:var(--accent-primary);"></i></span>' : ''}
            </div>
            <p class="note-card-preview">${highlightedPreview}</p>
            <div class="note-card-footer">
              <span class="note-card-date">${date}</span>
              <div class="note-card-tags">${tagDots}</div>
            </div>
          </div>
        `;
      }, {
        keyFn: (note) => note.id,
        debounce: 100,
        transition: true
      });

      // Delegate click handler (survives re-renders)
      if (!this._clickHandlerBound) {
        container.addEventListener('click', (e) => {
          const card = e.target.closest('.note-card');
          if (card) {
            const id = card.dataset.noteId;
            container.querySelectorAll('.note-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            window.Editor.open(id);
          }
        });

        // ✅ PRO: Predictive Prefetching (Hover)
        container.addEventListener('mouseover', (e) => {
          const card = e.target.closest('.note-card');
          if (card && !card._prefetched) {
            const id = card.dataset.noteId;
            const note = window.Store.getNote(id);
            if (note && note.content.includes('<img')) {
              this._prefetchAssets(note.content);
              card._prefetched = true;
            }
          }
        });
        
        this._clickHandlerBound = true;
      }

      window.AppIcons.render();
    },

    /**
     * Targeted update of a single note card in the DOM.
     * Avoids full list re-render for minor changes (title, content preview, date).
     */
    updateCard(noteId) {
      const container = document.getElementById('notes-container');
      if (!container) return;

      const card = container.querySelector(`[data-note-id="${noteId}"]`);
      if (!card) {
        // Card doesn't exist yet — need full render
        this.render(true);
        return;
      }

      const note = window.Store.getNote(noteId);
      if (!note) return;

      const currentId = window.Editor.getCurrentId();
      const title = note.title || 'Untitled Note';
      const preview = window.Store.stripHtml(note.content || '').substring(0, 100) || 'No content';
      const date = window.Store.formatDate(note.updatedAt);
      const tagDots = note.tags.slice(0, 4).map(t =>
        `<span class="note-card-tag" style="background: ${window.Store.getTagColor(t)}" title="${t}"></span>`
      ).join('');

      // Update individual elements in-place (no flash, no transition)
      const titleEl = card.querySelector('.note-card-title');
      const previewEl = card.querySelector('.note-card-preview');
      const dateEl = card.querySelector('.note-card-date');
      const tagsEl = card.querySelector('.note-card-tags');

      if (titleEl) titleEl.textContent = title;
      if (previewEl) previewEl.textContent = preview;
      if (dateEl) dateEl.textContent = date;
      if (tagsEl) tagsEl.innerHTML = tagDots;

      // Update active state
      card.classList.toggle('active', note.id === currentId);

      // Update pin indicator
      const existingPin = card.querySelector('.note-card-pin');
      if (note.pinned && !existingPin) {
        const header = card.querySelector('.note-card-header');
        if (header) {
          const pin = document.createElement('span');
          pin.className = 'note-card-pin';
          pin.innerHTML = '<i class="ph-fill ph-push-pin" style="font-size:14px;fill:var(--accent-primary);"></i>';
          header.appendChild(pin);
        }
      } else if (!note.pinned && existingPin) {
        existingPin.remove();
      }

      // Update the count
      const countEl = document.getElementById('notelist-count');
      if (countEl) {
        const filter = window.Sidebar.getFilter();
        const tag = window.Sidebar.getActiveTag();
        const search = window.SearchManager.getQuery();
        const folderId = filter.type === 'folder' ? filter.id : '__all__';
        const notes = window.Store.getFilteredNotes({ folderId, tag, search });
        countEl.textContent = notes.length;
      }

      // Invalidate fingerprint so next full render detects previously-missed changes
      _lastRenderFingerprint = '';
    },

    _bindNewNote() {
      const btn = document.getElementById('new-note-btn');
      if (btn) {
        btn.addEventListener('click', () => this.createNew());
      }
    },

    _bindSort() {
      const sortBar = document.querySelector('.notelist-sort');
      if (!sortBar) return;

      // Sync UI with current settings
      const currentSort = window.Store.getSettings().sortBy || 'newest';
      sortBar.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sort === currentSort);
      });

      sortBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.sort-btn');
        if (!btn) return;

        const sortBy = btn.dataset.sort;
        
        // Update UI
        sortBar.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update Store
        window.Store.saveSetting('sortBy', sortBy);

        // Force Re-render
        this.render(true);
      });
    },

    createNew() {
      // Require authentication to create notes
      if (!window.Auth.getToken()) {
        window.showToast('Please log in to create notes', 'warning');
        window.Auth._showAuthModal('login');
        return;
      }

      const filter = window.Sidebar.getFilter();
      const folderId = filter.type === 'folder' ? filter.id : null;
      const note = window.Store.createNote(folderId);
      this.render(true);
      window.Editor.open(note.id);
      window.Sidebar.renderFolders();

      // Focus title after a tick
      setTimeout(() => {
        document.getElementById('editor-title')?.focus();
      }, 100);

      window.showToast('✨ New note created', 'success');
    },

    _escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /**
     * Highlights search terms in the provided text.
     */
    _highlightText(text, query) {
      if (!query || !query.trim()) return text;
      const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${q})`, 'gi');
      return text.replace(regex, '<mark class="search-highlight">$1</mark>');
    },

    /**
     * Generates contextual empty state HTML.
     */
    _getEmptyStateHtml(search, tag, filter) {
      if (search) {
        return `
          <div class="empty-state-content">
            <i class="ph-duotone ph-magnifying-glass" style="font-size:48px; opacity:0.2; margin-bottom:16px;"></i>
            <h3>No matches found</h3>
            <p>No notes matching "${this._escapeHtml(search)}"</p>
          </div>
        `;
      }
      if (tag) {
        return `
          <div class="empty-state-content">
            <i class="ph-duotone ph-tag" style="font-size:48px; opacity:0.2; margin-bottom:16px;"></i>
            <h3>No notes tagged with #${tag}</h3>
            <p>Try selecting a different tag or creating a new note.</p>
          </div>
        `;
      }
      if (filter.type === 'folder') {
        return `
          <div class="empty-state-content">
            <i class="ph-duotone ph-folder-open" style="font-size:48px; opacity:0.2; margin-bottom:16px;"></i>
            <h3>This folder is empty</h3>
            <p>Ready to capture your next big idea?</p>
            <button class="btn btn-primary" onclick="window.NoteList.createNewNoteInFolder('${filter.id}')" style="margin-top:20px;">
              <i class="ph ph-plus"></i> Add Note
            </button>
          </div>
        `;
      }
      return `
        <div class="empty-state-content">
          <i class="ph-duotone ph-notebook" style="font-size:48px; opacity:0.2; margin-bottom:16px;"></i>
          <h3>No notes yet</h3>
          <p>Create your first note to get started</p>
          <button class="btn btn-primary" onclick="window.NoteList.createNewNoteInFolder()" style="margin-top:20px;">
            <i class="ph ph-plus"></i> Create Note
          </button>
        </div>
      `;
    },

    createNewNoteInFolder(folderId = null) {
      const note = window.Store.createNote(folderId);
      this.render(true);
      window.Editor.open(note.id);
    },

    /**
     * Predictive Asset Prefetching
     * Scans content for GridFS images and triggers background fetch
     */
    _prefetchAssets(content) {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(content)) !== null) {
        const url = match[1];
        if (url.includes('/api/sync/image/')) {
          const img = new Image();
          img.src = url; 
          console.log('☁️ Prefetching asset:', url.split('/').pop());
        }
      }
    }
  };
})();
