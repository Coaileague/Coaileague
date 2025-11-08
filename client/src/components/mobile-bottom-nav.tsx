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
        "mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-card/95 border-t border-border backdrop-blur-xl",
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
                isActive && "bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-all duration-300",
                  isActive ? "text-white dark:text-white scale-110" : "text-muted-foreground"
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
                isActive ? "text-foreground font-bold" : "text-muted-foreground"
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
          <div className="w-28 h-1 bg-foreground/20 rounded-full" />
        </div>
      )}
    </nav>
  );
}
