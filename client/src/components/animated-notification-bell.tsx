import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";

interface AnimatedNotificationBellProps {
  hasNotifications?: boolean;
  notificationCount?: number;
  onClear?: () => void;
  onClick?: () => void;
  className?: string;
}

export function AnimatedNotificationBell({
  hasNotifications = true,
  notificationCount = 0,
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
    { top: "-6px", right: "0px", delay: "0s" },
    { top: "2px", right: "-6px", delay: "0.3s" },
    { bottom: "-5px", right: "2px", delay: "0.6s" },
    { top: "0px", left: "-6px", delay: "0.9s" },
  ];

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md hover-elevate transition-all duration-200 group ${
        fadeOut ? "opacity-50" : "opacity-100"
      } ${className}`}
      aria-label="Notifications"
      data-testid="button-notifications"
      style={{ willChange: 'auto' }}
    >
      <div className="relative inline-flex items-center justify-center" style={{ width: '20px', height: '20px', willChange: 'transform' }}>
        {/* Main bell icon with spinning color-cycling animation when notifications exist */}
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            showSparkles ? "animate-star-spin-colors" : ""
          }`}
          style={showSparkles ? { willChange: 'transform, filter' } : undefined}
        >
          <Bell className="h-5 w-5" />
        </div>

        {/* Rotating sparkling dots around icon - same pattern as WhatsNew badge */}
        {showSparkles && sparkles.map((sparkle, idx) => (
          <div
            key={idx}
            className={`absolute pointer-events-none sparkle-star animate-star-spin-colors ${
              fadeOut ? "opacity-0" : "opacity-100"
            } transition-opacity duration-300`}
            style={{
              top: sparkle.top,
              right: sparkle.right,
              bottom: sparkle.bottom,
              left: sparkle.left,
              animationDelay: sparkle.delay,
              willChange: 'transform, filter, color',
            }}
          />
        ))}

        {/* Number badge with glowing effect - shows notification count */}
        {showSparkles && notificationCount > 0 && (
          <span 
            className={`absolute -top-2 -right-2 h-5 w-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold animate-whatsnew-badge-glow ${
              fadeOut ? "opacity-0" : "opacity-100"
            } transition-opacity duration-300`}
            style={{
              background: "linear-gradient(135deg, #06b6d4, #0891b2, #4ecdc4)",
            }}
          >
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        )}

        {/* Clear button on hover - hidden on mobile, visible on desktop */}
        {showSparkles && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleClearNotifications();
            }}
            className={`absolute -bottom-1 -right-1 bg-destructive rounded-full p-0.5 transition-opacity duration-200 hover-elevate cursor-pointer ${
              fadeOut ? "opacity-0" : "opacity-100"
            } hidden sm:opacity-0 sm:group-hover:opacity-100 sm:flex items-center justify-center`}
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
  );
}
