// FishCast Service Worker
const CACHE_NAME = 'fishcast-v2';
const urlsToCache = [
  '/fishing-forecast/',                    // ← matches start_url and root navigation for the app
  '/fishing-forecast/index.html',          // ← explicit fallback if server serves index.html directly
  '/fishing-forecast/manifest.json',
  // Add your actual app assets here (relative to /fishing-forecast/)
  '/fishing-forecast/styles.css',          // example — use real paths
  '/fishing-forecast/app.js',              // example
  '/fishing-forecast/icons/icon-192.png',
  '/fishing-forecast/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lato:wght@300;400;700&display=swap'
  // ... any other JS, CSS, images, API data (if static), etc.
];

// Install service worker and cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
