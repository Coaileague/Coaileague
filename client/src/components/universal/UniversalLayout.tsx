import { useIsMobile } from '@/hooks/use-mobile';

interface UniversalLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  bottomNav?: React.ReactNode;
  sidebar?: React.ReactNode;
  padding?: boolean;
  scroll?: boolean;
  className?: string;
}

export function UniversalLayout({
  children,
  header,
  bottomNav,
  sidebar,
  padding = true,
  scroll = true,
  className = '',
}: UniversalLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div
      className={`u-layout ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100%',
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-body)',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        overflow: 'hidden',
      }}
    >
      {/* Fixed header */}
      {header && (
        <div style={{ flexShrink: 0, zIndex: 'var(--z-index-fixed-header, 1030)' as any }}>
          {header}
        </div>
      )}

      {/* Body — sidebar + content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Desktop sidebar */}
        {!isMobile && sidebar && (
          <div style={{ flexShrink: 0 }}>
            {sidebar}
          </div>
        )}

        {/* Main content */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: scroll ? 'auto' : 'hidden',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch' as any,
            scrollBehavior: 'smooth',
            overscrollBehavior: 'contain',
            padding: padding
              ? isMobile
                ? 'var(--space-4)'
                : 'var(--space-6)'
              : '0',
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && bottomNav && (
        <div
          style={{
            flexShrink: 0,
            zIndex: 'var(--z-index-bottom-nav)' as any,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {bottomNav}
        </div>
      )}
    </div>
  );
}
