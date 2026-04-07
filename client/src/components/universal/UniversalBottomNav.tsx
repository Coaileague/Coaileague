import { useLocation } from 'wouter';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  route: string;
  badge?: number;
}

interface UniversalBottomNavProps {
  items: NavItem[];
  activeRoute?: string;
}

export function UniversalBottomNav({ items, activeRoute }: UniversalBottomNavProps) {
  const [location, navigate] = useLocation();
  const current = activeRoute ?? location;

  return (
    <nav
      data-testid="universal-bottom-nav"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 'var(--u-bottom-nav-height)',
        background: 'var(--color-bg-secondary)',
        borderTop: `1px solid var(--color-border-default)`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const isActive =
          item.route === '/'
            ? current === '/'
            : current.startsWith(item.route);

        return (
          <button
            key={item.route}
            data-testid={`nav-bottom-${item.label.toLowerCase()}`}
            onClick={() => navigate(item.route)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              position: 'relative',
              border: 'none',
              background: 'transparent',
              color: isActive
                ? 'var(--color-brand-primary)'
                : 'var(--color-text-secondary)',
              cursor: 'pointer',
              minHeight: 'var(--u-touch-min)',
              transition: `color var(--duration-fast) var(--ease-default),
                           transform var(--duration-fast) var(--ease-default)`,
              WebkitTapHighlightColor: 'transparent',
            }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(0.92)';
            }}
            onPointerUp={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
            onPointerLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
          >
            {/* Badge */}
            {item.badge != null && item.badge > 0 && (
              <span
                aria-label={`${item.badge} notifications`}
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: 'calc(50% - 18px)',
                  minWidth: '16px',
                  height: '16px',
                  padding: '0 4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#fff',
                  background: 'var(--color-danger)',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}

            {/* Icon */}
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.icon}
            </span>

            {/* Label */}
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-body)',
                fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                lineHeight: 1,
              }}
            >
              {item.label}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  width: '4px',
                  height: '4px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-brand-primary)',
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
