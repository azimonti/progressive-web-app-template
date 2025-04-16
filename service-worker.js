const CACHE_NAME = 'pwa-template-cache-v1';
const CACHE_AT_ONCE = false;
const assetsToCache = [
  // Core HTML & Manifest
  '/index.html',
  '/data/json/manifest.json',
  '/data/json/version.json',

  // CSS Libraries
  '/assets/css/lib/bootstrap-5.3.2.min.css',
  '/assets/css/lib/bootstrap-5.3.2.min.css.map',

  // CSS UI & App Specific
  '/assets/css/ui/datepicker.min.css',
  '/assets/css/ui/switch.min.css',
  '/assets/css/notif.min.css',
  '/assets/css/TEMPLATE.css',

  // JS Libraries
  '/assets/js/lib/bootstrap-5.3.2.min.js',
  '/assets/js/lib/bootstrap-5.3.2.min.js.map',
  '/assets/js/lib/bootstrap-datepicker-1.10.0.min.js',
  '/assets/js/lib/bootstrap-datepicker-1.10.0.min.js.map',
  '/assets/js/lib/dropbox-sdk-10.34.0.min.js',
  '/assets/js/lib/clipboard-2.0.11.min.js',
  '/assets/js/lib/clipboard-2.0.11.min.js.map',
  '/assets/js/lib/fontawesome-6.7.2.min.js',
  '/assets/js/lib/brands-6.7.2.min.js',
  '/assets/js/lib/solid-6.7.2.min.js',
  '/assets/js/lib/jquery-3.7.1.slim.min.js',
  '/assets/js/lib/jquery-3.7.1.slim.min.js.map',
  '/assets/js/lib/popper-2.11.8.min.js',
  '/assets/js/lib/popper-2.11.8.min.js.map',
  '/assets/js/lib/i18next-23.16.4.min.js',
  '/assets/js/lib/i18next-23.16.4.min.js.map',
  '/assets/js/lib/i18next-browser-language-detector-8.0.0.min.js',
  '/assets/js/lib/i18next-browser-language-detector-8.0.0.min.js.map',
  '/assets/js/lib/i18nextHttpBackend-3.0.2.min.js',

  // JS App Specific
  '/assets/js/cache.js',
  '/assets/js/datepicker.js',
  '/assets/js/logging.js',
  '/assets/js/notif-flash.min.js',
  '/assets/js/notif.js',
  '/assets/js/switch.js',
  '/assets/js/sync-coordinator.js',
  '/assets/js/TEMPLATE.js',
  '/assets/js/locales.js',

  // JS Storage Module
  '/assets/js/storage/files.js',
  '/assets/js/storage/storage.js',

  // JS Dropbox Integration
  '/assets/js/dropbox-sync.js',
  '/assets/js/dropbox/api.js',
  '/assets/js/dropbox/auth.js',
  '/assets/js/dropbox/config.js',
  '/assets/js/dropbox/offline.js',
  '/assets/js/dropbox/ui.js',

  // Locales
  '/assets/locales/en/translation.json',
  '/assets/locales/it/translation.json',
  '/assets/locales/ja/translation.json',

  '/img/icons/pwa-template.ico',
  '/img/icons/pwa-template-32x32.png',
  '/img/icons/pwa-template-180x180.png',
  '/img/icons/pwa-template-192x192.png',
  '/img/icons/pwa-template-512x512.png',
  '/img/icons/pwa-template-512x512-maskable.png'
];

// Function to cache assets
function cacheAssets() {
  return caches.open(CACHE_NAME).then(cache => {
    if (CACHE_AT_ONCE) {
      return cache.addAll(assetsToCache).catch(error => {
        console.error('Failed to cache some assets:', error);
      });
    } else {
      // Cache assets individually, logging errors but continuing
      return Promise.allSettled(
        assetsToCache.map(asset =>
          cache.add(asset).catch(error => ({ error, asset })) // Catch errors per asset
        )
      ).then(results => {
        results.forEach(result => {
          if (result.status === 'rejected' || result.value?.error) {
            console.error(`Failed to cache ${result.reason?.asset || result.value?.asset}: ${result.reason || result.value?.error}`);
          }
        });
        return results; // Return results even if some failed
      });
    }
  });
}

// Install event - cache assets
self.addEventListener('install', event => {
  console.log(`SW: Installing ${CACHE_NAME}`);
  self.skipWaiting(); // Force activation of new service worker
  event.waitUntil(cacheAssets());
});

// Activate event - clean up old caches and cache assets again (ensures consistency)
self.addEventListener('activate', event => {
  console.log(`SW: Activating ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME) // Filter out the current cache
          .map(name => {
            console.log(`SW: Deleting old cache ${name}`);
            return caches.delete(name); // Delete old caches
          })
      );
    }).then(() => self.clients.claim()) // Take control immediately
      .then(() => {
        console.log(`SW: Caching assets for ${CACHE_NAME} on activation.`);
        return cacheAssets(); // Re-cache assets on activation for robustness
      })
  );
});

// Fetch event - serve cached content or fall back to network (Network falling back to cache for offline)
self.addEventListener('fetch', event => {
  const req = event.request;

  // For navigation requests (HTML pages), try network first, then cache.
  // This ensures users get the latest HTML if online.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req) // Try network first
        .then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            // If network fails or returns an error, try the cache
            return caches.match(req);
          }
          // Optional: Cache the fetched page if needed, but usually handled by install/activate
          return response;
        })
        .catch(() => {
          // Network request failed, try to serve from cache
          return caches.match(req);
        })
    );
    return; // Important: exit early for navigate requests
  }

  // For non-navigation requests (CSS, JS, images), use cache-first strategy.
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      // Return cached response if found
      if (cachedResponse) {
        return cachedResponse;
      }
      // If not in cache, fetch from network
      return fetch(req).then(networkResponse => {
        // Optional: Cache the newly fetched resource dynamically
        // Be cautious with dynamic caching, it can fill up storage.
        // Consider only caching specific types or paths if needed.
        // Example:
        // if (networkResponse && networkResponse.status === 200) {
        //   const responseToCache = networkResponse.clone();
        //   caches.open(CACHE_NAME).then(cache => {
        //     cache.put(req, responseToCache);
        //   });
        // }
        return networkResponse;
      });
    }).catch(err => {
      // Handle fetch errors (e.g., network offline)
      console.error('SW: Fetch error', err);
      // Optionally return a custom offline response for specific asset types
      // if (req.url.endsWith('.png')) {
      //   return caches.match('/img/offline-placeholder.png');
      // }
      // For generic errors, just let the browser handle it (usually results in a network error page)
      // Or return a generic error response:
      // return new Response('Network error occurred', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});

// Message event listener (e.g., for cache refresh)
self.addEventListener('message', event => {
  if (event.data === 'refresh_cache') {
    console.log(`SW: Received 'refresh_cache' message. Re-caching assets for ${CACHE_NAME}.`);
    event.waitUntil(cacheAssets());
  }
});
