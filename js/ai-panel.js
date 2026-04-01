/* ============================================
   AI PANEL — Intelligent Assistant Integration
   ============================================ */

(function () {
  let isAiOpen = false;
  let isWaiting = false;
  let useVoiceOutput = false;

  window.AIPanel = {
    init() {
      this._injectHtml();
      this._bindEvents();
    },

    open() {
      if (isAiOpen) return;
      isAiOpen = true;
      document.getElementById('ai-panel')?.classList.add('open');
      document.body.classList.add('ai-panel-active');
      const input = document.getElementById('ai-input');
      if (input) {
        setTimeout(() => input.focus(), 300);
      }
    },

    close() {
      if (!isAiOpen) return;
      isAiOpen = false;
      document.getElementById('ai-panel')?.classList.remove('open');
      document.body.classList.remove('ai-panel-active');
      document.getElementById('editor-view')?.focus();
    },

    toggle() {
      isAiOpen ? this.close() : this.open();
    },

    _injectHtml() {
      const body = document.body;
      const html = `
        <div id="ai-panel" class="ai-panel">
          <div class="ai-panel-header">
            <div class="ai-panel-title">
              <i class="ph-fill ph-magic-wand"></i> Mnemos AI
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <select id="ai-context-select" style="background:var(--bg-tertiary); border:1px solid var(--border-default); border-radius:4px; color:var(--text-secondary); font-size:11px; padding:2px 4px; outline:none;">
                <option value="note">Note Context</option>
                <option value="folder">Folder Context</option>
                <option value="workspace">Workspace</option>
              </select>
              <button class="ai-panel-close" id="ai-panel-close" title="Close Panel">
                <i class="ph-bold ph-x" style="font-size:16px;"></i>
              </button>
            </div>
          </div>
          
          <div class="ai-chat-area" id="ai-chat-area">
            <div class="ai-empty-state" id="ai-empty-state">
              <i class="ph-duotone ph-sparkle"></i>
              <p>How can I help you today?</p>
            </div>
            <!-- Chat history will append here -->
          </div>

          <div class="ai-quick-actions" id="ai-quick-actions">
            <button class="ai-action-chip" data-action="summarize">Summarize</button>
            <button class="ai-action-chip" data-action="improve">Improve</button>
            <button class="ai-action-chip" data-action="actions">Action Items</button>
            <button class="ai-action-chip" data-action="flashcards">Flashcards</button>
            <button class="ai-action-chip" data-action="quiz">Quiz Me!</button>
            <button class="ai-action-chip" data-action="mindmap">Mind Map</button>
          </div>

          <form class="ai-input-area" id="ai-form" style="display:flex; gap:8px;">
            <button type="button" id="ai-voice-btn" class="ai-send-btn" title="Voice Dictation" style="background:transparent; color:var(--text-secondary);">
              <i class="ph-bold ph-microphone" style="font-size:18px;"></i>
            </button>
            <button type="button" id="ai-stop-btn" class="ai-send-btn" title="Stop Audio" style="display:none; background:var(--accent-danger); color:#fff; border-radius:4px;">
              <i class="ph-bold ph-stop" style="font-size:18px;"></i>
            </button>
            <textarea id="ai-input" class="ai-input" placeholder="Ask AI..." rows="1"></textarea>
            <button type="submit" id="ai-send" class="ai-send-btn" title="Send Request">
              <i class="ph-bold ph-paper-plane-right" style="font-size:18px;"></i>
            </button>
          </form>
        </div>
      `;
      body.insertAdjacentHTML('beforeend', html);
    },

    _bindEvents() {
      const closeBtn = document.getElementById('ai-panel-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());

      const aiToggleBtn = document.getElementById('ai-toggle-btn');
      if (aiToggleBtn) aiToggleBtn.addEventListener('click', () => this.toggle());

      const form = document.getElementById('ai-form');
      const input = document.getElementById('ai-input');
      
      if (form && input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.dispatchEvent(new Event('submit'));
          }
        });

        // Auto resize input
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const query = input.value.trim();
          if (!query || isWaiting) return;

          this._handleChatSubmit(query);
          input.value = '';
          input.style.height = 'auto';
        });
      }
      
      // Voice Integration
      const voiceBtn = document.getElementById('ai-voice-btn');
      if (voiceBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          
          recognition.onstart = () => {
             voiceBtn.innerHTML = '<i class="ph-fill ph-microphone" style="color:var(--accent-danger);"></i>';
          };
          
          recognition.onresult = (e) => {
             const text = e.results[0][0].transcript;
             if(input) input.value = text;
             useVoiceOutput = true; 
             if(form) form.dispatchEvent(new Event('submit'));
          };
          
          recognition.onerror = (e) => {
             console.error('Speech error', e);
             voiceBtn.innerHTML = '<i class="ph-bold ph-microphone" style="font-size:18px;"></i>';
          };
          
          recognition.onend = () => {
             voiceBtn.innerHTML = '<i class="ph-bold ph-microphone" style="font-size:18px;"></i>';
          };
          
          voiceBtn.addEventListener('click', () => {
             try { recognition.start(); } catch(err) {}
          });
        } else {
          voiceBtn.style.display = 'none'; // Not supported
        }
      }

      const stopBtn = document.getElementById('ai-stop-btn');
      if (stopBtn) {
         stopBtn.addEventListener('click', () => {
             if (window.speechSynthesis) window.speechSynthesis.cancel();
             stopBtn.style.display = 'none';
         });
      }

      // Quick Actions
      document.querySelectorAll('.ai-action-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          const action = e.target.dataset.action;
          if (isWaiting) return;
          this._handleQuickAction(action);
        });
      });

      // Bind Modal UI close button
      const modalClose = document.getElementById('ai-modal-close');
      if (modalClose) {
        modalClose.addEventListener('click', () => {
          document.getElementById('ai-modal-overlay').style.display = 'none';
        });
      }

      // ── Global AI FAB Button ──
      const globalFab = document.getElementById('global-ai-fab');
      if (globalFab) {
        globalFab.addEventListener('click', () => {
          this.open();
          const aiInput = document.getElementById('ai-input');
          if (aiInput) setTimeout(() => aiInput.focus(), 300);
        });
      }

      // ── Global Voice Button ──
      const globalVoiceBtn = document.getElementById('global-voice-btn');
      if (globalVoiceBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const globalRecognition = new SpeechRecognition();
          globalRecognition.continuous = false;
          globalRecognition.interimResults = false;
          
          globalRecognition.onstart = () => {
            globalVoiceBtn.classList.add('recording');
            globalVoiceBtn.innerHTML = '<i class="ph-fill ph-stop"></i>';
            window.showToast('🎤 Listening...', 'info');
          };
          
          globalRecognition.onresult = (e) => {
            const text = e.results[0][0].transcript;
            // Open the panel and submit directly
            this.open();
            useVoiceOutput = true;
            setTimeout(() => this._handleChatSubmit(text), 400);
          };
          
          globalRecognition.onerror = (e) => {
            console.error('Voice error:', e);
            globalVoiceBtn.classList.remove('recording');
            globalVoiceBtn.innerHTML = '<i class="ph-fill ph-microphone"></i>';
          };
          
          globalRecognition.onend = () => {
            globalVoiceBtn.classList.remove('recording');
            globalVoiceBtn.innerHTML = '<i class="ph-fill ph-microphone"></i>';
          };
          
          globalVoiceBtn.addEventListener('click', () => {
            try { globalRecognition.start(); } catch(err) {}
          });
        } else {
          globalVoiceBtn.style.display = 'none';
        }
      }

      // ── Global Keyboard Shortcuts ──
      document.addEventListener('keydown', (e) => {
        // Ctrl+Space → Open AI panel
        if (e.code === 'Space' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          e.preventDefault();
          this.open();
          const aiInput = document.getElementById('ai-input');
          if (aiInput) setTimeout(() => aiInput.focus(), 300);
        }
        // Ctrl+Shift+Space → Start voice recording directly
        if (e.code === 'Space' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
          e.preventDefault();
          const gvBtn = document.getElementById('global-voice-btn');
          if (gvBtn) gvBtn.click();
        }
      });
    },

    async _handleChatSubmit(query) {
      this._appendMessage('user', query);
      const loadingId = this._appendLoading();
      isWaiting = true;

      // Collect Context — auto-detect best mode
      let context = '';
      let contextMode = document.getElementById('ai-context-select')?.value || 'workspace';
      const currentId = window.Editor ? window.Editor.getCurrentId() : null;
      
      if (contextMode === 'note') {
         if (currentId) {
            const editorHtml = document.getElementById('editor-body')?.innerHTML || '';
            const note = window.Store.getNote(currentId);
            let metadataStr = '';
            if (note) {
               metadataStr = `[METADATA: Title="${note.title}", Tags="${(note.tags||[]).join(', ')}", Pinned=${note.pinned ? 'true' : 'false'}]\n\n`;
            }
            context = metadataStr + editorHtml;
         } else {
            context = "[SYSTEM NOTIFICATION: The user is in 'Note Mode' but NO Note is currently actively open in the Editor. Please kindly tell the user to click on a note first if they want you to read or analyze a specific note.]";
         }
      } else if (contextMode === 'folder') {
         const activeFilter = window.Sidebar ? window.Sidebar.getFilter() : { type: 'all' };
         let targetFolderId = null;
         let folderName = 'Current Workspace Context';
         
         if (activeFilter && activeFilter.type === 'folder' && activeFilter.id) {
             targetFolderId = activeFilter.id;
             const fObj = window.Store.getFolder(targetFolderId);
             if (fObj) folderName = fObj.name;
         } else if (currentId) {
             const note = window.Store.getNote(currentId);
             if (note && note.folderId) {
                 targetFolderId = note.folderId;
                 const fObj = window.Store.getFolder(targetFolderId);
                 if (fObj) folderName = fObj.name;
             }
         }
         
         if (targetFolderId) {
            const folderNotes = window.Store.getAllNotes().filter(n => n.folderId === targetFolderId);
            const notesStr = folderNotes.map(n => `[Note: ${n.title} | Tags: ${(n.tags||[]).join(', ')}]\n${n.content || ''}`).join('\n\n---\n\n');
            context = `[FOLDER CONTEXT: "${folderName}"]\nThere are ${folderNotes.length} notes in this folder.\n\n${notesStr}`;
         } else {
            const allNotes = window.Store.getAllNotes();
            const notesStr = allNotes.map(n => `[Note: ${n.title} | Tags: ${(n.tags||[]).join(', ')}]\n${n.content || ''}`).join('\n\n---\n\n');
            context = `[ALL NOTES CONTEXT]\nThere are ${allNotes.length} notes total.\n\n${notesStr}`;
         }
      } else if (contextMode === 'workspace') {
         // Workspace mode: provide a compact summary of all notes + folders
         const allFolders = window.Store.getAllFolders();
         const allNotes = window.Store.getAllNotes();
         const folderSummary = allFolders.map(f => `Folder: ${f.name} (${allNotes.filter(n => n.folderId === f.id).length} notes)`).join('\n');
         const noteSummary = allNotes.slice(0, 30).map(n => {
            const plainText = window.Store.stripHtml(n.content || '').substring(0, 50).replace(/\n/g, ' ');
            return `- "${n.title || 'Untitled'}" [tags: ${(n.tags||[]).join(',')}] (snippet: "${plainText}...")`;
         }).join('\n');
         context = `[WORKSPACE SUMMARY]\n${allFolders.length} folders, ${allNotes.length} notes total\n\nFolders:\n${folderSummary || 'No folders'}\n\nNotes:\n${noteSummary || 'No notes'}`;
      }

      try {
        const token = window.Auth.getToken();
        // Always use the agent endpoint for maximum capability
        const endpoint = '/ai/agent';
        
        // 60 second timeout to prevent infinite hang
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prompt: query, context: context.substring(0, 15000) }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('AI failed to respond');
        const data = await res.json();
        
        if (data.agent && data.agent.actions) {
           const actions = data.agent.actions;
           
           // Separate CHAT actions from execution actions
           const chatActions = actions.filter(a => a.action === 'CHAT');
           const execActions = actions.filter(a => a.action !== 'CHAT');
           
           if (execActions.length === 0 && chatActions.length > 0) {
              // Pure conversation
              const chatText = chatActions.map(a => a.text).join('\n\n');
              this._replaceLoadingWithMessage(loadingId, chatText || 'No response.');
              if (useVoiceOutput) this._speak(chatText);
           } else {
              // Execute all actions sequentially with stagger
              const totalOps = execActions.length;
              let completed = 0;
              
              execActions.forEach((actionPayload, i) => {
                 setTimeout(() => {
                    try {
                       this._executeAgentAction(actionPayload);
                       completed++;
                    } catch(e) {
                       console.warn(`[Agent] Action ${i} (${actionPayload.action}) failed:`, e);
                    }
                    
                    // After all completed — refresh UI and report
                    if (completed >= totalOps) {
                       window.NoteList.render(true);
                       if (window.Sidebar) {
                          window.Sidebar.renderFolders();
                          window.Sidebar.renderTags();
                       }
                    }
                 }, i * 250); // 250ms stagger between operations
              });
              
              // Build summary
              const actionNames = execActions.map(a => a.action.replace(/_/g, ' ')).join(', ');
              const summaryMsg = totalOps === 1
                 ? `✨ **${execActions[0].action}** completed!`
                 : `✨ **${totalOps} actions** executed: ${actionNames}`;
              
              // Include any CHAT text too
              const chatText = chatActions.map(a => a.text).join('\n\n');
              this._replaceLoadingWithMessage(loadingId, chatText ? `${summaryMsg}\n\n${chatText}` : summaryMsg);
              if (useVoiceOutput) this._speak(`Done! I completed ${totalOps} task${totalOps > 1 ? 's' : ''}.`);
           }
        } else if (data.result) {
           this._replaceLoadingWithMessage(loadingId, data.result || 'No response generated.');
           if (useVoiceOutput) this._speak(data.result);
        } else {
           this._replaceLoadingWithMessage(loadingId, '⚠️ No actionable response from AI.');
        }
      } catch (err) {
        const errorMsg = err.name === 'AbortError' 
          ? '⚠️ Request timed out (60s). Try a simpler prompt or check your LLM API keys.'
          : `⚠️ Error: ${err.message}`;
        this._replaceLoadingWithMessage(loadingId, errorMsg);
      } finally {
        isWaiting = false;
      }
    },

    _executeAgentAction(payload) {
       const { action, text, title, tags } = payload;

       // Handle System actions
       if (action === 'AUTO_CREATE_NOTE' || action === 'CREATE_NOTE' || action === 'CREATE_RICH_NOTE') {
          let folderId = window.Sidebar && window.Sidebar.currentFolderId ? window.Sidebar.currentFolderId : null;
          
          // If AI specified a folder name, find or create it
          const folderName = payload.folderName;
          if (folderName) {
             const allFolders = window.Store.getAllFolders();
             const existing = allFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
             if (existing) {
                folderId = existing.id;
             } else {
                const newFolder = window.Store.createFolder(folderName);
                folderId = newFolder.id;
                window.Sidebar.renderFolders();
             }
          }
          
          const target_title = title || '✨ AI Generating...';
          const instructions = payload.instructions || text || 'Write a detailed HTML document for this note.';
          const newNote = window.Store.createNote(folderId);
          
          if (newNote) {
             // Create skeleton note immediately
             window.Store.updateNote(newNote.id, { 
                 title: target_title, 
                 content: '<div style="text-align:center;padding:40px;color:#888;">🤖 AI is writing this note in the background...</div>' 
             });
             
             if (window.Editor) {
                window.Editor.open(newNote.id);
                window.NoteList.render();
                window.showToast('🚀 AI worker dispatched to write note...', 'info', 3000);
             }
             
             // Spawn sub-agent writer
             fetch(`${window.API_BASE_URL}/ai/agent`, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${window.Auth.getToken()}`
                 },
                 body: JSON.stringify({
                     prompt: `CREATION TASK: ${instructions}.\n\nOutput your response ONLY as an array containing a single {"action": "FIND_AND_UPDATE"} object outputting the generated rich HTML content.\n\nCRITICAL DESIGN RULE: NEVER wrap the entire document in global background colors or top-level text colors. Background colors ONLY belong on code blocks or specific highlights. Do NOT add <style> blocks.`,
                     context: `[METADATA: Title="${target_title}"]\n\n(Drafting new content...)`
                 })
             }).then(res => res.json()).then(data => {
                 if (data.agent && data.agent.actions && data.agent.actions.length > 0) {
                     const updateAction = data.agent.actions.find(a => a.action === 'FIND_AND_UPDATE' || a.action === 'REPLACE_ALL');
                     if (updateAction && updateAction.text) {
                         const cleanHtml = this._sanitizeAgentHtml(updateAction.text);
                         window.Store.updateNote(newNote.id, { content: cleanHtml, title: updateAction.title || target_title });
                         
                         // Refresh live if editor is open
                         const currentOpenId = window.Editor ? window.Editor.getCurrentId() : null;
                         if (currentOpenId === newNote.id) {
                            const editorBody = document.getElementById('editor-body');
                            if (editorBody) editorBody.innerHTML = cleanHtml;
                            window.Editor._scheduleAutoSave();
                         }
                         window.NoteList.render();
                         window.showToast(`✅ Finished writing "${target_title}"!`, 'success');
                     } else {
                         window.showToast(`⚠️ AI couldn't generate content for "${target_title}"`, 'warning');
                     }
                 }
             }).catch(err => {
                 console.error('Creation Sub-Agent Error:', err);
                 window.showToast(`🧨 Failed to write background note "${target_title}"`, 'error');
             });
          }
          return;
       }
       
       if (!window.Editor) return;
       const currentId = window.Editor.getCurrentId();
       let targetId = currentId;
       
       if (payload.searchQuery && !['AUTO_CREATE_NOTE', 'CREATE_NOTE', 'CREATE_RICH_NOTE'].includes(action)) {
           const query = payload.searchQuery.toLowerCase();
           const allNotes = window.Store.getAllNotes();
           const match = allNotes.find(n => (n.title || '').toLowerCase().includes(query))
              || allNotes.find(n => window.Store.stripHtml(n.content || '').toLowerCase().includes(query));
           if (match) targetId = match.id;
       }
       const isActiveEditor = targetId === currentId;
       
       if (action === 'UPDATE_TITLE' && targetId) {
          if (title) {
             window.Store.updateNote(targetId, { title });
             if (isActiveEditor) {
                 document.getElementById('note-title-display').textContent = title;
             }
             window.NoteList.render();
             window.showToast('🤖 AI renamed note', 'success');
          }
          return;
       }
       
       if (action === 'ADD_TAG' && targetId) {
          if (tags) {
             const note = window.Store.getNote(targetId);
             const tagArray = tags.split(',').map(t => t.trim().replace(/^#/, ''));
             const currentTags = note.tags || [];
             const merged = [...new Set([...currentTags, ...tagArray])];
             window.Store.updateNote(targetId, { tags: merged });
             if (isActiveEditor && window.Editor._renderTags) window.Editor._renderTags(merged);
             window.Sidebar.renderTags();
             window.showToast('🤖 AI added tags', 'success');
          }
          return;
       }

       if (action === 'DELETE_NOTE' && targetId) {
          if (window.showConfirm) {
             window.showConfirm('🤖 AI wants to delete this note', 'This action cannot be undone. The AI agent requested deletion.', () => {
                window.Store.deleteNote(targetId);
                if (isActiveEditor) window.Editor.close();
                window.NoteList.render();
                window.Sidebar.renderFolders();
                window.showToast('🤖 AI deleted note', 'danger');
             });
          }
          return;
       }

       if (action === 'PIN_NOTE' && targetId) {
          const note = window.Store.togglePin(targetId);
          if (isActiveEditor && window.Editor._updatePinButton) window.Editor._updatePinButton(note.pinned);
          window.NoteList.render();
          window.showToast(note.pinned ? '🤖 AI pinned note' : '🤖 AI unpinned note', 'info');
          return;
       }

       if (action === 'CHANGE_THEME_DARK') {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('mnemos_theme', 'dark');
          window.showToast('🤖 Theme updated', 'success');
          return;
       }
       if (action === 'CHANGE_THEME_LIGHT') {
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('mnemos_theme', 'light');
          window.showToast('🤖 Theme updated', 'success');
          return;
       }

       // ── Workspace Organization Tools ──
       if (action === 'CREATE_FOLDER') {
          const folderName = title || payload.folderName || 'New Folder';
          const folder = window.Store.createFolder(folderName);
          if (folder) {
             window.Sidebar.renderFolders();
             window.showToast(`🤖 AI created folder: ${folderName}`, 'success');

             // If this was part of CREATE_NOTE with a folder, also handle that
             if (text) {
                const newNote = window.Store.createNote(folder.id);
                if (newNote) {
                   window.Store.updateNote(newNote.id, { title: title || '✨ AI Note', content: text });
                   window.Editor.open(newNote.id);
                   window.NoteList.render();
                }
             }
          }
          return;
       }

       if (action === 'MOVE_NOTE' && targetId) {
          const folderName = payload.folderName || title || '';
          if (folderName) {
             const allFolders = window.Store.getAllFolders();
             const targetFolder = allFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
             if (targetFolder) {
                window.Store.updateNote(targetId, { folderId: targetFolder.id });
                window.NoteList.render();
                window.Sidebar.renderFolders();
                window.showToast(`🤖 Note moved to "${targetFolder.name}"`, 'success');
             } else {
                // Folder doesn't exist — create it first
                const newFolder = window.Store.createFolder(folderName);
                window.Store.updateNote(targetId, { folderId: newFolder.id });
                window.NoteList.render();
                window.Sidebar.renderFolders();
                window.showToast(`🤖 Created "${folderName}" and moved note`, 'success');
             }
          } else {
             window.showToast('🤖 No folder name specified', 'warning');
          }
          return;
       }

       if (action === 'DUPLICATE_NOTE' && targetId) {
          const srcNote = window.Store.getNote(targetId);
          if (srcNote) {
             const newNote = window.Store.createNote(srcNote.folderId);
             if (newNote) {
                window.Store.updateNote(newNote.id, {
                   title: (srcNote.title || 'Untitled') + ' (Copy)',
                   content: srcNote.content || '',
                   tags: [...(srcNote.tags || [])],
                   pinned: false
                });
                window.Editor.open(newNote.id);
                window.NoteList.render();
                window.showToast('🤖 Note duplicated', 'success');
             }
          }
          return;
       }

       if (action === 'REMOVE_TAG' && targetId) {
          const tagToRemove = (tags || '').trim().toLowerCase().replace(/^#/, '');
          if (tagToRemove) {
             const note = window.Store.getNote(targetId);
             const newTags = (note.tags || []).filter(t => t.toLowerCase() !== tagToRemove);
             window.Store.updateNote(targetId, { tags: newTags });
             if (isActiveEditor && window.Editor._renderTags) window.Editor._renderTags(newTags);
             window.Sidebar.renderTags();
             window.showToast(`🤖 Removed tag: ${tagToRemove}`, 'success');
          }
          return;
       }

       // ── AI-Powered Tools ──
       if (action === 'CREATE_FLASHCARDS') {
          // Trigger the existing flashcard flow via the quick action handler
          if (window.AIPanel) {
             window.AIPanel._handleQuickAction('flashcards');
          }
          return;
       }

       if (action === 'EXPORT_PDF') {
          if (!isActiveEditor && targetId) window.Editor.open(targetId);
          // Use browser print dialog for PDF export
          const editorBody = document.getElementById('editor-body');
          const titleEl = document.getElementById('editor-title');
          if (editorBody) {
             const printWindow = window.open('', '_blank');
             printWindow.document.write(`
                <!DOCTYPE html><html><head><title>${titleEl?.value || 'Mnemos Note'}</title>
                <style>
                   body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
                   h1 { font-size: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
                   table { border-collapse: collapse; width: 100%; margin: 16px 0; }
                   td, th { border: 1px solid #ddd; padding: 8px 12px; }
                   th { background: #f5f5f5; }
                   pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
                   code { font-family: 'Fira Code', monospace; font-size: 13px; }
                   blockquote { border-left: 3px solid #6366f1; padding: 8px 16px; margin: 12px 0; color: #666; font-style: italic; }
                   img { max-width: 100%; }
                   @media print { body { margin: 0; } }
                </style></head><body>
                <h1>${titleEl?.value || 'Untitled'}</h1>
                ${editorBody.innerHTML}
                </body></html>
             `);
             printWindow.document.close();
             printWindow.focus();
             setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
             window.showToast('🤖 PDF export opened', 'success');
          }
          return;
       }

       if (action === 'INSERT_MERMAID') {
          // Render mermaid diagram in the existing modal
          const mermaidCode = text || '';
          if (mermaidCode && window.AIPanel._renderMindMapUI) {
             window.AIPanel._renderMindMapUI(mermaidCode);
             window.showToast('🤖 Mermaid diagram generated', 'success');
          } else {
             window.showToast('🤖 No diagram content generated', 'warning');
          }
          return;
       }

       // ── Workspace Search & Navigation Tools ──
       if (action === 'SEARCH_NOTES') {
          const query = payload.searchQuery || text || '';
          if (query) {
             // Set the search input and trigger re-render
             const searchInput = document.getElementById('search-input');
             if (searchInput) {
                searchInput.value = query;
                window.SearchManager.query = query;
                window.NoteList.render(true);
                window.showToast(`🤖 Searching for: "${query}"`, 'success');
             }
          } else {
             window.showToast('🤖 No search query specified', 'warning');
          }
          return;
       }

       if (action === 'OPEN_NOTE') {
          const query = (payload.searchQuery || text || '').toLowerCase();
          if (query) {
             const allNotes = window.Store.getAllNotes();
             // Find best match by title, then by content
             const match = allNotes.find(n => (n.title || '').toLowerCase().includes(query))
                || allNotes.find(n => window.Store.stripHtml(n.content || '').toLowerCase().includes(query));
             if (match) {
                window.Editor.open(match.id);
                window.NoteList.render();
                window.showToast(`🤖 Opened: "${match.title || 'Untitled'}"`, 'success');
             } else {
                window.showToast(`🤖 No note found matching "${query}"`, 'warning');
             }
          }
          return;
       }

       if (action === 'LIST_NOTES') {
          const folderName = payload.folderName;
          let notes = window.Store.getAllNotes();
          let label = 'all notes';
          
          if (folderName) {
             const allFolders = window.Store.getAllFolders();
             const folder = allFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
             if (folder) {
                notes = notes.filter(n => n.folderId === folder.id);
                label = `notes in "${folder.name}"`;
             }
          }
          
          // Build a summary for the chat
          if (notes.length === 0) {
             this._appendMessage('ai', `📋 No ${label} found.`);
          } else {
             const listHtml = notes.map((n, i) => 
                `<b>${i + 1}.</b> ${n.title || 'Untitled'} <span style="color:var(--text-tertiary);font-size:12px;">(${(n.tags || []).join(', ') || 'no tags'})</span>`
             ).join('<br>');
             this._appendMessage('ai', `📋 <b>${notes.length} ${label}:</b><br>${listHtml}`);
          }
          window.showToast(`🤖 Listed ${notes.length} ${label}`, 'info');
          return;
       }

       if (action === 'FILTER_BY_TAG') {
          const tagName = (tags || payload.searchQuery || '').trim().toLowerCase().replace(/^#/, '');
          if (tagName) {
             // Click the tag in sidebar to filter
             const tagEls = document.querySelectorAll('.tag-item');
             let found = false;
             tagEls.forEach(el => {
                if ((el.textContent || '').toLowerCase().trim().replace(/^#/, '') === tagName) {
                   el.click();
                   found = true;
                }
             });
             if (!found) {
                // Manual filter via search
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                   searchInput.value = tagName;
                   window.SearchManager.query = tagName;
                   window.NoteList.render(true);
                }
             }
             window.showToast(`🤖 Filtered by tag: ${tagName}`, 'success');
          }
          return;
       }

       if (action === 'SORT_NOTES') {
          const c = (payload.searchQuery || text || 'newest').toLowerCase();
          let sortBy = 'newest';
          
          if (c.includes('alpha') || c.includes('name') || c.includes('a-z') || c.includes('z-a')) {
             if (c.includes('desc') || c.includes('z-a') || c.includes('reverse')) sortBy = 'alpha_desc';
             else sortBy = 'alpha_asc';
          } 
          else if (c.includes('length') || c.includes('content') || c.includes('size')) {
             if (c.includes('asc') || c.includes('shortest') || c.includes('reverse') || c.includes('small')) sortBy = 'length_asc';
             else sortBy = 'length_desc';
          }
          else {
             // date based or default (like "descending order")
             if (c.includes('old') || (c.includes('asc') && !c.includes('desc'))) sortBy = 'oldest';
             else sortBy = 'newest';
          }
          
          window.Store.saveSetting('sortBy', sortBy);
          window.NoteList.render(true);
          window.showToast(`🤖 Notes sorted: ${sortBy}`, 'success');
          return;
       }

       if (action === 'FIND_AND_UPDATE') {
          const query = (payload.searchQuery || '').toLowerCase();
          if (query) {
             const allNotes = window.Store.getAllNotes();
             const match = allNotes.find(n => (n.title || '').toLowerCase().includes(query))
                || allNotes.find(n => window.Store.stripHtml(n.content || '').toLowerCase().includes(query));
             
             if (match) {
                // Build update payload
                const updates = {};
                if (title) updates.title = title;
                if (text) {
                   // REPLACE the content entirely with the new rich content
                   updates.content = this._sanitizeAgentHtml(text);
                }
                window.Store.updateNote(match.id, updates);
                
                // If this note is currently open in the editor, refresh it live
                const currentOpenId = window.Editor ? window.Editor.getCurrentId() : null;
                if (currentOpenId === match.id) {
                   const editorBody = document.getElementById('editor-body');
                   if (editorBody && updates.content) editorBody.innerHTML = updates.content;
                   const editorTitle = document.getElementById('editor-title');
                   if (editorTitle && updates.title) editorTitle.value = updates.title;
                   window.Editor._scheduleAutoSave();
                }
                
                window.NoteList.render();
                window.showToast(`🤖 Updated: "${match.title}"`, 'success');
             } else {
                window.showToast(`🤖 No note found matching "${query}"`, 'warning');
             }
          }
          return;
       }

       if (action === 'AUTO_ENHANCE_NOTE') {
          const query = (payload.searchQuery || '').toLowerCase();
          const instructions = payload.instructions;
          if (query && instructions) {
             const allNotes = window.Store.getAllNotes();
             const match = allNotes.find(n => (n.title || '').toLowerCase().includes(query))
                || allNotes.find(n => window.Store.stripHtml(n.content || '').toLowerCase().includes(query));
             
             if (match) {
                // Determine a safe string context for the targeted note
                let contextStr = `[METADATA: Title="${match.title}"]\n\n${match.content || ''}`;
                window.showToast(`🤖 AI is enhancing "${match.title}" in the background...`, 'info', 3000);
                
                // Spawn a detached async sub-request strictly focused on rewriting this note
                // Using the same endpoint but explicitly commanding it to replace_all
                fetch(`${window.API_BASE_URL}/ai/agent`, {
                   method: 'POST',
                   headers: {
                       'Content-Type': 'application/json',
                       'Authorization': `Bearer ${window.Auth.getToken()}`
                   },
                   body: JSON.stringify({
                       prompt: `ENHANCEMENT TASK: ${instructions}.\n\nCRITICAL CONTENT RULE: You MUST PRESERVE all existing informational content and structural meaning. Expand and enrich the content seamlessly, but DO NOT delete existing user data unless explicitly asked. Synthesize the new content intelligently around the old content.\nCRITICAL DESIGN RULE: NEVER wrap the document in global background colors or top-level inline styles. The editor handles global themes natively. Focus purely on clean, rich semantic HTML.\n\nOutput your response ONLY as an array containing a single {"action": "FIND_AND_UPDATE"} object replacing the entire note content with the newly enhanced rich HTML.`,
                       context: contextStr
                   })
                }).then(res => res.json()).then(data => {
                   if (data.agent && data.agent.actions && data.agent.actions.length > 0) {
                       const updateAction = data.agent.actions.find(a => a.action === 'FIND_AND_UPDATE' || a.action === 'REPLACE_ALL');
                       if (updateAction && updateAction.text) {
                           const newHtml = this._sanitizeAgentHtml(updateAction.text);
                           
                           // Update store
                           window.Store.updateNote(match.id, { content: newHtml });
                           
                           // If open, refresh live editor
                           const currentOpenId = window.Editor ? window.Editor.getCurrentId() : null;
                           if (currentOpenId === match.id) {
                              const editorBody = document.getElementById('editor-body');
                              if (editorBody) editorBody.innerHTML = newHtml;
                              window.Editor._scheduleAutoSave();
                           }
                           
                           window.NoteList.render();
                           window.showToast(`✅ Successfully enhanced "${match.title}"!`, 'success');
                       } else {
                           window.showToast(`⚠️ AI failed to provide valid enhancement format for "${match.title}"`, 'warning');
                       }
                   }
                }).catch(err => {
                   console.error('Enhancement Sub-Agent Error:', err);
                   window.showToast(`🧨 Failed to enhance "${match.title}"`, 'error');
                });
             } else {
                window.showToast(`🤖 Couldn't find note "${payload.searchQuery}" to enhance`, 'warning');
             }
          }
          return;
       }

       // Text manipulating actions (These rely on Range/execCommand modifying the active DOM)
       if (!isActiveEditor && targetId) {
          window.Editor.open(targetId);
       }
       
       const body = document.getElementById('editor-body');
       if (!body) return;
       
       // For agent actions, the AI sends raw HTML — do NOT run through _parseMarkdown which escapes tags!
       const parsedHtml = this._sanitizeAgentHtml(text || '');
       
       if (action === 'FORMAT_TEXT' || action === 'CHANGE_COLOR' || action === 'INSERT_LINK') {
          const { targetText, format, color, isBg, url } = payload;
          if (!targetText) {
             window.showToast('🤖 No target text specified for formatting', 'warning');
             return;
          }
          if (action === 'FORMAT_TEXT' && !format) {
             window.showToast('🤖 No format specified', 'warning');
             return;
          }
          if (window.find) {
             // BUGFIX: Focus editor and collapse caret to top so `window.find` searches downwards inside document
             body.focus();
             const rng = document.createRange();
             rng.selectNodeContents(body);
             rng.collapse(true);
             const sel = document.getSelection();
             sel.removeAllRanges();
             sel.addRange(rng);

             // Search only downwards
             const found = window.find(targetText, false, false, false, false, false, false);
             
             if (found) {
                // BUGFIX: Verify selection is actually inside editor, not in Chat Panel
                const currentSel = window.getSelection();
                if (currentSel.rangeCount > 0 && body.contains(currentSel.anchorNode)) {
                   if (action === 'CHANGE_COLOR') {
                      if (isBg) {
                          if (!document.execCommand('hiliteColor', false, color || 'yellow')) {
                              document.execCommand('backColor', false, color || 'yellow');
                          }
                      } else {
                          document.execCommand('foreColor', false, color || 'red');
                      }
                   } else if (action === 'INSERT_LINK') {
                      document.execCommand('createLink', false, url || '#');
                   } else {
                      if (['bold', 'italic', 'underline', 'strikeThrough'].includes(format)) {
                         document.execCommand(format, false, null);
                      } else if (['h1', 'h2', 'h3'].includes(format)) {
                         document.execCommand('formatBlock', false, format.toUpperCase());
                      } else if (format === 'ul') {
                         document.execCommand('insertUnorderedList', false, null);
                      } else if (format === 'ol') {
                         document.execCommand('insertOrderedList', false, null);
                      } else if (format === 'checklist') {
                         document.execCommand('insertUnorderedList', false, null);
                      }
                   }
                   window.Editor._scheduleAutoSave();
                } else {
                   window.showToast('🤖 Target text found outside document boundaries', 'warning');
                }
             } else {
                window.showToast('🤖 Could not find target text to format', 'warning');
             }
          }
       } else if (action === 'TRANSLATE_TEXT') {
          // Find the target text and replace it with the translated version
          const { targetText } = payload;
          if (targetText && text && window.find) {
             body.focus();
             const rng = document.createRange();
             rng.selectNodeContents(body);
             rng.collapse(true);
             const sel = document.getSelection();
             sel.removeAllRanges();
             sel.addRange(rng);
             const found = window.find(targetText, false, false, false, false, false, false);
             if (found) {
                const currentSel = window.getSelection();
                if (currentSel.rangeCount > 0 && body.contains(currentSel.anchorNode)) {
                   document.execCommand('insertText', false, text);
                   window.Editor._scheduleAutoSave();
                } else {
                   window.showToast('🤖 Target text found outside editor', 'warning');
                }
             } else {
                window.showToast('🤖 Could not find text to translate', 'warning');
             }
          }
       } else if (action === 'REPLACE_ALL' || action === 'FIX_GRAMMAR') {
          let cleanHtml = parsedHtml
             .replace(/\[METADATA:[^\]]*\]\s*/gi, '')
             .replace(/(<br\s*\/?\s*>(\s*)){3,}/gi, '<br><br>')
             .trim();
          
          body.innerHTML = '';
          document.getSelection().removeAllRanges();
          const p = document.createElement('p');
          body.appendChild(p);
          const rangeObj = document.createRange();
          rangeObj.selectNodeContents(body);
          document.getSelection().addRange(rangeObj);
          document.execCommand('insertHTML', false, cleanHtml);
       } else if (action === 'APPEND_BOTTOM' || action === 'INSERT_IMAGE' || action === 'GENERATE_TABLE' || action === 'GENERATE_LIST' || action === 'SUMMARIZE_INLINE' || action === 'INSERT_CODE_BLOCK' || action === 'INSERT_CHECKLIST' || action === 'INSERT_BLOCKQUOTE') {
          const rangeObj = document.createRange();
          rangeObj.selectNodeContents(body);
          rangeObj.collapse(false); // end
          document.getSelection().removeAllRanges();
          document.getSelection().addRange(rangeObj);
          
          document.execCommand('insertHTML', false, '<br><br>' + parsedHtml);
       } else if (action === 'INSERT_TOP') {
          const rangeObj = document.createRange();
          rangeObj.selectNodeContents(body);
          rangeObj.collapse(true); // start
          document.getSelection().removeAllRanges();
          document.getSelection().addRange(rangeObj);
          
          document.execCommand('insertHTML', false, parsedHtml + '<br><br>');
       }
       
       window.Editor._scheduleAutoSave();
       window.showToast(`🤖 AI executed ${action}`, 'success');
    },

    _speak(text) {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*_#"`]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      const stopBtn = document.getElementById('ai-stop-btn');
      utterance.onstart = () => { if(stopBtn) stopBtn.style.display = 'flex'; };
      utterance.onend = () => { if(stopBtn) stopBtn.style.display = 'none'; };
      utterance.onerror = () => { if(stopBtn) stopBtn.style.display = 'none'; };

      window.speechSynthesis.speak(utterance);
      useVoiceOutput = false; 
    },

    async _handleQuickAction(action) {
      if (isWaiting) return;
      isWaiting = true;

      // Extract raw text for AI payload
      let content = '';
      const contextMode = document.getElementById('ai-context-select')?.value || 'note';
      
      if (contextMode === 'note') {
        const editorHtml = document.getElementById('editor-body')?.innerHTML || '';
        const currentId = window.Editor ? window.Editor.getCurrentId() : null;
        let metadataStr = '';
        if (currentId) {
           const note = window.Store.getNote(currentId);
           if (note) {
              metadataStr = `[METADATA: Title="${note.title}", Tags="${(note.tags||[]).join(', ')}", Pinned=${note.pinned ? 'true' : 'false'}]\n\n`;
           }
        }
        content = metadataStr + editorHtml;
      } else if (contextMode === 'folder') {
        const currentId = window.Editor ? window.Editor.getCurrentId() : null;
        const note = currentId ? window.Store.getNote(currentId) : null;
        if (note && note.folderId) {
           const folderNotes = window.Store.getAllNotes().filter(n => n.folderId === note.folderId);
           content = folderNotes.map(n => `[Note: ${n.title} | Tags: ${(n.tags||[]).join(', ')}]\n${n.content || ''}`).join('\n\n---\n\n');
        } else {
           const allNotes = window.Store.getAllNotes();
           content = allNotes.map(n => `[Note: ${n.title} | Tags: ${(n.tags||[]).join(', ')}]\n${n.content || ''}`).join('\n\n---\n\n');
        }
      }

      if (!content || content.length < 10) {
        this._appendMessage('ai', '⚠️ Please open a note with some content first.');
        isWaiting = false;
        return;
      }

      this._appendMessage('user', `Perform: ${action}`);
      const loadingId = this._appendLoading();

      try {
        const token = window.Auth.getToken();
        
        let endpoint = '/ai/complete';
        if (action === 'summarize') endpoint = '/ai/summarize';
        if (action === 'actions') endpoint = '/ai/actions';
        if (action === 'flashcards') endpoint = '/ai/flashcards';
        if (action === 'quiz') endpoint = '/ai/quiz';
        if (action === 'mindmap') endpoint = '/ai/mindmap';

        let bodyPayload = { content: content.substring(0, 15000) };

        // General fallback for un-mapped quick actions
        if (endpoint === '/ai/complete') {
          bodyPayload = { 
            prompt: `Please ${action} the following text.`,
            context: content.substring(0, 15000) 
          };
        }

        const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(bodyPayload)
        });

        if (!res.ok) throw new Error('Action failed');
        const data = await res.json();
        
        let responseStr = '';
        if (data.flashcards) {
          responseStr = '🃏 **Flashcards Generated!** See Modal.';
          this._renderFlashcardsUI(data.flashcards);
        } else if (data.quiz) {
          responseStr = '📝 **Quiz Generated!** See Modal.';
          this._renderQuizUI(data.quiz);
        } else if (data.mermaid) {
          responseStr = '🧠 **Mind Map Generated!** See Modal.';
          this._renderMindMapUI(data.mermaid);
        } else {
          responseStr = data.result || 'Done.';
        }

        this._replaceLoadingWithMessage(loadingId, responseStr);
      } catch (err) {
        this._replaceLoadingWithMessage(loadingId, `⚠️ Error: ${err.message}`);
      } finally {
        isWaiting = false;
      }
    },

    _renderFlashcardsUI(cards) {
      if (!cards || cards.length === 0) return;
      const modal = document.getElementById('ai-modal-overlay');
      const body = document.getElementById('ai-modal-body');
      const footer = document.getElementById('ai-modal-footer');
      const title = document.getElementById('ai-modal-title-text');
      
      title.textContent = 'Interactive Flashcards';
      modal.style.display = 'flex';
      footer.style.display = 'flex';
      
      let currentIndex = 0;
      let showAnswer = false;
      
      const renderCard = () => {
        const card = cards[currentIndex];
        body.innerHTML = `
          <div id="flashcard-ui" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; perspective:1000px;">
            <div style="font-size: 13px; font-weight: bold; color: var(--accent-primary); margin-bottom: 16px; text-transform:uppercase;">
              ${showAnswer ? 'Answer' : 'Question'}
            </div>
            <div style="font-size: 20px; font-weight: 500; text-align: center; color: ${showAnswer ? 'var(--text-secondary)' : 'var(--text-primary)'}; transition: 0.3s ease;">
              ${showAnswer ? card.a : card.q}
            </div>
            <div style="margin-top:24px; font-size:12px; color:var(--text-tertiary);">
              (Click anywhere to flip)
            </div>
          </div>
        `;
        
        document.getElementById('flashcard-ui').onclick = () => {
          showAnswer = !showAnswer;
          renderCard();
        };
        
        document.getElementById('ai-modal-status').textContent = `${currentIndex + 1} / ${cards.length}`;
        document.getElementById('ai-modal-btn-left').style.opacity = currentIndex === 0 ? '0.5' : '1';
        document.getElementById('ai-modal-btn-right').style.opacity = currentIndex === cards.length - 1 ? '0.5' : '1';
      };

      document.getElementById('ai-modal-btn-left').onclick = () => {
        if (currentIndex > 0) { currentIndex--; showAnswer = false; renderCard(); }
      };
      
      document.getElementById('ai-modal-btn-right').onclick = () => {
        if (currentIndex < cards.length - 1) { currentIndex++; showAnswer = false; renderCard(); }
      };
      
      renderCard();
    },

    _renderQuizUI(questions) {
      if (!questions || questions.length === 0) return;
      const modal = document.getElementById('ai-modal-overlay');
      const body = document.getElementById('ai-modal-body');
      const footer = document.getElementById('ai-modal-footer');
      const title = document.getElementById('ai-modal-title-text');
      
      title.textContent = 'Interactive Quiz';
      modal.style.display = 'flex';
      footer.style.display = 'flex';
      
      let currentIndex = 0;
      let score = 0;
      let answered = false;

      const renderQuestion = () => {
        if (currentIndex >= questions.length) {
          body.innerHTML = `<div style="text-align:center;"><h2>Quiz Complete!</h2><p>Score: ${score} / ${questions.length}</p></div>`;
          footer.style.display = 'none';
          return;
        }

        const q = questions[currentIndex];
        answered = false;
        
        body.innerHTML = `
          <div style="width:100%; max-width:500px;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 24px;">${q.q}</div>
            <div id="quiz-options" style="display:flex; flex-direction:column; gap:8px;">
              ${q.options.map((opt, i) => `<button class="btn btn-ghost quiz-opt" data-idx="${i}" style="text-align:left; border:1px solid var(--border-default); justify-content:flex-start;">${opt}</button>`).join('')}
            </div>
            <div id="quiz-feedback" style="margin-top:16px; font-weight:bold; height:24px;"></div>
          </div>
        `;

        document.getElementById('ai-modal-status').textContent = `Question ${currentIndex + 1} of ${questions.length}`;

        document.querySelectorAll('.quiz-opt').forEach(btn => {
          btn.onclick = (e) => {
            if (answered) return;
            answered = true;
            const chosen = parseInt(e.target.dataset.idx);
            
            if (chosen === q.answer) {
              e.target.style.backgroundColor = 'var(--accent-success)';
              e.target.style.color = '#fff';
              score++;
              document.getElementById('quiz-feedback').innerHTML = '<span style="color:var(--accent-success);">Correct!</span>';
            } else {
              e.target.style.backgroundColor = 'var(--accent-danger)';
              e.target.style.color = '#fff';
              document.getElementById('quiz-feedback').innerHTML = '<span style="color:var(--accent-danger);">Incorrect!</span>';
              
              // Highlight correct answer
              const correctBtn = document.querySelector(`.quiz-opt[data-idx="${q.answer}"]`);
              if (correctBtn) {
                 correctBtn.style.border = '2px solid var(--accent-success)';
              }
            }
          };
        });
      };

      document.getElementById('ai-modal-btn-left').onclick = () => {
        if (currentIndex > 0) { currentIndex--; renderQuestion(); }
      };
      
      document.getElementById('ai-modal-btn-right').onclick = () => {
        if (!answered) {
           alert('Please answer the question first!'); 
           return;
        }
        currentIndex++; 
        renderQuestion();
      };
      
      renderQuestion();
    },

    _renderMindMapUI(mermaidCode) {
      if (!mermaidCode) return;
      const modal = document.getElementById('ai-modal-overlay');
      const body = document.getElementById('ai-modal-body');
      const footer = document.getElementById('ai-modal-footer');
      const title = document.getElementById('ai-modal-title-text');
      
      title.textContent = 'Mind Map';
      modal.style.display = 'flex';
      footer.style.display = 'none'; // No next/prev needed
      
      body.innerHTML = `
         <div class="mermaid" id="mermaid-container" style="width:100%; height:100%; display:flex; justify-content:center;">
           ${mermaidCode}
         </div>
      `;

      // Render the mermaid chart!
      setTimeout(() => {
        try {
          if (window.mermaid) {
            window.mermaid.init(undefined, document.getElementById('mermaid-container'));
          }
        } catch(e) {
          body.innerHTML = `<div style="color:var(--accent-danger);">Error rendering MindMap: ${e.message}</div><pre style="margin-top:16px; font-size:11px;">${mermaidCode}</pre>`;
        }
      }, 50);
    },

    _appendMessage(role, text) {
      const chatArea = document.getElementById('ai-chat-area');
      const emptyState = document.getElementById('ai-empty-state');
      if (emptyState) emptyState.style.display = 'none';

      const div = document.createElement('div');
      div.className = `ai-message ${role}`;

      const avatar = document.createElement('div');
      avatar.className = 'ai-avatar';
      avatar.innerHTML = role === 'user' ? '<i class="ph-bold ph-user"></i>' : '<i class="ph-fill ph-magic-wand"></i>';

      const bubble = document.createElement('div');
      bubble.className = 'ai-bubble';
      bubble.innerHTML = this._parseMarkdown(text);

      div.appendChild(avatar);
      div.appendChild(bubble);
      
      chatArea.appendChild(div);
      chatArea.scrollTop = chatArea.scrollHeight;
      return div;
    },

    _appendLoading() {
      const chatArea = document.getElementById('ai-chat-area');
      const emptyState = document.getElementById('ai-empty-state');
      if (emptyState) emptyState.style.display = 'none';

      const id = 'loader_' + Date.now();
      const html = `
        <div class="ai-message ai" id="${id}">
          <div class="ai-avatar"><i class="ph-fill ph-magic-wand"></i></div>
          <div class="ai-bubble" style="background:transparent; border:none; padding-left:0;">
             <div class="ai-typing"><span></span><span></span><span></span></div>
          </div>
        </div>
      `;
      chatArea.insertAdjacentHTML('beforeend', html);
      chatArea.scrollTop = chatArea.scrollHeight;
      return id;
    },

    _replaceLoadingWithMessage(id, text) {
      const loader = document.getElementById(id);
      if (loader) {
        const bubble = loader.querySelector('.ai-bubble');
        if (bubble) {
          bubble.style.background = '';
          bubble.style.border = '';
          bubble.style.paddingLeft = '';
          bubble.innerHTML = this._parseMarkdown(text);
          loader.id = ''; // remove id so it acts as standard message
        }
      }
    },

    _parseMarkdown(text) {
      if (!text) return '';
      // Basic markdown parser for CHAT display messages (escapes HTML for safety)
      let html = text
        .replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape HTML
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      
      return html;
    },

    _sanitizeAgentHtml(text) {
      if (!text) return '';
      // For agent actions: the AI sends back raw HTML (tables, images, links).
      // We must NOT escape angle brackets. Only do light cleanup and security formatting.
      return text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // forcibly strip style block hallucinations causing global themes
        .replace(/\[METADATA:[^\]]*\]\s*/gi, '')         // strip leaked metadata
        .replace(/(<br\s*\/?>\s*){4,}/gi, '<br><br>')    // collapse excessive br
        .replace(/\\n/g, '\n')                           // unescape literal \n
        .replace(/\\'/g, "'")                             // unescape escaped quotes
        .trim();
    }
  };
})();
