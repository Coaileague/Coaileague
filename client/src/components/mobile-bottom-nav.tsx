/**
 * Mobile Bottom Navigation
 * Touch-optimized navigation bar for mobile devices
 * Supports swipe gestures and haptic feedback
 */

import { useLocation } from "wouter";
import { 
  Home, Users, Calendar, FileText, 
  MessageSquare, Settings, BarChart3, Clock
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
  { icon: Home, label: "Home", path: "/" },
  { icon: Calendar, label: "Schedule", path: "/schedule" },
  { icon: Clock, label: "Time", path: "/time-tracking" },
  { icon: MessageSquare, label: "Chat", path: "/messages" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
];

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();

  const handleNavigation = (path: string) => {
    triggerHaptic('light');
    setLocation(path);
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-bottom md:hidden"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation(item.path)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 h-14 w-full rounded-lg transition-all",
                isActive && "bg-accent text-accent-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className={cn(
                  "h-5 w-5 transition-transform",
                  isActive && "scale-110"
                )} />
                {item.badge && item.badge > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all",
                isActive ? "opacity-100" : "opacity-60"
              )}>
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
