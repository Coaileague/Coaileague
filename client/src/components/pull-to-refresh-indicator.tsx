import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullProgress: number;
  isRefreshing: boolean;
  isSnappingBack?: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullProgress,
  isRefreshing,
  isSnappingBack = false,
  threshold = 64,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min((pullProgress / threshold) * 100, 100);
  const isReady = progress >= 100;
  const shouldShow = pullProgress > 2 || isRefreshing;

  if (!shouldShow && !isSnappingBack) return null;

  const indicatorHeight = isRefreshing ? 44 : pullProgress;
  const circumference = 2 * Math.PI * 14;
  const strokeLen = (circumference * progress) / 100;
  const rotation = pullProgress * 5;
  const scale = Math.min(0.4 + (progress / 100) * 0.6, 1);
  const opacity = isRefreshing ? 1 : Math.min(progress / 40, 1);

  return (
    <div
      className="flex items-center justify-center overflow-hidden will-change-[height,opacity]"
      style={{
        height: `${isSnappingBack && !isRefreshing ? 0 : indicatorHeight}px`,
        opacity,
        transition: (isSnappingBack || isRefreshing)
          ? 'height 300ms cubic-bezier(0.4,0,0.2,1), opacity 300ms cubic-bezier(0.4,0,0.2,1)'
          : undefined,
      }}
      data-testid="pull-refresh-indicator"
    >
      <div
        className="flex items-center justify-center will-change-transform"
        style={{
          transform: `scale(${scale})`,
          transition: isSnappingBack ? 'transform 300ms cubic-bezier(0.4,0,0.2,1)' : 'none',
        }}
      >
        <div className="relative w-7 h-7">
          <svg
            viewBox="0 0 36 36"
            className="w-7 h-7"
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation - 90}deg)`,
            }}
          >
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              strokeWidth="2"
              className="stroke-muted-foreground/15"
            />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              className={cn(
                "transition-[stroke] duration-150",
                isReady || isRefreshing ? "stroke-primary" : "stroke-muted-foreground/60"
              )}
              style={{
                strokeDasharray: `${strokeLen} ${circumference}`,
              }}
            >
              {isRefreshing && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 18 18"
                  to="360 18 18"
                  dur="0.7s"
                  repeatCount="indefinite"
                />
              )}
            </circle>
          </svg>
        </div>
      </div>
    </div>
  );
}
