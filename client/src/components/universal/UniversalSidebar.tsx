import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';

interface SidebarItem {
  label: string;
  icon: React.ReactNode;
  route: string;
  badge?: number;
}

interface SidebarSection {
  label?: string;
  items: SidebarItem[];
}

interface UniversalSidebarProps {
  items: SidebarSection[];
  activeRoute?: string;
  logo?: React.ReactNode;
  footer?: React.ReactNode;
  defaultCollapsed?: boolean;
  onCollapseToggle?: (collapsed: boolean) => void;
}

const STORAGE_KEY = 'u-sidebar-collapsed';

export function UniversalSidebar({
  items,
  activeRoute,
  logo,
  footer,
  defaultCollapsed = false,
  onCollapseToggle,
}: UniversalSidebarProps) {
  const [location, navigate] = useLocation();
  const current = activeRoute ?? location;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? stored === 'true' : defaultCollapsed;
    } catch {
      return defaultCollapsed;
    }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
    onCollapseToggle?.(next);
  };

  const width = collapsed
    ? 'var(--u-sidebar-collapsed)'
    : 'var(--u-sidebar-width)';

  return (
    <aside
      data-testid="universal-sidebar"
      style={{
        width,
        minWidth: width,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg-secondary)',
        borderRight: `1px solid var(--color-border-default)`,
        transition: `width var(--duration-slow) var(--ease-default),
                     min-width var(--duration-slow) var(--ease-default)`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Logo area */}
      {logo && (
        <div
          style={{
            flexShrink: 0,
            padding: collapsed ? 'var(--space-4) var(--space-3)' : 'var(--space-4) var(--space-5)',
            borderBottom: `1px solid var(--color-border-subtle)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            overflow: 'hidden',
          }}
        >
          {logo}
        </div>
      )}

      {/* Nav sections */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 'var(--space-3) 0',
        }}
      >
        {items.map((section, si) => (
          <div key={si} style={{ marginBottom: 'var(--space-4)' }}>
            {section.label && !collapsed && (
              <div
                style={{
                  paddingInline: 'var(--space-5)',
                  paddingBottom: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 'var(--weight-semibold)' as any,
                  color: 'var(--color-text-disabled)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                  whiteSpace: 'nowrap',
                }}
              >
                {section.label}
              </div>
            )}

            {section.items.map((item) => {
              const isActive =
                item.route === '/'
                  ? current === '/'
                  : current.startsWith(item.route);

              return (
                <button
                  key={item.route}
                  data-testid={`nav-sidebar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => navigate(item.route)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: collapsed
                      ? 'var(--space-3)'
                      : 'var(--space-3) var(--space-5)',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    border: 'none',
                    background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
                    borderLeft: isActive
                      ? `3px solid var(--color-brand-primary)`
                      : '3px solid transparent',
                    color: isActive
                      ? 'var(--color-brand-primary)'
                      : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    borderRadius: '0',
                    transition: `background var(--duration-fast) var(--ease-default),
                                 color var(--duration-fast) var(--ease-default)`,
                    position: 'relative',
                    minHeight: 'var(--u-touch-min)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>

                  {!collapsed && (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 'var(--text-sm)',
                        fontFamily: 'var(--font-body)',
                        fontWeight: isActive
                          ? 'var(--weight-semibold)'
                          : 'var(--weight-regular)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'left',
                      }}
                    >
                      {item.label}
                    </span>
                  )}

                  {item.badge != null && item.badge > 0 && !collapsed && (
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: '20px',
                        height: '20px',
                        padding: '0 6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#fff',
                        background: 'var(--color-danger)',
                        borderRadius: 'var(--radius-full)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer slot */}
      {footer && !collapsed && (
        <div
          style={{
            flexShrink: 0,
            padding: 'var(--space-4) var(--space-5)',
            borderTop: `1px solid var(--color-border-subtle)`,
          }}
        >
          {footer}
        </div>
      )}

      {/* Collapse toggle */}
      <button
        data-testid="button-sidebar-collapse"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '44px',
          minHeight: '44px',
          border: 'none',
          borderTop: `1px solid var(--color-border-subtle)`,
          background: 'transparent',
          color: 'var(--color-text-disabled)',
          cursor: 'pointer',
          transition: `color var(--duration-fast)`,
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
