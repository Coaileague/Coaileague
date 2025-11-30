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

  // Handle clearing notifications with animation
  const handleClearNotifications = () => {
    setFadeOut(true);
    setTimeout(() => {
      setShowSparkles(false);
      onClear?.();
    }, 400);
  };

  // Generate sparkle positions around the bell for orbital animation
  const sparkles = [
    { id: 0, delay: "0s" },
    { id: 1, delay: "0.5s" },
    { id: 2, delay: "1s" },
    { id: 3, delay: "1.5s" },
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
          {/* Bell Icon with continuous ring when has notifications */}
          <div
            className={`transition-all ${
              showSparkles ? "animate-bell-ring-continuous animate-bell-flash-rainbow" : ""
            }`}
          >
            <Bell className="h-5 w-5" />
          </div>

          {/* Notification badge indicator - flashes with rainbow */}
          {showSparkles && (
            <div
              className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full shadow-lg animate-badge-pulse ${
                fadeOut ? "opacity-0" : "opacity-100"
              } transition-opacity duration-300`}
              style={{
                background: "linear-gradient(135deg, #ffd700, #ff6b6b, #4ecdc4, #a78bfa, #f472b6)",
                animation: "rainbowFlash 3s ease-in-out infinite",
              }}
            />
          )}

          {/* Orbiting Stars - spinning around the bell */}
          {showSparkles &&
            sparkles.map((sparkle) => (
              <div
                key={sparkle.id}
                className="absolute pointer-events-none"
                style={{
                  width: "24px",
                  height: "24px",
                  left: "50%",
                  top: "50%",
                  marginLeft: "-12px",
                  marginTop: "-12px",
                }}
              >
                <div
                  className={`absolute w-1.5 h-1.5 rounded-full animate-star-orbit ${
                    fadeOut ? "opacity-0" : "opacity-100"
                  } transition-opacity duration-300`}
                  style={{
                    left: "50%",
                    top: "50%",
                    marginLeft: "-3px",
                    marginTop: "-3px",
                    animationDelay: sparkle.delay,
                    background: "currentColor",
                    filter: "drop-shadow(0 0 6px rgba(168, 85, 247, 0.8))",
                  }}
                />
              </div>
            ))}

          {/* Clear notifications button - appears on hover */}
          {showSparkles && (
            <button
              onClick={handleClearNotifications}
              className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover-elevate"
              aria-label="Clear notifications"
              data-testid="button-clear-notifications"
            >
              <X className="h-2.5 w-2.5 text-white" />
            </button>
          )}
        </div>
      </button>
    </div>
  );
}
