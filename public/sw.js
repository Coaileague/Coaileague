// CoAIleague Service Worker for Push Notifications

const CACHE_NAME = 'coaileague-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  event.waitUntil(clients.claim());
});

// Push event - Handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let payload = {
    title: 'CoAIleague',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'default',
    data: {}
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    tag: payload.tag || 'coaileague-notification',
    data: payload.data || {},
    requireInteraction: payload.requireInteraction || false,
    vibrate: payload.vibrate || [100, 50, 100],
    actions: payload.actions || [],
    timestamp: payload.timestamp || Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  let url = '/';
  
  // Handle different actions
  switch (event.action) {
    case 'view':
    case 'view_shift':
      url = data.url || '/schedule';
      break;
    case 'clock_in':
      url = '/time-tracking';
      break;
    case 'approve':
      url = data.approvalUrl || '/approvals';
      break;
    case 'dismiss':
      // Just close the notification
      return;
    default:
      // Default click - open the relevant page or dashboard
      url = data.url || data.actionUrl || '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if a window is already open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(url);
          }
          return;
        }
      }
      // Open new window if none exists
      return clients.openWindow(url);
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
});

// Background sync for offline support
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
});

// Message event - Communication with main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
