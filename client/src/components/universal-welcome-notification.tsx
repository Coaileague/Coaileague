import { useEffect, useState } from "react";
import { LogIn, Zap, Shield, Crown } from "lucide-react";
import { LOADING_MESSAGES, getRandomLoadingMessage } from "@/config/loading-messages";

interface WelcomeNotificationProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  platformRole?: string | null;
  onComplete?: () => void;
  loadingDuration?: number; // How long the actual loading took in ms
}

const DISPLAY_DURATION = 6000; // How long to show the notification (6 seconds to enjoy messages!)

export function UniversalWelcomeNotification({
  firstName = "User",
  lastName,
  email,
  role,
  platformRole,
  onComplete,
  loadingDuration = 1000,
}: WelcomeNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState(() => getRandomLoadingMessage());

  // Progress bar that advances realistically based on loading duration
  // Extended to 3000ms minimum so you can enjoy the messages!
  useEffect(() => {
    let animationId: NodeJS.Timeout;
    const startTime = Date.now();
    const targetDuration = Math.max(loadingDuration, 3000); // Min 3 seconds for the loading bar
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / targetDuration) * 100, 100);
      setProgress(newProgress);
      
      if (newProgress < 100) {
        animationId = setTimeout(updateProgress, 30);
      }
    };
    
    animationId = setTimeout(updateProgress, 30);
    
    return () => clearTimeout(animationId);
  }, [loadingDuration]);

  // Change loading message every 600ms for variety (more frequent messages!)
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setLoadingMessage(getRandomLoadingMessage());
    }, 600);
    
    return () => clearInterval(messageInterval);
  }, []);

  // Auto-dismiss after display duration
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, DISPLAY_DURATION);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  // Determine role display and icon
  const getRoleInfo = () => {
    if (platformRole && platformRole !== "none" && platformRole !== null) {
      const platformRoleMap: Record<string, { label: string; icon: any }> = {
        root_admin: { label: "Root Admin", icon: Crown },
        deputy_admin: { label: "Deputy Admin", icon: Shield },
        sysop: { label: "System Operator", icon: Zap },
        support_manager: { label: "Support Manager", icon: Shield },
        support_agent: { label: "Support Agent", icon: Zap },
        compliance_officer: { label: "Compliance Officer", icon: Shield },
      };
      return platformRoleMap[platformRole] || { label: role || "User", icon: LogIn };
    }

    const roleMap: Record<string, { label: string; icon: any }> = {
      admin: { label: "Administrator", icon: Shield },
      manager: { label: "Manager", icon: Zap },
      user: { label: "User", icon: LogIn },
    };
    return roleMap[role || "user"] || { label: role || "User", icon: LogIn };
  };

  const roleInfo = getRoleInfo();
  const RoleIcon = roleInfo.icon;
  const displayName = firstName + (lastName ? ` ${lastName}` : "");

  return (
    <div className="fixed inset-x-0 bottom-0 sm:bottom-6 sm:right-6 sm:left-auto sm:w-full sm:max-w-sm z-50 p-4 sm:p-0">
      <div
        className="animate-in fade-in slide-in-from-bottom-5 sm:slide-in-from-right-5 duration-500"
        style={{
          animation: "slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        }}
      >
        <style>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideDown {
            from {
              opacity: 1;
              transform: translateY(0);
            }
            to {
              opacity: 0;
              transform: translateY(20px);
            }
          }
          .welcome-notification-exit {
            animation: slideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }
        `}</style>

        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-700 dark:via-blue-600 dark:to-cyan-600 rounded-lg sm:rounded-xl p-5 sm:p-6 shadow-2xl text-white">
          {/* Header with Icon and Welcome */}
          <div className="flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center backdrop-blur-sm">
              <RoleIcon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Welcome back, {displayName}!
              </h3>
              <p className="text-blue-100 text-xs sm:text-sm mt-0.5">
                {roleInfo.label}
              </p>
            </div>
          </div>

          {/* Body with Info */}
          <div className="space-y-2 sm:space-y-3 text-white/90 text-xs sm:text-sm">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <div className="w-2 h-2 bg-white/60 rounded-full" />
              <span className="truncate">
                {email || "Email not displayed"}
              </span>
            </div>

            {/* Quick Status */}
            <div className="flex gap-2 pt-1">
              <div className="flex-1 px-3 py-2 bg-white/10 rounded-lg backdrop-blur-sm text-center">
                <div className="text-xs font-medium opacity-75">Status</div>
                <div className="text-white font-semibold text-sm">Active</div>
              </div>
            </div>
          </div>

          {/* Footer with Loading Progress */}
          <div className="mt-4 sm:mt-5 space-y-3">
            {/* Loading message */}
            <p className="text-white/80 text-xs sm:text-sm font-medium h-5 sm:h-6 flex items-center">
              {loadingMessage}
            </p>
            
            {/* Progress section with large percentage */}
            <div className="space-y-2">
              {/* Progress bar */}
              <div className="w-full h-2 sm:h-2.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full bg-white/95 rounded-full transition-all duration-100 ease-out"
                  style={{
                    width: `${progress}%`,
                    boxShadow: "0 0 15px rgba(255, 255, 255, 0.6)"
                  }}
                />
              </div>
              
              {/* Large, bold percentage text */}
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-xs">Loading...</span>
                <span className="text-white font-bold text-base sm:text-lg tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
