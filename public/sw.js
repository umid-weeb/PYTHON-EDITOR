const CACHE_NAME = 'pyzone-root-v2';

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
  '/pyodide/pyodide.mjs',
  '/pyodide/pyodide.asm.wasm',
  '/pyodide/pyodide.asm.mjs',
  '/pyodide/pyodide-lock.json',
  '/pyodide/python_stdlib.zip',
  '/vendor/codemirror/lib/codemirror.css',
  '/vendor/codemirror/lib/codemirror.js',
  '/vendor/codemirror/theme/monokai.css',
  '/vendor/codemirror/theme/eclipse.css',
  '/vendor/codemirror/mode/python/python.js',
  '/vendor/codemirror/mode/javascript/javascript.js',
  '/vendor/codemirror/mode/clike/clike.js',
  '/vendor/codemirror/mode/go/go.js',
  '/vendor/codemirror/addon/hint/show-hint.css',
  '/vendor/codemirror/addon/hint/show-hint.js',
  '/vendor/codemirror/addon/hint/python-hint.js',
  '/vendor/codemirror/addon/hint/anyword-hint.js',
  '/vendor/codemirror/addon/edit/matchbrackets.js',
  '/vendor/codemirror/addon/edit/closebrackets.js',
  '/vendor/codemirror/addon/edit/active-line.js',
  '/vendor/codemirror/addon/dialog/dialog.css',
  '/vendor/codemirror/addon/dialog/dialog.js',
  '/vendor/codemirror/addon/search/searchcursor.js',
  '/vendor/codemirror/addon/search/search.js',
  '/vendor/codemirror/addon/fold/foldcode.js',
  '/vendor/codemirror/addon/fold/foldgutter.css',
  '/vendor/codemirror/addon/fold/foldgutter.js',
  '/vendor/codemirror/addon/fold/indent-fold.js'
];

// Install Event - Pre-cache core assets individually so single 404 won't break the cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Resiliently pre-caching PyZone root assets...');
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) {
              await cache.put(url, res);
            } else {
              console.warn(`[SW] Precache item returned status ${res.status}: ${url}`);
            }
          } catch (err) {
            console.warn(`[SW] Precache fetch error for ${url}:`, err);
          }
        })
      );
    })
  );
});

// Activate Event - Clean up old caches and claim clients immediately
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

// Fetch Event - Serve from Cache when available, fallback to network, fallback to /index.html for HTML navigations
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);

  // Is this an HTML navigation request?
  const isHtmlNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 1. Check direct cache match
      const cachedResponse = await cache.match(request, { ignoreSearch: true });
      if (cachedResponse) {
        // Fetch in background to keep cache fresh if online
        if (navigator.onLine) {
          fetch(request).then((networkRes) => {
            if (networkRes && networkRes.ok) {
              cache.put(request, networkRes);
            }
          }).catch(() => {});
        }
        return cachedResponse;
      }

      // 2. Try network fetch
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (networkError) {
        console.warn(`[SW] Network fetch failed for ${request.url}:`, networkError);

        // 3. Fallback for HTML navigations when offline
        if (isHtmlNavigation) {
          const fallbackHtml = (await cache.match('/index.html')) || (await cache.match('/'));
          if (fallbackHtml) {
            return fallbackHtml;
          }
        }

        // Return generic offline response or error
        return new Response('Network error and no offline cache available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});
