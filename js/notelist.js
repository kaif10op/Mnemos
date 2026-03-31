/* ============================================
   NOTE LIST — Rendering Note Cards
   ============================================ */

(function () {
  window.NoteList = {
    init() {
      this._bindNewNote();
      this.render();
    },

    render() {
      const container = document.getElementById('notes-container');
      const emptyState = document.getElementById('notelist-empty');
      const countEl = document.getElementById('notelist-count');
      if (!container) return;

      const filter = window.Sidebar.getFilter();
      const tag = window.Sidebar.getActiveTag();
      const search = window.SearchManager.getQuery();

      const folderId = filter.type === 'folder' ? filter.id : '__all__';
      const notes = window.Store.getFilteredNotes({ folderId, tag, search });

      if (countEl) countEl.textContent = notes.length;

      if (notes.length === 0) {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      container.style.display = 'block';
      if (emptyState) emptyState.style.display = 'none';

      const currentId = window.Editor.getCurrentId();

      container.innerHTML = notes.map((note, idx) => {
        const title = note.title || 'Untitled Note';
        const preview = window.Store.stripHtml(note.content || '').substring(0, 100) || 'No content';
        const date = window.Store.formatDate(note.updatedAt);
        const tagDots = note.tags.slice(0, 4).map(t =>
          `<span class="note-card-tag" style="background: ${window.Store.getTagColor(t)}" title="${t}"></span>`
        ).join('');

        return `
          <div class="note-card ${note.id === currentId ? 'active' : ''}"
               data-note-id="${note.id}"
               style="animation-delay: ${idx * 30}ms">
            <div class="note-card-header">
              <span class="note-card-title">${this._escapeHtml(title)}</span>
              ${note.pinned ? '<span class="note-card-pin">📌</span>' : ''}
            </div>
            <p class="note-card-preview">${this._escapeHtml(preview)}</p>
            <div class="note-card-footer">
              <span class="note-card-date">${date}</span>
              <div class="note-card-tags">${tagDots}</div>
            </div>
          </div>
        `;
      }).join('');

      // Bind clicks
      container.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.noteId;
          container.querySelectorAll('.note-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          window.Editor.open(id);
        });
      });
    },

    _bindNewNote() {
      const btn = document.getElementById('new-note-btn');
      if (btn) {
        btn.addEventListener('click', () => this.createNew());
      }
    },

    createNew() {
      const filter = window.Sidebar.getFilter();
      const folderId = filter.type === 'folder' ? filter.id : null;
      const note = window.Store.createNote(folderId);
      this.render();
      window.Editor.open(note.id);
      window.Sidebar.renderFolders();

      // Focus title after a tick
      setTimeout(() => {
        document.getElementById('editor-title')?.focus();
      }, 100);

      window.showToast('✨ New note created', 'success');
    },

    _escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
  };
})();
