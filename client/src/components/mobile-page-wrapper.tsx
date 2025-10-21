/**
 * Mobile Page Wrapper
 * Optimized container for mobile pages with pull-to-refresh and safe areas
 */

import { usePullToRefresh } from "@/hooks/use-touch-swipe";
import { PullToRefreshIndicator } from "./pull-to-refresh-indicator";
import { useIsMobile } from "@/hooks/use-mobile";
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
          "flex-1 overflow-y-auto mobile-scroll safe-top",
          withBottomNav && "safe-bottom pb-16"
        )}
      >
        {children}
      </div>
    </div>
  );
}
