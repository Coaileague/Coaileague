/**
 * MobileBottomNav - Fixed bottom navigation for mobile devices
 * 
 * Features:
 * - Fixed 5-item layout (4 primary + More) to fit all screen widths
 * - Touch-optimized tap targets (48px minimum - meets WCAG requirement)
 * - Active state indication
 * - Haptic feedback ready
 * - Keyboard-aware hiding
 * - Grid-based More menu for extra items
 */

import { Calendar, Clock, MessageSquare, Menu, LogOut, Settings, User, HelpCircle, Mail, Home, Bell, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { performLogout, setLogoutAnimationContext } from "@/lib/logoutHandler";
import { useUniversalAnimation } from "@/contexts/universal-animation-context";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive: boolean;
}

function NavItem({ icon: Icon, label, href, isActive }: NavItemProps) {
  const [, setLocation] = useLocation();
  
  const handleClick = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    setLocation(href);
  };
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg transition-all duration-150",
        "min-h-[48px] flex-1 py-1.5 px-1",
        isActive 
          ? "text-cyan-400" 
          : "text-slate-400 active:text-white"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon 
        className={cn(
          "transition-all",
          isActive ? "w-5 h-5" : "w-5 h-5"
        )} 
        strokeWidth={isActive ? 2.5 : 2} 
      />
      <span className={cn(
        "text-[9px] font-medium mt-0.5 leading-tight truncate max-w-full",
        isActive ? "font-semibold text-cyan-400" : ""
      )}>
        {label}
      </span>
    </button>
  );
}

// Grid menu item for the More sheet
function SheetMenuItem({ icon: Icon, label, href, onClose }: { 
  icon: LucideIcon; 
  label: string; 
  href: string;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  
  return (
    <button
      onClick={() => { setLocation(href); onClose(); }}
      className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/50 active:bg-slate-700 transition-colors"
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid={`menu-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-6 h-6 text-cyan-400 mb-1" />
      <span className="text-xs text-slate-300 font-medium">{label}</span>
    </button>
  );
}

interface MobileBottomNavProps {
  onMenuOpen?: () => void;
}

export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const animationContext = useUniversalAnimation();
  
  useEffect(() => {
    if (animationContext) {
      setLogoutAnimationContext(animationContext);
    }
  }, [animationContext]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const vv = window.visualViewport;
      
      const handleViewportChange = () => {
        const heightDiff = window.innerHeight - vv.height;
        setKeyboardVisible(heightDiff > 150);
      };
      
      vv.addEventListener('resize', handleViewportChange);
      return () => vv.removeEventListener('resize', handleViewportChange);
    }
  }, []);
  
  if (!isMobile || keyboardVisible) {
    return null;
  }
  
  // Primary nav: 4 essential items only (fits 320px screens)
  // Notifications/Dashboard is the home hub on mobile (GetSling-style unified dashboard)
  const navItems = [
    { icon: Bell, label: "Dashboard", href: "/mobile-hub" },
    { icon: Clock, label: "Clock", href: "/time-tracking" },
    { icon: Calendar, label: "Schedule", href: "/schedule" },
    { icon: MessageSquare, label: "Rooms", href: "/chatrooms" },
  ];
  
  // Items moved to More menu
  const menuItems = [
    { icon: Mail, label: "Inbox", href: "/inbox" },
    { icon: HelpCircle, label: "Help", href: "/support" },
    { icon: User, label: "Profile", href: "/profile" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];
  
  const isActive = (href: string) => {
    if (href === '/mobile-hub') {
      return location === '/' || location === '/mobile-hub' || location === '/dashboard';
    }
    return location.startsWith(href);
  };
  
  return (
    <nav 
      className={cn(
        "fixed bottom-0 inset-x-0 z-50",
        "bg-slate-900/98 backdrop-blur-xl",
        "border-t border-slate-700/50"
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
      role="navigation"
      aria-label="Main navigation"
      data-testid="mobile-bottom-nav"
    >
      {/* Fixed 5-item layout: 4 primary + More (fits all screens) */}
      <div className="flex items-center py-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            icon={item.icon}
            label={item.label}
            href={item.href}
            isActive={isActive(item.href)}
          />
        ))}
        
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center rounded-lg transition-all duration-150",
                "min-h-[48px] flex-1 py-1.5 px-1",
                menuOpen ? "text-cyan-400" : "text-slate-400 active:text-white"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              data-testid="nav-more"
              aria-label="More options"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
              <span className="text-[9px] font-medium mt-0.5 leading-tight">More</span>
            </button>
          </SheetTrigger>
          <SheetContent 
            side="bottom" 
            className="rounded-t-2xl bg-slate-900 border-slate-700 px-4 pt-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
          >
            <SheetTitle className="sr-only">More Options</SheetTitle>
            
            {/* 2x2 Grid for quick access items */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {menuItems.map((item) => (
                <SheetMenuItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  onClose={() => setMenuOpen(false)}
                />
              ))}
            </div>
            
            {/* Logout button */}
            <button
              onClick={() => performLogout()}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 active:bg-red-900/40 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              data-testid="nav-logout"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Log Out</span>
            </button>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
