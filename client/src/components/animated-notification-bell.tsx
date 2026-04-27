import { useId, useEffect } from "react";
import { HEADER_HEIGHTS } from "@/config/headerConfig";
import { setAppBadge, clearAppBadge, setupBadgeClearOnFocus } from "@/lib/appBadge";

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
  useEffect(() => {
    if (notificationCount > 0) {
      setAppBadge(notificationCount);
    } else {
      clearAppBadge();
    }
  }, [notificationCount]);

  useEffect(() => {
    return setupBadgeClearOnFocus();
  }, []);

  const hasNotifications = notificationCount > 0;
  const uid = useId().replace(/:/g, '');
  const activeId = `bellGradActive_${uid}`;
  const idleId = `bellGradIdle_${uid}`;
  const gradRef = hasNotifications ? `url(#${activeId})` : `url(#${idleId})`;

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex ${HEADER_HEIGHTS.iconButtonExplicit} items-center justify-center rounded-md hover-elevate transition-colors duration-200 ${className}`}
      aria-label={hasNotifications ? `${notificationCount} new notifications` : "Notifications"}
      title="Notifications"
      data-testid="button-notifications"
    >
      <div className="relative inline-flex items-center justify-center">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`transition-colors duration-300 ${hasNotifications ? "animate-bell-ring-continuous" : ""}`}
          style={hasNotifications ? {
            filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.7))',
          } : {
            filter: 'drop-shadow(0 0 3px rgba(168, 85, 247, 0.3))',
          }}
        >
          <defs>
            <linearGradient id={activeId} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f59e0b" />
              <stop offset="0.5" stopColor="#f97316" />
              <stop offset="1" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id={idleId} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a855f7" />
              <stop offset="0.5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
            fill={gradRef}
            fillOpacity={hasNotifications ? "0.35" : "0.2"}
            stroke={gradRef}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.73 21a2 2 0 0 1-3.46 0"
            stroke={gradRef}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {hasNotifications && (
          <>
            <span 
              className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-3 w-3 sm:h-4 sm:w-4 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%)",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
              }}
            />
            <span 
              className="absolute -top-0.5 -right-0.5 sm:-top-1.5 sm:-right-1.5 min-w-[13px] h-[13px] sm:min-w-[18px] sm:h-[18px] rounded-full text-white flex items-center justify-center text-[7px] sm:text-[9px] font-bold px-0.5"
              style={{
                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                boxShadow: "0 0 4px rgba(239, 68, 68, 0.5)",
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
