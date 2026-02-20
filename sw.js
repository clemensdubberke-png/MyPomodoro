/* ── Pomodoro Timer – Service Worker ── */
const CACHE = 'pomodoro-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg',
];

/* Install: pre-cache all local assets */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: remove old caches, then reload clients if this is an update */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => {
        const stale = keys.filter(k => k !== CACHE);
        const isUpdate = stale.length > 0;
        return Promise.all(stale.map(k => caches.delete(k)))
          .then(() => self.clients.claim())
          .then(() => {
            /* Only reload when there actually was an old cache (= real update).
               This avoids an unwanted reload on the very first install. */
            if (!isUpdate) return;
            return self.clients.matchAll({ type: 'window', includeUncontrolled: false })
              .then(clients => clients.forEach(c => c.navigate(c.url)));
          });
      })
  );
});

/* Fetch: cache-first for local, network-first for Google Fonts */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Google Fonts – network first, fallback to cache */
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  /* Everything else – cache first */
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
      )
      .catch(() => caches.match('./index.html'))
  );
});
