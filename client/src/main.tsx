import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);

// Force clear old service workers and caches on version mismatch
const APP_VERSION = 'v1.0.3';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // First, unregister any existing service workers to force fresh registration
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        // Check if this is an outdated service worker by forcing update check
        await registration.update();
        
        // If there's a waiting worker, activate it immediately
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      
      // Clear all caches to ensure fresh content
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => !name.includes(APP_VERSION.replace('v', '')));
        await Promise.all(oldCaches.map(name => {
          console.log('[CoAIleague] Clearing old cache:', name);
          return caches.delete(name);
        }));
      }
      
      // Register the service worker with cache-busting query param
      const registration = await navigator.serviceWorker.register(`/service-worker.js?v=${APP_VERSION}`);
      console.log('[CoAIleague] Service Worker registered', registration.scope);
      
      // Listen for updates
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
      
      // Check for updates periodically
      setInterval(() => registration.update(), 60000);
    } catch (error) {
      console.error('[CoAIleague] Service Worker setup failed', error);
    }
  });
}
