/* ============================================
   SEARCH — Real-time Search
   ============================================ */

(function () {
  let debounceTimer = null;

  window.SearchManager = {
    query: '',

    init() {
      const input = document.getElementById('search-input');
      const clearBtn = document.getElementById('search-clear');

      if (input) {
        input.addEventListener('input', (e) => {
          this.query = e.target.value;
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            window.NoteList.render();
          }, 150);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.query = '';
          if (input) input.value = '';
          window.NoteList.render();
        });
      }
    },

    getQuery() {
      return this.query;
    },

    clear() {
      this.query = '';
      const input = document.getElementById('search-input');
      if (input) input.value = '';
    },
  };
})();
