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
        {/* Main bell icon with glow effect when notifications exist */}
        <Bell 
          className={`h-5 w-5 transition-all duration-300 ${
            showSparkles ? "animate-whatsnew-badge-glow" : ""
          }`}
          style={showSparkles ? { 
            filter: 'drop-shadow(0 0 6px rgba(6, 182, 212, 0.6))',
            willChange: 'filter'
          } : undefined}
        />

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
