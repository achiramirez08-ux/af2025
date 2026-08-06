// ============================================================
// RUTA FERNANDO — Service Worker v1.1
// FIX: el HTML principal ahora es Network-First (siempre intenta
// traer la última versión del servidor primero) en vez de
// Cache-First. Antes, aunque el código en GitHub estuviera
// corregido, los navegadores seguían mostrando la copia vieja
// guardada porque nunca se les pedía revisar el servidor primero.
// Los assets estáticos (CDN de Tailwind/Lucide) siguen usando
// Cache-First para que la app abra rápido offline.
// ============================================================

const CACHE_NAME    = 'ruta-fernando-v19'; // ⚠️ subir este número en cada deploy
const OFFLINE_URL    = '/af2025/index.html';

const PRECACHE_URLS = [
  '/af2025/',
  '/af2025/index.html',
];

// ── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — borra TODOS los cachés viejos, no solo los de nombre distinto ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Google Apps Script (sync) → siempre red, nunca caché
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. El HTML principal de la app (navegación) → NETWORK-FIRST.
  //    Siempre intenta traer la versión más nueva del servidor.
  //    Solo usa el caché si no hay conexión.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/af2025/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // 3. CDN externas (Tailwind, Lucide) → Network-First con fallback a caché
  if (url.hostname.includes('cdn.tailwindcss.com') || url.hostname.includes('unpkg.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Todo lo demás → Cache-First (rapidez offline para assets estáticos)
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => caches.match(OFFLINE_URL));
      })
  );
});

// ── BACKGROUND SYNC ──────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-ventas') {
    event.waitUntil(
      self.clients.matchAll()
        .then(clients => clients.forEach(client =>
          client.postMessage({ type: 'SYNC_READY' })
        ))
    );
  }
});
