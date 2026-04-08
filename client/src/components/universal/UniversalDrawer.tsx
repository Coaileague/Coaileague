import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface UniversalDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'full';
  closeOnOverlay?: boolean;
  'data-testid'?: string;
}

const drawerWidths = {
  sm:   '320px',
  md:   '400px',
  lg:   '520px',
  full: '100%',
};

export function UniversalDrawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  size = 'md',
  closeOnOverlay = true,
  'data-testid': testId,
}: UniversalDrawerProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    // Scroll fix v6: explicit clear-on-close + clear-on-unmount pattern
    // (per user directive). See UniversalSheet.tsx for rationale.
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  if (isMobile) {
    return (
      <div
        data-testid={testId}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-index-modal-backdrop)' as any,
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div
          onClick={closeOnOverlay ? onClose : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'relative',
            zIndex: 'var(--z-index-modal)' as any,
            width: '100%',
            maxHeight: '90dvh',
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
            borderTop: '1px solid var(--color-border-default)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingBottom: 'env(safe-area-inset-bottom)',
            animation: 'u-sheet-up var(--duration-slow) var(--ease-out) both',
          }}
        >
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: 'var(--space-3) 0 var(--space-2)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-border-emphasis)' }} />
          </div>
          <DrawerInner title={title} onClose={onClose} footer={footer}>{children}</DrawerInner>
        </div>
      </div>
    );
  }

  const translateX = side === 'right' ? '100%' : '-100%';

  return (
    <div
      data-testid={testId}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-index-modal-backdrop)' as any,
        display: 'flex',
        [side === 'right' ? 'justifyContent' : 'alignItems']: side === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        onClick={closeOnOverlay ? onClose : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          zIndex: 'var(--z-index-modal)' as any,
          width: drawerWidths[size],
          maxWidth: '100%',
          height: '100%',
          background: 'var(--color-bg-secondary)',
          borderLeft: side === 'right' ? '1px solid var(--color-border-default)' : 'none',
          borderRight: side === 'left' ? '1px solid var(--color-border-default)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: `u-drawer-${side} var(--duration-slow) var(--ease-out) both`,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <DrawerInner title={title} onClose={onClose} footer={footer}>{children}</DrawerInner>
      </div>
    </div>
  );
}

function DrawerInner({
  title,
  onClose,
  footer,
  children,
}: {
  title?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {title && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)' as any,
              color: 'var(--color-text-primary)',
            }}
          >
            {title}
          </h2>
          <button
            data-testid="button-drawer-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, border: 'none', background: 'transparent',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch' as any,
          padding: 'var(--space-5) var(--space-6)',
        }}
      >
        {children}
      </div>

      {footer && (
        <div
          style={{
            flexShrink: 0,
            padding: 'var(--space-4) var(--space-6)',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          {footer}
        </div>
      )}
    </>
  );
}
