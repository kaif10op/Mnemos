/* ============================================
   SIDEBAR — Folder & Tag Management
   ============================================ */

(function () {
  let activeFilter = { type: 'all', id: null };
  let activeTag = null;

  window.Sidebar = {
    init() {
      this.renderFolders();
      this.renderTags();
      this._bindNewFolder();
      this._bindImportExport();
      this._bindMobileMenu();
      this._bindAllNotes();

      // Set default active
      document.querySelector('.nav-item[data-filter="all"]')?.classList.add('active');
    },

    getFilter() {
      return activeFilter;
    },

    getActiveTag() {
      return activeTag;
    },

    renderFolders() {
      const container = document.getElementById('folders-list');
      if (!container) return;

      const folders = window.Store.getAllFolders();
      const allCount = window.Store.getAllNotes().length;

      container.innerHTML = `
        <div class="nav-item active" data-filter="all" id="nav-all-notes">
          <span class="nav-item-icon">📋</span>
          <span class="nav-item-label">All Notes</span>
          <span class="nav-item-count">${allCount}</span>
        </div>
        ${folders.map(f => `
          <div class="nav-item" data-filter="folder" data-folder-id="${f.id}">
            <span class="nav-item-icon">${f.icon}</span>
            <span class="nav-item-label">${f.name}</span>
            <span class="nav-item-count">${window.Store.getNotesCountByFolder(f.id)}</span>
            <div class="nav-item-actions">
              <button class="nav-item-action-btn folder-delete-btn" data-folder-id="${f.id}" title="Delete folder">🗑️</button>
            </div>
          </div>
        `).join('')}
      `;

      // Bind clicks
      container.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.folder-delete-btn')) return;

          container.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');

          const filter = item.dataset.filter;
          if (filter === 'all') {
            activeFilter = { type: 'all', id: null };
          } else {
            activeFilter = { type: 'folder', id: item.dataset.folderId };
          }
          activeTag = null;
          document.querySelectorAll('.tag-chip').forEach(t => t.classList.remove('active'));

          window.NoteList.render();
          this._closeMobileMenu();
        });
      });

      // Bind delete buttons
      container.querySelectorAll('.folder-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fid = btn.dataset.folderId;
          window.showConfirm('Delete folder?', 'Notes in this folder will be moved to uncategorized.', () => {
            window.Store.deleteFolder(fid);
            if (activeFilter.id === fid) {
              activeFilter = { type: 'all', id: null };
            }
            this.renderFolders();
            window.NoteList.render();
            window.showToast('📂 Folder deleted', 'info');
          });
        });
      });
    },

    renderTags() {
      const container = document.getElementById('tags-cloud');
      if (!container) return;

      const tags = window.Store.getAllTags();
      if (tags.length === 0) {
        container.innerHTML = '<span style="font-size: var(--font-size-xs); color: var(--text-tertiary); padding: 0 var(--space-lg);">No tags yet</span>';
        return;
      }

      container.innerHTML = tags.map(tag => `
        <span class="tag-chip ${activeTag === tag ? 'active' : ''}" data-tag="${tag}">
          <span class="tag-dot" style="background: ${window.Store.getTagColor(tag)}"></span>
          ${tag}
        </span>
      `).join('');

      container.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const tag = chip.dataset.tag;
          if (activeTag === tag) {
            activeTag = null;
            chip.classList.remove('active');
          } else {
            activeTag = tag;
            container.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
          }
          window.NoteList.render();
          this._closeMobileMenu();
        });
      });
    },

    _bindAllNotes() {
      // Already handled in renderFolders
    },

    _bindNewFolder() {
      const btn = document.getElementById('add-folder-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const name = prompt('Folder name:');
          if (name && name.trim()) {
            const icons = ['📂', '📁', '🗂️', '📚', '🏷️', '⭐', '🔖'];
            const icon = icons[Math.floor(Math.random() * icons.length)];
            window.Store.createFolder(name.trim(), icon);
            this.renderFolders();
            window.showToast('📂 Folder created', 'success');
          }
        });
      }
    },

    _bindImportExport() {
      const exportBtn = document.getElementById('export-btn');
      const importBtn = document.getElementById('import-btn');

      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          window.Store.exportData();
          window.showToast('📥 Notes exported', 'success');
        });
      }

      if (importBtn) {
        importBtn.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
              try {
                await window.Store.importData(file);
                this.renderFolders();
                this.renderTags();
                window.NoteList.render();
                window.Editor.close();
                window.showToast('📤 Notes imported successfully', 'success');
              } catch {
                window.showToast('❌ Invalid file format', 'danger');
              }
            }
          };
          input.click();
        });
      }
    },

    _bindMobileMenu() {
      const menuBtn = document.getElementById('mobile-menu-btn');
      const overlay = document.getElementById('sidebar-overlay');
      const sidebar = document.querySelector('.sidebar');

      if (menuBtn) {
        menuBtn.addEventListener('click', () => {
          sidebar?.classList.toggle('open');
          overlay?.classList.toggle('visible');
        });
      }

      if (overlay) {
        overlay.addEventListener('click', () => {
          this._closeMobileMenu();
        });
      }
    },

    _closeMobileMenu() {
      document.querySelector('.sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('visible');
    },
  };
})();
