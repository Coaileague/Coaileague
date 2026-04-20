/**
 * CoAIleague Service Worker v4.6.0
 * APK-ready with IndexedDB offline queue, SW update prompts, and enhanced caching.
 *
 * Canonical registration: navigator.serviceWorker.register('/sw.js').
 * notificationclick handlers MUST stay in sync with NOTIFICATION_ACTION_MAP in
 * server/services/notificationDeliveryService.ts. Supported actions:
 *   accept, decline, approve, view, sign, clock_in, reply, acknowledge,
 *   respond, dismiss.
 * 
 * Features:
 * - IndexedDB-backed offline queue (survives app restarts)
 * - Background sync replays queued requests from IndexedDB
 * - SW update notifications to clients
 * - Aggressive precaching for APK shell
 * - Stale-while-revalidate for key API data (schedule, employees, notifications, time-entries)
 * - Offline page caching for network failures
 * - Push notification handling for shift alerts
 * - Cache-first for static assets, network-first for dynamic content
 * - Navigation preload
 * - Cache versioning with automatic stale data purge on SW update
 */

const CACHE_VERSION = 11;
const CACHE_NAME = 'coaileague-v4.6';
const STATIC_CACHE = 'coaileague-static-v4.6';
const API_CACHE = 'coaileague-api-v' + CACHE_VERSION;
const offlineFallbackPage = '/offline.html';

// Standalone public HTML assets that are NOT part of the React SPA.
// These must always fetch from the network and NEVER be served from the
// SW offline fallback, because external services (Twilio toll-free
// verification, regulators, etc.) visit them directly and expect the
// real content — not a PWA "You're Offline" screen. Added 2026-04-08
// after Twilio reviewers saw offline.html instead of the opt-in form.
const STANDALONE_HTML_BYPASS = new Set([
  '/sms-opt-in.html',
  '/offline.html', // served only as a last resort fallback, never cached-as-navigation
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/manifest.webmanifest',
]);

const STALE_WHILE_REVALIDATE_ENDPOINTS = [
  '/api/schedule',
  '/api/employees',
  '/api/notifications/combined',
  '/api/time-entries'
];

const DB_NAME = 'coaileague-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'offline-queue';

const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

const STATIC_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.png$/,
  /\.jpg$/,
  /\.svg$/,
  /\/icons\//
];

const OFFLINE_CAPABLE_ENDPOINTS = [
  '/api/time-entries/clock-in',
  '/api/time-entries/clock-out',
  '/api/incidents/report',
  '/api/time-entries'
];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v4.3.0');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v4.6.0 — purging ALL old caches + standalone HTML bypass');
  event.waitUntil(
    Promise.all([
      // Delete ALL caches that aren't the current valid set — this purges any stale Vite module caches
      caches.keys().then((keyList) => {
        const validCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE];
        return Promise.all(
          keyList.map((key) => {
            if (!validCaches.includes(key)) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            }
          })
        );
      }),
      // 2026-04-08: explicitly purge any stale entries for standalone HTML
      // paths that a prior SW version may have cached (e.g. Twilio opt-in
      // page served offline fallback). Run across ALL remaining caches.
      caches.keys().then((keyList) => {
        return Promise.all(
          keyList.map(async (cacheKey) => {
            const cache = await caches.open(cacheKey);
            for (const path of STANDALONE_HTML_BYPASS) {
              try { await cache.delete(path); } catch {}
              try { await cache.delete(new URL(path, self.location.origin).toString()); } catch {}
            }
          }),
        );
      }),
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
    ]).then(() => {
      // After purging stale caches, force-reload ALL open clients.
      // This is essential when stale cached JS caused a blank page — the page
      // can't show an "Update" banner if it never mounted in the first place.
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((c) => {
          // navigate() forces a full reload, bypassing any stale in-memory modules
          c.navigate(c.url).catch(() => {
            // fallback: postMessage if navigate fails
            c.postMessage({ type: 'SW_UPDATED', version: 'v4.6.0' });
          });
        });
      });
    })
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return STATIC_PATTERNS.some(pattern => pattern.test(url));
}

function isOfflineCapable(url) {
  return OFFLINE_CAPABLE_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

function isStaleWhileRevalidate(pathname) {
  return STALE_WHILE_REVALIDATE_ENDPOINTS.some(endpoint => pathname.startsWith(endpoint));
}

async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch((err) => {
    if (cached) return cached;
    return new Response(JSON.stringify({
      error: 'Offline',
      offline: true,
      message: 'You are offline. Showing cached data.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    if (['POST', 'PUT', 'PATCH'].includes(event.request.method) && isOfflineCapable(event.request.url)) {
      event.respondWith(handleOfflinePost(event.request));
    }
    return;
  }

  if (url.pathname.startsWith('/ws/')) return;

  // BYPASS standalone public HTML/static assets — never intercept, never
  // serve offline fallback. External auditors (Twilio, regulators, privacy
  // reviewers) visit these directly and must see the real content.
  // (2026-04-08: Twilio toll-free verification was served offline.html.)
  if (STANDALONE_HTML_BYPASS.has(url.pathname)) return;
  if (url.pathname.endsWith('.html') && url.pathname !== '/' && url.pathname !== '/index.html') return;
  if (url.pathname.endsWith('.txt') || url.pathname.endsWith('.xml')) return;

  // CRITICAL: Never cache Vite dev server module requests.
  // Paths starting with /@ are Vite internals (/@vite/client, /@react-refresh, /@fs/...).
  // Paths starting with /src/ are Vite-transformed source modules.
  // Caching these with cache-first causes the browser to serve stale/broken JS forever.
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.search.includes('v=') || url.search.includes('t=')) return;

  if (url.pathname.startsWith('/api/')) {
    if (isStaleWhileRevalidate(url.pathname)) {
      event.respondWith(handleStaleWhileRevalidate(event.request));
      return;
    }

    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return new Response(JSON.stringify({ 
            error: 'Offline', 
            offline: true,
            message: 'You are offline. Data will sync when connected.' 
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const preloadResponse = event.preloadResponse ? await event.preloadResponse : null;
        if (preloadResponse) return preloadResponse;

        const response = await fetch(event.request);
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      } catch (error) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === 'navigate') {
          return caches.match(offlineFallbackPage);
        }
        return new Response('Offline', { status: 503 });
      }
    })()
  );
});

async function handleOfflinePost(request) {
  try {
    return await fetch(request.clone());
  } catch (error) {
    const requestBody = await request.clone().text();
    const isClockEndpoint = request.url.includes('/api/time-entries/clock-in') || request.url.includes('/api/time-entries/clock-out');
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: requestBody,
      timestamp: Date.now(),
      idempotencyKey: isClockEndpoint ? crypto.randomUUID() : undefined
    };

    try {
      const db = await openDB();
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).add(requestData);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });

      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: 'OFFLINE_REQUEST_QUEUED', count: 1 }));

      if (self.registration.sync) {
        await self.registration.sync.register('sync-offline-queue');
      }
    } catch (dbError) {
      console.error('[SW] Failed to store offline request in IndexedDB:', dbError);
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: 'QUEUE_OFFLINE_REQUEST',
          payload: requestData
        });
      });
    }

    return new Response(JSON.stringify({
      success: true,
      queued: true,
      message: 'Saved offline. Will sync when connected.'
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function syncOfflineQueue() {
  console.log('[SW] Syncing offline queue from IndexedDB...');
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const all = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
    });

    if (all.length === 0) {
      console.log('[SW] No queued requests to sync');
      return;
    }

    console.log('[SW] Found', all.length, 'queued requests to sync');
    let synced = 0;

    for (const entry of all) {
      try {
        let replayBody = entry.body;
        if (entry.idempotencyKey && replayBody) {
          try {
            const parsed = JSON.parse(replayBody);
            parsed.idempotencyKey = entry.idempotencyKey;
            replayBody = JSON.stringify(parsed);
          } catch (parseErr) {
            console.warn('[SW] Could not inject idempotencyKey into body:', parseErr);
          }
        }
        const response = await fetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: replayBody
        });
        if (response.ok) {
          const delTx = db.transaction(QUEUE_STORE, 'readwrite');
          delTx.objectStore(QUEUE_STORE).delete(entry.id);
          await new Promise((resolve, reject) => {
            delTx.oncomplete = resolve;
            delTx.onerror = reject;
          });
          synced++;
        }
      } catch (e) {
        console.log('[SW] Request still failing, will retry later:', entry.url);
      }
    }

    if (synced > 0) {
      console.log('[SW] Successfully synced', synced, 'queued requests');
      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: 'OFFLINE_SYNC_COMPLETE', synced }));
    }
  } catch (e) {
    console.error('[SW] Failed to sync offline queue:', e);
  }
}

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncOfflineQueue());
  }
  if (event.tag === 'sync-clock-punches') {
    event.waitUntil(
      syncOfflineQueue().then(() => syncClockPunches())
    );
  }
  if (event.tag === 'sync-time-entries') {
    event.waitUntil(
      syncOfflineQueue().then(() => syncTimeEntries())
    );
  }
  if (event.tag === 'sync-incidents') {
    event.waitUntil(
      syncOfflineQueue().then(() => syncIncidents())
    );
  }
});

async function syncClockPunches() {
  console.log('[SW] Syncing clock punches...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_CLOCK_PUNCHES' });
  });
}

async function syncTimeEntries() {
  console.log('[SW] Syncing time entries...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_TIME_ENTRIES' });
  });
}

async function syncIncidents() {
  console.log('[SW] Syncing incidents...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_INCIDENTS' });
  });
}

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = { title: 'CoAIleague', body: 'You have a new notification' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    data.body = event.data?.text() || 'You have a new notification';
  }
  
  const options = {
    body: data.body || data.message,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-72x72.png',
    image: data.image || undefined,
    vibrate: data.vibrate || getVibrationPattern(data.type),
    data: {
      url: data.url || getDefaultUrl(data.type),
      notificationId: data.id,
      type: data.type,
      category: data.category || getNotificationCategory(data.type),
      payload: data.payload || {}
    },
    actions: data.actions || getNotificationActions(data.type),
    tag: data.tag || getNotificationTag(data.type, data.id),
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || isHighPriority(data.type),
    silent: data.silent || false,
    timestamp: data.timestamp || Date.now(),
    dir: 'auto'
  };

  Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);

  event.waitUntil(
    self.registration.showNotification(data.title, options).then(() => {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BADGE_UPDATE', action: 'increment' });
        });
      });
    })
  );
});

function getVibrationPattern(type) {
  switch (type) {
    case 'shift_reminder':
    case 'compliance_alert':
      return [200, 100, 200, 100, 200];
    case 'approval_request':
      return [200, 100, 200];
    case 'urgent_alert':
      return [300, 100, 300, 100, 300, 100, 300];
    case 'message':
    case 'chat':
      return [100, 50, 100];
    case 'payroll':
    case 'invoice':
      return [150, 75, 150];
    default:
      return [100, 50, 100];
  }
}

function isHighPriority(type) {
  return ['shift_reminder', 'urgent_alert', 'compliance_alert', 'approval_request', 'incident'].includes(type);
}

function getNotificationCategory(type) {
  const categories = {
    shift_reminder: 'schedule',
    approval_request: 'approval',
    message: 'communication',
    chat: 'communication',
    compliance_alert: 'compliance',
    urgent_alert: 'urgent',
    payroll: 'financial',
    invoice: 'financial',
    timesheet: 'time_tracking',
    incident: 'safety',
    onboarding: 'hr',
  };
  return categories[type] || 'general';
}

function getDefaultUrl(type) {
  const urls = {
    shift_reminder: '/schedule',
    approval_request: '/workflow-approvals',
    message: '/chatrooms',
    chat: '/chatrooms',
    compliance_alert: '/compliance',
    payroll: '/payroll',
    invoice: '/invoices',
    timesheet: '/time-tracking',
    incident: '/worker-incidents',
    onboarding: '/onboarding',
  };
  return urls[type] || '/';
}

function getNotificationTag(type, id) {
  if (id) return `coaileague-${type || 'notification'}-${id}`;
  return `coaileague-${type || 'notification'}-${Date.now()}`;
}

function getNotificationActions(type) {
  switch (type) {
    case 'shift_reminder':
      return [
        { action: 'clock-in', title: 'Clock In' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    case 'approval_request':
      return [
        { action: 'approve', title: 'Approve' },
        { action: 'view', title: 'View Details' }
      ];
    case 'message':
    case 'chat':
      return [
        { action: 'reply', title: 'Reply' },
        { action: 'view', title: 'View' }
      ];
    case 'compliance_alert':
      return [
        { action: 'view', title: 'View Details' },
        { action: 'acknowledge', title: 'Acknowledge' }
      ];
    case 'payroll':
    case 'invoice':
      return [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
    case 'incident':
      return [
        { action: 'respond', title: 'Respond' },
        { action: 'view', title: 'View Details' }
      ];
    case 'urgent_alert':
      return [
        { action: 'view', title: 'View Now' },
        { action: 'acknowledge', title: 'Acknowledge' }
      ];
    default:
      return [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
  }
}

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action, 'type:', event.notification.data?.type);
  event.notification.close();

  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'BADGE_UPDATE', action: 'clear' });
    });
  });

  const notificationData = event.notification.data || {};
  let targetUrl = notificationData.url || '/';

  switch (event.action) {
    case 'clock_in':
      targetUrl = notificationData.url || '/worker';
      break;
    case 'accept':
      notifyClientOfAction(notificationData, 'accepted');
      targetUrl = notificationData.url || '/schedule';
      break;
    case 'decline':
      notifyClientOfAction(notificationData, 'declined');
      return;
    case 'sign':
      targetUrl = notificationData.url || '/documents/signatures';
      break;
    case 'approve':
      notifyClientOfAction(notificationData, 'approved');
      targetUrl = notificationData.url || '/workflow-approvals';
      break;
    case 'reply':
      targetUrl = notificationData.url || '/chatrooms';
      break;
    case 'view':
      targetUrl = notificationData.url || '/universal-inbox';
      break;
    case 'acknowledge':
      notifyClientOfAction(notificationData, 'acknowledged');
      targetUrl = notificationData.url || '/universal-inbox';
      break;
    case 'respond':
      targetUrl = notificationData.url || '/worker-incidents';
      break;
    case 'dismiss':
      notifyClientOfAction(notificationData, 'dismissed');
      return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

function notifyClientOfAction(notificationData, action) {
  const data = notificationData || {};
  if (!data.notificationId) return;
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'NOTIFICATION_ACTION',
        notificationId: data.notificationId,
        notificationType: data.type,
        action,
        url: data.url,
        offerId: data.offerId,
        shiftId: data.shiftId,
        documentId: data.documentId,
        approvalId: data.approvalId,
        entityId: data.entityId,
        entityType: data.entityType,
      });
    });
  });
}

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);
  
  if (event.tag === 'refresh-schedule') {
    event.waitUntil(refreshScheduleData());
  }
  if (event.tag === 'refresh-notifications') {
    event.waitUntil(refreshNotifications());
  }
});

async function refreshScheduleData() {
  console.log('[SW] Refreshing schedule data in background');
  try {
    const response = await fetch('/api/shifts/upcoming');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/api/shifts/upcoming', response);
    }
  } catch (e) {
    console.log('[SW] Background schedule refresh failed (offline)');
  }
}

async function refreshNotifications() {
  console.log('[SW] Refreshing notifications in background');
  try {
    const response = await fetch('/api/notifications/unread-count');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/api/notifications/unread-count', response);
    }
  } catch (e) {
    console.log('[SW] Background notification refresh failed (offline)');
  }
}

self.addEventListener('message', (event) => {
  console.log('[SW] Message from client:', event.data?.type);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }

  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: 'v4.6.0' });
  }

  if (event.data?.type === 'CLEAR_ALL_CACHES') {
    event.waitUntil(
      caches.keys().then((keyList) => {
        return Promise.all(keyList.map((key) => caches.delete(key)));
      }).then(() => {
        event.source?.postMessage({ type: 'CACHES_CLEARED' });
      })
    );
  }

  if (event.data?.type === 'GET_QUEUE_COUNT') {
    event.waitUntil(
      (async () => {
        try {
          const db = await openDB();
          const tx = db.transaction(QUEUE_STORE, 'readonly');
          const store = tx.objectStore(QUEUE_STORE);
          const countReq = store.count();
          const count = await new Promise((resolve) => {
            countReq.onsuccess = () => resolve(countReq.result);
          });
          event.source?.postMessage({ type: 'QUEUE_COUNT', count });
        } catch (e) {
          event.source?.postMessage({ type: 'QUEUE_COUNT', count: 0 });
        }
      })()
    );
  }

  if (event.data?.type === 'FORCE_SYNC') {
    event.waitUntil(syncOfflineQueue());
  }
});

console.log('[SW] Service Worker loaded - v4.6.0 (Unified sw.js + accept/decline/sign/clock_in handlers for NOTIFICATION_ACTION_MAP)');
