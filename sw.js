const CACHE_NAME = 'scout-v158';

// App shell — code that changes on every deploy. NETWORK-FIRST.
// Cache-first here is what caused the "I pushed the fix but still see the old
// error" loop: the stale copy was served, then silently re-cached behind it.
const SHELL_ASSETS = [
  './',
  './index.html',
  './support.js',
  './pokemon-mechanics.js',
  './src/sample-data.js',
  './Scout%20Dashboard.dc.html',
  './IV%20CP%20HP%20Guide.dc.html',
  './manifest.json'
];

// Immutable content-addressed assets — safe to serve cache-first.
const IMMUTABLE_ASSETS = [
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png'
];

function cacheEach(cache, urls) {
  return Promise.all(urls.map(function (url) {
    return cache.add(url).catch(function () {});
  }));
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cacheEach(cache, SHELL_ASSETS)
          .then(function () { return cacheEach(cache, IMMUTABLE_ASSETS); });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// Anything that is app code (or an unknown same-origin document/script) is
// treated as shell. Only sprites and icons get cache-first.
function isImmutable(pathname) {
  return /\/sprites\//.test(pathname) || /\/icons\//.test(pathname);
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.hostname.includes('firebase') || url.hostname.includes('gstatic') ||
      url.hostname.includes('googleapis') || url.hostname.includes('jsdelivr')) {
    return;
  }

  if (isImmutable(url.pathname)) {
    // Cache-first: these never change without a filename change.
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for all app code: always get the freshest deploy, fall back
  // to cache only when genuinely offline.
  event.respondWith(
    fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(request, clone); });
      }
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
