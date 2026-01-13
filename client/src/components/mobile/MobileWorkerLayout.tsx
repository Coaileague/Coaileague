/**
 * MobileWorkerLayout - Role-based mobile layout for security guards and field workers
 * 
 * Features:
 * - Simplified 5-tab navigation for workers (Home, Schedule, Chat, Incidents, Profile)
 * - Big clock-in button on home screen
 * - Site-specific context awareness
 * - Offline-ready design
 * 
 * This layout is shown ONLY for employees on mobile devices
 * Managers and admins get the standard responsive layout
 */

import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdentity } from "@/hooks/useIdentity";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Calendar, 
  MessageSquare, 
  AlertTriangle, 
  User,
  Clock,
  Menu,
  LogOut,
  Settings,
  HelpCircle,
  Bell,
  type LucideIcon 
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { performLogout } from "@/lib/logoutHandler";
import { ColorfulCelticKnot } from "@/components/ui/colorful-celtic-knot";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive: boolean;
  badge?: number;
  urgent?: boolean;
}

function WorkerNavItem({ icon: Icon, label, href, isActive, badge, urgent }: NavItemProps) {
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
        "flex flex-col items-center justify-center rounded-lg transition-all duration-150 relative",
        "min-h-[52px] flex-1 py-2 px-1",
        isActive 
          ? "text-cyan-400 bg-cyan-400/10" 
          : "text-slate-400 active:text-white"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid={`worker-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="relative">
        <Icon 
          className={cn(
            "transition-all",
            isActive ? "w-6 h-6" : "w-5 h-5"
          )} 
          strokeWidth={isActive ? 2.5 : 2} 
        />
        {badge !== undefined && badge > 0 && (
          <span className={cn(
            "absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full text-[10px] font-bold flex items-center justify-center",
            urgent ? "bg-red-500 text-white animate-pulse" : "bg-cyan-500 text-white"
          )}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-medium mt-1 leading-tight truncate max-w-full",
        isActive ? "font-semibold text-cyan-400" : ""
      )}>
        {label}
      </span>
    </button>
  );
}

// Trinity-branded menu item for worker layout
function WorkerTrinityMenuItem({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [isPressed, setIsPressed] = useState(false);
  
  return (
    <button
      onClick={() => { setLocation("/trinity"); onClose(); }}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={cn(
        "w-full relative flex items-center justify-center gap-3 p-4 rounded-xl transition-all duration-200",
        "bg-gradient-to-r from-purple-900/40 via-slate-800/60 to-cyan-900/40",
        "border border-purple-500/20",
        isPressed ? "scale-[0.98] ring-2 ring-cyan-400/40" : "active:scale-[0.98]"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid="worker-menu-ask-trinity"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-radial from-cyan-400/10 via-transparent to-transparent pointer-events-none" />
      
      <ColorfulCelticKnot 
        size="sm" 
        animated={isPressed}
        state={isPressed ? "thinking" : "idle"}
      />
      <span className="text-sm font-medium bg-gradient-to-r from-purple-300 via-cyan-300 to-amber-300 bg-clip-text text-transparent">
        Ask Trinity AI
      </span>
    </button>
  );
}

function WorkerMoreMenu({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  
  const menuItems = [
    { icon: Bell, label: "Notifications", href: "/mobile-hub" },
    { icon: HelpCircle, label: "Help", href: "/support" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];
  
  return (
    <SheetContent 
      side="bottom" 
      className="rounded-t-2xl bg-slate-900 border-slate-700 px-4 pt-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
    >
      <SheetTitle className="sr-only">More Options</SheetTitle>
      
      {/* Trinity AI - Featured prominently */}
      <div className="mb-3">
        <WorkerTrinityMenuItem onClose={onClose} />
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        {menuItems.map((item) => (
          <button
            key={item.href}
            onClick={() => { setLocation(item.href); onClose(); }}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 active:bg-slate-700 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            data-testid={`worker-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon className="w-6 h-6 text-cyan-400 mb-2" />
            <span className="text-xs text-slate-300 font-medium">{item.label}</span>
          </button>
        ))}
      </div>
      
      <button
        onClick={() => performLogout()}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 active:bg-red-900/40 transition-colors"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        data-testid="worker-nav-logout"
      >
        <LogOut className="w-5 h-5" />
        <span className="text-sm font-medium">Log Out</span>
      </button>
    </SheetContent>
  );
}

interface MobileWorkerLayoutProps {
  children: ReactNode;
  unreadMessages?: number;
  pendingIncidents?: number;
}

export function MobileWorkerLayout({ 
  children, 
  unreadMessages = 0,
  pendingIncidents = 0 
}: MobileWorkerLayoutProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isEmployee, workspaceRole, isLoading: identityLoading } = useIdentity();
  
  // Role-based gating: Only show worker layout for field workers
  // Uses authoritative isEmployee flag from RBAC identity system
  // Also check workspaceRole for staff designation
  const isFieldWorker = isEmployee || workspaceRole === 'staff' || workspaceRole === 'employee';
  
  // Wait for identity to load before deciding layout (safe fallback to standard)
  if (identityLoading) {
    return <>{children}</>;
  }
  
  // Non-mobile or non-worker: show standard layout
  // Managers, admins, and platform users get the full responsive layout
  if (!isMobile || !isFieldWorker) {
    return <>{children}</>;
  }
  
  const workerNavItems = [
    { icon: Home, label: "Home", href: "/worker", badge: 0 },
    { icon: Calendar, label: "Schedule", href: "/worker/schedule", badge: 0 },
    { icon: MessageSquare, label: "Chat", href: "/chatrooms", badge: unreadMessages },
    { icon: AlertTriangle, label: "Incidents", href: "/worker/incidents", badge: pendingIncidents, urgent: pendingIncidents > 0 },
    { icon: User, label: "Profile", href: "/profile", badge: 0 },
  ];
  
  const isActive = (href: string) => {
    if (href === '/worker') {
      return location === '/worker' || location === '/dashboard';
    }
    return location.startsWith(href);
  };
  
  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <div className="flex-1 overflow-y-auto pb-20">
        {children}
      </div>
      
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
        aria-label="Worker navigation"
        data-testid="mobile-worker-nav"
      >
        <div className="flex items-center py-1 px-1">
          {workerNavItems.map((item) => (
            <WorkerNavItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isActive={isActive(item.href)}
              badge={item.badge}
              urgent={item.urgent}
            />
          ))}
          
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg transition-all duration-150",
                  "min-h-[52px] w-14 py-2 px-1",
                  menuOpen ? "text-cyan-400" : "text-slate-400 active:text-white"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                data-testid="worker-nav-more"
                aria-label="More options"
              >
                <Menu className="w-5 h-5" strokeWidth={2} />
                <span className="text-[10px] font-medium mt-1 leading-tight">More</span>
              </button>
            </SheetTrigger>
            <WorkerMoreMenu onClose={() => setMenuOpen(false)} />
          </Sheet>
        </div>
      </nav>
    </div>
  );
}

export default MobileWorkerLayout;
