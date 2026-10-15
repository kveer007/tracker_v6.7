/**
 * Daily Tracker PWA Service Worker
 *
 * IMPORTANT: this file must stay at the repository root. A service worker can
 * only control pages at or below its own directory, so moving it into a
 * subfolder would silently limit its scope to that subfolder.
 *
 * All precache entries are RELATIVE. The app is served from a GitHub Pages
 * project subpath (e.g. /tracker_v5/), where a root-absolute path like '/'
 * or '/icons/icon-192.png' points at the wrong site entirely.
 */

// Change whenever FILES_TO_CACHE changes, so old caches are dropped.
const CACHE_NAME = 'daily-tracker-v6.7';

// Resolved against the service worker's own scope, so these work at any subpath.
const FILES_TO_CACHE = [
  'index.html',
  'manifest.json',
  'core/core-styles.css',
  'core/core-scripts.js',
  'core/ui.js',
  'core/chart.js',
  'core/calendar.js',
  'trackers/trackers-scripts.js',
  'trackers/trackers-styles.css',
  'workouts/workouts-scripts.js',
  'workouts/workouts-styles.css',
  'habits/habits-scripts.js',
  'habits/habits-styles.css',
  'reminders/reminders-scripts.js',
  'reminders/reminders-styles.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

/**
 * Resolve a path against the service worker scope.
 */
function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

// Install - precache the app shell.
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Deliberately NOT cache.addAll: that is atomic, so a single failed
      // request (an offline font CDN, a renamed file) would leave the app
      // with no cache at all. Cache each entry independently instead.
      return Promise.allSettled(
        FILES_TO_CACHE.map((file) =>
          cache.add(file).catch((error) => {
            console.warn('[Service Worker] Failed to precache', file, error);
          })
        )
      );
    })
  );
});

// Activate - drop old caches and take control.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');

  event.waitUntil(
    caches
      .keys()
      .then((keyList) =>
        Promise.all(
          keyList.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Serve from cache, refreshing the cache in the background.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.status === 200 || response.type === 'opaque')) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Try the network first, fall back to cache when offline.
 *
 * Used for HTML, JS and CSS so that a deploy actually reaches the installed
 * app. Under a cache-first strategy the app would keep serving whatever was
 * cached at install time until CACHE_NAME changed, which is very easy to
 * forget when pushing a fix.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // A navigation with nothing cached: fall back to the app shell.
    if (request.mode === 'navigate') {
      const shell = await caches.match(scopedUrl('index.html'));
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never interfere with non-GET traffic.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isFontHost =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (!isSameOrigin && !isFontHost) return;

  // Fonts and images barely change; serve them from cache for speed.
  if (isFontHost || /\.(png|jpg|jpeg|svg|gif|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // App code and markup: network first so updates land.
  event.respondWith(networkFirst(request));
});

// Push notifications (used when a push backend is connected).
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');

  let notificationData = {
    title: 'Daily Tracker',
    body: 'Reminder from your tracker',
    icon: scopedUrl('icons/icon-192.png'),
    badge: scopedUrl('icons/icon-192.png'),
    tag: 'tracker-reminder',
    requireInteraction: false,
    timestamp: Date.now(),
    data: {}
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData,
        data: { ...notificationData.data, ...pushData.data }
      };
    } catch (e) {
      console.error('[Service Worker] Error parsing push data:', e);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  if (notificationData.data && notificationData.data.type) {
    switch (notificationData.data.type) {
      case 'system-reminder':
        notificationData.tag = `system-${notificationData.data.reminderType}`;
        break;
      case 'custom-reminder':
        notificationData.tag = `custom-${notificationData.data.reminderId}`;
        break;
      default:
        notificationData.tag = 'daily-tracker-notification';
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click - focus an open window, or open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action || 'default';

  if (action === 'dismiss') return;

  const urlParams = new URLSearchParams();

  if (notificationData.type) {
    urlParams.append('notification', notificationData.type);

    if (notificationData.type === 'system-reminder' && notificationData.reminderType) {
      urlParams.append('reminder', notificationData.reminderType);
      if (notificationData.reminderType.includes('water')) {
        urlParams.append('tab', 'water');
      } else if (notificationData.reminderType.includes('protein')) {
        urlParams.append('tab', 'protein');
      }
    } else if (notificationData.type === 'custom-reminder') {
      if (notificationData.reminderId) {
        urlParams.append('customId', notificationData.reminderId);
      }
      urlParams.append('tab', 'reminders');
    }
  }

  // Relative to the scope, so this opens the app rather than the domain root.
  let targetUrl = scopedUrl('index.html');
  if (urlParams.toString()) {
    targetUrl += '?' + urlParams.toString();
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            client.postMessage({
              type: 'notification-click',
              notificationData,
              action,
              timestamp: Date.now()
            });
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
      .catch((error) => {
        console.error('[Service Worker] Error handling notification click:', error);
      })
  );
});

self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'skip-waiting') {
    self.skipWaiting();
  } else if (type === 'update-cache') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        Promise.allSettled(FILES_TO_CACHE.map((file) => cache.add(file)))
      )
    );
  }
});
