/**
 * MobileBottomNav - Fixed bottom navigation for mobile devices
 * 
 * Features:
 * - Fixed position with safe area support
 * - Touch-optimized tap targets (48px minimum)
 * - Active state indication
 * - Smooth transitions
 * - Haptic feedback ready
 * - Keyboard-aware hiding
 */

import { Home, Calendar, Clock, MessageSquare, Menu, LayoutDashboard, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface NavItemProps {
  icon: typeof Home;
  label: string;
  href: string;
  isActive: boolean;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, href, isActive, onClick }: NavItemProps) {
  const [, setLocation] = useLocation();
  
  const handleClick = () => {
    // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    setLocation(href);
    onClick();
  };
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-all",
        "min-h-[52px] min-w-[56px] tap",
        isActive 
          ? "text-primary bg-primary/10" 
          : "text-muted-foreground hover-elevate active-elevate-2"
      )}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon 
        className={cn(
          "transition-all",
          isActive ? "w-6 h-6" : "w-5 h-5"
        )} 
        strokeWidth={isActive ? 2.5 : 2} 
      />
      <span className={cn(
        "text-[10px] font-medium mt-0.5 leading-tight",
        isActive && "font-semibold"
      )}>
        {label}
      </span>
    </button>
  );
}

interface MobileBottomNavProps {
  onMenuOpen?: () => void;
}

export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const [location, setLocation] = useLocation();
  const { isMobile, keyboardVisible, safeAreaBottom } = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Don't render on desktop or when keyboard is visible
  if (!isMobile || keyboardVisible) {
    return null;
  }
  
  // Core navigation items - most essential features
  const navItems = [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: Calendar, label: "Schedule", href: "/schedule" },
    { icon: Clock, label: "Time", href: "/time-tracking" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
  ];
  
  // Check if current path matches nav item
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location === '/' || location === '/dashboard';
    }
    return location.startsWith(href);
  };
  
  return (
    <nav 
      className={cn(
        "fixed bottom-0 inset-x-0 z-50",
        "bg-background/98 backdrop-blur-md",
        "border-t border-border shadow-lg"
      )}
      style={{
        paddingBottom: safeAreaBottom > 0 ? `${safeAreaBottom}px` : 'env(safe-area-inset-bottom, 0px)'
      }}
      role="navigation"
      aria-label="Main navigation"
      data-testid="mobile-bottom-nav"
    >
      <div className="mx-auto max-w-screen-sm flex justify-around items-center py-1 px-2">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            icon={item.icon}
            label={item.label}
            href={item.href}
            isActive={isActive(item.href)}
            onClick={() => {}}
          />
        ))}
        
        {/* More menu button */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center py-2 px-2 rounded-lg transition-all",
                "min-h-[52px] min-w-[56px] tap",
                menuOpen
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover-elevate active-elevate-2"
              )}
              data-testid="nav-more"
              aria-label="More options"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-medium mt-0.5 leading-tight">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <div className="p-4 space-y-4">
              <h3 className="font-semibold text-lg mb-4">Quick Access</h3>
              
              {/* Additional navigation options */}
              <div className="grid grid-cols-3 gap-3">
                <QuickNavButton 
                  icon={Users} 
                  label="Employees" 
                  href="/employees" 
                  onNavigate={() => { setLocation('/employees'); setMenuOpen(false); }}
                />
                <QuickNavButton 
                  icon={LayoutDashboard} 
                  label="Reports" 
                  href="/reports" 
                  onNavigate={() => { setLocation('/reports'); setMenuOpen(false); }}
                />
                <QuickNavButton 
                  icon={Calendar} 
                  label="Approvals" 
                  href="/workflow-approvals" 
                  onNavigate={() => { setLocation('/workflow-approvals'); setMenuOpen(false); }}
                />
              </div>
              
              <div className="pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="w-full h-12 justify-start gap-3"
                  onClick={() => { setLocation('/profile'); setMenuOpen(false); }}
                  data-testid="nav-profile"
                >
                  <Users className="w-5 h-5" />
                  My Profile
                </Button>
              </div>
              
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  className="w-full h-12 justify-start gap-3"
                  onClick={() => { setLocation('/settings'); setMenuOpen(false); }}
                  data-testid="nav-settings"
                >
                  <Menu className="w-5 h-5" />
                  Settings
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

interface QuickNavButtonProps {
  icon: typeof Home;
  label: string;
  href: string;
  onNavigate: () => void;
}

function QuickNavButton({ icon: Icon, label, onNavigate }: QuickNavButtonProps) {
  return (
    <button
      onClick={onNavigate}
      className={cn(
        "flex flex-col items-center justify-center p-3 rounded-lg",
        "bg-muted/50 hover-elevate active-elevate-2 tap",
        "min-h-[72px]"
      )}
    >
      <Icon className="w-6 h-6 text-primary mb-1" />
      <span className="text-xs font-medium text-center">{label}</span>
    </button>
  );
}
