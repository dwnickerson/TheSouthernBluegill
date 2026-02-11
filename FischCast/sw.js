// FishCast Service Worker
const CACHE_NAME = 'fishcast-v3';
const APP_PATH = '/fishcast/';

const urlsToCache = [
  APP_PATH,
  APP_PATH + 'index.html',
  APP_PATH + 'manifest.json',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lato:wght@300;400;700&display=swap',
  'https://fonts.gstatic.com/s/cinzel/v23/8vIU7ww63mVu7gtL-KM.woff2',
  'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXg.woff2'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Don't cache API requests to external services
  if (url.hostname === 'api.open-meteo.com' || 
      url.hostname === 'nominatim.openstreetmap.org' ||
      url.hostname === 'script.google.com') {
    // Network only for API calls
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For app resources, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Cache hit - return cached version
          return response;
        }
        
        // Not in cache - fetch from network
        return fetch(event.request).then(response => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the fetched resource
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        }).catch(() => {
          // Network failed - if it's a navigation request, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match(APP_PATH + 'index.html');
          }
        });
      })
  );
});
