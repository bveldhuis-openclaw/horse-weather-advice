const CACHE = 'horse-weather-v2';
const OFFLINE_URL = '/index.html';
const ASSETS = [OFFLINE_URL, '/styles.css', '/main.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE) return caches.delete(k); })
    )).then(() => self.clients.claim())
  );
});

// Network first for navigation/HTML, cache-first for assets
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(OFFLINE_URL, copy));
        return resp;
      }).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // For other requests, try cache first then network
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      // cache static assets
      if (ASSETS.includes(url.pathname)) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return resp;
    }).catch(() => {}))
  );
});
