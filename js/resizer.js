/* ============================================
   RESIZER — Draggable Multi-column Dividers
   ============================================ */

(function () {
  const STORAGE_KEY = 'mnemos_layout_widths';
  const MIN_SIDEBAR = 180;
  const MAX_SIDEBAR = 450;
  const MIN_NOTELIST = 240;
  const MAX_NOTELIST = 600;

  window.Resizer = {
    init() {
      const app = document.getElementById('app');
      const sidebarResizer = document.getElementById('resizer-sidebar');
      const editorResizer = document.getElementById('resizer-editor');

      if (!app || !sidebarResizer || !editorResizer) return;

      // Load saved widths
      this._loadSavedWidths(app);

      // Bind events
      this._bindResizer(sidebarResizer, (e) => {
        const newWidth = Math.max(MIN_SIDEBAR, Math.min(e.clientX, MAX_SIDEBAR));
        app.style.setProperty('--sidebar-width', `${newWidth}px`);
        this._saveWidths(newWidth, null);
      });

      this._bindResizer(editorResizer, (e) => {
        // Get sidebar width to calculate relative offset
        const sbWidth = parseInt(getComputedStyle(app).getPropertyValue('--sidebar-width')) || 260;
        const resizerWidth = 4; // var(--resizer-width)
        
        // The notelist width is X - sidebarWidth - (divider widths)
        const newWidth = Math.max(MIN_NOTELIST, Math.min(e.clientX - sbWidth - resizerWidth, MAX_NOTELIST));
        app.style.setProperty('--notelist-width', `${newWidth}px`);
        this._saveWidths(null, newWidth);
      });
    },

    _bindResizer(resizer, onMove) {
      const app = document.getElementById('app');

      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        app.classList.add('resizing');
        resizer.classList.add('active');

        const moveHandler = (moveEvent) => {
          onMove(moveEvent);
        };

        const upHandler = () => {
          app.classList.remove('resizing');
          resizer.classList.remove('active');
          window.removeEventListener('mousemove', moveHandler);
          window.removeEventListener('mouseup', upHandler);
          
          // Trigger a resize event for components that might need it (like Mermaid)
          window.dispatchEvent(new Event('resize'));
        };

        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
      });
    },

    _saveWidths(sidebar, notelist) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (sidebar !== null) saved.sidebar = sidebar;
        if (notelist !== null) saved.notelist = notelist;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch (e) {
        console.error('Failed to save layout widths', e);
      }
    },

    _loadSavedWidths(app) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (saved.sidebar) {
          app.style.setProperty('--sidebar-width', `${saved.sidebar}px`);
        }
        if (saved.notelist) {
          app.style.setProperty('--notelist-width', `${saved.notelist}px`);
        }
      } catch (e) {
        console.warn('Failed to load layout widths', e);
      }
    }
  };

  // Auto-init on load
  document.addEventListener('DOMContentLoaded', () => {
    window.Resizer.init();
  });
})();
