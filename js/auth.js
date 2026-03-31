/* ============================================
   AUTH — Handles Login, Registration, and Tokens
   ============================================ */

// 🔑 Use relative path for same-origin requests (eliminates CORS entirely)
let configuredApiBaseUrl = localStorage.getItem('notesaver_api_base_url');
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// If running locally, strictly reject any old cached '/api' string from localStorage and force port 5050
if (isLocalhost && (!configuredApiBaseUrl || configuredApiBaseUrl === '/api')) {
  configuredApiBaseUrl = 'http://localhost:5050/api';
}

window.API_BASE_URL = window.API_BASE_URL || configuredApiBaseUrl || '/api';

// 🚀 FIREBASE INITIALIZATION
const firebaseConfig = {
  apiKey: "AIzaSyDW0T91yX5ISK67NdcmgDhwESfpaRBcJvE",
  authDomain: "log-in-with-59978.firebaseapp.com",
  projectId: "log-in-with-59978",
  storageBucket: "log-in-with-59978.firebasestorage.app",
  messagingSenderId: "423009600149",
  appId: "1:423009600149:web:ad9f5e0b081c027eb7919c"
};

if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}

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
      // 🛡️ SECURE PURGE: Clear all sensitive workspace data on logout
      localStorage.removeItem('notesaver_token');
      localStorage.removeItem('notesaver_user');
      localStorage.removeItem('notesaver_notes');
      localStorage.removeItem('notesaver_folders');
      localStorage.removeItem('deleted_notes');
      localStorage.removeItem('deleted_folders');
      localStorage.removeItem('last_sync_hash');
      localStorage.removeItem('last_sync_etag');
      
      window.showToast('Logged out & Workspace cleared', 'info');
      
      // Reload to enforce the Auth Guard from a clean slate
      setTimeout(() => window.location.reload(), 1000);
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

        <div style="margin-top: var(--space-xl); position: relative; text-align: center;">
          <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--border-default); z-index: 0;"></div>
          <span style="position: relative; z-index: 1; background: var(--bg-secondary); padding: 0 var(--space-md); color: var(--text-secondary); font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Alternatively</span>
        </div>

        <button id="google-auth-btn" class="btn btn-ghost" style="width: 100%; margin-top: var(--space-lg); border: 1px solid var(--border-default); justify-content: center; gap: var(--space-md); background: white; color: #1f1f1f;">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91a8.78 8.78 0 0 0 2.69-6.62z" fill="#4285F4"/><path d="M9 18c2.38 0 4.37-.78 5.82-2.12l-2.91-2.26c-.8.54-1.83.86-2.91.86-2.24 0-4.14-1.52-4.81-3.57H1.17v2.33A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M4.19 10.91a5.41 5.41 0 0 1 0-3.42V5.15H1.17a8.996 8.996 0 0 0 0 7.7l3.02-2.34z" fill="#FBBC05"/><path d="M9 3.58c1.3 0 2.45.44 3.37 1.32l2.53-2.53C13.38.89 11.39 0 9 0 5.48 0 2.44 2.11 1.17 5.15L4.19 7.49c.67-2.04 2.57-3.57 4.81-3.57z" fill="#EA4335"/></svg>
          Sign in with Google
        </button>
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
          if (!res.ok) throw new Error(data.msg || 'Authentication failed');

          this.setToken(data.token, data.user);
          window.showToast('Successfully authenticated!', 'success');
          document.getElementById('modal-overlay').classList.remove('visible');

          // 🚀 Reveal the Workspace
          setTimeout(() => window.location.reload(), 500);

        } catch (err) {
          errorMsg.textContent = err.message;
          submitBtn.innerHTML = submitText;
          submitBtn.disabled = false;
        }
      });

      // 🌈 GOOGLE AUTH LOGIC
      document.getElementById('google-auth-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('google-auth-btn');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> Connecting...';
        btn.disabled = true;

        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          // 🛡️ SECURITY: Explicitly request email and profile for complete identity
          provider.addScope('email');
          provider.addScope('profile');
          
          // 🔄 FORCE: Clear existing sticky session to allow account switching
          await firebase.auth().signOut();
          const result = await firebase.auth().signInWithPopup(provider);
          const idToken = await result.user.getIdToken();

          // 🔑 DEEP IDENTITY: Extract email even if restricted
          const verifiedEmail = result.user.email || result.user.providerData?.[0]?.email;
          
          // Exchange Firebase token for our app JWT
          const res = await fetch(`${window.API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              idToken,
              email: verifiedEmail 
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.msg || 'Google Sign-In failed');

          this.setToken(data.token, data.user);
          window.showToast(`Welcome, ${data.user.email}!`, 'success');
          document.getElementById('modal-overlay').classList.remove('visible');

          // 🚀 Reveal the Workspace
          setTimeout(() => window.location.reload(), 500);

        } catch (err) {
          window.showToast(err.message, 'danger');
          btn.innerHTML = originalContent;
          btn.disabled = false;
        }
      });
    }
  };
})();
