/**
 * Mobile Bottom Navigation - Native App Style
 * APK-Quality touch-optimized navigation bar
 * Features: Gradient accents, haptic feedback, smooth animations, iOS safe area support
 */

import { useLocation } from "wouter";
import { 
  LayoutDashboard, Calendar, Clock, BarChart3, MessageSquare, Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { triggerHaptic } from "@/hooks/use-touch-swipe";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/use-mobile";
import { getFeatureRoute, useDevicePlatform, type FeatureKey } from "@/hooks/use-adaptive-route";

interface NavItem {
  icon: React.ElementType;
  label: string;
  feature: FeatureKey; // Feature identifier for adaptive routing
  badge?: number;
}

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const { isIOS } = useMobile();
  const platform = useDevicePlatform();

  // Use adaptive routing for nav items
  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: "Dashboard", feature: "dashboard" },
    { icon: Calendar, label: "Schedule", feature: "schedule" },
    { icon: Clock, label: "Time", feature: "time-tracking" },
    { icon: MessageSquare, label: "Chat", feature: "chat" },
    { icon: Menu, label: "More", feature: "settings" },
  ];

  const handleNavigation = (feature: FeatureKey) => {
    triggerHaptic('light');
    const path = getFeatureRoute(feature, platform);
    setLocation(path);
  };

  return (
    <nav 
      className={cn(
        "mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 border-t-2 border-gray-200 dark:border-slate-700 backdrop-blur-xl shadow-lg",
        "md:hidden z-50",
        isIOS && "mobile-safe-area-bottom"
      )}
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const itemPath = getFeatureRoute(item.feature, platform);
          const isActive = location === itemPath || (itemPath !== '/dashboard' && location.startsWith(itemPath));
          
          return (
            <Button
              key={item.feature}
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation(item.feature)}
              className={cn(
                "mobile-touch-target relative flex flex-col items-center justify-center gap-1 w-full rounded-xl transition-all duration-300",
                "hover-elevate active-elevate-2 mobile-active-state",
                isActive && "scale-105"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-300",
                isActive && "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-700 shadow-md shadow-blue-200/50 dark:shadow-blue-800/50"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-all duration-300",
                  isActive ? "text-blue-600 dark:text-blue-400 scale-110 font-bold" : "text-gray-600 dark:text-gray-400"
                )} />
                {item.badge && item.badge > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 text-[10px] flex items-center justify-center rounded-full"
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all duration-300",
                isActive ? "text-blue-600 dark:text-blue-400 font-bold" : "text-gray-600 dark:text-gray-400"
              )}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
      {/* iOS-style home indicator (only on iOS) */}
      {isIOS && (
        <div className="flex justify-center pb-1.5">
          <div className="w-28 h-1 bg-gray-300 dark:bg-gray-700 rounded-full" />
        </div>
      )}
    </nav>
  );
}
