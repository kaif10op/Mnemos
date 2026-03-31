/* ============================================
   PALETTE — Global Command Palette (Cmd+K)
   ============================================ */

(function () {
  let isVisible = false;
  let activeIndex = 0;
  let currentItems = [];

  const COMMANDS = [
    { type: 'command', title: 'Create New Note', id: 'new_note', icon: 'ph-plus', shortcut: 'Ctrl+N' },
    { type: 'command', title: 'Toggle Theme', id: 'toggle_theme', icon: 'ph-moon', shortcut: 'Ctrl+Shift+T' },
    { type: 'command', title: 'Export Notes', id: 'export_notes', icon: 'ph-upload-simple', shortcut: 'Ctrl+E' },
    { type: 'command', title: 'Show Keyboard Shortcuts', id: 'show_shortcuts', icon: 'ph-keyboard', shortcut: 'Ctrl+/' },
    { type: 'command', title: 'Sign In / Profile', id: 'profile', icon: 'ph-user-circle', shortcut: '' },
    
    // AI Commands
    { type: 'ai-action', title: '✨ Summarize Current Note', id: 'ai_summarize', icon: 'ph-magic-wand', action: 'summarize' },
    { type: 'ai-action', title: '✨ Extract Action Items', id: 'ai_actions', icon: 'ph-check-square-offset', action: 'actions' },
    { type: 'ai-action', title: '✨ Generate Study Flashcards', id: 'ai_flashcards', icon: 'ph-cards', action: 'flashcards' },
    { type: 'ai-action', title: '✨ Ask AI a Question', id: 'ai_ask', icon: 'ph-chat-circle-text', action: 'chat' },
  ];

  window.Palette = {
    init() {
      this._bindShortcut();
      this._bindOverlayEvents();
    },

    open() {
      if (isVisible) return;
      isVisible = true;
      const overlay = document.getElementById('palette-overlay');
      if (overlay) {
        overlay.classList.add('visible');
        const input = document.getElementById('palette-input');
        if (input) {
          input.value = '';
          input.focus();
          this._renderItems('');
        }
      }
    },

    close() {
      if (!isVisible) return;
      isVisible = false;
      const overlay = document.getElementById('palette-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        document.getElementById('palette-input')?.blur();
      }
    },

    _bindShortcut() {
      document.addEventListener('keydown', (e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        
        // Open Palette on Ctrl+K
        if (ctrl && e.key === 'k') {
          e.preventDefault();
          if (isVisible) this.close();
          else this.open();
        }

        if (!isVisible) return;

        // Palette Navigation
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._navigate(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._navigate(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this._executeActive();
        }
      });

      const input = document.getElementById('palette-input');
      if (input) {
        input.addEventListener('input', (e) => {
          this._renderItems(e.target.value);
        });
      }
    },

    _bindOverlayEvents() {
      const overlay = document.getElementById('palette-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.close();
        });
      }
    },

    _navigate(direction) {
      if (currentItems.length === 0) return;
      
      activeIndex += direction;
      if (activeIndex < 0) activeIndex = currentItems.length - 1;
      if (activeIndex >= currentItems.length) activeIndex = 0;

      this._updateActiveStyles();
      this._scrollToActive();
    },

    _updateActiveStyles() {
      const els = document.querySelectorAll('.palette-item');
      els.forEach((el, index) => {
        el.classList.toggle('active', index === activeIndex);
      });
    },

    _scrollToActive() {
      const activeEl = document.querySelector('.palette-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    },

    _executeActive() {
      if (currentItems.length === 0) return;
      const item = currentItems[activeIndex];
      this.close();

      if (item.type === 'command') {
        switch (item.id) {
          case 'new_note': window.NoteList.createNew(); break;
          case 'toggle_theme': window.ThemeManager.toggle(); break;
          case 'export_notes': window.Store.exportData(); break;
          case 'show_shortcuts': window.ShortcutManager._showShortcutsModal(); break;
          case 'profile': 
            const authBtn = document.getElementById('auth-btn');
            if (authBtn) authBtn.click();
            break;
        }
      } else if (item.type === 'ai-action') {
        if (window.AIPanel) {
          window.AIPanel.open();
          if (item.action === 'chat') {
            document.getElementById('ai-input')?.focus();
          } else {
            window.AIPanel._handleQuickAction(item.action);
          }
        }
      } else if (item.type === 'note') {
        window.Editor.open(item.noteId);
        
        // On mobile, force close sidebar if it's open when a note is selected via palette
        document.getElementById('app')?.classList.remove('sidebar-open');
        document.getElementById('sidebar-overlay')?.classList.remove('visible');
      } else if (item.type === 'tag') {
        window.Sidebar._setActiveFilter('tag-' + item.title);
        window.NoteList.render({ tag: item.title });
        
        // On mobile, close sidebar automatically
        document.getElementById('app')?.classList.remove('sidebar-open');
        document.getElementById('sidebar-overlay')?.classList.remove('visible');
      }
    },

    _renderItems(query) {
      const q = query.toLowerCase().trim();
      const container = document.getElementById('palette-results');
      if (!container) return;

      activeIndex = 0;
      currentItems = [];

      let html = '';

      // --- Filter Commands ---
      const cmds = COMMANDS.filter(c => c.title.toLowerCase().includes(q));
      if (cmds.length > 0) {
        html += `<div class="palette-section-title">Commands</div>`;
        cmds.forEach((cmd) => {
          currentItems.push(cmd);
          const i = currentItems.length - 1;
          html += this._createItemHtml(cmd, i);
        });
      }

      // --- Filter Tags (if query starts with # or if just searching) ---
      const allTags = window.Store.getAllTags();
      const tagQuery = q.startsWith('#') ? q.substring(1) : q;
      const filteredTags = allTags.filter(t => t.toLowerCase().includes(tagQuery));
      
      if (filteredTags.length > 0) {
        html += `<div class="palette-section-title">Tags</div>`;
        filteredTags.forEach(tag => {
          const item = { type: 'tag', title: tag, icon: 'ph-hash' };
          currentItems.push(item);
          html += this._createItemHtml(item, currentItems.length - 1);
        });
      }

      // --- Filter Notes ---
      const allNotes = window.Store.getAllNotes();
      const filteredNotes = allNotes.filter(n => 
        (n.title || '').toLowerCase().includes(q) || 
        window.Store.stripHtml(n.content || '').toLowerCase().includes(q)
      );

      if (filteredNotes.length > 0) {
        html += `<div class="palette-section-title">Notes</div>`;
        filteredNotes.forEach(note => {
          const folder = note.folderId ? window.Store.getAllFolders().find(f => f.id === note.folderId) : null;
          const subtitle = folder ? folder.name : 'Uncategorized';
          const item = { 
            type: 'note', 
            noteId: note.id, 
            title: note.title || 'Untitled Note', 
            icon: 'ph-file-text',
            subtitle: subtitle
          };
          currentItems.push(item);
          html += this._createItemHtml(item, currentItems.length - 1);
        });
      }

      if (currentItems.length === 0) {
        html = `<div class="palette-empty">No results found for "${query}"</div>`;
      }

      container.innerHTML = html;
      this._updateActiveStyles();

      // Bind click events on new elements
      const els = container.querySelectorAll('.palette-item');
      els.forEach((el, index) => {
        el.addEventListener('click', () => {
          activeIndex = index;
          this._executeActive();
        });
        el.addEventListener('mousemove', () => {
          if (activeIndex !== index) {
            activeIndex = index;
            this._updateActiveStyles();
          }
        });
      });
      
      // Update icons
      if (window.AppIcons) window.AppIcons.render();
    },

    _createItemHtml(item, index) {
      const activeClass = index === activeIndex ? 'active' : '';
      const shortcutHtml = item.shortcut ? `<kbd class="kbd" style="background: var(--bg-primary); border-color: var(--border-hover);">${item.shortcut}</kbd>` : '';
      const subtitleHtml = item.subtitle ? `<div class="palette-item-subtitle">${item.subtitle}</div>` : '';
      
      return `
        <div class="palette-item ${activeClass}" data-index="${index}">
          <div class="palette-item-left">
            <div class="palette-item-icon">
              <i class="ph-bold ${item.icon}"></i>
            </div>
            <div class="palette-item-text">
              <div class="palette-item-title">${item.title}</div>
              ${subtitleHtml}
            </div>
          </div>
          <div class="palette-item-right">
            ${shortcutHtml}
          </div>
        </div>
      `;
    }
  };
})();
