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
import { UniversalModal, UniversalModalTrigger, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { performLogout, setLogoutTransitionLoader } from "@/lib/logoutHandler";
import { useTransitionLoaderIfMounted } from "@/components/canvas-hub";
import { TrinityLogo } from "@/components/trinity-logo";
import TrinityRedesign from "@/components/trinity-redesign";
import { Suspense, useEffect } from "react";
import { useTrinityModal } from "@/components/trinity-chat-modal";

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
          ? "text-amber-400 bg-amber-400/10" 
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
            urgent ? "bg-red-500 text-white animate-pulse" : "bg-amber-500 text-white"
          )}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-medium mt-1 leading-tight truncate max-w-full",
        isActive ? "font-semibold text-amber-400" : ""
      )}>
        {label}
      </span>
    </button>
  );
}

// Trinity-branded menu item for worker layout
function WorkerTrinityMenuItem({ onClose }: { onClose: () => void }) {
  const { openModal: openTrinityModal } = useTrinityModal();
  const [isPressed, setIsPressed] = useState(false);
  
  return (
    <button
      onClick={() => { openTrinityModal(); onClose(); }}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={cn(
        "w-full relative flex items-center justify-center gap-3 p-4 rounded-md transition-all duration-200",
        "bg-gradient-to-r from-slate-800/60 to-amber-900/40",
        "border border-amber-500/20",
        isPressed ? "scale-[0.98] ring-2 ring-amber-400/40" : "active:scale-[0.98]"
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      data-testid="worker-menu-ask-trinity"
    >
      <div className="absolute inset-0 rounded-md bg-gradient-radial from-amber-400/10 via-transparent to-transparent pointer-events-none" />
      
      {isPressed ? (
        <Suspense fallback={<div className="w-6 h-6" />}>
          <TrinityRedesign size={24} mode="THINKING" />
        </Suspense>
      ) : (
        <TrinityLogo size={24} />
      )}
      <span className="text-sm font-medium bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
        Ask Trinity AI
      </span>
    </button>
  );
}

function WorkerMoreMenu({ onClose }: { onClose: () => void }) {
  const [, setLocation] = useLocation();
  
  // Notifications removed - now accessed via bell icon in header
  const menuItems = [
    { icon: HelpCircle, label: "HelpDesk", href: "/helpdesk" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];
  
  return (
    <UniversalModalContent 
      side="bottom" 
      className="rounded-t-2xl px-4 pt-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      showHomeButton={false}
    >
      <UniversalModalTitle className="sr-only">More Options</UniversalModalTitle>
      
      <div className="mb-3">
        <WorkerTrinityMenuItem onClose={onClose} />
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        {menuItems.map((item) => (
          <button
            key={item.href}
            onClick={() => { setLocation(item.href); onClose(); }}
            className="flex flex-col items-center justify-center p-4 rounded-md bg-muted/50 active-elevate-2 transition-colors"
            style={{ 
              WebkitTapHighlightColor: 'transparent',
              minHeight: '72px',
              minWidth: '72px',
            }}
            data-testid={`worker-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon className="w-7 h-7 text-primary mb-1.5" />
            <span className="text-xs text-muted-foreground font-medium leading-tight text-center">{item.label}</span>
          </button>
        ))}
      </div>
      
      <button
        onClick={() => performLogout()}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive active-elevate-2 transition-colors"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        data-testid="worker-nav-logout"
      >
        <LogOut className="w-5 h-5" />
        <span className="text-sm font-medium">Log Out</span>
      </button>
    </UniversalModalContent>
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
  const transitionLoader = useTransitionLoaderIfMounted();
  useEffect(() => {
    if (transitionLoader) {
      setLogoutTransitionLoader(transitionLoader);
    }
  }, [transitionLoader]);
  
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
          
          <UniversalModal open={menuOpen} onOpenChange={setMenuOpen}>
            <UniversalModalTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg transition-all duration-150",
                  "min-h-[52px] min-w-[52px] py-2 px-1",
                  menuOpen ? "text-amber-400" : "text-slate-400 active:text-white"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                data-testid="worker-nav-more"
                aria-label="More options"
              >
                <Menu className="w-5 h-5" strokeWidth={2} />
                <span className="text-[10px] font-medium mt-1 leading-tight">More</span>
              </button>
            </UniversalModalTrigger>
            <WorkerMoreMenu onClose={() => setMenuOpen(false)} />
          </UniversalModal>
        </div>
      </nav>
    </div>
  );
}

export default MobileWorkerLayout;
