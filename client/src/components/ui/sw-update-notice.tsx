import { useState, useEffect } from 'react';
import { X, ArrowRight, Sparkles } from 'lucide-react';

/**
 * SW Update Toast — Vivaldi-style minimal non-blocking update prompt
 * Icon left | App name + version label | Arrow action right
 * Slides in from bottom-right, dismissible, non-blocking
 */
export function SWUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') { setUpdateAvailable(true); setDismissed(false); }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) setUpdateAvailable(true);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true); setDismissed(false);
          }
        });
      });
    });
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, []);

  useEffect(() => {
    if (updateAvailable && !dismissed) {
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
    }
  }, [updateAvailable, dismissed]);

  const handleUpdate = () => {
    navigator.serviceWorker?.ready.then((reg) => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    setTimeout(() => window.location.reload(), 250);
  };

  const handleDismiss = () => { setAnimateIn(false); setTimeout(() => setDismissed(true), 280); };

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 99999,
        transform: animateIn ? 'translateY(0) scale(1)' : 'translateY(1.5rem) scale(0.97)',
        opacity: animateIn ? 1 : 0,
        transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease',
        pointerEvents: 'auto',
      }}
      role="alert"
      aria-live="polite"
      data-testid="banner-sw-update"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '0.75rem',
          padding: '0.625rem 0.875rem 0.625rem 0.75rem',
          boxShadow: '0 4px 20px hsl(var(--foreground)/0.1), 0 1px 4px hsl(var(--foreground)/0.06)',
          minWidth: '240px',
          maxWidth: '320px',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: '0.5rem', flexShrink: 0,
          background: 'hsl(var(--primary)/0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: 0, color: 'hsl(var(--foreground))' }}>
            CoAIleague updated
          </p>
          <p style={{ fontSize: '0.6875rem', margin: '0.1rem 0 0', color: 'hsl(var(--muted-foreground))' }}>
            Restart to apply new version
          </p>
        </div>

        {/* Update arrow */}
        <button
          onClick={handleUpdate}
          data-testid="button-sw-refresh"
          title="Update now"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: '0.5rem', border: 'none',
            background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
            cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

        {/* Dismiss X */}
        <button
          onClick={handleDismiss}
          data-testid="button-sw-dismiss"
          aria-label="Dismiss update notification"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: '0.375rem', border: 'none',
            background: 'transparent', cursor: 'pointer', flexShrink: 0,
            color: 'hsl(var(--muted-foreground))', transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--accent))'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
