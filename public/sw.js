// Minimal service worker — network-first for API, cache-first for assets
const CACHE = 'recipe-vault-v1';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Always network-first for API calls and Supabase
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    e.respondWith(fetch(request));
    return;
  }

  // Cache-first for everything else (app shell, assets)
  e.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});
