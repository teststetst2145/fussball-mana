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
  self.skipWaiting(); // neues Update sofort aktivieren
});

self.addEventListener('activate', e => {
  // alte Cache-Versionen automatisch löschen
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // alle offenen Tabs sofort aktualisieren
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
