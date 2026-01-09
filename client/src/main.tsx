console.log('[CoAIleague] main.tsx loading...');

import { createRoot } from "react-dom/client";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App";
import "./index.css";

console.log('[CoAIleague] Imports complete, mounting React app...');

// Suppress Vite HMR WebSocket errors in development (harmless dev-only warnings in Replit)
if (import.meta.env.DEV) {
  // Suppress unhandled promise rejections from Vite HMR connection attempts
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const reasonStr = String(reason);
    const messageStr = reason?.message ? String(reason.message) : "";
    
    // Check multiple ways the error can be represented
    if (reasonStr.includes("Failed to construct 'WebSocket'") || 
        reasonStr.includes("localhost:undefined") ||
        messageStr.includes("Failed to construct 'WebSocket'") ||
        messageStr.includes("localhost:undefined")) {
      event.preventDefault(); // Suppress the error
    }
  });
  
  // Also suppress console.error for these development-only errors
  const origError = console.error;
  console.error = (...args: any[]) => {
    const fullStr = args.map(a => String(a)).join(" ");
    if (fullStr.includes("Failed to construct 'WebSocket'") || 
        fullStr.includes("localhost:undefined")) {
      return;
    }
    origError(...args);
  };
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Service Worker registration - PRODUCTION ONLY
// In development, the service worker can intercept Vite's module requests and cause blank screens
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const APP_VERSION = 'v1.0.3';
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.update();
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => !name.includes(APP_VERSION.replace('v', '')));
        await Promise.all(oldCaches.map(name => {
          console.log('[CoAIleague] Clearing old cache:', name);
          return caches.delete(name);
        }));
      }
      
      const registration = await navigator.serviceWorker.register(`/service-worker.js?v=${APP_VERSION}`);
      console.log('[CoAIleague] Service Worker registered', registration.scope);
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[CoAIleague] New version available, reloading...');
              window.location.reload();
            }
          });
        }
      });
      
      setInterval(() => registration.update(), 60000);
    } catch (error) {
      console.error('[CoAIleague] Service Worker setup failed', error);
    }
  });
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // In development, unregister any existing service workers to prevent interference
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
      console.log('[CoAIleague] Dev mode: Unregistered service worker');
    }
  });
}
