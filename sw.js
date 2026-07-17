// ⬇️ DIESE ZAHL ERHÖHEN wenn du ein Update hochlädst (z.B. v2, v3, ...)
const CACHE = 'fussball-v1';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

// Auf Nachricht von der App reagieren → sofort aktivieren
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: immer frische Dateien wenn online, Cache als Fallback wenn offline
self.addEventListener('fetch', e => {
  // Nur GET-Requests abfangen
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(networkRes => {
        // Antwort im Cache aktualisieren
        const clone = networkRes.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return networkRes;
      })
      .catch(() => {
        // Offline: aus Cache bedienen
        return caches.match(e.request);
      })
  );
});
