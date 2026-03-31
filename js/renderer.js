/* ============================================
   RENDERER — Smooth DOM Updates with Diff-Based Rendering
   ============================================ */

(function () {
  window.Renderer = {
    // Debounce render calls
    _renderQueue: new Map(),

    /**
     * Smart render: Only update changed elements, keep focus intact
     * @param {HTMLElement} container - Container to render into
     * @param {Array} items - Items to render
     * @param {Function} renderItem - Function to render each item
     * @param {Object} options - { keyFn, debounce, transition }
     */
    smartRender(container, items, renderItem, options = {}) {
      const {
        keyFn = (item, idx) => idx,
        debounce = 200,
        transition = true
      } = options;

      // Debounce re-renders
      const containerId = container.id || Math.random().toString(36);
      if (this._renderQueue.has(containerId)) {
        clearTimeout(this._renderQueue.get(containerId));
      }

      const timeoutId = setTimeout(() => {
        this._performSmartRender(container, items, renderItem, keyFn, transition);
        this._renderQueue.delete(containerId);
      }, debounce);

      this._renderQueue.set(containerId, timeoutId);
    },

    _performSmartRender(container, newItems, renderItem, keyFn, transition) {
      // Create a key -> item map for new items
      const newItemMap = new Map();
      newItems.forEach((item, idx) => {
        newItemMap.set(String(keyFn(item, idx)), item);
      });

      // Keep track of existing elements
      const existingElements = new Map();
      const oldChildren = Array.from(container.children);

      oldChildren.forEach(el => {
        const key = el.dataset.renderKey;
        if (key) existingElements.set(key, el);
      });

      // Build new HTML for comparison
      const newHtmlMap = new Map();
      newItems.forEach((item, idx) => {
        const key = String(keyFn(item, idx));
        newHtmlMap.set(key, renderItem(item, idx));
      });

      // Update or create elements
      let currentIndex = 0;
      newItems.forEach((item, idx) => {
        const key = String(keyFn(item, idx));
        const newHtml = newHtmlMap.get(key);
        const existingEl = existingElements.get(key);

        if (!existingEl) {
          // Create new element
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newHtml.trim();
          const newEl = tempDiv.firstElementChild;
          newEl.dataset.renderKey = key;

          if (transition) {
            newEl.style.opacity = '0';
            newEl.style.transform = 'translateY(-10px)';
            newEl.style.transition = 'all 200ms ease';
          }

          if (currentIndex < container.children.length) {
            container.insertBefore(newEl, container.children[currentIndex]);
          } else {
            container.appendChild(newEl);
          }

          // Trigger animation
          if (transition) {
            setTimeout(() => {
              newEl.style.opacity = '1';
              newEl.style.transform = 'translateY(0)';
            }, 10);
          }
        } else {
          // Check if HTML changed
          const oldHtml = existingEl.outerHTML;
          if (oldHtml !== newHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newHtml.trim();
            const newEl = tempDiv.firstElementChild;
            newEl.dataset.renderKey = key;

            if (transition) {
              existingEl.style.transition = 'opacity 150ms ease';
              existingEl.style.opacity = '0.5';

              setTimeout(() => {
                container.replaceChild(newEl, existingEl);
                setTimeout(() => {
                  newEl.style.opacity = '1';
                  newEl.style.transition = 'opacity 150ms ease';
                }, 10);
              }, 150);
            } else {
              container.replaceChild(newEl, existingEl);
            }
          } else {
            // Move element to correct position if needed
            if (container.children[currentIndex] !== existingEl) {
              if (currentIndex < container.children.length) {
                container.insertBefore(existingEl, container.children[currentIndex]);
              } else {
                container.appendChild(existingEl);
              }
            }
          }
        }

        currentIndex++;
      });

      // Remove elements that no longer exist
      oldChildren.forEach(el => {
        const key = el.dataset.renderKey;
        if (!newItemMap.has(key)) {
          if (transition) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            el.style.transition = 'all 200ms ease';
            setTimeout(() => el.remove(), 200);
          } else {
            el.remove();
          }
        }
      });
    },

    /**
     * Batch update: Update multiple elements efficiently
     */
    batchUpdate(updates) {
      // Group by container
      const grouped = {};
      updates.forEach(({ container, selector, value, type = 'textContent' }) => {
        const id = container.id || Math.random();
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push({ selector, value, type });
      });

      // Apply updates
      Object.values(grouped).forEach(ops => {
        ops.forEach(({ selector, value, type }) => {
          const el = selector instanceof HTMLElement ? selector : document.querySelector(selector);
          if (el) {
            if (type === 'textContent') el.textContent = value;
            else if (type === 'innerHTML') el.innerHTML = value;
            else if (type === 'class') el.className = value;
            else el[type] = value;
          }
        });
      });
    },

    /**
     * Update element with smooth transition
     */
    updateWithTransition(element, html, duration = 150) {
      return new Promise((resolve) => {
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0.5';

        setTimeout(() => {
          element.innerHTML = html;
          element.style.opacity = '1';

          setTimeout(() => {
            element.style.transition = '';
            resolve();
          }, duration);
        }, duration);
      });
    },

    /**
     * Add smooth fade effect to elements
     */
    fadeIn(element, duration = 300) {
      element.style.opacity = '0';
      element.style.transition = `opacity ${duration}ms ease`;
      setTimeout(() => {
        element.style.opacity = '1';
      }, 10);
    },

    fadeOut(element, duration = 300) {
      return new Promise((resolve) => {
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0';
        setTimeout(() => {
          element.style.transition = '';
          resolve();
        }, duration);
      });
    }
  };
})();
