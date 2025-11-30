import { useState, useEffect } from "react";
import { Bell } from "lucide-react";

interface AnimatedNotificationBellProps {
  hasNotifications?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AnimatedNotificationBell({
  hasNotifications = true,
  onClick,
  className = "",
}: AnimatedNotificationBellProps) {
  const [showSparkles, setShowSparkles] = useState(hasNotifications);

  useEffect(() => {
    setShowSparkles(hasNotifications);
  }, [hasNotifications]);

  // Generate sparkle positions around the bell (like the star image)
  const sparkles = [
    { top: "-8px", right: "4px", delay: "0s", size: "6px" },
    { top: "2px", right: "-8px", delay: "0.3s", size: "4px" },
    { top: "12px", right: "2px", delay: "0.6s", size: "5px" },
    { top: "8px", left: "-6px", delay: "0.2s", size: "4px" },
  ];

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center min-h-9 min-w-9 rounded-md hover-elevate transition-all ${className}`}
      aria-label="Notifications"
      data-testid="button-notifications"
    >
      <div className="relative">
        {/* Bell Icon with subtle ring animation when has notifications */}
        <div className={`transition-all ${showSparkles ? "animate-bell-ring-continuous" : ""}`}>
          <Bell
            className="h-5 w-5 text-foreground"
            style={{
              filter: showSparkles ? "drop-shadow(0 0 8px rgba(168, 85, 247, 0.6))" : "none",
            }}
          />
        </div>

        {/* Notification badge indicator */}
        {showSparkles && (
          <div className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full animate-badge-pulse shadow-lg shadow-purple-500/50" />
        )}

        {/* Polished Sparkles around the bell (like the star animation) */}
        {showSparkles &&
          sparkles.map((sparkle, idx) => (
            <div
              key={idx}
              className="absolute pointer-events-none"
              style={{
                top: sparkle.top,
                right: sparkle.right,
                left: sparkle.left,
              }}
            >
              <div
                className="animate-sparkles-pulse"
                style={{
                  width: sparkle.size,
                  height: sparkle.size,
                  backgroundColor: "currentColor",
                  borderRadius: "50%",
                  opacity: 0.8,
                  filter: "drop-shadow(0 0 4px rgba(168, 85, 247, 0.8))",
                  animationDelay: sparkle.delay,
                }}
              />
            </div>
          ))}

        {/* Larger glow ring effect (only when notifications present) */}
        {showSparkles && (
          <div
            className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-20"
            style={{
              boxShadow: "0 0 12px rgba(168, 85, 247, 0.4)",
            }}
          />
        )}
      </div>
    </button>
  );
}
