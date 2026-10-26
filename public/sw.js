/* SANJEH offline shell. No network data is ever uploaded or cached. */
importScripts('./precache-manifest.js');

// Every deploy gets a unique id, so a new service worker always ships fresh
// cache names and this build's caches are independent from older builds.
const BUILD = self.__SANJEH_BUILD_ID__ || 'dev';
const BASE = new URL('./', self.location.href).pathname;
// CacheStorage is shared by every app on the origin (GitHub Pages project
// sites share one), so cache names are scoped to this deployment path.
const SCOPE =
  BASE === '/'
    ? 'root'
    : BASE.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
const CACHE_PREFIX = `sanjeh:${SCOPE}:`;
const SHELL_CACHE = `${CACHE_PREFIX}${BUILD}-shell`;
const ASSET_CACHE = `${CACHE_PREFIX}${BUILD}-assets`;
const LEGACY_CACHES = ['sanjeh-v2-shell', 'sanjeh-v2-assets'];

const SHELL_ASSETS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}fonts/Vazirmatn-Variable.woff2`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/icon-maskable-512.png`,
  `${BASE}icons/icon-180.png`,
  `${BASE}icons/favicon.svg`,
  ...(self.__SANJEH_PRECACHE__ || []).map((asset) => `${BASE}${asset}`),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) || LEGACY_CACHES.includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function matchShell() {
  return caches
    .open(SHELL_CACHE)
    .then((cache) =>
      cache.match(`${BASE}index.html`).then((cached) => cached || cache.match(BASE)),
    );
}

function matchCached(request) {
  return caches
    .open(ASSET_CACHE)
    .then((cache) => cache.match(request))
    .then((cached) => {
      if (cached) return cached;
      return caches.open(SHELL_CACHE).then((cache) => cache.match(request));
    });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      // Bypass the HTTP cache so a fresh deploy is picked up immediately;
      // hosting like GitHub Pages may keep serving a stale index.html.
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) {
            return matchShell().then((cached) => cached || response);
          }
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(`${BASE}index.html`, copy)),
          );
          return response;
        })
        .catch(() => matchShell().then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    matchCached(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)),
          );
        }
        return response;
      });
    }),
  );
});
