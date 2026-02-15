// FishCast Service Worker
const CACHE_NAME = 'fishcast-v6';
const APP_PATH = '/fishcast/';

const urlsToCache = [
  APP_PATH,
  `${APP_PATH}index.html`,
  `${APP_PATH}manifest.json`,
  `${APP_PATH}styles/main.css`,
  `${APP_PATH}js/app.js`,
  `${APP_PATH}js/config/constants.js`,
  `${APP_PATH}js/config/species.js`,
  `${APP_PATH}js/config/waterBodies.js`,
  `${APP_PATH}js/models/fishingScore.js`,
  `${APP_PATH}js/models/solunar.js`,
  `${APP_PATH}js/models/waterTemp.js`,
  `${APP_PATH}js/services/geocoding.js`,
  `${APP_PATH}js/services/storage.js`,
  `${APP_PATH}js/services/weatherAPI.js`,
  `${APP_PATH}js/ui/favorites.js`,
  `${APP_PATH}js/ui/forecast.js`,
  `${APP_PATH}js/ui/modals.js`,
  `${APP_PATH}js/utils/date.js`,
  `${APP_PATH}js/utils/math.js`,
  `${APP_PATH}icon-192.png`,
  `${APP_PATH}icon-512.png`
];

// Install event - cache core app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      })
    )).then(() => self.clients.claim())
  );
});

// Fetch event - app shell offline first, API network only
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Keep API calls network-only so we don't serve stale forecast data
  if (
    url.hostname === 'api.open-meteo.com' ||
    url.hostname === 'archive-api.open-meteo.com' ||
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname === 'script.google.com'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(`${APP_PATH}index.html`);
          }

          return caches.match(event.request);
        });
    })
  );
});
