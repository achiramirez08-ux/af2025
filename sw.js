// ============================================================
// RUTA FERNANDO — Service Worker v2.0
// Cache-First + Background Sync para pedidos pendientes
// ============================================================

const CACHE_NAME    = 'ruta-fernando-v17';
const OFFLINE_URL   = '/index.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/catalogo.json',
  '/clientes.json',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

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

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchAndCache = () => {
          return fetch(event.request)
            .then(fresh => {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, fresh));
              return fresh;
            })
            .catch(() => cached);
        };
        if (cached) {
          fetchAndCache();
          return cached;
        }
        return fetchAndCache();
      })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-ventas') {
    event.waitUntil(
      self.clients.matchAll()
        .then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SYNC_READY' });
          });
        })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'REGISTER_SYNC') {
    event.waitUntil(
      self.registration.sync.register('sync-ventas')
        .then(() => console.log('[SW] Sync registrado'))
        .catch(err => console.warn('[SW] Sync falló', err))
    );
  }
});
