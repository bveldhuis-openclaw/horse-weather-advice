const CACHE = 'horse-weather-v1';
const OFFLINE_URL = '/index.html';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE_URL, '/styles.css', '/main.js', '/manifest.json'])));
  self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(()=>caches.match(OFFLINE_URL)));
});
