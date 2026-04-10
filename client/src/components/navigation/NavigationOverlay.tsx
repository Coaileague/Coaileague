/**
 * NavigationOverlay — Dark Navy Mega Menu
 *
 * Full brand design system treatment:
 * - Dark navy bg (#0B1629) with navy-mid card surfaces
 * - Per-family icon tabs with gold active indicator
 * - NavCard grid: navy-mid bg, gold hover border, lift animation
 * - GPU-accelerated open/close (transform + opacity inline styles)
 * - Responsive: 1 col mobile → 2 col sm → 3 col md → 4 col lg
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { selectSidebarFamilies, type FamilyId } from '@/lib/sidebarModules';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AnimationState } from '@/hooks/useNavigationOverlay';
import {
  LayoutGrid,
  TrendingUp,
  Layers,
  Users,
  Brain,
} from 'lucide-react';

// ─── Design tokens (inline — no import dependency on ds-components) ──────────

const DS = {
  navy:     '#0B1629',
  navyMid:  '#102040',
  navyLt:   '#1A3058',
  border:   '#1E3A5F',
  gold:     '#C9952A',
  goldGlow: 'rgba(201,149,42,0.15)',
  goldBdr:  'rgba(201,149,42,0.40)',
  txtPrimary:   '#F0F4FF',
  txtSecondary: '#8BA3C7',
  txtMuted:     '#4A6A96',
  fontDisplay: "'Rajdhani', 'Syne', sans-serif",
  fontBody:    "'DM Sans', 'Inter', sans-serif",
  fontMono:    "'JetBrains Mono', monospace",
};

// ─── Per-family accent config ────────────────────────────────────────────────

const FAMILY_META: Record<FamilyId, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}> = {
  platform:     { icon: LayoutGrid,  color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
  executive:    { icon: TrendingUp,  color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
  operations:   { icon: Layers,      color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  people:       { icon: Users,       color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  intelligence: { icon: Brain,       color: '#0d9488', bg: 'rgba(13,148,136,0.12)' },
};

// ─── Types ───────────────────────────────────────────────────────────────────

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface NavigationOverlayProps {
  isOpen: boolean;
  animationState: AnimationState;
  activeCategory: string | null;
  onCategoryHover: (categoryId: string | null) => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NavigationOverlay({
  isOpen,
  animationState,
  activeCategory,
  onCategoryHover,
  onClose,
  onMouseEnter,
  onMouseLeave,
  className,
}: NavigationOverlayProps) {
  const [location, setLocation] = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const {
    workspaceRole = 'staff',
    subscriptionTier = 'professional',
    isPlatformStaff = false,
    positionCapabilities,
  } = useWorkspaceAccess() || {};

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const families = selectSidebarFamilies(workspaceRole, subscriptionTier, isPlatformStaff, positionCapabilities);
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && !selectedFamily && families.length > 0) {
      const current = families.find(f => f.routes.some(r => location.startsWith(r.href)));
      setSelectedFamily(current?.id || families[0]?.id || null);
    }
  }, [isOpen, families, location, selectedFamily]);

  useEffect(() => { if (!isOpen) setSelectedFamily(null); }, [isOpen]);

  useEffect(() => {
    if (isOpen && overlayRef.current) {
      const els = overlayRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (els.length > 0) {
        firstFocusableRef.current = els[0] as HTMLButtonElement;
        lastFocusableRef.current = els[els.length - 1];
        requestAnimationFrame(() => firstFocusableRef.current?.focus());
      }
    }
  }, [isOpen, selectedFamily]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && overlayRef.current) {
      const els = overlayRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }, []);

  const handleNavigate = (href: string) => { setLocation(href); onClose(); };

  const activeFamilyId = (activeCategory || selectedFamily) as FamilyId | null;
  const currentFamily = families.find(f => f.id === activeFamilyId);
  const familyMeta = activeFamilyId ? FAMILY_META[activeFamilyId] : null;

  // Keep the overlay in the DOM during the exit animation so opacity can
  // fade out. Only unmount once the animation has completed.
  if (!isOpen && animationState === 'exited') return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="nav-backdrop fixed inset-0 z-[1025]"
        style={{
          top: 'var(--header-height, 48px)',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          // Visual state tracks the animation (fades during exit).
          opacity: isOpen && animationState !== 'exiting' ? 1 : 0,
          // SCROLL FIX (2026-04-08): pointer-events must be `none` whenever
          // the nav is NOT open OR is actively animating out. The ORIGINAL
          // bug tied this to animationState only, leaving pointer-events:auto
          // any time the nav wasn't actively exiting — including the entire
          // idle closed state — so an invisible full-viewport backdrop
          // intercepted every wheel/touch across the whole app.
          pointerEvents: (!isOpen || animationState === 'exiting') ? 'none' : 'auto',
          transition: 'opacity 150ms ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Overlay panel */}
      <div
        ref={overlayRef}
        id="nav-overlay"
        role="navigation"
        aria-label="Main navigation"
        className={cn('nav-overlay fixed left-0 right-0 z-[1026]', isMobile && 'overflow-y-auto', className)}
        style={{
          top: 'var(--header-height, 48px)',
          background: DS.navy,
          borderBottom: `1px solid ${DS.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          transform: animationState === 'exiting' ? 'translateY(-8px)' : 'translateY(0)',
          opacity: isOpen && animationState !== 'exiting' ? 1 : 0,
          // SCROLL FIX: same pattern as the backdrop — pointer-events
          // tied to isOpen so the closed-but-mounted-during-exit panel
          // can't accidentally eat touch/click events.
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), opacity 150ms ease',
          willChange: 'transform, opacity',
          ...(isMobile ? { bottom: 0, WebkitOverflowScrolling: 'touch' } : {}),
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onKeyDown={handleKeyDown}
        data-testid="nav-overlay"
      >
        {/* ── Family tab bar ─────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10"
          style={{ background: DS.navy, borderBottom: `1px solid ${DS.border}` }}
        >
          <div className={cn('flex items-center gap-1 overflow-x-auto scrollbar-hide', isMobile ? 'px-3 py-2' : 'px-5 py-2.5')}>
            {families.map(family => {
              const isActive = family.id === activeFamilyId;
              const meta = FAMILY_META[family.id as FamilyId];
              const FamilyIcon = meta?.icon;
              const hasRoute = family.routes.some(r => location.startsWith(r.href));

              return (
                <button
                  key={family.id}
                  className="shrink-0 flex items-center gap-2 rounded-lg outline-none focus-visible:ring-1 transition-all duration-150 whitespace-nowrap"
                  style={{
                    padding: isMobile ? '6px 12px' : '8px 14px',
                    fontFamily: DS.fontBody,
                    fontWeight: isActive ? 600 : 400,
                    fontSize: isMobile ? 12 : 13,
                    color: isActive ? DS.txtPrimary : (hasRoute ? meta?.color : DS.txtMuted),
                    background: isActive ? DS.navyMid : 'transparent',
                    borderLeft: isActive ? `2px solid ${DS.gold}` : '2px solid transparent',
                    transition: 'all 120ms ease',
                  }}
                  onMouseEnter={() => {
                    if (!isMobile) { onCategoryHover(family.id); setSelectedFamily(family.id); }
                  }}
                  onClick={() => setSelectedFamily(family.id)}
                  data-testid={`nav-family-${family.id}`}
                >
                  {FamilyIcon && <FamilyIcon className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
                  <span>{family.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── NavCard grid ───────────────────────────────────────────────── */}
        {currentFamily && currentFamily.routes.length > 0 && (
          <div className={cn('secondary-nav', isMobile ? 'px-3 py-3' : 'px-5 py-5')}>
            {/* Section header */}
            {!isMobile && familyMeta && (
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 28, height: 28, background: familyMeta.bg }}
                >
                  // @ts-ignore — TS migration: fix in refactoring sprint
                  {(() => { const Icon = (familyMeta as any).icon; return <Icon className="h-4 w-4" style={{ color: (familyMeta as any).color } as React.CSSProperties} />; })()}
                </div>
                <span
                  className="uppercase tracking-widest"
                  style={{ fontFamily: DS.fontDisplay, fontWeight: 600, fontSize: 11, color: DS.txtMuted }}
                >
                  {currentFamily.label}
                </span>
              </div>
            )}

            <div
              key={currentFamily.id}
              className="grid gap-2"
              style={{ gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))' }}
            >
              {currentFamily.routes.map(route => {
                const isActive = location === route.href || location.startsWith(route.href + '/');
                const Icon = route.icon;

                return (
                  <button
                    key={route.id}
                    onClick={() => handleNavigate(route.href)}
                    className="group relative flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-1 transition-all duration-150"
                    style={{
                      padding: isMobile ? '10px 12px' : '12px 14px',
                      background: isActive ? DS.navyLt : DS.navyMid,
                      border: `1px solid ${isActive ? DS.goldBdr : DS.border}`,
                      boxShadow: isActive ? `0 0 12px ${DS.goldGlow}` : 'none',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = DS.goldBdr;
                      el.style.transform = 'translateY(-1px)';
                      el.style.boxShadow = `0 4px 16px ${DS.goldGlow}`;
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = isActive ? DS.goldBdr : DS.border;
                      el.style.transform = 'translateY(0)';
                      el.style.boxShadow = isActive ? `0 0 12px ${DS.goldGlow}` : 'none';
                    }}
                    data-testid={`nav-route-${route.id}`}
                  >
                    {/* Icon */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-lg"
                      style={{
                        width: isMobile ? 32 : 36,
                        height: isMobile ? 32 : 36,
                        background: isActive ? DS.gold : DS.goldGlow,
                        transition: 'background 120ms ease',
                      }}
                    >
                      <Icon
                        className={isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'}
                        style={{ color: isActive ? '#000' : DS.gold }}
                      />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="font-semibold truncate leading-tight"
                          style={{
                            fontFamily: DS.fontDisplay,
                            fontWeight: 600,
                            fontSize: isMobile ? 13 : 14,
                            color: isActive ? DS.gold : DS.txtPrimary,
                          }}
                        >
                          {route.label}
                        </span>
                        {route.badge && (
                          <span
                            className="inline-flex items-center rounded-full leading-none shrink-0"
                            style={{
                              fontFamily: DS.fontBody,
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 6px',
                              background: DS.goldGlow,
                              color: DS.gold,
                              border: `1px solid rgba(201,149,42,0.30)`,
                            }}
                          >
                            {route.badge}
                          </span>
                        )}
                      </div>
                      {route.description && !isMobile && (
                        <p
                          className="truncate mt-0.5 leading-snug"
                          style={{ fontFamily: DS.fontBody, fontSize: 11, color: DS.txtMuted }}
                        >
                          {route.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Locked routes teaser */}
            {currentFamily.locked && currentFamily.locked.length > 0 && (
              <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${DS.border}` }}>
                <p style={{ fontFamily: DS.fontBody, fontSize: 11, color: DS.txtMuted, marginBottom: 8, fontWeight: 500 }}>
                  UPGRADE TO UNLOCK
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentFamily.locked.slice(0, 4).map(route => (
                    <span
                      key={route.id}
                      className="inline-flex items-center rounded-full opacity-40"
                      style={{
                        fontFamily: DS.fontBody,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '3px 8px',
                        border: `1px solid ${DS.border}`,
                        color: DS.txtMuted,
                        cursor: 'not-allowed',
                      }}
                    >
                      {route.label}
                    </span>
                  ))}
                  {currentFamily.locked.length > 4 && (
                    <span
                      className="inline-flex items-center rounded-full opacity-40"
                      style={{
                        fontFamily: DS.fontBody,
                        fontSize: 10,
                        padding: '3px 8px',
                        border: `1px solid ${DS.border}`,
                        color: DS.txtMuted,
                      }}
                    >
                      +{currentFamily.locked.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
