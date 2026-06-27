// Service worker for Game Day W.
// Goals:
//  - App shell loads instantly and works offline (cache-first on /, /index.html, /app.js, /styles.css, logos).
//  - Reference data (rosters, schedule, leaders, trades, injuries) renders immediately from cache,
//    refreshing in the background — fast cold opens on flaky arena wifi.
//  - Live scoreboard (/api/live) stays network-first so scores never appear stale; falls back to cache only
//    if the network actually fails.
// Bump VERSION when shipping breaking changes to invalidate old caches.

const VERSION = 'v5';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
// Cap the API cache so a long session visiting many player pages can't grow it unbounded.
const API_CACHE_MAX = 80;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/light.svg',
  '/dark.svg',
  '/icon.png',
  '/icon-192.png',
  '/icon-maskable.png',
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

// Keep a cache from growing without bound by trimming oldest entries (FIFO by insertion order,
// which is the order caches.keys() returns) once it exceeds `max`.
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (const req of keys.slice(0, keys.length - max)) await cache.delete(req);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) { await cache.put(request, fresh.clone()); trimCache(cacheName, API_CACHE_MAX); }
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
      if (res.ok) { cache.put(request, res.clone()).then(() => trimCache(cacheName, API_CACHE_MAX)); }
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
    // Time-sensitive feeds (live scores, schedule status/scores) must never render stale —
    // go network-first, falling back to cache only when offline. Everything else (rosters,
    // leaders, trades, injuries) is fine to serve stale-while-revalidate for instant paint.
    if (url.pathname === '/api/live' || url.pathname === '/api/schedule') {
      event.respondWith(networkFirst(request, API_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request, API_CACHE));
    }
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => fetch(request)));
});
