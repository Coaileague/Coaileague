/**
 * AutoForce™ Service Worker
 * Provides offline support and caching for PWA functionality
 */

const CACHE_NAME = 'autoforce-v1.0.3';
const RUNTIME_CACHE = 'autoforce-runtime-v1.0.3';

// Assets to precache on install (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[AutoForce™ SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[AutoForce™ SW] Caching app shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[AutoForce™ SW] Installed successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[AutoForce™ SW] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[AutoForce™ SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const deletePromises = cacheNames
        .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
        .map(name => {
          console.log('[AutoForce™ SW] Deleting old cache:', name);
          return caches.delete(name);
        });
      return Promise.all(deletePromises);
    }).then(() => {
      console.log('[AutoForce™ SW] Activated, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== location.origin) return;

  // Skip chrome extension and special protocols
  if (url.protocol === 'chrome-extension:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // API requests - network first, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // App shell (HTML, JS, CSS) - NETWORK FIRST to ensure latest code
  // Changed from cache-first to prevent stale JavaScript bundles
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache only when offline
          return caches.match(request).then(cached => {
            if (cached) return cached;
            // Final fallback to index.html for navigation requests
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Static assets (images, fonts, icons) - cache first
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|eot)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (response.ok) {
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, response.clone());
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // All other requests - network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then(cached => {
          return cached || new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle push notifications (for future implementation)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New notification from AutoForce™',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'autoforce-notification',
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AutoForce™', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
