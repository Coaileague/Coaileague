/**
 * Mobile Page Wrapper & Layout Primitives
 * Optimized container for mobile pages with pull-to-refresh, safe areas, and responsive layouts
 * Uses centralized MOBILE_CONFIG for all sizing and behavior
 */

import { ReactNode, useState, useEffect } from 'react';
import { usePullToRefresh } from "@/hooks/use-touch-swipe";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import { useIsMobile, useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MOBILE_CONFIG } from "@/config/mobileConfig";

interface MobilePageWrapperProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
  enablePullToRefresh?: boolean;
  className?: string;
  withBottomNav?: boolean;
}

export function MobilePageWrapper({
  children,
  onRefresh,
  enablePullToRefresh = false,
  className,
  withBottomNav = false,
}: MobilePageWrapperProps) {
  const isMobile = useIsMobile();
  const { isRefreshing, pullDistance } = usePullToRefresh(
    onRefresh || (() => Promise.resolve())
  );

  const shouldEnablePullToRefresh = isMobile && enablePullToRefresh && onRefresh;

  return (
    <div 
      className={cn(
        "flex flex-col h-full w-full overflow-hidden",
        className
      )}
      data-testid="mobile-page-wrapper"
    >
      {/* Pull-to-Refresh Indicator */}
      {shouldEnablePullToRefresh && (
        <PullToRefreshIndicator 
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Scrollable Content */}
      <div 
        className={cn(
          "flex-1 overflow-y-auto smooth-scroll mobile-safe-area-top",
          withBottomNav && "mobile-safe-area-bottom pb-20"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * MobilePageHeader - Sticky mobile-friendly page header
 */
interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backButton?: boolean;
  onBack?: () => void;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  action,
  backButton = false,
  onBack,
  className,
}: MobilePageHeaderProps) {
  const { isMobile } = useMobile();

  return (
    <div
      className={cn(
        'mobile-header sticky top-0 bg-background/95 backdrop-blur-lg border-b border-border',
        'px-4 py-3 md:px-6 md:py-4',
        className
      )}
      style={{
        zIndex: 'var(--z-sticky)',
        minHeight: isMobile
          ? `${MOBILE_CONFIG.header.heightMobile}px`
          : `${MOBILE_CONFIG.header.heightTablet}px`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {backButton && onBack && (
            <button
              onClick={onBack}
              className="mobile-touch-target shrink-0 hover-elevate active-elevate-2 rounded-lg"
              style={{
                minHeight: `${MOBILE_CONFIG.touchTargets.minHeight}px`,
                minWidth: `${MOBILE_CONFIG.touchTargets.minWidth}px`,
                padding: `${MOBILE_CONFIG.touchTargets.padding}px`,
              }}
              data-testid="button-back"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                'font-bold truncate',
                isMobile ? 'text-lg' : 'text-2xl'
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/**
 * MobileGrid - Responsive grid that adapts to screen size
 * Uses MOBILE_CONFIG for columns configuration
 * Supports any column count from 1-12, responsive across breakpoints
 */
interface MobileGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: number;
  className?: string;
}

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>(() => {
    if (typeof window === 'undefined') return 'mobile';
    const width = window.innerWidth;
    if (width >= DESKTOP_BREAKPOINT) return 'desktop';
    if (width >= TABLET_BREAKPOINT) return 'tablet';
    return 'mobile';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= DESKTOP_BREAKPOINT) setBreakpoint('desktop');
      else if (width >= TABLET_BREAKPOINT) setBreakpoint('tablet');
      else setBreakpoint('mobile');
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

export function MobileGrid({
  children,
  cols = {
    mobile: MOBILE_CONFIG.grid.columnsMobile,
    tablet: MOBILE_CONFIG.grid.columnsTablet,
    desktop: MOBILE_CONFIG.grid.columnsDesktop,
  },
  gap = MOBILE_CONFIG.spacing.md,
  className,
}: MobileGridProps) {
  const breakpoint = useBreakpoint();

  const mobileCol = Math.max(1, Math.min(12, cols.mobile ?? 1));
  const tabletCol = Math.max(1, Math.min(12, cols.tablet ?? 2));
  const desktopCol = Math.max(1, Math.min(12, cols.desktop ?? 4));

  const columnCount = breakpoint === 'desktop' ? desktopCol :
                      breakpoint === 'tablet' ? tabletCol : mobileCol;

  return (
    <div
      className={cn('grid w-full', className)}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * MobileCard - Mobile-optimized card with touch feedback
 */
interface MobileCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  interactive?: boolean;
}

export function MobileCard({
  children,
  onClick,
  className,
  interactive = false,
}: MobileCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-lg p-4',
        interactive && 'hover-elevate active-elevate-2 mobile-active-state cursor-pointer',
        className
      )}
      data-testid="mobile-card"
    >
      {children}
    </div>
  );
}
