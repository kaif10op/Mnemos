/* ============================================
   APP — Main Entry Point
   ============================================ */

(function () {
  // ── Toast System ──
  window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '✅',
      danger: '❌',
      info: 'ℹ️',
      warning: '⚠️',
    };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  };

  // ── Confirm Modal ──
  window.showConfirm = function (title, message, onConfirm) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    if (!overlay || !modal) return;

    modal.innerHTML = `
      <h3>${title}</h3>
      <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-lg);">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
        <button class="btn btn-danger" id="modal-confirm">Delete</button>
      </div>
    `;

    overlay.classList.add('visible');

    document.getElementById('modal-cancel').onclick = () => overlay.classList.remove('visible');
    document.getElementById('modal-confirm').onclick = () => {
      overlay.classList.remove('visible');
      onConfirm();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    };
  };

  // ── Generic Modal ──
  window.showModal = function (html) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    if (!overlay || !modal) return;

    modal.innerHTML = `
      ${html}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="modal-close-btn">Close</button>
      </div>
    `;

    overlay.classList.add('visible');

    document.getElementById('modal-close-btn').onclick = () => overlay.classList.remove('visible');
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    };
  };

  // ── Initialize Everything ──
  document.addEventListener('DOMContentLoaded', () => {
    window.ThemeManager.init();
    window.SearchManager.init();
    window.Sidebar.init();
    window.NoteList.init();
    window.Editor.init();
    window.ShortcutManager.init();

    // Seed demo notes if first visit
    if (window.Store.getAllNotes().length === 0) {
      seedDemoNotes();
      window.Sidebar.renderFolders();
      window.Sidebar.renderTags();
      window.NoteList.render();
    }
  });

  // ── Seed Demo Notes ──
  function seedDemoNotes() {
    const folders = window.Store.getAllFolders();

    const demoNotes = [
      {
        title: 'Welcome to Notes Saver ✨',
        content: `<h2>Your Personal Note-Taking Space</h2>
<p>Welcome! This is a powerful, beautiful note-taking application that runs entirely in your browser.</p>
<h3>Features you'll love:</h3>
<ul>
  <li><strong>Rich text editing</strong> — Bold, italic, headings, lists, and more</li>
  <li><strong>Folders</strong> — Organize your notes by category</li>
  <li><strong>Tags</strong> — Add tags for quick filtering</li>
  <li><strong>Search</strong> — Find any note instantly</li>
  <li><strong>Dark &amp; Light themes</strong> — Toggle in the sidebar</li>
  <li><strong>Keyboard shortcuts</strong> — Press <code>Ctrl+/</code> to see all shortcuts</li>
  <li><strong>Auto-save</strong> — Your notes are saved automatically</li>
  <li><strong>Import/Export</strong> — Back up and restore your notes</li>
</ul>
<blockquote>All your notes are stored locally in your browser. No account needed!</blockquote>`,
        folderId: folders[0]?.id || null,
        tags: ['welcome', 'guide'],
        pinned: true,
      },
      {
        title: 'Meeting Notes — Project Alpha',
        content: `<h3>Sprint Planning — March 2026</h3>
<p><strong>Attendees:</strong> Engineering team</p>
<p><strong>Key Decisions:</strong></p>
<ol>
  <li>Move to microservices architecture</li>
  <li>Implement CI/CD pipeline by end of sprint</li>
  <li>Allocate 20% time for tech debt</li>
</ol>
<h3>Action Items</h3>
<ul>
  <li>Set up Docker containers — <em>Due: April 3</em></li>
  <li>Write API documentation — <em>Due: April 5</em></li>
  <li>Review security audit results — <em>Due: April 7</em></li>
</ul>
<p>Next meeting: <strong>Monday 10 AM</strong></p>`,
        folderId: folders[1]?.id || null,
        tags: ['meeting', 'project'],
        pinned: false,
      },
      {
        title: 'App Ideas Brainstorm 💡',
        content: `<h2>Potential Side Projects</h2>
<p>Some ideas I've been thinking about:</p>
<ol>
  <li><strong>Habit Tracker</strong> — Minimalist daily habit tracker with streaks and analytics</li>
  <li><strong>Recipe Manager</strong> — Save, categorize, and search recipes with meal planning</li>
  <li><strong>Focus Timer</strong> — Pomodoro timer with ambient sounds and session tracking</li>
  <li><strong>Budget Dashboard</strong> — Visual expense tracking with charts and smart categories</li>
</ol>
<h3>Priority Criteria</h3>
<ul>
  <li>Can it be built in a weekend?</li>
  <li>Does it solve a real problem I have?</li>
  <li>Is there a unique design angle?</li>
</ul>
<p><em>Top pick: The habit tracker — simple concept, big impact.</em></p>`,
        folderId: folders[2]?.id || null,
        tags: ['ideas', 'brainstorm'],
        pinned: false,
      },
    ];

    demoNotes.forEach(demo => {
      const note = window.Store.createNote(demo.folderId);
      window.Store.updateNote(note.id, {
        title: demo.title,
        content: demo.content,
        tags: demo.tags,
        pinned: demo.pinned,
      });
    });
  }
})();
