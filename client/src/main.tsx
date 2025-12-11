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

// Register service worker for PWA support and push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[CoAIleague] Service Worker registered', registration.scope);
        
        // Check for updates periodically in production
        if (import.meta.env.PROD) {
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute
        }
      })
      .catch((error) => {
        console.error('[CoAIleague] Service Worker registration failed', error);
      });
  });
}
