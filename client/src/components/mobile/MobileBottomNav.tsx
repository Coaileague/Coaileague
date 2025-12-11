/**
 * MobileBottomNav - Fixed bottom navigation for mobile devices
 * 
 * Features:
 * - Fixed position with safe area support
 * - Touch-optimized tap targets (52px minimum - exceeds WCAG 44px requirement)
 * - Active state indication
 * - Smooth transitions
 * - Haptic feedback ready
 * - Keyboard-aware hiding
 */

import { Home, Calendar, Clock, MessageSquare, Menu, DollarSign, Users, LogOut, ArrowLeft, ClipboardCheck, Settings, User } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { performLogout, setLogoutAnimationContext } from "@/lib/logoutHandler";
import { useUniversalAnimation } from "@/contexts/universal-animation-context";
import { useQuery } from "@tanstack/react-query";

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
        "flex flex-col items-center justify-center rounded-xl transition-all duration-200",
        "min-h-[52px] min-w-[56px] py-2 px-3",
        "-webkit-tap-highlight-color: transparent",
        isActive 
          ? "text-cyan-400 bg-slate-800" 
          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
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
        "text-[10px] font-medium mt-1 leading-tight",
        isActive ? "font-semibold text-white" : ""
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
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const animationContext = useUniversalAnimation();
  
  // Fetch employee info for RBAC-based menu items
  const { data: employee } = useQuery<{ workspaceRole?: string }>({
    queryKey: ['/api/employees/me'],
  });
  
  const workspaceRole = employee?.workspaceRole || 'staff';
  const isSupervisor = ['org_owner', 'org_admin', 'manager', 'supervisor', 'hr_manager'].includes(workspaceRole);
  
  useEffect(() => {
    // Wire animation context to logout handler
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
  
  const navItems = [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: Calendar, label: "Schedule", href: "/schedule" },
    { icon: Clock, label: "Time", href: "/time-tracking" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
  ];
  
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location === '/' || location === '/dashboard';
    }
    return location.startsWith(href);
  };

  const canGoBack = location !== '/dashboard' && location !== '/';
  
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/dashboard');
    }
  };
  
  return (
    <nav 
      className={cn(
        "fixed bottom-0 inset-x-0 z-50",
        "bg-slate-900/98 backdrop-blur-xl",
        "border-t border-slate-700/50 shadow-2xl"
      )}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
      role="navigation"
      aria-label="Main navigation"
      data-testid="mobile-bottom-nav"
    >
      <div className="mx-auto max-w-screen-sm flex justify-around items-center py-2 px-2">
        {canGoBack && (
          <button
            onClick={handleBack}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl transition-all duration-200",
              "min-h-[52px] min-w-[56px] py-2 px-3",
              "text-slate-400 hover:text-white hover:bg-slate-800/50"
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
            data-testid="nav-back"
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1 leading-tight">Back</span>
          </button>
        )}
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
        
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center rounded-xl transition-all duration-200",
                "min-h-[52px] min-w-[56px] py-2 px-3",
                menuOpen
                  ? "text-cyan-400 bg-slate-800"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              data-testid="nav-more"
              aria-label="More options"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-medium mt-1 leading-tight">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl max-h-[70vh] overflow-y-auto bg-slate-900 border-slate-700">
            <SheetTitle className="sr-only">Quick Access Menu</SheetTitle>
            <div className="p-5 space-y-4">
              <h3 className="font-bold text-lg text-white mb-4">Quick Access</h3>
              
              {/* Workforce-focused quick actions */}
              <div className="grid grid-cols-3 gap-3">
                <QuickNavButton 
                  icon={DollarSign} 
                  label="My Pay" 
                  href="/payroll" 
                  onNavigate={() => { setLocation('/payroll'); setMenuOpen(false); }}
                />
                <QuickNavButton 
                  icon={ClipboardCheck} 
                  label="Time Off" 
                  href="/pto" 
                  onNavigate={() => { setLocation('/pto'); setMenuOpen(false); }}
                />
                <QuickNavButton 
                  icon={Calendar} 
                  label="Availability" 
                  href="/availability" 
                  onNavigate={() => { setLocation('/availability'); setMenuOpen(false); }}
                />
              </div>
              
              {/* Supervisor-only tools */}
              {isSupervisor && (
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Supervisor Tools</p>
                  <div className="grid grid-cols-3 gap-3">
                    <QuickNavButton 
                      icon={Users} 
                      label="Team" 
                      href="/employees" 
                      onNavigate={() => { setLocation('/employees'); setMenuOpen(false); }}
                    />
                    <QuickNavButton 
                      icon={ClipboardCheck} 
                      label="Approvals" 
                      href="/workflow-approvals" 
                      onNavigate={() => { setLocation('/workflow-approvals'); setMenuOpen(false); }}
                    />
                  </div>
                </div>
              )}
              
              <div className="pt-4 border-t border-slate-700">
                <Button 
                  variant="ghost"
                  className="w-full h-12 justify-start gap-3 text-slate-300 hover:text-white hover:bg-slate-800"
                  onClick={() => { setLocation('/profile'); setMenuOpen(false); }}
                  data-testid="nav-profile"
                >
                  <User className="w-5 h-5 text-cyan-400" />
                  My Profile
                </Button>
              </div>
              
              <div className="pt-1">
                <Button 
                  variant="ghost"
                  className="w-full h-12 justify-start gap-3 text-slate-300 hover:text-white hover:bg-slate-800"
                  onClick={() => { setLocation('/settings'); setMenuOpen(false); }}
                  data-testid="nav-settings"
                >
                  <Settings className="w-5 h-5 text-cyan-400" />
                  Settings
                </Button>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <Button 
                  variant="ghost"
                  className="w-full h-12 justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                  onClick={() => performLogout()}
                  data-testid="nav-logout"
                >
                  <LogOut className="w-5 h-5" />
                  Log Out
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
        "flex flex-col items-center justify-center p-3 rounded-xl",
        "bg-slate-800 hover:bg-slate-700 transition-colors",
        "min-h-[72px] border border-slate-700/50"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon className="w-6 h-6 text-cyan-400 mb-1.5" />
      <span className="text-xs font-medium text-center text-slate-300">{label}</span>
    </button>
  );
}
