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

      // Update "All Notes" count with smooth update
      let allNotesItem = document.querySelector('.nav-item[data-filter="all"]');
      if (allNotesItem) {
        const countEl = allNotesItem.querySelector('.nav-item-count');
        if (countEl) countEl.textContent = allCount;
      }

      // Use smooth renderer for folders
      window.Renderer.smartRender(container, folders, (folder) => {
        const iconName = ['folder', 'briefcase', 'lightbulb', 'star', 'tag', 'bookmark', 'book', 'layers', 'package'].includes(folder.icon) ? folder.icon : 'folder';
        return `
          <div class="nav-item" data-filter="folder" data-folder-id="${folder.id}" data-render-key="folder-${folder.id}">
            <span class="nav-item-icon"><i class="ph-duotone ph-${iconName}" style="font-size:16px;"></i></span>
            <span class="nav-item-label">${this._escapeHtml(folder.name)}</span>
            <span class="nav-item-count">${window.Store.getNotesCountByFolder(folder.id)}</span>
            <div class="nav-item-actions">
              <button class="nav-item-action-btn folder-delete-btn" data-folder-id="${folder.id}" title="Delete folder" aria-label="Delete folder">
                <i class="ph-bold ph-trash" style="font-size:14px;"></i>
              </button>
            </div>
          </div>
        `;
      }, {
        keyFn: (f) => f.id,
        debounce: 100,
        transition: true
      });

      // Use event delegation for folder clicks (survives re-renders)
      if (!this._folderClickBound) {
        container.addEventListener('click', (e) => {
          const deleteBtn = e.target.closest('.folder-delete-btn');
          if (deleteBtn) {
            e.stopPropagation();
            const fid = deleteBtn.dataset.folderId;
            window.showConfirm('Delete folder?', 'Notes in this folder will be moved to uncategorized.', () => {
              window.Store.deleteFolder(fid);
              if (activeFilter.id === fid) {
                activeFilter = { type: 'all', id: null };
              }
              this.renderFolders();
              window.NoteList.render();
              window.showToast('Folder deleted', 'info');
            });
            return;
          }

          const item = e.target.closest('.nav-item');
          if (item) {
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
          }
        });
        this._folderClickBound = true;
      }

      window.AppIcons.render();
    },

    renderTags() {
      const container = document.getElementById('tags-cloud');
      if (!container) return;

      const tags = window.Store.getAllTags();
      if (tags.length === 0) {
        container.innerHTML = '<span style="font-size: var(--font-size-xs); color: var(--text-tertiary); padding: 0 var(--space-lg);">No tags yet</span>';
        return;
      }

      // Use smooth renderer for tags
      window.Renderer.smartRender(container, tags, (tag) => `
        <span class="tag-chip ${activeTag === tag ? 'active' : ''}" data-tag="${tag}" data-render-key="tag-${tag}">
          <span class="tag-dot" style="background: ${window.Store.getTagColor(tag)}"></span>
          ${tag}
        </span>
      `, {
        keyFn: (tag) => tag,
        debounce: 100,
        transition: true
      });

      // Use event delegation for tag clicks (survives re-renders)
      if (!this._tagClickBound) {
        container.addEventListener('click', (e) => {
          const chip = e.target.closest('.tag-chip');
          if (chip) {
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
          }
        });
        this._tagClickBound = true;
      }

      window.AppIcons.render();
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
            const icons = ['folder', 'briefcase', 'book', 'layers', 'package', 'star', 'bookmark'];
            const icon = icons[Math.floor(Math.random() * icons.length)];
            window.Store.createFolder(name.trim(), icon);
            this.renderFolders();
            window.showToast('Folder created', 'success');
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

    _escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
