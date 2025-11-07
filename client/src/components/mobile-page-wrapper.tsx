/**
 * Mobile Page Wrapper & Layout Primitives
 * Optimized container for mobile pages with pull-to-refresh, safe areas, and responsive layouts
 */

import { ReactNode } from 'react';
import { usePullToRefresh } from "@/hooks/use-touch-swipe";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import { useIsMobile, useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
      style={{ zIndex: 'var(--z-sticky)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {backButton && onBack && (
            <button
              onClick={onBack}
              className="mobile-touch-target shrink-0 p-2 -ml-2 hover-elevate active-elevate-2 rounded-lg"
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

export function MobileGrid({
  children,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 4,
  className,
}: MobileGridProps) {
  const gapClass = `gap-${gap}`;
  
  return (
    <div
      className={cn(
        'grid',
        gapClass,
        `grid-cols-${cols.mobile || 1}`,
        `md:grid-cols-${cols.tablet || 2}`,
        `lg:grid-cols-${cols.desktop || 3}`,
        className
      )}
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
