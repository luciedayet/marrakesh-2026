const CACHE_NAME = 'carnet-shell-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = ['/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The app shell ("/") and every /api/* call are per-session and can
  // carry private trip/budget data — always hit the network, never cache.
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Static, non-sensitive shell assets: cache-first.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
