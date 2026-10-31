/* WonderTech Pulse — Service Worker
 * Strategies
 *   - App shell:        Cache-First (precached at install, versioned cache)
 *   - Navigations:      Cache-First shell with offline.html fallback
 *   - Feeds / external: Stale-While-Revalidate (network-first for explicit "no-store" sync fetches)
 *   - Static Routing API (Chromium): icons/ and css/ are routed straight to the cache without waking the SW
 *   - Background Sync ("wtp-sync") and Periodic Background Sync ("wtp-feed-refresh") run a real feed sync
 *
 * IMPORTANT: bump VERSION whenever any precached asset changes, so clients receive the update.
 */
'use strict';

const VERSION = '1.4.0';
const SHELL_CACHE = 'wtp-shell-v' + VERSION;
const FEED_CACHE = 'wtp-feeds-v' + VERSION;
const FEED_CACHE_MAX = 60;

const SHELL_ASSETS = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/db.js',
  'js/feeds.js',
  'js/pwa-handler.js',
  'js/app.js',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png'
];

// DB + feed engine are shared with the page so background sync can write to IndexedDB.
importScripts('js/db.js', 'js/feeds.js');

self.addEventListener('install', (event) => {
  // Static Routing API (progressive enhancement; ignored where unsupported)
  if (typeof event.addRoutes === 'function') {
    try {
      const base = new URL('./', self.registration.scope).pathname;
      const p = event.addRoutes([
        { condition: { urlPattern: { pathname: base + 'icons/*' } }, source: { cacheName: SHELL_CACHE } },
        { condition: { urlPattern: { pathname: base + 'css/*' } }, source: { cacheName: SHELL_CACHE } }
      ]);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* unsupported syntax in this browser build */ }
  }

  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
  })());
  // Activation is user-controlled: the page shows an "Update available" toast and sends SKIP_WAITING.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, FEED_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('wtp-') && !keep.has(n)).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }

  // Explicit fresh fetches (feed sync) → network first, cache as fallback.
  if (req.cache === 'no-store' || req.cache === 'reload') {
    event.respondWith(networkFirst(req, event));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(handleAsset(req, event));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, event));
});

async function handleNavigate(req) {
  const cache = await caches.open(SHELL_CACHE);
  let res = await cache.match(req, { ignoreSearch: true });
  if (!res) {
    const p = new URL(req.url).pathname;
    if (p.endsWith('/') || p.endsWith('/index.html')) res = await cache.match('index.html');
  }
  if (res) return res;
  try {
    return await fetch(req);
  } catch (_) {
    return (await cache.match('offline.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function handleAsset(req, event) {
  const shell = await caches.open(SHELL_CACHE);
  const hit = await shell.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return staleWhileRevalidate(req, event);
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(FEED_CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      trimCache(cache);
    }
    return res;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  return res || new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
}

async function networkFirst(req, event) {
  const cache = await caches.open(FEED_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      event.waitUntil(cache.put(req, res.clone()).then(() => trimCache(cache)));
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function trimCache(cache) {
  const keys = await cache.keys();
  const extra = keys.length - FEED_CACHE_MAX;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

/* ---------------- Background Sync / Periodic Background Sync ---------------- */

self.addEventListener('sync', (event) => {
  if (event.tag === 'wtp-sync') event.waitUntil(backgroundSync('background-sync'));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'wtp-feed-refresh') event.waitUntil(backgroundSync('periodic-sync'));
});

async function backgroundSync(origin) {
  let summary = null;
  try {
    summary = await self.WTP_FEEDS.syncAll({ origin });
  } catch (err) {
    try { await self.WTP_DB.log('sync', 'Background sync failed: ' + err.message, { origin }, false); } catch (_) {}
  }

  let unreviewed = 0;
  try {
    unreviewed = await self.WTP_DB.countUnreviewedCritical();
    if (self.navigator && 'setAppBadge' in self.navigator) {
      if (unreviewed > 0) await self.navigator.setAppBadge(unreviewed);
      else await self.navigator.clearAppBadge();
    }
  } catch (_) {}

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: 'SYNC_COMPLETE', origin, unreviewed, summary }));

  // Let the browser retry one-shot background syncs when feeds failed.
  if (origin === 'background-sync' && summary && summary.failed > 0) {
    throw new Error('One or more feeds failed; retry later');
  }
}
