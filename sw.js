// Service worker: keeps the game, card data and artwork in the browser cache.
// Every request is answered from the cache immediately (if present) and refreshed
// in the background (stale-while-revalidate), so repeat visits load instantly and
// new cards still show up on the next visit.
const CACHE = 'rajongoi-tcg-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    // artwork rarely changes: serve it from cache without waiting; everything else too,
    // but refresh in the background so the next visit is up to date
    if (cached) { e.waitUntil(fresh); return cached; }
    return fresh;
  })());
});
