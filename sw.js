// Palestra — service worker (offline app shell)
const CACHE = 'palestra-v6';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/db.js',
  './js/seed.js',
  './js/state.js',
  './js/util.js',
  './js/views.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google Fonts: cache-first, opaque ok
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))
      )
    );
    return;
  }
  if (url.origin !== location.origin) return; // let cross-origin (e.g. Supabase) pass through
  // App assets: cache-first with network fallback
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
