// FishCast Service Worker
const CACHE_NAME = 'fishcast-v7';
const APP_PATH = '/fishcast/';
const DEBUG_SW = false;
const DEV_SW = DEBUG_SW || (typeof self !== 'undefined' && /localhost|127\.0\.0\.1/.test(self.location.hostname));
const SW_API_HOSTS = new Set([
  'api.open-meteo.com',
  'archive-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'script.google.com'
]);
const swDebugKeys = new Set();

function logSW(...args) {
  if (DEV_SW) {
    console.log('[FishCast SW]', ...args);
  }
}

function logSWOnce(key, ...args) {
  if (!DEV_SW || swDebugKeys.has(key)) {
    return;
  }

  swDebugKeys.add(key);
  console.warn('[FishCast SW]', ...args);
}

function offlineResponse() {
  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

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
  `${APP_PATH}js/utils/theme.js`,
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
  const request = event?.request;
  if (!request || request.method !== 'GET') {
    return;
  }

  const safeResponse = handleFetch(request).catch((error) => {
    logSW('fetch.respondWith.unhandled', request?.url, error);
    if (request.mode === 'navigate') {
      return caches.match(`${APP_PATH}index.html`).then((appShell) => appShell || offlineResponse());
    }
    return new Response(null, { status: 204 });
  });

  event.respondWith(safeResponse);
});

async function handleFetch(request) {
  try {
    if (!request || !request.url) {
      return new Response(null, { status: 204 });
    }

    const url = new URL(request.url);

    if (url.pathname.includes('/null') || url.pathname.endsWith('/null') || url.href.includes('/null?')) {
      logSWOnce('null-path', 'Blocked invalid /null request', url.href);
      return new Response(null, { status: 204 });
    }

    if (url.origin !== self.location.origin) {
      logSW('bypass-cross-origin', url.href);
      try {
        return await fetch(request);
      } catch (error) {
        logSW('cross-origin-fetch-failed', url.href, error);
        return offlineResponse();
      }
    }

    // Keep selected APIs network-only so we don't serve stale forecast data.
    if (SW_API_HOSTS.has(url.hostname)) {
      logSW('network-only-api', url.href);
      try {
        return await fetch(request);
      } catch (error) {
        logSW('network-only-api-failed', url.href, error);
        const fallback = await caches.match(request);
        return fallback || offlineResponse();
      }
    }

    // App shell code/assets should prefer network so field-model updates are
    // visible immediately after deploys instead of being pinned by cache-first.
    const isAppCodeAsset =
      url.pathname.startsWith(`${APP_PATH}js/`) ||
      url.pathname.startsWith(`${APP_PATH}styles/`) ||
      url.pathname === `${APP_PATH}index.html`;

    if (!isAppCodeAsset) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        logSW('cache-hit', url.href);
        return cachedResponse;
      }
    }

    if (isAppCodeAsset) {
      try {
        const networkFresh = await fetch(request);
        if (networkFresh?.status === 200) {
          const clone = networkFresh.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, clone))
            .catch(error => logSW('cache-put-failed', url.href, error));
        }
        logSW('network-first-app-asset', url.href);
        return networkFresh;
      } catch (error) {
        logSW('network-first-app-asset-failed', url.href, error);
        const cachedFallback = await caches.match(request);
        if (cachedFallback) return cachedFallback;
      }
    }

    try {
      const networkResponse = await fetch(request);
      if (!networkResponse) {
        logSW('empty-network-response', url.href);
        return offlineResponse();
      }

      if (networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(request, responseToCache))
          .catch(error => logSW('cache-put-failed', url.href, error));
      }

      logSW('network-ok', url.href);
      return networkResponse;
    } catch (error) {
      logSW('network-failed', url.href, error);
      if (request.mode === 'navigate') {
        const appShell = await caches.match(`${APP_PATH}index.html`);
        if (appShell) {
          logSW('fallback-app-shell', url.href);
          return appShell;
        }
      }

      const cachedFallback = await caches.match(request);
      if (cachedFallback) {
        logSW('fallback-cache', url.href);
        return cachedFallback;
      }

      return request.mode === 'navigate'
        ? offlineResponse()
        : new Response(null, { status: 204 });
    }
  } catch (error) {
    logSW('fetch-handler-error', request?.url, error);
    if (request?.mode === 'navigate') {
      const appShell = await caches.match(`${APP_PATH}index.html`);
      return appShell || offlineResponse();
    }
    return new Response(null, { status: 204 });
  }
}
