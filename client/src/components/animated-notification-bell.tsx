import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";

interface AnimatedNotificationBellProps {
  hasNotifications?: boolean;
  onClear?: () => void;
  onClick?: () => void;
  className?: string;
}

export function AnimatedNotificationBell({
  hasNotifications = true,
  onClear,
  onClick,
  className = "",
}: AnimatedNotificationBellProps) {
  const [showSparkles, setShowSparkles] = useState(hasNotifications);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    setShowSparkles(hasNotifications);
    setFadeOut(false);
  }, [hasNotifications]);

  const handleClearNotifications = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowSparkles(false);
      onClear?.();
    }, 400);
  };

  const sparkles = [
    { top: "-6px", right: "2px", delay: "0s" },
    { top: "4px", right: "-6px", delay: "0.4s" },
    { bottom: "-4px", right: "4px", delay: "0.8s" },
    { top: "2px", left: "-5px", delay: "1.2s" },
  ];

  return (
    <div className="relative inline-flex items-center group">
      <button
        onClick={onClick}
        className={`relative inline-flex items-center justify-center min-h-9 min-w-9 rounded-md hover-elevate transition-all duration-300 ${
          fadeOut ? "opacity-50" : "opacity-100"
        } ${className}`}
        aria-label="Notifications"
        data-testid="button-notifications"
      >
        <div className="relative">
          <div
            className={`transition-all ${
              showSparkles ? "animate-bell-ring-continuous animate-bell-flash-rainbow" : ""
            }`}
          >
            <Bell className="h-5 w-5" />
          </div>

          {showSparkles && (
            <div
              className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full shadow-lg animate-badge-pulse ${
                fadeOut ? "opacity-0" : "opacity-100"
              } transition-opacity duration-300`}
              style={{
                background: "linear-gradient(135deg, #ffd700, #ff6b6b, #4ecdc4, #a78bfa, #f472b6)",
                backgroundSize: "200% 200%",
                animation: "rainbowFlash 3s ease-in-out infinite, badgePulse 2s ease-in-out infinite",
              }}
            />
          )}

          {showSparkles &&
            sparkles.map((sparkle, idx) => (
              <div
                key={idx}
                className={`absolute pointer-events-none sparkle-star animate-star-sparkle ${
                  fadeOut ? "opacity-0" : ""
                } transition-opacity duration-300`}
                style={{
                  top: sparkle.top,
                  right: sparkle.right,
                  bottom: sparkle.bottom,
                  left: sparkle.left,
                  animationDelay: sparkle.delay,
                  color: idx % 2 === 0 ? "#ffd700" : "#a78bfa",
                  filter: `drop-shadow(0 0 3px ${idx % 2 === 0 ? "#ffd700" : "#a78bfa"})`,
                }}
              />
            ))}

          {showSparkles && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleClearNotifications();
              }}
              className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover-elevate cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Clear notifications"
              data-testid="button-clear-notifications"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClearNotifications();
                }
              }}
            >
              <X className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
