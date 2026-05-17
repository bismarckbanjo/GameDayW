// Service worker for Game Day W.
// Goals:
//  - App shell loads instantly and works offline (cache-first on /, /index.html, /app.js, /styles.css, logos).
//  - Reference data (rosters, schedule, leaders, trades, injuries) renders immediately from cache,
//    refreshing in the background — fast cold opens on flaky arena wifi.
//  - Live scoreboard (/api/live) stays network-first so scores never appear stale; falls back to cache only
//    if the network actually fails.
// Bump VERSION when shipping breaking changes to invalidate old caches.

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/light.svg',
  '/dark.svg',
  '/icon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Use a fresh fetch for each so we don't pull stale copies from the HTTP cache during install.
      cache.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('network and cache both unavailable');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests — serve the shell from cache when offline so the SPA still boots.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    // Live scoreboard must never appear stale. Everything else is fair game for SWR.
    if (url.pathname === '/api/live') {
      event.respondWith(networkFirst(request, API_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request, API_CACHE));
    }
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => fetch(request)));
});
