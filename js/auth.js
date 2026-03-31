/* ============================================
   AUTH — Handles Login, Registration, and Tokens
   ============================================ */

window.API_BASE_URL = window.API_BASE_URL || 'http://localhost:5000/api';

(function () {
  window.Auth = {
    init() {
      this._bindAuthButton();
      this.updateAuthUI();
    },

    getToken() {
      return localStorage.getItem('notesaver_token');
    },

    getUser() {
      try {
        const userStr = localStorage.getItem('notesaver_user');
        return userStr ? JSON.parse(userStr) : null;
      } catch {
        return null;
      }
    },

    async isLoggedIn() {
      const token = this.getToken();
      if (!token) return false;
      
      try {
        const res = await fetch(`${window.API_BASE_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
      } catch (e) {
        console.error('Auth check failed:', e);
        return false;
      }
    },

    logout() {
      localStorage.removeItem('notesaver_token');
      localStorage.removeItem('notesaver_user');
      this.updateAuthUI();
      window.showToast('Logged out successfully', 'info');
      // Render local store only
      window.Sidebar.renderFolders();
      window.Sidebar.renderTags();
      window.NoteList.render();
    },

    setToken(token, user) {
      localStorage.setItem('notesaver_token', token);
      localStorage.setItem('notesaver_user', JSON.stringify(user));
      this.updateAuthUI();
    },

    updateAuthUI() {
      const btn = document.getElementById('auth-btn');
      if (!btn) return;

      const user = this.getUser();
      if (user) {
        btn.innerHTML = `<i class="ph-fill ph-check-circle" style="font-size:20px; color: var(--accent-success);"></i>`;
        btn.title = `Logged in as ${user.email} (Click for options)`;
      } else {
        btn.innerHTML = `<i class="ph-duotone ph-user-circle" style="font-size:20px;"></i>`;
        btn.title = 'Sign In / Register';
      }
    },

    _bindAuthButton() {
      const btn = document.getElementById('auth-btn');
      if (!btn) return;

      btn.addEventListener('click', () => {
        if (this.getUser()) {
          this._showProfileModal();
        } else {
          this._showAuthModal('login');
        }
      });
    },

    _showProfileModal() {
      const user = this.getUser();
      const html = `
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <i class="ph-fill ph-user-circle" style="font-size: 64px; color: var(--accent-primary);"></i>
        </div>
        <h3 style="text-align: center; margin-bottom: var(--space-xs);">Account</h3>
        <p style="text-align: center; color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-2xl);">${user?.email}</p>
        
        <div class="modal-actions" style="justify-content: center; gap: var(--space-md); flex-direction: column;">
          <button class="btn btn-primary" id="modal-sync-now" style="width: 100%;">
            <i class="ph-bold ph-arrows-clockwise"></i> Force Sync
          </button>
          <button class="btn btn-danger" id="modal-logout" style="width: 100%;">
            <i class="ph-bold ph-sign-out"></i> Log Out
          </button>
        </div>
      `;

      window.showModal(html);

      document.getElementById('modal-logout')?.addEventListener('click', () => {
        document.getElementById('modal-overlay').classList.remove('visible');
        this.logout();
      });

      document.getElementById('modal-sync-now')?.addEventListener('click', async () => {
        const btn = document.getElementById('modal-sync-now');
        btn.innerHTML = '<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> Syncing...';
        btn.disabled = true;
        
        try {
          await window.Store.syncWithCloud();
          window.showToast('Sync complete!', 'success');
          document.getElementById('modal-overlay').classList.remove('visible');
        } catch (e) {
          btn.innerHTML = 'Sync Failed';
          window.showToast('Sync failed', 'danger');
        }
      });
    },

    _showAuthModal(type = 'login') {
      const isLogin = type === 'login';
      const title = isLogin ? 'Welcome Back' : 'Create Account';
      const submitText = isLogin ? 'Sign In' : 'Sign Up';
      const toggleText = isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In";

      const html = `
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <i class="ph-duotone ph-cloud-arrow-up" style="font-size: 48px; color: var(--accent-primary);"></i>
        </div>
        <h3 style="text-align: center; margin-bottom: var(--space-xl);">${title}</h3>
        
        <form id="auth-form" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div>
            <label style="display: block; font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: 4px;">Email</label>
            <input type="email" id="auth-email" required style="width: 100%; padding: var(--space-sm); border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-tertiary); color: var(--text-primary); outline: none;" placeholder="you@example.com">
          </div>
          <div>
            <label style="display: block; font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: 4px;">Password</label>
            <input type="password" id="auth-password" required style="width: 100%; padding: var(--space-sm); border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-tertiary); color: var(--text-primary); outline: none;" placeholder="••••••••">
          </div>
          <p id="auth-error" style="color: var(--accent-danger); font-size: var(--font-size-xs); text-align: center; height: 16px; margin: 0;"></p>
          <button type="submit" class="btn btn-primary" id="auth-submit-btn" style="width: 100%; margin-top: var(--space-sm); justify-content: center;">
            ${submitText}
          </button>
        </form>

        <div style="text-align: center; margin-top: var(--space-lg);">
          <button id="auth-toggle-btn" class="btn btn-ghost" style="font-size: var(--font-size-xs); color: var(--text-secondary);">${toggleText}</button>
        </div>
      `;

      window.showModal(html);

      const form = document.getElementById('auth-form');
      const toggleBtn = document.getElementById('auth-toggle-btn');
      const errorMsg = document.getElementById('auth-error');
      const submitBtn = document.getElementById('auth-submit-btn');

      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._showAuthModal(isLogin ? 'register' : 'login');
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        errorMsg.textContent = '';
        submitBtn.innerHTML = '<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> Processing...';
        submitBtn.disabled = true;

        try {
          const endpoint = isLogin ? '/auth/login' : '/auth/register';
          const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.msg || 'Authentication failed');
          }

          this.setToken(data.token, data.user);
          
          window.showToast('Successfully authenticated!', 'success');
          document.getElementById('modal-overlay').classList.remove('visible');

          // Trigger sync upon mapping
          window.showToast('Syncing with cloud...', 'info');
          await window.Store.syncWithCloud();
          
        } catch (err) {
          errorMsg.textContent = err.message;
          submitBtn.innerHTML = submitText;
          submitBtn.disabled = false;
        }
      });
    }
  };
})();
