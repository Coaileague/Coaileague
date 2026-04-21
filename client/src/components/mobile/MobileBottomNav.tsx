import { Calendar, Clock, Menu, Home, CheckCircle, Mail, FileText, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { hasManagerAccess } from "@/config/mobileConfig";
import { useQuery } from "@tanstack/react-query";

const KEYBOARD_HEIGHT_THRESHOLD = 150;

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive: boolean;
  badge?: number;
}

function NavItem({ icon: Icon, label, href, isActive, badge }: NavItemProps) {
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
        "flex flex-col items-center justify-center transition-colors duration-100",
        "flex-1 px-1",
        isActive
          ? "text-primary"
          : "text-muted-foreground active:text-foreground"
      )}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={`${label}${badge && badge > 0 ? `, ${badge} unread` : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="relative inline-flex items-center justify-center">
        <Icon
          style={{ width: '22px', height: '22px' }}
          strokeWidth={isActive ? 2.5 : 2}
        />
        {badge !== undefined && badge > 0 && (
          <span
            className="absolute pointer-events-none leading-none"
            style={{
              top: '-5px',
              right: '-8px',
              minWidth: '12px',
              height: '12px',
              borderRadius: '6px',
              fontSize: '7px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              backgroundColor: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
            }}
            data-testid={`badge-${label.toLowerCase()}`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span
        className={cn(
          "leading-none text-center",
          isActive ? "font-semibold text-primary" : "font-medium"
        )}
        style={{ fontSize: '10px', marginTop: '3px' }}
      >
        {label}
      </span>
    </button>
  );
}

interface MobileBottomNavProps {
  onMenuOpen?: () => void;
}

export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { workspaceRole, platformRole } = useWorkspaceAccess();

  const { data: inboxData } = useQuery<{ mailbox?: { unreadCount?: number } }>({
    queryKey: ['/api/internal-email/mailbox/auto-create'],
    refetchInterval: 60000,
  });

  const unreadInbox = inboxData?.mailbox?.unreadCount || 0;

  const effectiveRole = platformRole === 'root_admin' || platformRole === 'deputy_admin' || platformRole === 'sysop'
    ? 'org_owner'
    : workspaceRole;
  const isManager = hasManagerAccess(effectiveRole);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const vv = window.visualViewport;

      const handleViewportChange = () => {
        const heightDiff = window.innerHeight - vv.height;
        setKeyboardVisible(heightDiff > KEYBOARD_HEIGHT_THRESHOLD);
      };

      vv.addEventListener('resize', handleViewportChange);
      return () => vv.removeEventListener('resize', handleViewportChange);
    }
  }, []);

  if (!isMobile || keyboardVisible) {
    return null;
  }

  const navItems = isManager ? [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: Calendar, label: "Schedule", href: "/schedule" },
    { icon: Clock, label: "Clock", href: "/time-tracking" },
    { icon: Mail, label: "Mail", href: "/inbox", badge: unreadInbox },
  ] : [
    { icon: Home, label: "Home", href: "/dashboard" },
    { icon: Calendar, label: "Schedule", href: "/schedule" },
    { icon: Clock, label: "Clock", href: "/time-tracking" },
    { icon: FileText, label: "Reports", href: "/field-reports" },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location === '/' || location === '/dashboard';
    }
    return location.startsWith(href);
  };

  const isMoreActive = location === '/mobile-more';

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40",
        "bg-background/98 backdrop-blur-xl",
        "border-t border-border"
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', '--bottom-nav-height': '56px' } as React.CSSProperties}
      role="navigation"
      aria-label="Mobile navigation"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center" style={{ height: '56px' }}>
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            icon={item.icon}
            label={item.label}
            href={item.href}
            isActive={isActive(item.href)}
            badge={'badge' in item ? item.badge : undefined}
          />
        ))}

        <button
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(10);
            setLocation('/mobile-more');
          }}
          className={cn(
            "flex flex-col items-center justify-center transition-colors duration-100",
            "flex-1 px-1",
            isMoreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
          )}
          data-testid="nav-more"
          aria-label="More options"
          aria-current={isMoreActive ? 'page' : undefined}
        >
          <Menu style={{ width: '22px', height: '22px' }} strokeWidth={isMoreActive ? 2.5 : 2} />
          <span
            className={cn(
              "leading-none text-center",
              isMoreActive ? "font-semibold text-primary" : "font-medium"
            )}
            style={{ fontSize: '10px', marginTop: '3px' }}
          >More</span>
        </button>
      </div>
    </nav>
  );
}
