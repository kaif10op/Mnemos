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
    },

    open(noteId) {
      currentNoteId = noteId;
      const note = window.Store.getNote(noteId);
      if (!note) return;

      // Show editor, hide empty state
      document.getElementById('editor-active').style.display = 'flex';
      document.getElementById('editor-empty-state').style.display = 'none';

      // Fill fields
      document.getElementById('editor-title').value = note.title || '';
      document.getElementById('editor-body').innerHTML = note.content || '';
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

    _bindToolbar() {
      document.querySelectorAll('[data-command]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;

          if (cmd === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand(cmd, false, url);
          } else if (cmd === 'formatBlock') {
            document.execCommand(cmd, false, val);
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

      // Image upload
      const insertImgBtn = document.getElementById('insert-image-btn');
      const imgInput = document.getElementById('image-upload-input');
      if (insertImgBtn && imgInput) {
        insertImgBtn.addEventListener('click', () => imgInput.click());
        imgInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              document.execCommand('insertImage', false, ev.target.result);
              this._scheduleAutoSave();
            };
            reader.readAsDataURL(file);
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
                window.NoteList.render();
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
              window.NoteList.render();
            }
          }
        });
      }
    },

    _bindBody() {
      const body = document.getElementById('editor-body');
      if (body) {
        body.addEventListener('input', () => {
          this._scheduleAutoSave();
          this._updateStats();
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
        });

        body.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.originalEvent || e).clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          this._scheduleAutoSave();
        });

        body.addEventListener('mouseup', () => this._updateToolbarState());
        body.addEventListener('keyup', () => this._updateToolbarState());
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

      // Share button
      const shareBtn = document.getElementById('share-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          if (!currentNoteId) return;
          const note = window.Store.getNote(currentNoteId);
          const content = document.getElementById('editor-body').innerText || '';
          if (navigator.share) {
            navigator.share({
              title: note.title || 'Untitled Note',
              text: content,
            }).catch(() => {});
          } else {
            window.showToast('Share not supported on this browser', 'warning');
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

      // Mobile back
      const backBtn = document.getElementById('mobile-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.close();
        });
      }
    },

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
      window.NoteList.render();
    },

    _setSaved(saved) {
      isSaved = saved;
      const dot = document.querySelector('.save-dot');
      const label = document.getElementById('save-status-label');
      if (dot) {
        dot.classList.toggle('unsaved', !saved);
      }
      if (label) {
        label.textContent = saved ? 'Saved' : 'Saving...';
      }
    },

    _updateStats() {
      const body = document.getElementById('editor-body');
      if (!body) return;
      const text = body.innerText || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const wordEl = document.getElementById('word-count');
      const charEl = document.getElementById('char-count');
      if (wordEl) wordEl.textContent = `${words} words`;
      if (charEl) charEl.textContent = `${chars} chars`;
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

      // Bind remove buttons
      container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const tagName = btn.dataset.tag;
          const note = window.Store.getNote(currentNoteId);
          if (note) {
            note.tags = note.tags.filter(t => t !== tagName);
            window.Store.updateNote(currentNoteId, { tags: note.tags });
            this._renderTags(note.tags);
            window.Sidebar.renderTags();
            window.NoteList.render();
          }
        });
      });
    },

    _updatePinButton(pinned) {
      const btn = document.getElementById('pin-btn');
      if (btn) {
        btn.classList.toggle('pinned', pinned);
        btn.title = pinned ? 'Unpin note' : 'Pin note';
        btn.innerHTML = pinned ? '<i class="ph-fill ph-push-pin" style="font-size:18px;"></i>' : '<i class="ph-bold ph-push-pin" style="font-size:18px;"></i>';
        window.AppIcons.render();
      }
    },

    _updateToolbarState() {
      document.querySelectorAll('[data-command]').forEach(btn => {
        const cmd = btn.dataset.command;
        try {
          if (['bold', 'italic', 'underline', 'strikeThrough', 'insertOrderedList', 'insertUnorderedList'].includes(cmd)) {
            btn.classList.toggle('active', document.queryCommandState(cmd));
          }
        } catch { /* ignore */ }
      });
    },

    _handleMarkdownShortcuts(e) {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      
      // We only care about text nodes
      if (container.nodeType !== Node.TEXT_NODE) return;
      
      const text = container.textContent;
      const cursorPosition = range.startOffset;
      
      // Check the text before the cursor
      const textBeforeCursor = text.substring(0, cursorPosition);
      
      const shortcuts = [
        { pattern: /^#\s$/, command: 'formatBlock', value: 'h1' },
        { pattern: /^##\s$/, command: 'formatBlock', value: 'h2' },
        { pattern: /^###\s$/, command: 'formatBlock', value: 'h3' },
        { pattern: /^-\s$/, command: 'insertUnorderedList', value: null },
        { pattern: /^\*\s$/, command: 'insertUnorderedList', value: null },
        { pattern: /^1\.\s$/, command: 'insertOrderedList', value: null },
        { pattern: /^>\s$/, command: 'formatBlock', value: 'blockquote' },
      ];

      for (const { pattern, command, value } of shortcuts) {
        if (pattern.test(textBeforeCursor)) {
          // Prevent the space from being typed if we're transforming
          // Actually, since this is on keyup, the space is already there.
          // We need to remove the shortcut prefix.
          
          const match = textBeforeCursor.match(pattern);
          const matchLength = match[0].length;
          
          // Remove the characters
          range.setStart(container, cursorPosition - matchLength);
          range.setEnd(container, cursorPosition);
          range.deleteContents();
          
          // Execute command
          document.execCommand(command, false, value);
          
          this._scheduleAutoSave();
          this._updateToolbarState();
          break;
        }
      }
    },
  };
})();
