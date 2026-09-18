// Snapture service worker — precache the app shell, and runtime-cache the
// self-hosted OCR engine + language data on first use, so scanning keeps working
// offline afterwards. Everything Snapture loads is same-origin (no CDN).
const VERSION = 'snapture-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './extract.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Only handle same-origin GETs (shell + vendored Tesseract core/worker/langs).
  if (new URL(req.url).origin !== self.location.origin) return;

  // Cache-first: fast repeat loads, and offline once these are cached.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
    })
  );
});
