import { createRoot } from "react-dom/client";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App";
import "./index.css";
import "./print-styles.css";

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

// Register service worker for PWA support (push notifications, offline, caching)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
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
