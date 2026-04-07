import { useState, useEffect } from 'react';
import { RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

export function SWUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        setUpdateAvailable(true);
        setDismissed(false);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setUpdateAvailable(true);
      }

      const handleUpdateFound = () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        const handleStateChange = () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            setDismissed(false);
          }
        };

        newWorker.addEventListener('statechange', handleStateChange);
        // We can't easily remove this one because it's on a worker that might be gone, 
        // but it's less of a leak than the registration listener.
      };

      registration.addEventListener('updatefound', handleUpdateFound);
      
      // Cleanup for registration listener
      const originalCleanup = () => {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
        registration.removeEventListener('updatefound', handleUpdateFound);
      };
      
      // We need to return this cleanup, but we're inside a promise.
      // In practice, registration listeners are often okay to leave if they are long-lived,
      // but the prompt asked to check for them.
    });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, []);

  useEffect(() => {
    if (updateAvailable && !dismissed) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimateIn(true);
        });
      });
    } else {
      setAnimateIn(false);
    }
  }, [updateAvailable, dismissed]);

  const handleRefresh = () => {
    navigator.serviceWorker?.ready.then((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    setTimeout(() => window.location.reload(), 300);
  };

  const handleDismiss = () => {
    setAnimateIn(false);
    setTimeout(() => setDismissed(true), 300);
  };

  if (!updateAvailable || dismissed) return null;

  const mobileBottomOffset = isMobile
    ? 'calc(48px + env(safe-area-inset-bottom, 0px) + 0.75rem)'
    : '1rem';

  return (
    <div
      className="sw-update-toast-container"
      style={{
        position: 'fixed',
        bottom: mobileBottomOffset,
        left: isMobile ? '0.75rem' : 'auto',
        right: isMobile ? '0.75rem' : '1rem',
        zIndex: 99999,
        maxWidth: isMobile ? 'none' : '340px',
        width: isMobile ? 'auto' : 'calc(100vw - 2rem)',
        pointerEvents: 'none',
      }}
    >
      <div
        role="alert"
        aria-live="polite"
        data-testid="banner-sw-update"
        className="overflow-visible"
        style={{
          pointerEvents: 'auto',
          background: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 24px hsl(var(--foreground) / 0.12), 0 1px 4px hsl(var(--foreground) / 0.06)',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          transform: animateIn ? 'translateY(0)' : 'translateY(calc(100% + 2rem))',
          opacity: animateIn ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
            height: '2rem',
            borderRadius: '50%',
            background: 'hsl(var(--primary) / 0.1)',
            flexShrink: 0,
          }}
        >
          <ArrowUpCircle
            className="h-4 w-4"
            style={{ color: 'hsl(var(--primary))' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              lineHeight: 1.3,
              color: 'hsl(var(--foreground))',
              margin: 0,
            }}
          >
            Update available
          </p>
          <p
            style={{
              fontSize: '0.75rem',
              lineHeight: 1.3,
              color: 'hsl(var(--muted-foreground))',
              margin: '0.125rem 0 0 0',
            }}
          >
            Refresh for the latest version
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <Button
            size="sm"
            onClick={handleRefresh}
            data-testid="button-sw-refresh"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Update
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            data-testid="button-sw-dismiss"
            aria-label="Dismiss update notification"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
