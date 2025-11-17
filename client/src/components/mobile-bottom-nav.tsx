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
        "mobile-bottom-nav fixed bottom-0 left-0 right-0 backdrop-blur-2xl shadow-2xl border-t",
        "bg-white/90 border-gray-200/50",
        "md:hidden z-50",
        isIOS && "mobile-safe-area-bottom"
      )}
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-stretch justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const itemPath = getFeatureRoute(item.feature, platform);
          const isActive = location === itemPath || (itemPath !== '/dashboard' && location.startsWith(itemPath));
          
          return (
            <button
              key={item.feature}
              onClick={() => handleNavigation(item.feature)}
              className={cn(
                "mobile-touch-target relative flex flex-col items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl transition-all duration-300",
                "active:scale-95 flex-1 min-w-0",
                isActive ? "scale-105" : "scale-100"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {/* Active indicator - Modern top bar */}
              {isActive && (
                <div 
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
                  style={{ 
                    background: 'linear-gradient(90deg, #3b82f6 0%, #22d3ee 100%)'
                  }}
                />
              )}
              
              <div className="relative flex items-center justify-center">
                <Icon 
                  className={cn(
                    "transition-all duration-300",
                    isActive ? "h-7 w-7" : "h-6 w-6",
                    isActive ? "text-blue-600 drop-shadow-md" : "text-gray-500"
                  )} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.badge && item.badge > 0 && (
                  <div 
                    className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1.5 text-[10px] font-bold flex items-center justify-center rounded-full text-white shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </div>
                )}
              </div>
              
              <span className={cn(
                "text-[11px] font-semibold transition-all duration-300 truncate w-full text-center",
                isActive ? "opacity-100" : "opacity-70",
                isActive ? "text-blue-600" : "text-gray-600"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* iOS-style home indicator (only on iOS) */}
      {isIOS && (
        <div className="flex justify-center pb-1 pt-0.5">
          <div className="w-24 h-1 bg-gray-400 rounded-full opacity-40" />
        </div>
      )}
    </nav>
  );
}
