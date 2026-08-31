// Snapture service worker — app shell precache + runtime cache for the
// Tesseract CDN, so the app works offline after the first successful scan.
const VERSION = 'snapture-v1';
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

  const isTesseract = /cdn\.jsdelivr\.net|unpkg\.com|tessdata|tesseract/i.test(req.url);
  const sameOrigin = new URL(req.url).origin === self.location.origin;

  if (sameOrigin || isTesseract) {
    // Cache-first: fast, and enables offline once these are cached.
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
  }
});
