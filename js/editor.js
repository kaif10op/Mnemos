/* ============================================
   EDITOR — Rich Text Editing Logic
   ============================================ */

(function () {
  let currentNoteId = null;
  let saveTimer = null;
  let isSaved = true;
  let _lastEditorRange = null; // Global: saves cursor pos before toolbar steals focus

  window.Editor = {
    init() {
      this._bindToolbar();
      this._bindTitleInput();
      this._bindTagInput();
      this._bindBody();
      this._bindActions();
      this._initInteractions();
      this._initBlockManager();
      this._initDirectManipulation();
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
      
      // ✅ IMAGE REPAIR: Prepend backend origin if it's a relative path
      let content = note.content || '';
      const baseUrl = window.API_BASE_URL.replace('/api', '');
      
      // Fix both legacy /uploads and new /api/sync/image paths
      if (content.includes('src="/uploads/')) {
        content = content.replaceAll('src="/uploads/', `src="${baseUrl}/uploads/`);
      }
      if (content.includes('src="/api/sync/image/')) {
        content = content.replaceAll('src="/api/sync/image/', `src="${baseUrl}/api/sync/image/`);
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
      // GLOBAL: Save editor selection before ANY toolbar interaction steals focus
      const toolbar = document.querySelector('.editor-toolbar');
      if (toolbar) {
        toolbar.addEventListener('mousedown', () => {
          const sel = window.getSelection();
          const body = document.getElementById('editor-body');
          if (sel.rangeCount > 0 && body && body.contains(sel.anchorNode)) {
            _lastEditorRange = sel.getRangeAt(0).cloneRange();
          }
        });
      }

      document.querySelectorAll('[data-command]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.command;
          const val = btn.dataset.value || null;

          // Restore selection before executing command
          this._restoreSelection();

          if (cmd === 'createLink') {
            this._saveSelection(); // Save selection before prompt opens
            const url = prompt('Enter URL:');
            if (url) {
              this._restoreSelection(); // Restore it after prompt closes
              document.execCommand(cmd, false, url);
            }
          } else {
            document.execCommand(cmd, false, val);
          }

          this._updateToolbarState();
          this._scheduleAutoSave();
        });
      });

      // Heading select — save selection on mousedown
      const headingSelect = document.getElementById('heading-select');
      if (headingSelect) {
        headingSelect.addEventListener('mousedown', () => {
          const sel = window.getSelection();
          const body = document.getElementById('editor-body');
          if (sel.rangeCount > 0 && body && body.contains(sel.anchorNode)) {
            _lastEditorRange = sel.getRangeAt(0).cloneRange();
          }
        });
        headingSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val) {
            this._restoreSelection();
            document.execCommand('formatBlock', false, val);
            this._scheduleAutoSave();
          }
          e.target.value = '';
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

      // 📊 Table Insertion — Visual Grid Picker
      const tableBtn = document.getElementById('insert-table-btn');
      if (tableBtn) {
        tableBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showTableGridPicker(tableBtn);
        });
      }

      // 📏 Font Size Selector — with selection preservation
      const fontSizeSelect = document.getElementById('font-size-select');
      if (fontSizeSelect) {
        let savedRange = null;
        fontSizeSelect.addEventListener('mousedown', () => {
          const sel = window.getSelection();
          if (sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
        });
        fontSizeSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val && savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
            document.execCommand('fontSize', false, val);
            this._scheduleAutoSave();
          }
          e.target.value = '';
          document.getElementById('editor-body').focus();
        });
      }

      // 🖨️ Print Button
      const printBtn = document.getElementById('print-btn');
      if (printBtn) {
        printBtn.addEventListener('click', () => window.print());
      }

      // 📄 Paper Theme Picker
      const paperThemeBtn = document.getElementById('paper-theme-btn');
      if (paperThemeBtn) {
        paperThemeBtn.addEventListener('click', () => this._showPaperThemePicker());
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
              window.showToast('🚀 Processing image...', 'info');
              
              // ✅ PRO: Compress image in-browser before upload (Target: 1920px max, WebP/JPEG)
              const compressedFile = await this._compressImage(file);
              
              const formData = new FormData();
              formData.append('image', compressedFile);
              
              const token = window.Auth.getToken();
              const res = await fetch(`${window.API_BASE_URL}/sync/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
              });
              
              if (!res.ok) throw new Error('Upload failed');
              const data = await res.json();
              
              // ✅ FIXED: Standardized absolute path for GridFS images
              const baseUrl = window.API_BASE_URL.replace('/api', '');
              const fullUrl = data.url.startsWith('http') ? data.url : `${baseUrl}${data.url}`;
              
              if (this._restoreSelection) this._restoreSelection();
              document.execCommand('insertImage', false, fullUrl);
              this._scheduleAutoSave();
              window.showToast('🖼️ Optimized upload complete', 'success');
            } catch (err) {
              window.showToast('Upload failed: ' + err.message, 'danger');
            }
          }
          imgInput.value = '';
        });
      }
    },

    // ✅ PRO: In-Browser Asset Compression (Canvas API)
    async _compressImage(file) {
      if (file.size < 200 * 1024) return file; // Don't touch small files
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Limit to Pro resolution (1920px)
            const MAX_SIZE = 1920;
            if (width > height) {
              if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
              }
            } else {
              if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
              const newFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(newFile);
            }, 'image/jpeg', 0.82); // 82% quality for best balance
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    },

    _bindTitleInput() {
      const titleInput = document.getElementById('editor-title');
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          this._scheduleAutoSave();
        });
      }

      const titleBtn = document.getElementById('ai-title-btn');
      if (titleBtn) {
        titleBtn.addEventListener('click', async () => {
          if (!currentNoteId) return;
          const body = document.getElementById('editor-body');
          const content = window.Store.stripHtml(body.innerHTML || '');
          if (content.length < 15) {
            window.showToast('Please write more content first.', 'warning');
            return;
          }
          
          titleBtn.disabled = true;
          titleBtn.innerHTML = '<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> <span class="desktop-only" style="margin-left:4px;">Thinking...</span>';
          
          try {
            const token = window.Auth.getToken();
            const res = await fetch(`${window.API_BASE_URL}/ai/complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ prompt: 'Generate a short, concise, and professional title for this note without quotes or extra text. Max 6 words.', context: content.substring(0, 5000) })
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            
            if (data.result) {
              const cleanTitle = data.result.replace(/"/g, '').trim();
              if (titleInput) titleInput.value = cleanTitle;
              this._scheduleAutoSave();
              window.showToast('✨ Auto-Title generated', 'success');
            }
          } catch(e) {
            window.showToast('Failed to generate title', 'danger');
          } finally {
            titleBtn.disabled = false;
            titleBtn.innerHTML = '<i class="ph-fill ph-magic-wand" style="color:var(--accent-primary);"></i> <span class="desktop-only" style="margin-left:4px;">Auto-Title</span>';
          }
        });
      }
    },

    _bindTagInput() {
      const tagInput = document.getElementById('tag-input');
      const tagsWrapper = document.querySelector('.editor-tags-wrapper');
      
      // ✅ AI PRO: Auto-Tag Button
      if (tagsWrapper) {
        const aiTagBtn = document.createElement('button');
        aiTagBtn.className = 'btn btn-ghost ai-tag-btn';
        aiTagBtn.innerHTML = '<i class="ph-fill ph-magic-wand" style="color:var(--accent-primary);"></i> Auto-Tag';
        aiTagBtn.style.cssText = 'font-size: 11px; padding: 2px 8px; margin-left: auto;';
        aiTagBtn.title = 'AI Auto-Tag';
        
        aiTagBtn.onclick = async () => {
          if (!currentNoteId) return;
          const note = window.Store.getNote(currentNoteId);
          const content = window.Store.stripHtml(note.content || '');
          if (content.length < 20) {
            window.showToast('Please write more content first', 'warning');
            return;
          }
          
          aiTagBtn.innerHTML = '<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> Generating...';
          aiTagBtn.disabled = true;
          
          try {
            const token = window.Auth.getToken();
            const res = await fetch(`${window.API_BASE_URL}/ai/tags`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ content: content.substring(0, 15000), existingTags: window.Store.getAllTags() })
            });
            if (!res.ok) throw new Error('AI tagging failed');
            const data = await res.json();
            
            if (data.tags && data.tags.length > 0) {
              const newTags = data.tags.filter(t => !note.tags.includes(t));
              if (newTags.length > 0) {
                note.tags.push(...newTags);
                window.Store.updateNote(currentNoteId, { tags: note.tags });
                this._renderTags(note.tags);
                window.Sidebar.renderTags();
                window.NoteList.updateCard(currentNoteId);
                window.showToast('✨ Tags generated', 'success');
              } else {
                window.showToast('Note already has these tags', 'info');
              }
            } else {
              window.showToast('No new tags suggested.', 'info');
            }
          } catch (e) {
            window.showToast(e.message, 'danger');
          } finally {
            aiTagBtn.innerHTML = '<i class="ph-fill ph-magic-wand" style="color:var(--accent-primary);"></i> Auto-Tag';
            aiTagBtn.disabled = false;
          }
        };
        
        tagsWrapper.appendChild(aiTagBtn);
      }

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

        body.addEventListener('keydown', async (e) => {
          // Tab to indent properly in lists or AI continue
          if (e.key === 'Tab') {
            e.preventDefault();
            
            // ✅ AI PRO: Smart Write (Continue sentence)
            const sel = window.getSelection();
            if (sel.isCollapsed && sel.focusNode) {
              const textNode = sel.focusNode;
              const textContent = textNode.textContent || '';
              const offset = sel.focusOffset;
              
              // Trigger AI if Tab is pressed at the end of a non-empty text node
              if (offset === textContent.length && textContent.trim().length > 5) {
                const buttonHtml = '<span id="ai-ghost-text" style="color:var(--text-tertiary);" contenteditable="false"><i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> AI writing...</span>';
                document.execCommand('insertHTML', false, buttonHtml);
                
                try {
                  const fullText = window.Store.stripHtml(body.innerHTML);
                  const token = window.Auth.getToken();
                  const res = await fetch(`${window.API_BASE_URL}/ai/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ prompt: 'Please write the next 1-2 sentences to seamlessly continue the text. Output ONLY the continuation sentences, nothing else.', context: fullText.substring(0, 15000) })
                  });
                  
                  const ghostEl = document.getElementById('ai-ghost-text');
                  if (!res.ok) throw new Error();
                  const data = await res.json();
                  
                  if (data.result && ghostEl) {
                    ghostEl.outerHTML = ' ' + data.result;
                    this._scheduleAutoSave();
                    window.showToast('✨ AI Continued', 'success');
                  } else if (ghostEl) {
                    ghostEl.outerHTML = '';
                  }
                } catch(e) {
                  const ghostEl = document.getElementById('ai-ghost-text');
                  if (ghostEl) ghostEl.outerHTML = '';
                  window.showToast('AI Continuation failed.', 'warning');
                }
                return;
              }
            }

            if (e.shiftKey) {
              document.execCommand('outdent', false, null);
            } else {
              document.execCommand('indent', false, null);
            }
            this._scheduleAutoSave();
          } else if (e.key === 'Enter') {
            // ✅ AI PRO: Inline /ask command
            const sel = window.getSelection();
            if (sel.isCollapsed && sel.focusNode) {
              const textNode = sel.focusNode;
              const textContent = textNode.textContent || '';
              
              if (textContent.startsWith('/ask ')) {
                e.preventDefault();
                const promptText = textContent.replace('/ask ', '').trim();
                
                // Clear the node text
                textNode.textContent = '';
                
                // Insert loading
                const buttonHtml = `<span id="ai-ghost-ask" style="color:var(--text-tertiary);" contenteditable="false"><i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> AI generating...</span>`;
                document.execCommand('insertHTML', false, buttonHtml);
                
                try {
                  const token = window.Auth.getToken();
                  const res = await fetch(`${window.API_BASE_URL}/ai/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ prompt: promptText })
                  });
                  
                  const ghostEl = document.getElementById('ai-ghost-ask');
                  if (!res.ok) throw new Error();
                  const data = await res.json();
                  
                  if (data.result && ghostEl) {
                    const selObj = window.getSelection();
                    const rangeObj = document.createRange();
                    rangeObj.selectNode(ghostEl);
                    selObj.removeAllRanges();
                    selObj.addRange(rangeObj);
                    
                    const htmlToInsert = data.result
                      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/`(.*?)`/g, '<code>$1</code>')
                      .replace(/\n/g, '<br>');
                    document.execCommand('insertHTML', false, htmlToInsert);
                    
                    this._scheduleAutoSave();
                  } else if (ghostEl) {
                    ghostEl.remove();
                  }
                } catch(e) {
                  const ghostEl = document.getElementById('ai-ghost-ask');
                  if (ghostEl) ghostEl.outerHTML = '⚠️ Failed to generate response.';
                }
                return;
              }
            }
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
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          
          if (btn.classList.contains('ai-inline-btn')) {
            const mode = btn.dataset.ai;
            const sel = window.getSelection();
            
            if (!sel.isCollapsed && sel.rangeCount > 0) {
              const text = sel.toString();
              const range = sel.getRangeAt(0);
              
              if (text.trim().length > 0) {
                const prompts = {
                  'improve': 'Rewrite and polish the following text to make it sound professional and extremely clear. Ensure you only return the requested text and no surrounding pleasantries.',
                  'format': 'Format the following messy text into a clean, well-structured Markdown list or table. Return only the formatted text.',
                  'fix': 'Fix all grammar, spelling, and punctuation errors in the following text. Do not rewrite the sentence structure unnecessarily. Return only the fixed text.',
                  'translate': 'Translate the following text into clear, fluent English. Return only the translation.',
                  'shorter': 'Make the following text significantly shorter and punchier. Return only the shortened text.',
                  'longer': 'Expand the following text organically. Add relevant details or elaborations. Return only the expanded text.',
                  'tone': 'Rewrite the following text to have a highly professional, confident, and business-appropriate tone. Return only the result.',
                  'explain': 'Explain the following text or concept simply, as if I am 5 years old (ELI5). Be concise.'
                };
                
                const promptToUse = prompts[mode] || prompts['improve'];
                
                // Keep the selection but change background
                document.getElementById('floating-bubble').style.display = 'none';
                
                const span = document.createElement('span');
                span.style.backgroundColor = 'var(--accent-primary)';
                span.style.color = '#fff';
                span.style.padding = '0 4px';
                span.style.borderRadius = '2px';
                span.className = 'ai-processing-inline';
                span.textContent = text;
                
                range.deleteContents();
                range.insertNode(span);
                
                try {
                  const token = window.Auth.getToken();
                  const res = await fetch(`${window.API_BASE_URL}/ai/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ prompt: promptToUse + `\n\nText: "${text}"` })
                  });
                  if (!res.ok) throw new Error('AI Error');
                  const data = await res.json();
                  
                  if (data.result) {
                    const selObj = window.getSelection();
                    const rangeObj = document.createRange();
                    rangeObj.selectNode(span);
                    selObj.removeAllRanges();
                    selObj.addRange(rangeObj);
                    
                    if (mode === 'explain') {
                      // Put original text back
                      document.execCommand('insertText', false, text);
                      
                      // Show Modal
                      const modal = document.getElementById('ai-modal-overlay');
                      const body = document.getElementById('ai-modal-body');
                      const title = document.getElementById('ai-modal-title-text');
                      const footer = document.getElementById('ai-modal-footer');
                      
                      title.textContent = 'ELI5 Explanation';
                      footer.style.display = 'none';
                      // Use AIPanel markdown parser if available
                      body.innerHTML = data.result
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/`(.*?)`/g, '<code>$1</code>')
                        .replace(/\n/g, '<br>');
                      modal.style.display = 'flex';
                    } else if (mode === 'format') {
                      // Format: AI may return HTML lists/tables — insert directly
                      document.execCommand('insertHTML', false, data.result);
                      this._scheduleAutoSave();
                      window.showToast('✨ Text formatted', 'success');
                    } else {
                      document.execCommand('insertText', false, data.result);
                      this._scheduleAutoSave();
                      window.showToast('✨ Text replaced inline', 'success');
                    }
                  } else {
                    const selObj = window.getSelection();
                    const rangeObj = document.createRange();
                    rangeObj.selectNode(span);
                    selObj.removeAllRanges();
                    selObj.addRange(rangeObj);
                    document.execCommand('insertText', false, text);
                  }
                } catch (err) {
                  const selObj = window.getSelection();
                  const rangeObj = document.createRange();
                  rangeObj.selectNode(span);
                  selObj.removeAllRanges();
                  selObj.addRange(rangeObj);
                  document.execCommand('insertText', false, text);
                  
                  window.showToast(`⚠️ AI Inline Mod failed`, 'danger');
                }
              }
            }
            return;
          }

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
        { id: 'h3', name: 'Heading 3', desc: 'Small section heading', icon: 'ph-text-h-three' },
        { id: 'callout', name: 'Callout — Info', desc: 'Blue information box', icon: 'ph-info' },
        { id: 'callout-warning', name: 'Callout — Warning', desc: 'Yellow warning box', icon: 'ph-warning' },
        { id: 'callout-success', name: 'Callout — Success', desc: 'Green success box', icon: 'ph-check-circle' },
        { id: 'callout-danger', name: 'Callout — Danger', desc: 'Red danger box', icon: 'ph-x-circle' },
        { id: 'table', name: 'Table', desc: 'Visual grid picker', icon: 'ph-table' },
        { id: 'divider', name: 'Divider', desc: 'Visual separator', icon: 'ph-minus' },
        { id: 'code', name: 'Code Block', desc: 'Syntax highlighted snippet', icon: 'ph-code' },
        { id: 'quote', name: 'Blockquote', desc: 'Insert a styled quote', icon: 'ph-quotes' },
        { id: 'checklist', name: 'Checklist', desc: 'Interactive checkbox list', icon: 'ph-check-square' },
        { id: 'image', name: 'Image (URL)', desc: 'Insert image from URL', icon: 'ph-image' },
        { id: 'mermaid', name: 'Mermaid Diagram', desc: 'Live flowchart / diagram', icon: 'ph-graph' },
        { id: 'columns', name: 'Two Columns', desc: 'Side-by-side layout', icon: 'ph-columns' },
        { id: 'toc', name: 'Table of Contents', desc: 'Auto-linked headings index', icon: 'ph-list-bullets' },
        { id: 'date', name: 'Current Date', desc: 'Insert formatted date', icon: 'ph-calendar' },
        { id: 'emoji', name: 'Emoji Picker', desc: 'Quick emoji insert', icon: 'ph-smiley' },
        { id: 'math', name: 'Math Block', desc: 'Formatted equation', icon: 'ph-math-operations' },
        { id: 'ai-summarize', name: 'Summarize Note', desc: '✨ Generate AI summary', icon: 'ph-magic-wand' },
        { id: 'ai-actions', name: 'Extract Actions', desc: '✨ Find action items', icon: 'ph-check-square-offset' },
        { id: 'ai-flashcards', name: 'Flashcards', desc: '✨ Create study cards', icon: 'ph-cards' },
        { id: 'ai-quiz', name: 'Quiz Me', desc: '✨ Generate a quick test', icon: 'ph-student' },
        { id: 'ai-mindmap', name: 'Mind Map', desc: '✨ Map concepts visually', icon: 'ph-graph' }
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
      const commands = ['h1', 'h2', 'h3', 'callout', 'callout-warning', 'callout-success', 'callout-danger', 'table', 'divider', 'code', 'quote', 'checklist', 'image', 'mermaid', 'columns', 'toc', 'date', 'emoji', 'math', 'ai-summarize', 'ai-actions', 'ai-flashcards', 'ai-quiz', 'ai-mindmap'];
      const cmd = commands[this._slashIndex];
      this._hideSlashMenu();
      
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(this._slashRange);
      document.execCommand('delete', false);
      
      this._executeSlashCommand(cmd);
    },

    _executeSlashCommand(cmd) {
      if (cmd && cmd.startsWith('ai-')) {
        const action = cmd.replace('ai-', '');
        if (window.AIPanel) {
          window.AIPanel.open();
          window.AIPanel._handleQuickAction(action);
        }
        return;
      }
      
      if (cmd === 'h1' || cmd === 'h2' || cmd === 'h3') {
        document.execCommand('formatBlock', false, cmd);
      } else if (cmd === 'divider') {
        document.execCommand('insertHorizontalRule');
      } else if (cmd === 'table') {
        const tableBtn = document.getElementById('insert-table-btn');
        if (tableBtn) this._showTableGridPicker(tableBtn);
        else this._insertTable(3, 3);
      } else if (cmd === 'code') {
        const html = `<pre class="pro-code-block"><code>// Your code here...</code></pre><p>&nbsp;</p>`;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'quote') {
        const html = `<blockquote style="border-left:3px solid var(--accent-primary);padding:8px 16px;margin:12px 0;color:var(--text-secondary);font-style:italic;">Write your quote here...</blockquote><p>&nbsp;</p>`;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'checklist') {
        const html = `<ul style="list-style:none;padding-left:4px;"><li><input type="checkbox" style="margin-right:8px;"> Task item 1</li><li><input type="checkbox" style="margin-right:8px;"> Task item 2</li><li><input type="checkbox" style="margin-right:8px;"> Task item 3</li></ul><p>&nbsp;</p>`;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'image') {
        this._saveSelection(); // Save selection before prompt steals it
        const url = prompt('Enter image URL:');
        if (url) {
          this._restoreSelection(); // Restore after prompt closes
          const html = `<img src="${url}" alt="User image" style="max-width:100%;border-radius:8px;margin:8px 0;"><p>&nbsp;</p>`;
          document.execCommand('insertHTML', false, html);
        }
      } else if (cmd === 'callout' || cmd === 'callout-warning' || cmd === 'callout-success' || cmd === 'callout-danger') {
        const variants = {
          'callout': { icon: 'ph-info', cls: 'info', text: 'Important information here...' },
          'callout-warning': { icon: 'ph-warning', cls: 'warning', text: 'Warning: Be careful about...' },
          'callout-success': { icon: 'ph-check-circle', cls: 'success', text: 'Success! Everything is working...' },
          'callout-danger': { icon: 'ph-x-circle', cls: 'danger', text: 'Danger: Critical issue...' }
        };
        const v = variants[cmd];
        const html = `
          <div class="pro-callout pro-callout-${v.cls}" contenteditable="false">
            <div class="pro-callout-icon"><i class="ph-fill ${v.icon}"></i></div>
            <div class="pro-callout-content" contenteditable="true">${v.text}</div>
          </div><p>&nbsp;</p>
        `;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'mermaid') {
        const html = `
          <div class="mermaid-block" contenteditable="false">
            <div class="mermaid-source" contenteditable="true" spellcheck="false">flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Result 1]\n    B -->|No| D[Result 2]</div>
            <div class="mermaid-preview"></div>
            <div class="mermaid-actions">
              <button class="mermaid-render-btn" onclick="window.Editor._renderSingleMermaid(this.closest('.mermaid-block'))">▶ Render Diagram</button>
            </div>
          </div><p>&nbsp;</p>
        `;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'columns') {
        const html = `
          <div class="pro-columns" contenteditable="false">
            <div class="pro-column" contenteditable="true">Column 1 content...</div>
            <div class="pro-column" contenteditable="true">Column 2 content...</div>
          </div><p>&nbsp;</p>
        `;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'toc') {
        this._insertTableOfContents();
      } else if (cmd === 'date') {
        const now = new Date();
        const formatted = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const html = `<span class="pro-date-chip">📅 ${formatted}</span>&nbsp;`;
        document.execCommand('insertHTML', false, html);
      } else if (cmd === 'emoji') {
        this._showEmojiPicker();
      } else if (cmd === 'math') {
        const html = `<div class="pro-math-block" contenteditable="true" spellcheck="false">E = mc²</div><p>&nbsp;</p>`;
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

    /** Saves the current cursor/selection from the editor body */
    _saveSelection() {
      const sel = window.getSelection();
      const body = document.getElementById('editor-body');
      if (sel.rangeCount > 0 && body && body.contains(sel.anchorNode)) {
        _lastEditorRange = sel.getRangeAt(0).cloneRange();
      }
    },

    /** Restores the last saved cursor/selection into the editor body */
    _restoreSelection() {
      const body = document.getElementById('editor-body');
      if (!body) return;
      body.focus();
      if (_lastEditorRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_lastEditorRange);
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
          <div id="share-result" style="display:none; margin-top: 16px; text-align: left;">
            <p style="font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">Public Link:</p>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="share-link-input" readonly style="flex: 1; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-default); border-radius: 4px; color: var(--text-primary); font-size: 12px;"/>
              <button class="btn btn-secondary" id="modal-copy-share" style="padding: 8px;"><i class="ph-bold ph-copy"></i> Copy</button>
            </div>
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
          btn.style.display = 'none'; // Hide create button after success
          
          document.getElementById('modal-copy-share').onclick = () => {
            navigator.clipboard.writeText(data.url);
            window.showToast('Link copied to clipboard!', 'success');
            window.closeModal();
          };
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
          if (i === 0) {
            html += '<th style="border:1px solid var(--border-default); padding:12px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; font-weight:600;">Header</th>';
          } else {
            html += '<td style="border:1px solid var(--border-default); padding:12px;">&nbsp;</td>';
          }
        }
        html += '</tr>';
      }
      html += '</table><p>&nbsp;</p>';
      this._restoreSelection();
      document.execCommand('insertHTML', false, html);
    },

    /* ── Visual Table Grid Picker ── */
    _showTableGridPicker(anchorEl) {
      this._saveSelection(); // Preserve cursor before picker steals focus
      const picker = document.getElementById('table-grid-picker');
      const cellsContainer = document.getElementById('table-grid-cells');
      if (!picker || !cellsContainer) return;

      // Build 8x8 grid
      cellsContainer.innerHTML = '';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cell = document.createElement('div');
          cell.className = 'table-grid-cell';
          cell.dataset.row = r + 1;
          cell.dataset.col = c + 1;
          cell.addEventListener('mouseover', () => {
            this._highlightGridCells(r + 1, c + 1);
            document.getElementById('table-grid-label').textContent = `${r + 1} × ${c + 1}`;
          });
          cell.addEventListener('click', () => {
            picker.style.display = 'none';
            this._insertTable(r + 1, c + 1);
          });
          cellsContainer.appendChild(cell);
        }
      }

      // Position near button
      const rect = anchorEl.getBoundingClientRect();
      picker.style.display = 'block';
      picker.style.left = `${rect.left}px`;
      picker.style.top = `${rect.bottom + 8}px`;

      // Hide on click outside
      const hideHandler = (e) => {
        if (!picker.contains(e.target) && e.target !== anchorEl) {
          picker.style.display = 'none';
          document.removeEventListener('mousedown', hideHandler);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', hideHandler), 50);
    },

    _highlightGridCells(rows, cols) {
      document.querySelectorAll('.table-grid-cell').forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        cell.classList.toggle('active', r <= rows && c <= cols);
      });
    },

    /* ── Mermaid Live Rendering Engine ── */
    async _renderSingleMermaid(block) {
      if (!block || !window.mermaid) return;
      const source = block.querySelector('.mermaid-source');
      const preview = block.querySelector('.mermaid-preview');
      if (!source || !preview) return;

      const code = source.textContent.replace(/\\n/g, '\n').trim();
      if (!code) return;

      try {
        const id = 'mermaid-' + Date.now();
        const { svg } = await mermaid.render(id, code);
        preview.innerHTML = svg;
        preview.style.display = 'block';
        source.style.display = 'none';
        block.querySelector('.mermaid-actions').style.display = 'none';

        // Click preview to re-edit
        preview.onclick = () => {
          preview.style.display = 'none';
          source.style.display = 'block';
          block.querySelector('.mermaid-actions').style.display = 'flex';
          source.focus();
        };
      } catch (err) {
        preview.innerHTML = `<div style="color:#ef4444; padding:8px; font-size:13px;">⚠️ Mermaid Syntax Error: ${err.message || 'Invalid diagram'}</div>`;
        preview.style.display = 'block';
      }
    },

    _renderAllMermaidBlocks() {
      const blocks = document.querySelectorAll('.mermaid-block');
      blocks.forEach(block => {
        const preview = block.querySelector('.mermaid-preview');
        if (preview && preview.style.display !== 'block') {
          this._renderSingleMermaid(block);
        }
      });
    },

    /* ── Table of Contents Generator ── */
    _insertTableOfContents() {
      const body = document.getElementById('editor-body');
      if (!body) return;
      const headings = body.querySelectorAll('h1, h2, h3');
      if (headings.length === 0) {
        window.showToast('No headings found in this note', 'warning');
        return;
      }
      let tocHtml = '<div class="pro-toc"><div class="pro-toc-title">📑 Table of Contents</div><ul>';
      headings.forEach((h, i) => {
        const level = h.tagName.toLowerCase();
        const indent = level === 'h1' ? 0 : level === 'h2' ? 16 : 32;
        const id = `heading-${i}`;
        h.id = id;
        tocHtml += `<li style="padding-left:${indent}px"><a href="#${id}" style="color:var(--accent-primary);text-decoration:none;">${h.textContent}</a></li>`;
      });
      tocHtml += '</ul></div><p>&nbsp;</p>';
      document.execCommand('insertHTML', false, tocHtml);
    },

    /* ── Emoji Picker ── */
    _showEmojiPicker() {
      const emojis = ['😀','😂','❤️','🔥','⭐','✅','🎯','🚀','💡','📌','📊','🎨','📝','🔑','💎','🌟','⚡','🏆','📚','🧠','💪','🎉','👍','🙌','❓','⚠️','✨','🔔','📁','🗂️'];
      const html = `<div class="pro-emoji-grid" contenteditable="false">${emojis.map(e => `<span class="pro-emoji-item" onclick="document.execCommand('insertText', false, '${e}'); this.closest('.pro-emoji-grid').remove();">${e}</span>`).join('')}</div>`;
      document.execCommand('insertHTML', false, html);
    },

    /* ── Paper Theme Picker ── */
    _showPaperThemePicker() {
      if (!currentNoteId) return;
      const themes = [
        { id: 'default', name: 'Clean', desc: 'No background pattern' },
        { id: 'dotted', name: 'Dotted', desc: 'Subtle dot grid' },
        { id: 'lined', name: 'Lined', desc: 'Ruled notebook lines' },
        { id: 'grid', name: 'Grid', desc: 'Engineering grid' },
        { id: 'texture', name: 'Parchment', desc: 'Textured paper feel' }
      ];
      const html = `
        <div style="padding: 20px;">
          <h3 style="margin-bottom: 16px;">📄 Paper Style</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${themes.map(t => `<button class="btn btn-secondary paper-option" data-paper="${t.id}" style="text-align:left; padding:12px;"><strong>${t.name}</strong><br><small style="color:var(--text-tertiary);">${t.desc}</small></button>`).join('')}
          </div>
        </div>
      `;
      window.showModal(html);
      document.querySelectorAll('.paper-option').forEach(btn => {
        btn.onclick = () => {
          const paper = btn.dataset.paper;
          const bodyWrapper = document.getElementById('editor-body-wrapper');
          if (bodyWrapper) {
            bodyWrapper.className = 'editor-body-wrapper';
            if (paper !== 'default') bodyWrapper.classList.add(`paper-${paper}`);
          }
          window.closeModal();
          window.showToast(`📄 Paper style: ${btn.querySelector('strong').textContent}`, 'success');
        };
      });
    },

    /* ── Settings & Shares Manager ── */
    async _showSettingsModal() {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const API_BASE_URL = localStorage.getItem('notesaver_api_base_url') || (isLocalhost ? 'http://localhost:5050/api' : '/api');
      const token = localStorage.getItem('notesaver_token');

      if (!token) {
        window.showToast('Please sign in to manage shared links', 'error');
        return;
      }

      // Initial loading state
      window.showModal(`
        <div style="padding: 24px; min-width: 400px;">
          <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <i class="ph-duotone ph-share-network" style="color:var(--accent-primary)"></i> Managed Shared Links
          </h3>
          <div id="settings-loader" style="text-align: center; padding: 40px;">
            <i class="ph-bold ph-circle-notch ph-spin" style="font-size: 32px; color: var(--accent-primary);"></i>
            <p style="margin-top: 16px; color: var(--text-secondary);">Fetching your active links...</p>
          </div>
          <div id="shares-list-container" style="display: none;"></div>
        </div>
      `);

      try {
        const res = await fetch(`${API_BASE_URL}/share/shares/list`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to fetch shares');

        const data = await res.json();
        const container = document.getElementById('shares-list-container');
        const loader = document.getElementById('settings-loader');

        if (!container || !loader) return;

        loader.style.display = 'none';
        container.style.display = 'block';

        if (!data.shares || data.shares.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-tertiary);">
              <i class="ph-duotone ph-link-break" style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
              <p>No active shared links found.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = `
          <div style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;">
            ${data.shares.map(share => `
              <div class="share-item" style="background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${share.noteTitle}">
                    ${share.noteTitle || 'Untitled Note'}
                  </div>
                  <div style="font-size: 11px; color: var(--text-tertiary); display: flex; gap: 12px;">
                    <span><i class="ph ph-eye"></i> ${share.views || 0} views</span>
                    <span><i class="ph ph-calendar"></i> ${new Date(share.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div style="display: flex; gap: 8px; margin-left: 16px;">
                  <a href="${share.url}" target="_blank" class="btn btn-icon" title="View Public Page" style="color: var(--accent-primary);">
                    <i class="ph-bold ph-arrow-square-out"></i>
                  </a>
                  <button class="btn btn-icon revoke-share-btn" data-token="${share.token}" title="Revoke Link" style="color: #ef4444;">
                    <i class="ph-bold ph-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Bind revoke actions
        container.querySelectorAll('.revoke-share-btn').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('Are you sure you want to revoke this share link? It will stop working immediately.')) return;
            
            const shareToken = btn.dataset.token;
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-circle-notch ph-spin"></i>';

            try {
              const delRes = await fetch(`${API_BASE_URL}/share/${shareToken}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });

              if (delRes.ok) {
                window.showToast('Share link revoked', 'success');
                this._showSettingsModal(); // Refresh list
              } else {
                throw new Error('Failed to revoke');
              }
            } catch (err) {
              window.showToast('Revoke failed: ' + err.message, 'error');
              btn.disabled = false;
              btn.innerHTML = '<i class="ph-bold ph-trash"></i>';
            }
          };
        });

      } catch (err) {
        const container = document.getElementById('shares-list-container');
        if (container) {
          container.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
          container.style.display = 'block';
        }
        const loader = document.getElementById('settings-loader');
        if (loader) loader.style.display = 'none';
      }
    },

    /* ── Image Manipulation Engine ── */

    /* ── Unified Block Manipulation Engine (Pro) ── */

    _selectedBlock: null,

    _initBlockManager() {
      const toolbar = document.getElementById('block-toolbar');
      const body = document.getElementById('editor-body');
      if (!toolbar || !body) return;

      // Handle block selection via delegation
      body.addEventListener('click', (e) => {
        const block = e.target.closest('img, table, hr, blockquote');
        if (block) {
          this._handleBlockClick(block);
        } else {
          this._hideBlockToolbar();
        }
      });

      // Bind toolbar actions
      toolbar.querySelectorAll('.block-tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._handleBlockAction(btn.dataset.action);
        });
      });

      // Hide toolbar on escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._hideBlockToolbar();
      });
    },

    _handleBlockClick(block) {
      this._selectedBlock = block;
      
      // Clear previous selection
      document.querySelectorAll('.editor-body .selected').forEach(el => el.classList.remove('selected'));
      block.classList.add('selected');
      this._positionManipulationHandles(block);

      const toolbar = document.getElementById('block-toolbar');
      
      // Contextual UI Toggling
      const type = block.tagName.toLowerCase();
      toolbar.querySelectorAll('.block-tool-group').forEach(group => {
        group.style.display = (group.dataset.type === type || (group.dataset.type === 'image' && type === 'img')) ? 'flex' : 'none';
      });

      // Positioning
      const rect = block.getBoundingClientRect();
      toolbar.style.display = 'flex';
      toolbar.style.left = `${rect.left + rect.width / 2}px`;
      toolbar.style.top = `${rect.top + window.scrollY}px`;
    },

    _hideBlockToolbar() {
      this._selectedBlock = null;
      document.querySelectorAll('.editor-body .selected').forEach(el => el.classList.remove('selected'));
      const toolbar = document.getElementById('block-toolbar');
      if (toolbar) toolbar.style.display = 'none';
      const resizer = document.getElementById('block-resizer');
      if (resizer) resizer.style.display = 'none';
    },

    _handleBlockAction(action) {
      if (!this._selectedBlock) return;
      const block = this._selectedBlock;

      switch(action) {
        // Image Sizes
        case 'size-sm': block.style.width = '25%'; break;
        case 'size-md': block.style.width = '50%'; break;
        case 'size-lg': block.style.width = '100%'; break;
        
        // Alignment
        case 'align-left': 
          block.className = 'selected align-left';
          break;
        case 'align-center': 
          block.className = 'selected align-center';
          break;
        case 'align-right': 
          block.className = 'selected align-right';
          break;
          
        // Table Controls
        case 'add-row':
          if (block.tagName === 'TABLE') {
            const row = block.insertRow(-1);
            const colCount = block.rows[0].cells.length;
            for (let i = 0; i < colCount; i++) {
              const cell = row.insertCell(0);
              cell.innerHTML = '&nbsp;';
              cell.style.border = '1px solid var(--border-default)';
              cell.style.padding = '12px';
            }
          }
          break;
          
        case 'add-col':
          if (block.tagName === 'TABLE') {
            for (let i = 0; i < block.rows.length; i++) {
              const cell = block.rows[i].insertCell(-1);
              cell.innerHTML = '&nbsp;';
              cell.style.border = '1px solid var(--border-default)';
              cell.style.padding = '12px';
            }
          }
          break;
          
        // Universal Delete
        case 'delete':
          if (block.tagName === 'IMG') {
            const src = block.getAttribute('src');
            if (src && src.includes('/api/sync/image/')) {
              const filename = src.split('/').pop();
              const token = window.Auth.getToken();
              fetch(`${window.API_BASE_URL}/sync/image/${filename}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              }).catch(err => console.error('Asset GC Failed:', err));
            }
          }
          block.remove();
          this._hideBlockToolbar();
          window.showToast('🗑️ Block purged successfully', 'info');
          break;
      }
      
      this._scheduleAutoSave();
      // Reposition handles
      if (document.contains(block)) {
        setTimeout(() => {
          this._handleBlockClick(block);
          this._positionManipulationHandles(block);
        }, 50);
      }
    },

    /* ── 💠 Direct Manipulation Engine (Pro) ── */

    _draggedBlock: null,
    _resizingBlock: null,
    _startWidth: 0,
    _startX: 0,

    _initDirectManipulation() {
      const body = document.getElementById('editor-body');
      const dragHandle = document.getElementById('block-drag-handle');
      const resizer = document.getElementById('block-resizer');
      const indicator = document.getElementById('drop-indicator');
      if (!body || !dragHandle || !resizer) return;

      // 1. Drag Handle Positioning (Hover)
      body.addEventListener('mousemove', (e) => {
        if (this._resizingBlock) return;
        const block = e.target.closest('img, table, hr, blockquote, p, h1, h2, h3, .mermaid-block, .pro-columns, .pro-toc, pre, ul, ol, .pro-callout, .pro-math-block');
        if (block && block.parentElement === body) {
          const rect = block.getBoundingClientRect();
          dragHandle.style.display = 'flex';
          dragHandle.style.top = `${rect.top + window.scrollY}px`;
          dragHandle.style.left = `${rect.left - 30}px`; /* Positioned in the 48px gutter */
          dragHandle._targetBlock = block;
          
          // Show a subtle hover state on the target block
          document.querySelectorAll('.editor-body > *').forEach(el => el.style.borderLeft = 'none');
          block.style.borderLeft = '2px solid var(--accent-primary-glow)';
        } else {
          dragHandle.style.display = 'none';
          document.querySelectorAll('.editor-body > *').forEach(el => el.style.borderLeft = 'none');
        }
      });

      body.addEventListener('mouseleave', () => {
        dragHandle.style.display = 'none';
      });

      // 2. Reordering Logic (Drag & Drop)
      dragHandle.addEventListener('dragstart', (e) => {
        this._draggedBlock = dragHandle._targetBlock;
        e.dataTransfer.setData('text/plain', ''); // Required for FF
        e.dataTransfer.effectAllowed = 'move';
        this._draggedBlock.style.opacity = '0.4';
        this._hideBlockToolbar();
      });

      dragHandle.addEventListener('dragend', () => {
        if (this._draggedBlock) this._draggedBlock.style.opacity = '1';
        indicator.style.display = 'none';
        this._draggedBlock = null;
      });

      body.addEventListener('dragover', (e) => {
        e.preventDefault();
        const block = e.target.closest('img, table, hr, blockquote, p, h1, h2, h3');
        if (block && block.parentElement === body && block !== this._draggedBlock) {
          const rect = block.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          indicator.style.display = 'block';
          indicator.style.width = `${rect.width}px`;
          indicator.style.left = `${rect.left}px`;
          
          if (e.clientY < midpoint) {
            indicator.style.top = `${rect.top + window.scrollY - 4}px`;
            indicator._dropPos = 'before';
          } else {
            indicator.style.top = `${rect.bottom + window.scrollY}px`;
            indicator._dropPos = 'after';
          }
          indicator._targetBlock = block;
        }
      });

      body.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this._draggedBlock && indicator._targetBlock) {
          if (indicator._dropPos === 'before') {
            body.insertBefore(this._draggedBlock, indicator._targetBlock);
          } else {
            body.insertBefore(this._draggedBlock, indicator._targetBlock.nextSibling);
          }
          this._scheduleAutoSave();
        }
      });

      // 3. Pixel-Perfect Resizing
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!this._selectedBlock) return;
        this._resizingBlock = this._selectedBlock;
        this._startWidth = this._resizingBlock.offsetWidth;
        this._startX = e.clientX;
        this._resizingBlock.classList.add('resizing');
        
        const onMouseMove = (moveEvent) => {
          if (!this._resizingBlock) return;
          const deltaX = moveEvent.clientX - this._startX;
          const newWidth = Math.max(50, Math.min(body.offsetWidth, this._startWidth + deltaX));
          this._resizingBlock.style.width = `${newWidth}px`;
          this._positionManipulationHandles(this._resizingBlock);
        };

        const onMouseUp = () => {
          if (this._resizingBlock) {
            this._resizingBlock.classList.remove('resizing');
            this._resizingBlock = null;
            this._scheduleAutoSave();
          }
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    },

    // Extends _handleBlockClick to position resizer
    _positionManipulationHandles(block) {
      const resizer = document.getElementById('block-resizer');
      if (!resizer) return;

      if (['IMG', 'TABLE'].includes(block.tagName)) {
        const rect = block.getBoundingClientRect();
        resizer.style.display = 'block';
        resizer.style.top = `${rect.bottom + window.scrollY - 6}px`;
        resizer.style.left = `${rect.right - 6}px`;
      } else {
        resizer.style.display = 'none';
      }
    }
  };
})();
