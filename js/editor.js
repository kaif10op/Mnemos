/* ============================================
   EDITOR — Rich Text Editing Logic
   ============================================ */

(function () {
  let currentNoteId = null;
  let saveTimer = null;
  let isSaved = true;

  window.Editor = {
    init() {
      this._bindToolbar();
      this._bindTitleInput();
      this._bindTagInput();
      this._bindBody();
      this._bindActions();
      this._initInteractions();
      this._initImageManager();
    },

    _initInteractions() {
      // 🫧 Floating Bubble
      document.addEventListener('selectionchange', () => this._handleSelectionChange());

      // ⌨️ Slash Menu Navigation
      document.addEventListener('keydown', (e) => {
        if (this._slashVisible) {
          if (e.key === 'ArrowDown') { e.preventDefault(); this._moveSlashSelection(1); }
          if (e.key === 'ArrowUp') { e.preventDefault(); this._moveSlashSelection(-1); }
          if (e.key === 'Enter') { e.preventDefault(); this._selectSlashItem(); }
          if (e.key === 'Escape') { this._hideSlashMenu(); }
        }
      });

      // Close menus on click outside
      document.addEventListener('mousedown', (e) => {
        if (this._slashVisible && !document.getElementById('slash-menu').contains(e.target)) {
          this._hideSlashMenu();
        }
      });
    },

    open(noteId, skipHash = false) {
      currentNoteId = noteId;
      const note = window.Store.getNote(noteId);
      if (!note) return;

      // ✅ URL Persistence: Update hash
      if (!skipHash) {
        window.location.hash = `#note-${noteId}`;
      }

      // Show editor, hide empty state
      document.getElementById('editor-active').style.display = 'flex';
      document.getElementById('editor-empty-state').style.display = 'none';

      // ✅ NEW: Apply Note-Specific Theme & Layout
      const panel = document.querySelector('.editor-panel');
      if (panel) {
        panel.setAttribute('data-note-theme', note.theme || 'default');
        panel.classList.toggle('full-width', !!note.isFullWidth);
      }

      // Fill fields - ✅ SECURITY: Sanitize HTML content
      document.getElementById('editor-title').value = note.title || '';
      
      // ✅ IMAGE REPAIR: Prepend backend origin if it's a relative /uploads path
      let content = note.content || '';
      const baseUrl = window.API_BASE_URL.replace('/api', '');
      if (content.includes('src="/uploads/')) {
        content = content.replaceAll('src="/uploads/', `src="${baseUrl}/uploads/`);
      }

      document.getElementById('editor-body').innerHTML = DOMPurify.sanitize(content);
      this._renderTags(note.tags);
      this._updatePinButton(note.pinned);
      this._updateStats();
      this._setSaved(true);

      // Mobile: open editor panel
      document.querySelector('.editor-panel')?.classList.add('open');
    },

    close() {
      this._saveNow();
      currentNoteId = null;
      document.getElementById('editor-active').style.display = 'none';
      document.getElementById('editor-empty-state').style.display = 'flex';
      document.querySelector('.editor-panel')?.classList.remove('open');
    },

    getCurrentId() {
      return currentNoteId;
    },

    // ✅ PRO SYNC: Called by Store when a remote update for this note arrives
    handleRemoteUpdate(id) {
      if (id === currentNoteId && isSaved) {
        const note = window.Store.getNote(id);
        if (note) {
          // Update title and body quietly if no unsaved changes
          const titleEl = document.getElementById('editor-title');
          const bodyEl = document.getElementById('editor-body');
          
          if (titleEl && titleEl.value !== note.title) titleEl.value = note.title;
          
          // Only update body if content changed to avoid cursor jump
          let content = note.content || '';
          const baseUrl = window.API_BASE_URL.replace('/api', '');
          if (content.includes('src="/uploads/')) {
            content = content.replaceAll('src="/uploads/', `src="${baseUrl}/uploads/`);
          }
          
          const sanitized = DOMPurify.sanitize(content);
          if (bodyEl && bodyEl.innerHTML !== sanitized) {
            bodyEl.innerHTML = sanitized;
            this._updateStats();
          }
          
          this._renderTags(note.tags);
          this._updatePinButton(note.pinned);
          
          // Theme/Layout
          const panel = document.querySelector('.editor-panel');
          if (panel) {
            panel.setAttribute('data-note-theme', note.theme || 'default');
            panel.classList.toggle('full-width', !!note.isFullWidth);
          }
        }
      }
    },

    _bindToolbar() {
      document.querySelectorAll('[data-command]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;

          if (cmd === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand(cmd, false, url);
          } else {
            document.execCommand(cmd, false, val);
          }

          this._updateToolbarState();
          this._scheduleAutoSave();
          document.getElementById('editor-body').focus();
        });
      });

      // Heading select
      const headingSelect = document.getElementById('heading-select');
      if (headingSelect) {
        headingSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val) {
            document.execCommand('formatBlock', false, val);
            this._scheduleAutoSave();
          }
          e.target.value = '';
          document.getElementById('editor-body').focus();
        });
      }

      // 🎨 Color Pickers
      const textColorBtn = document.getElementById('text-color-btn');
      const textColorInput = document.getElementById('text-color-input');
      if (textColorBtn && textColorInput) {
        textColorBtn.addEventListener('click', () => textColorInput.click());
        textColorInput.addEventListener('input', (e) => {
          document.execCommand('foreColor', false, e.target.value);
          this._scheduleAutoSave();
        });
      }

      const bgColorBtn = document.getElementById('bg-color-btn');
      const bgColorInput = document.getElementById('bg-color-input');
      if (bgColorBtn && bgColorInput) {
        bgColorBtn.addEventListener('click', () => bgColorInput.click());
        bgColorInput.addEventListener('input', (e) => {
          document.execCommand('hiliteColor', false, e.target.value);
          this._scheduleAutoSave();
        });
      }

      // 📊 Table Insertion
      const tableBtn = document.getElementById('insert-table-btn');
      if (tableBtn) {
        tableBtn.addEventListener('click', () => {
          const rows = prompt('Number of rows:', '3') || 3;
          const cols = prompt('Number of columns:', '3') || 3;
          this._insertTable(parseInt(rows), parseInt(cols));
        });
      }

      // Image upload
      const insertImgBtn = document.getElementById('insert-image-btn');
      const imgInput = document.getElementById('image-upload-input');
      if (insertImgBtn && imgInput) {
        insertImgBtn.addEventListener('click', () => imgInput.click());
        imgInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (file) {
            try {
              const formData = new FormData();
              formData.append('image', file);
              
              const token = window.Auth.getToken();
              const res = await fetch(`${window.API_BASE_URL}/sync/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
              });
              
              if (!res.ok) throw new Error('Upload failed');
              const data = await res.json();
              
              // ✅ FIXED: Standardized absolute path for images
              const baseUrl = window.API_BASE_URL.replace('/api', '');
              const fullUrl = `${baseUrl}${data.url}`;
              
              document.execCommand('insertImage', false, fullUrl);
              this._scheduleAutoSave();
              window.showToast('🖼️ Image uploaded successfully', 'success');
            } catch (err) {
              window.showToast('Upload failed: ' + err.message, 'danger');
            }
          }
          imgInput.value = '';
        });
      }
    },

    _bindTitleInput() {
      const titleInput = document.getElementById('editor-title');
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          this._scheduleAutoSave();
        });
      }
    },

    _bindTagInput() {
      const tagInput = document.getElementById('tag-input');
      if (tagInput) {
        tagInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = tagInput.value.trim().replace(/,/g, '');
            if (val && currentNoteId) {
              const note = window.Store.getNote(currentNoteId);
              if (note && !note.tags.includes(val)) {
                note.tags.push(val);
                window.Store.updateNote(currentNoteId, { tags: note.tags });
                this._renderTags(note.tags);
                window.Sidebar.renderTags();
                window.NoteList.updateCard(currentNoteId);
              }
            }
            tagInput.value = '';
          } else if (e.key === 'Backspace' && !tagInput.value) {
            // Remove last tag
            const note = window.Store.getNote(currentNoteId);
            if (note && note.tags.length) {
              note.tags.pop();
              window.Store.updateNote(currentNoteId, { tags: note.tags });
              this._renderTags(note.tags);
              window.Sidebar.renderTags();
              window.NoteList.updateCard(currentNoteId);
            }
          }
        });
      }
    },

    _bindBody() {
      const body = document.getElementById('editor-body');
      if (body) {
        body.addEventListener('input', (e) => {
          this._scheduleAutoSave();
          this._updateStats();
          this._handleSlashTrigger(e);
        });

        body.addEventListener('keydown', (e) => {
          // Tab to indent properly in lists
          if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
              document.execCommand('outdent', false, null);
            } else {
              document.execCommand('indent', false, null);
            }
            this._scheduleAutoSave();
          }
        });

        // Handle Markdown shortcuts on Space or Enter
        body.addEventListener('keyup', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            this._handleMarkdownShortcuts(e);
          }
          this._updateToolbarState();
        });

        body.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.originalEvent || e).clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          this._scheduleAutoSave();
        });

        body.addEventListener('mouseup', () => this._updateToolbarState());

        // ✅ Image Selection Handling
        body.addEventListener('click', (e) => {
          if (e.target.tagName === 'IMG') {
            this._handleImageClick(e.target);
          } else {
            this._hideImageToolbar();
          }
        });
      }
    },

    _bindActions() {
      // Copy button
      const copyBtn = document.getElementById('copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          const note = window.Store.getNote(currentNoteId);
          const content = document.getElementById('editor-body').innerText || '';
          const textToCopy = (note.title ? note.title + '\n\n' : '') + content;
          navigator.clipboard.writeText(textToCopy).then(() => {
            window.showToast('📋 Copied to clipboard', 'success');
          });
        });
      }

      // ✅ NEW: Share button - Create shareable link
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          const note = window.Store.getNote(currentNoteId);
          if (window.Auth.getToken()) {
            this._showShareModal(currentNoteId, note.title);
          } else {
            window.showToast('Please log in to share notes', 'warning');
          }
        });
      }

      // Pin button
      const pinBtn = document.getElementById('pin-btn');
      if (pinBtn) {
        pinBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          const note = window.Store.togglePin(currentNoteId);
          if (note) {
            this._updatePinButton(note.pinned);
            window.NoteList.render();
            window.showToast(note.pinned ? '📌 Note pinned' : 'Note unpinned', 'info');
          }
        });
      }

      // Delete button
      const deleteBtn = document.getElementById('delete-note-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          window.showConfirm('Delete this note?', 'This action cannot be undone.', () => {
            window.Store.deleteNote(currentNoteId);
            this.close();
            window.NoteList.render();
            window.Sidebar.renderFolders();
            window.Sidebar.renderTags();
            window.showToast('🗑️ Note deleted', 'danger');
          });
        });
      }

      // ↔️ Full Width Toggle
      const fullWidthBtn = document.getElementById('full-width-btn');
      if (fullWidthBtn) {
        fullWidthBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          const panel = document.querySelector('.editor-panel');
          const isFull = panel.classList.toggle('full-width');
          window.Store.updateNote(currentNoteId, { isFullWidth: isFull });
          window.showToast(isFull ? 'Layout expanded' : 'Focus mode active', 'info');
        });
      }

      // 🌈 Theme Picker
      const themeBtn = document.getElementById('theme-picker-btn');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          this._showThemePicker();
        });
      }

      // Mobile back
      const backBtn = document.getElementById('mobile-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.close();
        });
      }

      // Bubble buttons
      document.querySelectorAll('.bubble-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;
          if (cmd === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand(cmd, false, url);
          } else {
            document.execCommand(cmd, false, val);
          }
          this._scheduleAutoSave();
          this._updateToolbarState();
        });
      });
    },

    /* ── Pro Interaction Controllers ── */

    _handleSelectionChange() {
      const selection = window.getSelection();
      const bubble = document.getElementById('floating-bubble');
      
      if (!selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const body = document.getElementById('editor-body');
        
        if (body.contains(range.commonAncestorContainer)) {
          const rect = range.getBoundingClientRect();
          bubble.style.display = 'flex';
          bubble.style.left = `${rect.left + rect.width / 2}px`;
          bubble.style.top = `${rect.top + window.scrollY}px`;
          return;
        }
      }
      bubble.style.display = 'none';
    },

    _handleSlashTrigger(e) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const text = range.startContainer.textContent || '';
      const offset = range.startOffset;
      const lastChar = text[offset - 1];

      if (lastChar === '/') {
        this._showSlashMenu(range);
      } else if (this._slashVisible) {
        // Simple search logic could go here
      }
    },

    _showSlashMenu(range) {
      const menu = document.getElementById('slash-menu');
      const rect = range.getBoundingClientRect();

      this._slashVisible = true;
      this._slashIndex = 0;
      this._slashRange = range.cloneRange();

      menu.style.display = 'block';
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.top + 24 + window.scrollY}px`;

      this._renderSlashItems();
    },

    _renderSlashItems() {
      const commands = [
        { id: 'h1', name: 'Heading 1', desc: 'Big section heading', icon: 'ph-text-h-one' },
        { id: 'h2', name: 'Heading 2', desc: 'Medium section heading', icon: 'ph-text-h-two' },
        { id: 'callout', name: 'Callout', desc: 'Info box for key notes', icon: 'ph-info' },
        { id: 'table', name: 'Table', desc: '3x3 Data grid', icon: 'ph-table' },
        { id: 'divider', name: 'Divider', desc: 'Visual separator', icon: 'ph-minus' },
      ];

      const container = document.getElementById('slash-menu-items');
      container.innerHTML = commands.map((c, i) => `
        <div class="slash-item ${i === this._slashIndex ? 'selected' : ''}" data-cmd="${c.id}">
          <div class="slash-item-icon"><i class="ph-bold ${c.icon}"></i></div>
          <div class="slash-item-content">
            <div class="slash-item-name">${c.name}</div>
            <div class="slash-item-desc">${c.desc}</div>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.slash-item').forEach((el, i) => {
        el.onmousedown = (e) => {
          e.preventDefault();
          this._slashIndex = i;
          this._selectSlashItem();
        };
      });
    },

    _moveSlashSelection(dir) {
      const items = document.querySelectorAll('.slash-item');
      if (!items.length) return;
      this._slashIndex = (this._slashIndex + dir + items.length) % items.length;
      this._renderSlashItems();
    },

    _selectSlashItem() {
      const commands = ['h1', 'h2', 'callout', 'table', 'divider'];
      const cmd = commands[this._slashIndex];
      this._hideSlashMenu();
      
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._slashRange);
      document.execCommand('delete', false);
      
      this._executeSlashCommand(cmd);
    },

    _executeSlashCommand(cmd) {
      if (cmd === 'h1' || cmd === 'h2') {
        document.execCommand('formatBlock', false, cmd);
      } else if (cmd === 'divider') {
        document.execCommand('insertHorizontalRule');
      } else if (cmd === 'table') {
        this._insertTable(3, 3);
      } else if (cmd === 'callout') {
        const html = `
          <div class="pro-callout" contenteditable="false">
            <div class="pro-callout-icon"><i class="ph-fill ph-info"></i></div>
            <div class="pro-callout-content" contenteditable="true">Write your important note here...</div>
          </div><p>&nbsp;</p>
        `;
        document.execCommand('insertHTML', false, html);
      }
      this._scheduleAutoSave();
    },

    _hideSlashMenu() {
      this._slashVisible = false;
      const menu = document.getElementById('slash-menu');
      if (menu) menu.style.display = 'none';
    },

    /* ── Core Editor Helpers ── */

    _scheduleAutoSave() {
      this._setSaved(false);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => this._saveNow(), 800);
    },

    _saveNow() {
      if (!currentNoteId) return;
      const title = document.getElementById('editor-title')?.value || '';
      const content = document.getElementById('editor-body')?.innerHTML || '';
      window.Store.updateNote(currentNoteId, { title, content });
      this._setSaved(true);
      window.NoteList.updateCard(currentNoteId);
    },

    _setSaved(saved) {
      isSaved = saved;
      const dot = document.querySelector('.save-dot');
      const label = document.getElementById('save-status-label');
      if (dot) dot.classList.toggle('unsaved', !saved);
      if (label) label.textContent = saved ? 'Saved' : 'Saving...';
    },

    _updateStats() {
      const body = document.getElementById('editor-body');
      if (!body) return;
      const text = body.innerText || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      document.getElementById('word-count').textContent = `${words} words`;
      document.getElementById('char-count').textContent = `${chars} chars`;
    },

    _renderTags(tags) {
      const container = document.getElementById('editor-tags');
      if (!container) return;
      container.innerHTML = tags.map(tag => `
        <span class="editor-tag" style="border-color: ${window.Store.getTagColor(tag)}30; color: ${window.Store.getTagColor(tag)}">
          <span class="tag-dot" style="background: ${window.Store.getTagColor(tag)}"></span>
          ${tag}
          <button class="tag-remove" data-tag="${tag}" title="Remove tag">✕</button>
        </span>
      `).join('');

      container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const tagName = btn.dataset.tag;
          const note = window.Store.getNote(currentNoteId);
          if (note) {
            note.tags = note.tags.filter(t => t !== tagName);
            window.Store.updateNote(currentNoteId, { tags: note.tags });
            this._renderTags(note.tags);
            window.Sidebar.renderTags();
            window.NoteList.updateCard(currentNoteId);
          }
        });
      });
    },

    _updatePinButton(pinned) {
      const btn = document.getElementById('pin-btn');
      if (btn) {
        btn.classList.toggle('pinned', pinned);
        btn.innerHTML = pinned ? '<i class="ph-fill ph-push-pin" style="font-size:18px;"></i>' : '<i class="ph-bold ph-push-pin" style="font-size:18px;"></i>';
      }
    },

    _updateToolbarState() {
      document.querySelectorAll('[data-command]').forEach(btn => {
        const cmd = btn.dataset.command;
        try {
          if (['bold', 'italic', 'underline', 'strikeThrough'].includes(cmd)) {
            btn.classList.toggle('active', document.queryCommandState(cmd));
          }
        } catch { }
      });
    },

    _handleMarkdownShortcuts(e) {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      if (container.nodeType !== Node.TEXT_NODE) return;
      const text = container.textContent;
      const pos = range.startOffset;
      const textBefore = text.substring(0, pos);
      
      const shortcuts = [
        { pattern: /^#\s$/, cmd: 'h1' },
        { pattern: /^##\s$/, cmd: 'h2' },
        { pattern: /^>\s$/, cmd: 'blockquote' },
      ];

      for (const s of shortcuts) {
        if (s.pattern.test(textBefore)) {
          const match = textBefore.match(s.pattern);
          range.setStart(container, pos - match[0].length);
          range.setEnd(container, pos);
          range.deleteContents();
          document.execCommand(s.cmd === 'blockquote' ? 'formatBlock' : 'formatBlock', false, s.cmd);
          break;
        }
      }
    },

    async _showShareModal(noteId, noteTitle) {
      const html = `
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin-bottom: 8px;">Share Note</h3>
          <p style="color: var(--text-tertiary); font-size: 14px;">Create a read-only link for others.</p>
          <button class="btn btn-primary" id="modal-create-share" style="width: 100%; margin-top: 16px;">Create Link</button>
          <div id="share-result" style="display:none; margin-top: 16px;">
            <input type="text" id="share-link-input" readonly style="width:100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 4px; color: var(--text-primary); font-size: 12px;"/>
          </div>
        </div>
      `;
      window.showModal(html);
      const btn = document.getElementById('modal-create-share');
      btn.onclick = async () => {
        btn.disabled = true;
        btn.innerText = 'Creating...';
        try {
          const res = await fetch(`${window.API_BASE_URL}/share/${noteId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${window.Auth.getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: noteTitle, content: document.getElementById('editor-body').innerHTML })
          });
          const data = await res.json();
          document.getElementById('share-result').style.display = 'block';
          document.getElementById('share-link-input').value = data.url;
        } catch (e) { window.showToast('Failed to share', 'danger'); }
      };
    },

    _showThemePicker() {
      const themes = ['default', 'sepia', 'midnight', 'cyberpunk', 'solarized'];
      const html = `
        <div style="padding: 20px;">
          <h3 style="margin-bottom: 16px;">Themes</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${themes.map(t => `<button class="btn btn-secondary theme-option" data-theme="${t}">${t}</button>`).join('')}
          </div>
        </div>
      `;
      window.showModal(html);
      document.querySelectorAll('.theme-option').forEach(btn => {
        btn.onclick = () => {
          const theme = btn.dataset.theme;
          document.querySelector('.editor-panel').setAttribute('data-note-theme', theme);
          window.Store.updateNote(currentNoteId, { theme });
          window.closeModal();
        };
      });
    },

    _insertTable(rows, cols) {
      let html = '<table style="width:100%; border-collapse:collapse; margin: 12px 0;">';
      for (let i = 0; i < rows; i++) {
        html += '<tr>';
        for (let j = 0; j < cols; j++) {
          html += '<td style="border:1px solid var(--border-default); padding:10px;">&nbsp;</td>';
        }
        html += '</tr>';
      }
      html += '</table><p>&nbsp;</p>';
      document.getElementById('editor-body').focus();
      document.execCommand('insertHTML', false, html);
    },

    /* ── Image Manipulation Engine ── */

    _selectedImg: null,

    _initImageManager() {
      const toolbar = document.getElementById('image-toolbar');
      if (!toolbar) return;

      document.querySelectorAll('.img-tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._handleImageAction(btn.dataset.action);
        });
      });
    },

    _handleImageClick(img) {
      this._selectedImg = img;
      
      // Highlight image
      document.querySelectorAll('.editor-body img').forEach(i => i.classList.remove('selected'));
      img.classList.add('selected');

      // Position toolbar
      const toolbar = document.getElementById('image-toolbar');
      const rect = img.getBoundingClientRect();
      
      toolbar.style.display = 'flex';
      toolbar.style.left = `${rect.left + rect.width / 2}px`;
      toolbar.style.top = `${rect.top + window.scrollY}px`;
    },

    _hideImageToolbar() {
      this._selectedImg = null;
      document.querySelectorAll('.editor-body img').forEach(i => i.classList.remove('selected'));
      const toolbar = document.getElementById('image-toolbar');
      if (toolbar) toolbar.style.display = 'none';
    },

    _handleImageAction(action) {
      if (!this._selectedImg) return;
      const img = this._selectedImg;

      switch(action) {
        case 'size-sm': img.style.width = '25%'; break;
        case 'size-md': img.style.width = '50%'; break;
        case 'size-lg': img.style.width = '100%'; break;
        case 'align-left': 
          img.className = 'selected align-left';
          break;
        case 'align-center': 
          img.className = 'selected align-center';
          break;
        case 'align-right': 
          img.className = 'selected align-right';
          break;
        case 'delete':
          img.remove();
          this._hideImageToolbar();
          break;
      }
      
      this._scheduleAutoSave();
      // Reposition toolbar after size change
      setTimeout(() => this._handleImageClick(img), 100);
    }
  };
})();
