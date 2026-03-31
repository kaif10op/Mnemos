/* ============================================
   AI PANEL — Intelligent Assistant Integration
   ============================================ */

(function () {
  let isAiOpen = false;
  let isWaiting = false;

  window.AIPanel = {
    init() {
      this._injectHtml();
      this._bindEvents();
    },

    open() {
      if (isAiOpen) return;
      isAiOpen = true;
      document.getElementById('ai-panel')?.classList.add('open');
      const input = document.getElementById('ai-input');
      if (input) {
        setTimeout(() => input.focus(), 300);
      }
    },

    close() {
      if (!isAiOpen) return;
      isAiOpen = false;
      document.getElementById('ai-panel')?.classList.remove('open');
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

          <form class="ai-input-area" id="ai-form">
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
    },

    async _handleChatSubmit(query) {
      this._appendMessage('user', query);
      const loadingId = this._appendLoading();
      isWaiting = true;

      // Collect Context
      let context = '';
      const contextMode = document.getElementById('ai-context-select')?.value || 'note';
      
      if (contextMode === 'note') {
        const editorHtml = document.getElementById('editor-body')?.innerHTML || '';
        context = window.Store.stripHtml(editorHtml);
      } else if (contextMode === 'folder') {
        const currentId = window.Editor ? window.Editor.getCurrentId() : null;
        const note = currentId ? window.Store.getNote(currentId) : null;
        
        if (note && note.folderId) {
           const folderNotes = window.Store.getAllNotes().filter(n => n.folderId === note.folderId);
           context = folderNotes.map(n => `Title: ${n.title}\nContent:\n${window.Store.stripHtml(n.content || '')}`).join('\n\n---\n\n');
        } else {
           const allNotes = window.Store.getAllNotes();
           context = allNotes.map(n => `Title: ${n.title}\nContent:\n${window.Store.stripHtml(n.content || '')}`).join('\n\n---\n\n');
        }
      }

      try {
        const token = window.Auth.getToken();
        const endpoint = contextMode === 'note' ? '/ai/agent' : '/ai/complete';
        
        const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prompt: query, context: context.substring(0, 15000) })
        });

        if (!res.ok) throw new Error('AI failed to respond');
        const data = await res.json();
        
        if (contextMode === 'note' && data.agent) {
           const payload = data.agent;
           if (payload.action === 'CHAT') {
               this._replaceLoadingWithMessage(loadingId, payload.text || 'No response.');
           } else {
               this._executeAgentAction(payload.action, payload.text);
               this._replaceLoadingWithMessage(loadingId, `✨ Automated Task: **${payload.action}**\n\nI have successfully updated your document for you!`);
           }
        } else {
           this._replaceLoadingWithMessage(loadingId, data.result || 'No response generated.');
        }
      } catch (err) {
        this._replaceLoadingWithMessage(loadingId, `⚠️ Error: ${err.message}`);
      } finally {
        isWaiting = false;
      }
    },

    _executeAgentAction(action, newText) {
       const body = document.getElementById('editor-body');
       if (!body || !window.Editor) return;
       
       const parsedHtml = this._parseMarkdown(newText);
       
       if (action === 'REPLACE_ALL') {
          body.innerHTML = '';
          document.getSelection().removeAllRanges();
          const p = document.createElement('p');
          body.appendChild(p);
          const rangeObj = document.createRange();
          rangeObj.selectNodeContents(body);
          document.getSelection().addRange(rangeObj);
          document.execCommand('insertHTML', false, parsedHtml);
       } else if (action === 'APPEND_BOTTOM') {
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

    async _handleQuickAction(action) {
      if (isWaiting) return;
      isWaiting = true;

      // Extract raw text for AI payload
      let content = '';
      const contextMode = document.getElementById('ai-context-select')?.value || 'note';
      
      if (contextMode === 'note') {
        const editorHtml = document.getElementById('editor-body')?.innerHTML || '';
        content = window.Store.stripHtml(editorHtml);
      } else if (contextMode === 'folder') {
        const currentId = window.Editor ? window.Editor.getCurrentId() : null;
        const note = currentId ? window.Store.getNote(currentId) : null;
        if (note && note.folderId) {
           const folderNotes = window.Store.getAllNotes().filter(n => n.folderId === note.folderId);
           content = folderNotes.map(n => `Title: ${n.title}\nContent:\n${window.Store.stripHtml(n.content || '')}`).join('\n\n---\n\n');
        } else {
           const allNotes = window.Store.getAllNotes();
           content = allNotes.map(n => `Title: ${n.title}\nContent:\n${window.Store.stripHtml(n.content || '')}`).join('\n\n---\n\n');
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
      // Basic markdown parser
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
    }
  };
})();
