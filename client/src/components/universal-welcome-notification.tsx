import { useEffect, useState } from "react";
import { LogIn, Zap, Shield, Crown } from "lucide-react";
import { LOADING_MESSAGES, getRandomLoadingMessage } from "@/config/loading-messages";
import { useOrgStatusNotification } from "@/hooks/useOrgStatusNotification";
import TrinityMarketingHero from "@/components/trinity-marketing-hero";

interface WelcomeNotificationProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  platformRole?: string | null;
  workspaceId?: string;
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
  workspaceId,
  onComplete,
  loadingDuration = 1000,
}: WelcomeNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState(() => getRandomLoadingMessage());
  const { status: orgStatus, isLoading: statusLoading } = useOrgStatusNotification(workspaceId);

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
      return platformRoleMap[platformRole] || { label: role || "Team Member", icon: LogIn };
    }

    const roleMap: Record<string, { label: string; icon: any }> = {
      admin: { label: "Administrator", icon: Shield },
      owner: { label: "Organization Owner", icon: Crown },
      manager: { label: "Manager", icon: Zap },
      supervisor: { label: "Supervisor", icon: Shield },
      hr_manager: { label: "HR Manager", icon: Shield },
      employee: { label: "Employee", icon: LogIn },
      user: { label: "Team Member", icon: LogIn },
    };
    
    // Format role name if not in map - capitalize and humanize
    const formatRoleName = (r: string) => {
      return r.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    
    return roleMap[role || "user"] || { label: formatRoleName(role || "Team Member"), icon: LogIn };
  };

  const roleInfo = getRoleInfo();
  const RoleIcon = roleInfo.icon;
  const displayName = firstName + (lastName ? ` ${lastName}` : "");

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:bottom-5 sm:right-5 sm:left-auto sm:max-w-xs md:max-w-sm z-50">
      <div
        className="animate-in fade-in slide-in-from-bottom-5 duration-500"
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

        <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 dark:from-blue-700 dark:via-blue-600 dark:to-cyan-600 rounded-xl p-3 sm:p-4 md:p-5 shadow-xl text-white border border-white/10">
          {/* Header with Trinity Icon and Welcome */}
          <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
            <div className="flex-shrink-0">
              <TrinityMarketingHero 
                variant="compact" 
                iconOnly 
                showGlow={false}
                showSparkles={false}
                animated={false}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-white leading-tight truncate">
                Welcome back, {displayName}!
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <RoleIcon className="w-3 h-3 text-blue-100/80" />
                <p className="text-blue-100/80 text-xs">
                  {roleInfo.label}
                </p>
              </div>
            </div>
          </div>

          {/* Body with Info - More Compact */}
          <div className="space-y-1.5 sm:space-y-2 text-white/90 text-xs">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/10 rounded-md backdrop-blur-sm">
              <div className="w-1.5 h-1.5 bg-white/60 rounded-full flex-shrink-0" />
              <span className="truncate text-xs">
                {email || "Email not displayed"}
              </span>
            </div>

            {/* Quick Status - Compact */}
            <div className="px-2.5 py-1.5 bg-white/10 rounded-md backdrop-blur-sm text-center">
              <div className="text-[10px] font-medium opacity-70 uppercase tracking-wide">Status</div>
              <div className="text-white font-semibold text-xs">
                {statusLoading ? 'Loading...' : orgStatus === 'active' ? 'Active' : 'Review Required'}
              </div>
            </div>
          </div>

          {/* Footer with Loading Progress - Compact */}
          <div className="mt-2.5 sm:mt-3 space-y-1.5">
            {/* Loading message */}
            <p className="text-white/70 text-[11px] sm:text-xs font-medium truncate">
              {loadingMessage}
            </p>
            
            {/* Progress section */}
            <div className="space-y-1">
              {/* Progress bar */}
              <div className="w-full h-1.5 sm:h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full bg-white/90 rounded-full transition-all duration-100 ease-out"
                  style={{
                    width: `${progress}%`,
                    boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)"
                  }}
                />
              </div>
              
              {/* Percentage text */}
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-[10px]">Loading...</span>
                <span className="text-white font-semibold text-sm tabular-nums">
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
