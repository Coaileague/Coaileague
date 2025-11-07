/**
 * Mobile Bottom Navigation - Native App Style
 * APK-Quality touch-optimized navigation bar
 * Features: Gradient accents, haptic feedback, smooth animations
 */

import { useLocation } from "wouter";
import { 
  LayoutDashboard, Calendar, Clock, BarChart3, MessageSquare, Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { triggerHaptic } from "@/hooks/use-touch-swipe";
import { cn } from "@/lib/utils";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Calendar, label: "Schedule", path: "/schedule" },
  { icon: Clock, label: "Time", path: "/time-tracking" },
  { icon: MessageSquare, label: "Chat", path: "/comm-os" },
  { icon: Menu, label: "More", path: "/settings" },
];

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();

  const handleNavigation = (path: string) => {
    triggerHaptic('light');
    setLocation(path);
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 border-t border-border safe-bottom md:hidden backdrop-blur-xl"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-20 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || (item.path !== '/dashboard' && location.startsWith(item.path));
          
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation(item.path)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 h-16 w-full rounded-2xl transition-all duration-300",
                "hover-elevate active-elevate-2",
                isActive && "scale-105"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className={cn(
                "relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300",
                isActive && "bg-success-gradient shadow-lg shadow-primary/30"
              )}>
                <Icon className={cn(
                  "h-6 w-6 transition-all duration-300",
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
                "text-[11px] font-semibold transition-all duration-300",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
      {/* iOS-style home indicator */}
      <div className="flex justify-center pb-1">
        <div className="w-32 h-1 bg-foreground/20 rounded-full" />
      </div>
    </nav>
  );
}
