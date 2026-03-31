const CACHE_NAME = 'mnemos-pro-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/animations.css',
  './css/layout.css',
  './css/sidebar.css',
  './css/notelist.css',
  './css/editor.css',
  './css/palette.css',
  './js/store.js',
  './js/auth.js',
  './js/theme.js',
  './js/search.js',
  './js/error-handler.js',
  './js/sync-manager.js',
  './js/palette.js',
  './js/renderer.js',
  './js/editor.js',
  './js/sidebar.js',
  './js/notelist.js',
  './js/shortcuts.js',
  './js/app.js'
];

// Install Event — Cache the App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('☁️ Service Worker: Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event — Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('☁️ Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event — Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for specific domains (local and CDNs)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Skip API calls
  if (url.pathname.startsWith('/api')) return;

  // 🚀 ICON & FONT VAULTING: Aggressive cache for CDNs
  const isCDN = url.hostname.includes('unpkg.com') || 
                url.hostname.includes('googleapis.com') || 
                url.hostname.includes('gstatic.com') ||
                url.hostname.includes('cdn.jsdelivr.net');

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached immediately, but update in background if NOT a CDN
        // (CDNs are immutable versions, so we don't need to revalidate often)
        if (!isCDN) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
            }
          });
        }
        return cachedResponse;
      }

      // Not in cache — fetch and vault if it's a CDN asset
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
          return networkResponse;
        }

        // Vault the CDN asset for next time
        if (isCDN) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
        }
        
        return networkResponse;
      }).catch(() => {
        // If fetch fails and we're not in cache, we're offline and the asset is lost
        return new Response('Offline resource not found', { status: 503 });
      });
    })
  );
});
