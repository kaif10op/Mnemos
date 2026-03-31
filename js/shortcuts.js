/* ============================================
   SHORTCUTS — Keyboard Shortcut Handler
   ============================================ */

(function () {
  window.ShortcutManager = {
    init() {
      document.addEventListener('keydown', (e) => {
        const ctrl = e.ctrlKey || e.metaKey;

        // Ctrl+N — New note
        if (ctrl && e.key === 'n') {
          e.preventDefault();
          window.NoteList.createNew();
        }

        // Ctrl+S — Force save
        if (ctrl && e.key === 's') {
          e.preventDefault();
          window.Editor._saveNow();
          window.showToast('💾 Note saved', 'success');
        }

        // Ctrl+F — Focus search
        if (ctrl && e.key === 'f') {
          e.preventDefault();
          document.getElementById('search-input')?.focus();
        }

        // Ctrl+\ — Toggle Sidebar
        if (ctrl && e.key === '\\') {
          e.preventDefault();
          document.getElementById('sidebar-toggle-btn')?.click();
        }

        // Ctrl+E — Export
        if (ctrl && e.key === 'e') {
          e.preventDefault();
          window.Store.exportData();
          window.showToast('📥 Notes exported', 'success');
        }

        // Ctrl+Shift+T — Toggle theme
        if (ctrl && e.shiftKey && e.key === 'T') {
          e.preventDefault();
          window.ThemeManager.toggle();
        }

        // Escape — Close editor on mobile
        if (e.key === 'Escape') {
          const editorPanel = document.querySelector('.editor-panel');
          if (editorPanel?.classList.contains('open')) {
            window.Editor.close();
          }
        }

        // Ctrl+/ — Show shortcuts
        if (ctrl && e.key === '/') {
          e.preventDefault();
          this._showShortcutsModal();
        }
      });
    },

    _showShortcutsModal() {
      const shortcuts = [
        ['Ctrl + N', 'New note'],
        ['Ctrl + S', 'Save note'],
        ['Ctrl + F', 'Search notes'],
        ['Ctrl + \\', 'Toggle sidebar'],
        ['Ctrl + E', 'Export notes'],
        ['Ctrl + Shift + T', 'Toggle theme'],
        ['Ctrl + /', 'Show shortcuts'],
        ['Esc', 'Close editor (mobile)'],
      ];

      const html = `
        <div style="text-align: center; margin-bottom: var(--space-xl);">
          <i class="ph-duotone ph-keyboard" style="font-size: 48px; color: var(--accent-primary);"></i>
        </div>
        <h3 style="text-align: center; margin-bottom: var(--space-lg);">Keyboard Shortcuts</h3>
        <div style="margin-top: var(--space-md);">
          ${shortcuts.map(([key, desc]) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) 12px; border-bottom: 1px solid var(--border-default);">
              <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">${desc}</span>
              <kbd class="kbd" style="background: var(--bg-tertiary); box-shadow: 0 2px 0 var(--border-default);">${key}</kbd>
            </div>
          `).join('')}
        </div>
      `;

      window.showModal(html);
    },
  };
})();
