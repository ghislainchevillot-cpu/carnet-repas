// Carnet Repas — garde l'appli disponible hors ligne.
// Incrémentez VERSION à chaque mise en ligne d'une nouvelle version du code.
const VERSION = 'carnet-v2';
const SHELL = [
  './', 'index.html', 'styles.css?v=2', 'app.js?v=2', 'config.js?v=2',
  'vendor/supabase.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Les données (Supabase) passent toujours par le réseau ; l'appli garde sa propre copie.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Réseau d'abord pour avoir la dernière version, cache si hors ligne.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
