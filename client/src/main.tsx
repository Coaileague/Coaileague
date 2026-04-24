import { createRoot } from "react-dom/client";
// ============================================================================
// VITE CHUNK LOAD ERROR HANDLER — auto-reload on stale asset hash
// ============================================================================
// When a new deployment changes Vite asset hashes, any user with old HTML cached
// will hit "Unable to preload CSS for /assets/xxx-[hash].css". This handler
// catches that event and forces a hard reload so they get fresh chunks.
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[CoAIleague] Stale asset detected, reloading for fresh chunks:', event);
  window.location.reload();
});


import { Component, type ReactNode, type ErrorInfo } from "react";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App";
import "./index.css";
import "./print-styles.css";

// ============================================================================
// NUCLEAR BODY OVERFLOW GUARD (scroll fix v8 — diagnostic + enforcement)
// ============================================================================
// Per user directive: install a setter trap on CSSStyleDeclaration.prototype
// for the `overflow` property. Any attempt to set `document.body.style.overflow
// = 'hidden'` is BLOCKED and a console.trace logs the full stack trace of the
// caller so we can identify which library is doing it.
//
// Three components in client/src/ have been verified to set body.overflow only
// inside `if (open)` checks. All other sources are third-party (Radix
// react-remove-scroll-bar, vaul, framer-motion, etc.) — the trap will identify
// which one and the trace will show the exact call site.
//
// MUST RUN BEFORE React renders. Installed at the very top of main.tsx,
// before createRoot(). Inline `<script>` in index.html runs even earlier
// (the EventTarget hijack from scroll fix v4) but cannot patch the CSS
// setter because CSSStyleDeclaration is only available after the DOM is
// constructed.
try {
  const desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'overflow');
  if (desc && desc.set) {
    const origSet = desc.set;
    Object.defineProperty(CSSStyleDeclaration.prototype, 'overflow', {
      configurable: true,
      enumerable: true,
      get: desc.get,
      set(val: string) {
        if (val === 'hidden' && this === document.body.style) {
          // eslint-disable-next-line no-console
          console.trace('[scroll-guard] BLOCKED body.style.overflow = "hidden" from:');
          return;
        }
        origSet.call(this, val);
      },
    });
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[scroll-guard] failed to install body overflow trap:', e);
}

// Suppress Vite HMR WebSocket errors in development
if (import.meta.env.DEV) {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const reasonStr = String(reason);
    const messageStr = reason?.message ? String(reason.message) : "";
    if (reasonStr.includes("Failed to construct 'WebSocket'") || 
        reasonStr.includes("localhost:undefined") ||
        messageStr.includes("Failed to construct 'WebSocket'") ||
        messageStr.includes("localhost:undefined")) {
      event.preventDefault();
    }
  });
  
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

// Top-level error boundary — catches crashes before App's internal providers mount
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
          gap: "1rem",
        }}>
          <div style={{ fontSize: "2.5rem" }}>⚠</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#94a3b8", margin: 0, maxWidth: "480px" }}>
            {this.state.error?.message || "An unexpected error occurred loading the platform."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "0.5rem",
              padding: "0.6rem 1.5rem",
              background: "#0d9488",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            Reload Platform
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </RootErrorBoundary>
);

// Register service worker for PWA support (push notifications, offline, caching).
// /sw.js is the canonical CoAIleague service worker — its notificationclick
// handlers match NOTIFICATION_ACTION_MAP in notificationDeliveryService.ts.
// The legacy /service-worker.js (AutoForce-branded) was retired; do not re-register it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        if (import.meta.env.DEV) {
          console.log('[SW] Registered, scope:', registration.scope);
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[SW] Registration failed:', err);
        }
      });
  });
}
