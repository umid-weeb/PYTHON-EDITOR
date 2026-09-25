const CACHE_NAME = 'pyzone-root-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/real.js',
  '/editor-ai.js',
  '/pyodide-worker.js',
  '/manifest.json',
  '/ryempo.ico',
  '/python_icon_round.png',
  '/pyodide/pyodide.js',
  '/pyodide/pyodide.asm.js',
  '/pyodide/pyodide.asm.wasm',
  '/pyodide/python_stdlib.zip',
  '/vendor/codemirror/lib/codemirror.css',
  '/vendor/codemirror/lib/codemirror.js',
  '/vendor/codemirror/theme/monokai.css',
  '/vendor/codemirror/theme/eclipse.css',
  '/vendor/codemirror/mode/python/python.js',
  '/vendor/codemirror/mode/javascript/javascript.js',
  '/vendor/codemirror/mode/clike/clike.js',
  '/vendor/codemirror/mode/go/go.js'
];

// Install Event - Pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core PyZone root assets...');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Some precache items failed to load, continuing:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && !name.startsWith('pyzone-offline')) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - CacheFirst for assets, NetworkFirst with cache fallback for navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests
  if (event.request.method !== 'GET') return;

  // Handle local assets and CDN requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached resource immediately
        return cachedResponse;
      }

      // Fetch from network and cache for offline
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // If network fails (Offline) and navigating HTML, serve offline index.html
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html') || caches.match('/');
        }
      });
    })
  );
});
