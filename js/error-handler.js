/* ============================================
   ERROR HANDLER — Network Error Recovery & Retry Logic
   ============================================ */

(function () {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 5000]; // Exponential backoff: 1s, 2s, 5s

  window.ErrorHandler = {
    /**
     * Retry a function with exponential backoff
     */
    async retryWithBackoff(fn, maxRetries = MAX_RETRIES) {
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;
          console.error(`Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

          if (attempt < maxRetries) {
            const delayMs = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
            console.log(`Retrying in ${delayMs}ms...`);
            await this._sleep(delayMs);
          }
        }
      }

      throw lastError;
    },

    /**
     * Fetch with automatic retry
     */
    async fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
      return this.retryWithBackoff(
        () => fetch(url, options).then(res => {
          if (!res.ok && res.status !== 304) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res;
        }),
        maxRetries
      );
    },

    /**
     * Handle network error gracefully
     */
    handleNetworkError(error, context = 'Operation') {
      console.error(`Network Error in ${context}:`, error);

      if (!navigator.onLine) {
        window.showToast('You are offline. Changes will sync when online.', 'warning');
        return { offline: true, retryable: true };
      }

      if (error.message.includes('HTTP 429')) {
        window.showToast('Too many requests. Please wait before trying again.', 'warning');
        return { offline: false, retryable: true };
      }

      if (error.message.includes('HTTP 5')) {
        window.showToast('Server error. Please try again in a moment.', 'warning');
        return { offline: false, retryable: true };
      }

      if (error.message.includes('timeout')) {
        window.showToast('Request timed out. Please try again.', 'warning');
        return { offline: false, retryable: true };
      }

      window.showToast(`Error: ${error.message}`, 'danger');
      return { offline: false, retryable: false };
    },

    /**
     * Handle validation error
     */
    handleValidationError(error, context = 'Validation') {
      console.error(`Validation Error in ${context}:`, error);
      const message = error.message || 'Invalid input. Please check your data.';
      window.showToast(message, 'danger');
    },

    /**
     * Handle sync conflict
     */
    handleSyncConflict(localData, remoteData) {
      console.warn('Sync conflict detected. Using remote version.', {
        local: localData,
        remote: remoteData
      });
      // For now, prefer remote (server is source of truth)
      // In future: implement merge strategy
      return remoteData;
    },

    /**
     * Setup offline detection
     */
    setupOfflineDetection() {
      window.addEventListener('offline', () => {
        console.warn('Device went offline');
        window.showToast('You are now offline. Notes will sync when online.', 'info');
        document.body.classList.add('offline-mode');
      });

      window.addEventListener('online', () => {
        console.log('Device is back online');
        document.body.classList.remove('offline-mode');
        window.showToast('Back online! Syncing notes...', 'success');
        // Trigger sync when reconnected
        if (window.Auth.getToken()) {
          window.Store.syncWithCloud();
        }
      });

      // Check initial state
      if (!navigator.onLine) {
        document.body.classList.add('offline-mode');
      }
    },

    /**
     * Helper: Sleep for N milliseconds
     */
    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  // Initialize on load
  document.addEventListener('DOMContentLoaded', () => {
    window.ErrorHandler.setupOfflineDetection();
  });
})();
