/**
 * Pull-to-Refresh Indicator
 * Visual feedback for pull-to-refresh gesture
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min((pullDistance / threshold) * 100, 100);
  const shouldShowIndicator = pullDistance > 10 || isRefreshing;

  if (!shouldShowIndicator) return null;

  return (
    <div 
      className="flex items-center justify-center py-2 transition-all"
      style={{
        height: `${Math.min(pullDistance, threshold)}px`,
        opacity: isRefreshing ? 1 : progress / 100,
      }}
      data-testid="pull-refresh-indicator"
    >
      <div className="flex flex-col items-center gap-1">
        <Loader2 
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform",
            isRefreshing ? "animate-spin" : ""
          )}
          style={{
            transform: !isRefreshing ? `rotate(${progress * 3.6}deg)` : undefined,
          }}
        />
        <span className="text-xs text-muted-foreground">
          {isRefreshing 
            ? "Refreshing..." 
            : progress >= 100 
              ? "Release to refresh" 
              : "Pull to refresh"
          }
        </span>
      </div>
    </div>
  );
}
