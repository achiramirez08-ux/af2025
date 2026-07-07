// ============================================================
// RUTA FERNANDO — Service Worker v1.0
// Estrategia: Cache-First para assets, Network-First para GAS sync
// Offline: app carga en <1s desde caché incluso sin señal
// ============================================================

const CACHE_NAME    = 'ruta-fernando-v18';
const OFFLINE_URL   = '/index.html';

// Assets a cachear en la instalación (shell de la app)
const PRECACHE_URLS = [
  '/af2025/',
  '/af2025/index.html',
];

// ── INSTALL — cachear el shell de la app ────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activar inmediatamente
  );
});

// ── ACTIVATE — limpiar cachés viejos ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // tomar control de todas las tabs
  );
});

// ── FETCH — estrategia según tipo de request ────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Google Apps Script (sync de ventas) → Network-Only
  //    Si falla, el frontend ya tiene su cola de retry
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. CDN externas (Tailwind, Lucide) → Network-First con fallback a caché
  if (url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('unpkg.com')) {
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

  // 3. App shell (HTML, JS inline) → Cache-First
  //    Crítico para el Chaco: carga en <1s sin señal
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // Actualizar en background (stale-while-revalidate)
          fetch(event.request)
            .then(fresh => caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, fresh)))
            .catch(() => {}); // silencioso si no hay red
          return cached;
        }
        // No está en caché → ir a la red
        return fetch(event.request)
          .then(response => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => caches.match(OFFLINE_URL)); // último recurso: página offline
      })
  );
});

// ── BACKGROUND SYNC — reintentar uploads pendientes ─────────────────────────
// Cuando el dispositivo recupera señal, el SW notifica a la app
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
