// FishCast Service Worker - Fixed for reliable updates (v5+)

// Version is sourced from sw.js?v=... at registration time so deploys only bump one value.
const SW_URL = (typeof self !== 'undefined' && self.location && self.location.href) ? self.location.href : '';
const SW_QUERY_VERSION = SW_URL ? new URL(SW_URL).searchParams.get('v') : null;
const CACHE_VERSION = SW_QUERY_VERSION || 'dev';
const CACHE_NAME = `fishcast-v${CACHE_VERSION}`;

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
  if (!DEV_SW || swDebugKeys.has(key)) return;
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

// Install: precache with forced network fetches (bypasses old cache)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        urlsToCache.map(url => {
          return fetch(url, { cache: 'reload' })
            .then(response => {
              if (!response.ok) {
                logSW('install-fetch-warning', url, 'status:', response.status);
              }
              return cache.put(url, response);
            })
            .catch(err => {
              logSW('install-fetch-failed', url, err);
              // Don't fail install if one asset is missing
            });
        })
      );
    })
    .then(() => {
      logSW('install-success', 'Precached with fresh fetches');
      return self.skipWaiting();
    })
    .catch(err => logSW('install-error', err))
  );
});

// Activate: cleanup + immediate control
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => {
        return Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) {
              logSW('deleting-old-cache', key);
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      }),
      self.clients.claim()  // Take control of all pages right away
    ])
    .then(() => logSW('activate-success', 'New version active'))
  );
});

// Handle messages from client (e.g. force skip waiting)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    logSW('message-skip-waiting');
    self.skipWaiting();
  }
});

// Fetch handling (your original logic preserved)
self.addEventListener('fetch', event => {
  const request = event?.request;
  if (!request || request.method !== 'GET') return;

  const safeResponse = handleFetch(request).catch(error => {
    logSW('fetch-unhandled-error', request?.url, error);
    if (request.mode === 'navigate') {
      return caches.match(`${APP_PATH}index.html`).then(s => s || offlineResponse());
    }
    return new Response(null, { status: 204 });
  });

  event.respondWith(safeResponse);
});

async function handleFetch(request) {
  try {
    if (!request?.url) return new Response(null, { status: 204 });

    const url = new URL(request.url);

    if (url.pathname.includes('/null') || url.pathname.endsWith('/null') || url.href.includes('/null?')) {
      logSWOnce('null-path', 'Blocked invalid /null', url.href);
      return new Response(null, { status: 204 });
    }

    if (url.origin !== self.location.origin) {
      logSW('cross-origin-bypass', url.href);
      try { return await fetch(request); } catch { return offlineResponse(); }
    }

    if (SW_API_HOSTS.has(url.hostname)) {
      logSW('network-only-api', url.href);
      try { return await fetch(request); } catch {
        const fb = await caches.match(request);
        return fb || offlineResponse();
      }
    }

    const isAppCodeAsset =
      url.pathname.startsWith(`${APP_PATH}js/`) ||
      url.pathname.startsWith(`${APP_PATH}styles/`) ||
      url.pathname === `${APP_PATH}index.html`;

    if (!isAppCodeAsset) {
      const cached = await caches.match(request);
      if (cached) {
        logSW('cache-hit-non-asset', url.href);
        return cached;
      }
    }

    if (isAppCodeAsset) {
      try {
        const fresh = await fetch(request);
        if (fresh?.status === 200) {
          const clone = fresh.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(err => logSW('put-fail', url.href, err));
        }
        logSW('network-first-asset', url.href);
        return fresh;
      } catch (err) {
        logSW('network-first-fail', url.href, err);
        const fb = await caches.match(request);
        if (fb) return fb;
      }
    }

    try {
      const resp = await fetch(request);
      if (resp?.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(err => logSW('put-fail', url.href, err));
      }
      logSW('network-success', url.href);
      return resp;
    } catch (err) {
      logSW('network-fail', url.href, err);
      if (request.mode === 'navigate') {
        const shell = await caches.match(`${APP_PATH}index.html`);
        if (shell) return shell;
      }
      const fb = await caches.match(request);
      if (fb) return fb;
      return request.mode === 'navigate' ? offlineResponse() : new Response(null, { status: 204 });
    }
  } catch (err) {
    logSW('handle-fetch-error', request?.url, err);
    if (request?.mode === 'navigate') {
      const shell = await caches.match(`${APP_PATH}index.html`);
      return shell || offlineResponse();
    }
    return new Response(null, { status: 204 });
  }
}
