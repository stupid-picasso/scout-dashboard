const CACHE_NAME = 'scout-v427';

// App shell — code that changes on every deploy. NETWORK-FIRST.
const SHELL_ASSETS = [
  './',
  './index.html',
  './support.js',
  './pokemon-mechanics.js',
  './Scout%20Dashboard.dc.html',
  './IV%20CP%20HP%20Guide.dc.html',
  './manifest.json'
];

// Icons, served cache-first.
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

// Fetch app code from the network and keep a copy for offline use.
// keep(p), when given, receives the promise of the cache write so the caller can hold the worker open until it is done.
function fetchShell(request, keep) {
  return fetch(request).then(function (response) {
    if (response && response.ok && response.type === 'basic') {
      const clone = response.clone();
      const stored = caches.open(CACHE_NAME).then(function (c) { return c.put(request, clone); });
      if (keep) keep(stored);
    }
    return response;
  });
}

function offlineShell(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return new Response('', { status: 504, statusText: 'Offline' });
  });
}

function networkFirst(request) {
  return fetchShell(request).catch(function () { return offlineShell(request); });
}

// Network-first with a time limit: if the network has not answered in SHELL_TIMEOUT_MS and a cached copy exists, serve
// that copy. Without a cached copy keep waiting for the network. The fetch is never cancelled, so it still refreshes the cache.
const SHELL_TIMEOUT_MS = 3000;
function raceShell(event, request) {
  const quiet = function () {};
  let stored = Promise.resolve();
  const net = fetchShell(request, function (p) { stored = p.then(quiet, quiet); });
  // Hold the worker open until the fetch and the cache write are done, even after the cached copy was served.
  event.waitUntil(net.then(function () { return stored; }, quiet));
  let timer;
  const slow = {};
  const timeout = new Promise(function (resolve) { timer = setTimeout(resolve, SHELL_TIMEOUT_MS, slow); });
  return Promise.race([net, timeout]).then(function (first) {
    clearTimeout(timer);
    if (first !== slow) return first;
    return caches.match(request).then(function (cached) {
      // Only the app's own entry points may fall back to the cached index.html; any other page keeps waiting for the network.
      if (!cached && request.mode === 'navigate' && /(^|\/)(index\.html)?$/.test(new URL(request.url).pathname)) return caches.match('./index.html');
      return cached;
    }).then(function (cached) { return cached || net; });
  }).catch(function () { clearTimeout(timer); return offlineShell(request); });
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutable(url.pathname)) {
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

  // The update check reads sw.js itself and must see the server copy, never a cached one.
  if (request.cache === 'no-store' || /\/sw\.js$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Network-first for all app code: always get the freshest deploy. On a stalled connection the cached copy is
  // served after SHELL_TIMEOUT_MS while the network fetch carries on and refreshes the cache.
  event.respondWith(raceShell(event, request));
});

// ---- Web Push (task 28). The Worker sends { t: title, b: body, tag, url } encrypted; every push MUST show a notification (iOS revokes the
// permission otherwise), so a missing, empty or unreadable payload still shows one. The app works the same with no Worker set up.
function pushUrl(u) {
  // Same origin only; anything else (another site, javascript:, garbage) opens the app instead.
  try {
    const url = new URL(typeof u === 'string' ? u : './', self.registration.scope);
    return url.origin === self.location.origin ? url.href : self.registration.scope;
  } catch (e) { return self.registration.scope; }
}

self.addEventListener('push', function (event) {
  let d = null;
  try { d = event.data ? event.data.json() : null; } catch (e) {
    try { d = { b: event.data.text() }; } catch (e2) { d = null; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
  const title = typeof d.t === 'string' && d.t.trim() ? d.t.slice(0, 120) : 'Professor';
  const opts = {
    body: typeof d.b === 'string' && d.b ? d.b.slice(0, 300) : 'Open the app to see what is new.',
    icon: './icons/icon-192.png',
    data: { url: pushUrl(d.url) }
  };
  if (typeof d.tag === 'string' && d.tag) opts.tag = d.tag.slice(0, 100);   // same tag replaces, never stacks
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = pushUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].url && list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});

// The browser replaced or expired the subscription: subscribe again with the same options and tell open windows. The app compares its stored
// endpoint on every open and re-registers with the Worker, so a closed app catches up the next time it opens.
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil((async function () {
    try {
      const old = event.oldSubscription;
      if (old && old.options) await self.registration.pushManager.subscribe(old.options);
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(function (c) { c.postMessage({ type: 'push-resync' }); });
    } catch (e) {}
  })());
});
