import { Bell } from "lucide-react";

interface AnimatedNotificationBellProps {
  notificationCount?: number;
  onClick?: () => void;
  className?: string;
}

export function AnimatedNotificationBell({
  notificationCount = 0,
  onClick,
  className = "",
}: AnimatedNotificationBellProps) {
  // Animation shows only when there are unread notifications
  const showAnimation = notificationCount > 0;

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md hover-elevate transition-all duration-200 ${className}`}
      aria-label="Notifications"
      data-testid="button-notifications"
      style={{ willChange: 'auto' }}
    >
      <div className="relative inline-flex items-center justify-center">
        {/* Main bell icon with glow effect when notifications exist and popover is closed */}
        <Bell 
          className={`h-4 w-4 transition-all duration-300 ${
            showAnimation ? "animate-whatsnew-badge-glow" : ""
          }`}
          style={showAnimation ? { 
            filter: 'drop-shadow(0 0 6px rgba(6, 182, 212, 0.6))',
            willChange: 'filter'
          } : undefined}
        />

        {/* Number badge with glowing effect - shows notification count */}
        {showAnimation && notificationCount > 0 && (
          <span 
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold animate-whatsnew-badge-glow"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #0891b2, #4ecdc4)",
            }}
          >
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        )}
      </div>
    </button>
  );
}
