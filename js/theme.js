/* ============================================
   THEME — Dark/Light Toggle
   ============================================ */

(function () {
  const settings = window.Store.getSettings();
  const theme = settings.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  window.ThemeManager = {
    current() {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    },

    toggle() {
      const next = this.current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      window.Store.saveSetting('theme', next);
      this._updateIcon();
      return next;
    },

    _updateIcon() {
      const knob = document.querySelector('.theme-toggle-knob');
      if (knob) {
        knob.textContent = this.current() === 'dark' ? '🌙' : '☀️';
      }
    },

    init() {
      this._updateIcon();
      const toggle = document.getElementById('theme-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => this.toggle());
      }
    },
  };
})();
