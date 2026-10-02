/* =========================================================
   FocusFlow Service Worker  ·  v2.0
   Handles: Web Push, Notification Clicks, Offline Cache
   ========================================================= */

const CACHE_NAME = 'focusflow-v2';
const ASSETS_TO_CACHE = ['/', '/screen.png', '/favicon.svg'];

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------- Fetch (offline-first for shell assets) ----------
self.addEventListener('fetch', (event) => {
  // Only cache GET requests for same-origin navigation
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ---------- Push ----------
self.addEventListener('push', (event) => {
  let data = { title: 'FocusFlow', body: 'You have a new reminder.', url: '/', tag: 'focusflow-default', icon: '/screen.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/screen.png',
    badge: '/screen.png',
    tag: data.tag || 'focusflow',
    renotify: false,
    requireInteraction: false,
    silent: false,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open FocusFlow' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ---------- Notification Click ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if open
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            client.focus();
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return;
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow(self.location.origin + targetUrl);
      })
  );
});

// ---------- Push Subscription Change ----------
self.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscribe silently in the background
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        // Notify the app to send the new subscription to the server
        return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription }));
        });
      })
  );
});
