/* ── Pomodoro Timer – Service Worker ── */

/* ── Scheduled timer notification ──
   The main page posts SCHEDULE_TIMER with { endEpoch, msg }.
   We use setTimeout so the notification fires even when the page is
   frozen by Android's power-saving.  The SW can still be terminated
   by the browser at any time — so this is a best-effort enhancement
   on top of the epoch-based checks in the main page. */
let scheduledTimerId = null;

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_TIMER') {
    if (scheduledTimerId) { clearTimeout(scheduledTimerId); scheduledTimerId = null; }
    const delay = Math.max(0, e.data.endEpoch - Date.now());
    scheduledTimerId = setTimeout(() => {
      scheduledTimerId = null;
      self.registration.showNotification('MyPomodoro', {
        body: e.data.msg || 'Timer abgelaufen',
        icon:  'icons/icon-192.svg',
        badge: 'icons/icon-192.svg',
        tag:      'pomodoro-alert',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 300],
      }).catch(() => {});
    }, delay);
  } else if (e.data.type === 'CANCEL_TIMER') {
    if (scheduledTimerId) { clearTimeout(scheduledTimerId); scheduledTimerId = null; }
  }
});

/* Notification click: Tap auf die Push-Notification öffnet / fokussiert die App */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow('./');
      })
  );
});
const CACHE = 'pomodoro-v15';

/* Static assets that rarely change — safe to serve from cache */
const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg',
  './Pause.mp3',
];

/* Install: pre-cache only static assets.
   index.html is intentionally excluded so it is always fetched
   fresh from the network (network-first below). */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: remove all old caches, claim clients, then reload open tabs
   so they immediately get the latest code without a manual refresh. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => {
        const stale = keys.filter(k => k !== CACHE);
        const isUpdate = stale.length > 0;
        return Promise.all(stale.map(k => caches.delete(k)))
          .then(() => self.clients.claim())
          .then(() => {
            if (!isUpdate) return;
            return self.clients.matchAll({ type: 'window', includeUncontrolled: false })
              .then(clients => clients.forEach(c => c.navigate(c.url)));
          });
      })
  );
});

/* Fetch strategy:
   - index.html   → network-first (always get latest code; fall back to cache offline)
   - Google Fonts → network-first, cache for offline fallback
   - Everything else (icons, manifest) → cache-first                                  */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* index.html – network first so code updates are always picked up */
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
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

  /* Static assets – cache first, network fallback */
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
