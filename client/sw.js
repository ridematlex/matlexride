/* =============================================
   MATLEX RIDE — Service Worker
   Strategy:
     - Static assets  → Cache-first (fast loads)
     - API calls      → Network-first (always fresh)
     - Offline page   → Served from cache on failure
   ============================================= */

const CACHE_NAME = 'matlex-v10';
// BASE is '/matlex/client/' on localhost, '/client/' on production
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const OFFLINE_URL = BASE + 'offline.html';

const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'assets/css/client.css',
  BASE + 'assets/js/client.js',
  BASE + 'manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
];

// ── Install: pre-cache static assets ──────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ─────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and browser extensions
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // API calls → Network-first, no cache
  if (url.pathname.includes('/client/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ success: false, message: 'No internet connection' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Static assets → Cache-first, fallback to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Cache successful responses for static files
          if (response.ok && (
            request.url.includes('/assets/') ||
            request.url.includes('cdn.jsdelivr.net') ||
            request.url.includes('cdnjs.cloudflare.com') ||
            request.url.includes('fonts.googleapis.com')
          )) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Serve offline page for HTML navigation requests
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL) ||
                   caches.match(BASE + 'index.html');
          }
        });
    })
  );
});

// ── Background sync placeholder (extend later) ─
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-ratings') {
    // Future: flush offline rating queue to server
  }
});
