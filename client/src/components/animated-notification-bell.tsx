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
      aria-label={showAnimation ? `${notificationCount} new notifications` : "Notifications"}
      data-testid="button-notifications"
      style={{ willChange: 'auto' }}
    >
      <div className="relative inline-flex items-center justify-center">
        {/* Main bell icon with glow effect when notifications exist */}
        <Bell 
          className={`h-5 w-5 transition-all duration-300 ${
            showAnimation ? "animate-bell-ring-continuous text-amber-500" : "text-muted-foreground"
          }`}
          style={showAnimation ? { 
            filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))',
            willChange: 'filter'
          } : undefined}
        />

        {/* Number badge with pulsing + scaling animation - shows notification count */}
        {showAnimation && notificationCount > 0 && (
          <>
            {/* Outer pulse ring */}
            <span 
              className="absolute -top-1 -right-1 h-6 w-6 rounded-full animate-pulse"
              style={{
                background: "radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%)",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
              }}
            />
            
            {/* Main badge with number - prominent and animated */}
            <span 
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full text-white flex items-center justify-center text-[11px] font-bold shadow-lg animate-badge-pulse animate-bounce"
              style={{
                background: "linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)",
                boxShadow: "0 0 12px rgba(239, 68, 68, 0.8), inset 0 1px 3px rgba(255, 255, 255, 0.2)",
                animation: "badge-pulse 2s ease-in-out infinite, bounce 1s ease-in-out infinite",
              }}
              data-testid="badge-unread-count"
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          </>
        )}
      </div>
    </button>
  );
}
