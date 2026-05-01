/**
 * ProgressiveHeader - Combined Slim Header + Navigation Overlay
 *
 * Platform-wide progressive disclosure navigation system that:
 * - Maximizes viewport space with 48px slim header
 * - Shows navigation overlay on hamburger click
 * - Renders role-aware nav from selectSidebarFamilies() — no hardcoded links
 * - Integrates with Trinity modal (close one when other opens)
 * - Handles keyboard accessibility (Escape to close)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  HelpCircle,
  Settings,
  LogOut,
  Mail,
  Home,
  Menu,
  X,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrinityModal } from '@/components/trinity-chat-modal';
import { TrinityMiniButton } from '@/components/trinity-button';
import { NotificationsPopover } from '@/components/notifications-popover';
import { performLogout, setLogoutTransitionLoader } from '@/lib/logoutHandler';
import { useTransitionLoaderIfMounted } from '@/components/canvas-hub';
import { CreditBalanceBadge } from '@/components/plan-status';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import {
  selectSidebarFamilies,
  type SidebarFamily,
  type ModuleRoute,
} from '@/lib/sidebarModules';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface ProgressiveHeaderProps {
  pageTitle?: string;
  className?: string;
}

// ─── Nav Route Button ─────────────────────────────────────────────────────────

function NavRouteButton({
  route,
  isActive,
  onNavigate,
  locked = false,
}: {
  route: ModuleRoute;
  isActive: boolean;
  onNavigate: (href: string) => void;
  locked?: boolean;
}) {
  const Icon = route.icon;

  return (
    <button
      onClick={() => !locked && onNavigate(route.href)}
      disabled={locked}
      className={cn(
        'group flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-all duration-100 text-left',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : locked
          ? 'text-muted-foreground/50 cursor-not-allowed'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
      data-testid={`nav-link-${route.id}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          isActive ? 'text-primary' : locked ? 'opacity-40' : 'group-hover:text-foreground',
        )}
      />
      <span className="truncate">{route.label}</span>
      {locked && route.badge && (
        <Badge variant="secondary" className="ml-auto text-[9px] px-1 py-0 h-4 shrink-0">
          <Lock className="h-2.5 w-2.5 mr-0.5" />
          {route.badge}
        </Badge>
      )}
      {!locked && route.badge && (
        <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-4 shrink-0">
          {route.badge}
        </Badge>
      )}
    </button>
  );
}

// ─── Family Section ───────────────────────────────────────────────────────────

function FamilySection({
  family,
  location,
  onNavigate,
}: {
  family: SidebarFamily;
  location: string;
  onNavigate: (href: string) => void;
}) {
  if (family.routes.length === 0 && family.locked.length === 0) return null;

  return (
    <div className="min-w-0">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 truncate">
        {family.label}
      </h3>
      <nav className="space-y-0.5">
        {family.routes.map((route) => (
          <NavRouteButton
            key={route.id}
            route={route}
            isActive={location === route.href}
            onNavigate={onNavigate}
          />
        ))}
        {family.locked.map((route) => (
          <NavRouteButton
            key={`locked-${route.id}`}
            route={route}
            isActive={false}
            onNavigate={onNavigate}
            locked
          />
        ))}
      </nav>
    </div>
  );
}

// ─── Nav Overlay ──────────────────────────────────────────────────────────────

function NavOverlay({
  families,
  location,
  onNavigate,
  onClose,
}: {
  families: SidebarFamily[];
  location: string;
  onNavigate: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-12 left-0 right-0 z-50 bg-card border-b border-border shadow-xl max-h-[calc(100vh-48px)] overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* Close button — mobile only */}
        <div className="flex items-center justify-between mb-4 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Navigation
          </span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {families.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading navigation…</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3 lg:grid-cols-5">
            {families.map((family) => (
              <FamilySection
                key={family.id}
                family={family}
                location={location}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProgressiveHeader({ pageTitle, className }: ProgressiveHeaderProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { openModal: openTrinityModal, isOpen: isTrinityOpen } = useTrinityModal();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const transitionLoader = useTransitionLoaderIfMounted();

  // RBAC data for role-aware nav
  const {
    workspaceRole,
    subscriptionTier,
    isPlatformStaff,
    isLoading: accessLoading,
    positionCapabilities,
  } = useWorkspaceAccess();

  useEffect(() => {
    if (transitionLoader) {
      setLogoutTransitionLoader(transitionLoader);
    }
  }, [transitionLoader]);

  const [isOpen, setIsOpen] = useState(false);

  const closeOverlay = useCallback(() => {
    setIsOpen(false);
    document.body.removeAttribute('data-nav-overlay-open');
    triggerRef.current?.focus();
  }, []);

  const toggleOverlay = useCallback(() => {
    setIsOpen((v) => {
      const next = !v;
      if (next) document.body.setAttribute('data-nav-overlay-open', 'true');
      else document.body.removeAttribute('data-nav-overlay-open');
      return next;
    });
  }, []);

  // Close when Trinity opens
  useEffect(() => {
    if (isTrinityOpen && isOpen) closeOverlay();
  }, [isTrinityOpen, isOpen, closeOverlay]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeOverlay]);

  const handleTrinityClick = useCallback(() => {
    if (isOpen) closeOverlay();
    openTrinityModal();
  }, [isOpen, closeOverlay, openTrinityModal]);

  const handleNavigate = useCallback(
    (href: string) => {
      setLocation(href);
      closeOverlay();
    },
    [setLocation, closeOverlay],
  );

  // Build role-aware sidebar families
  const families: SidebarFamily[] = accessLoading
    ? []
    : selectSidebarFamilies(
        workspaceRole,
        subscriptionTier,
        isPlatformStaff,
        positionCapabilities,
      ).map((family) => ({
        ...family,
        routes: isMobile ? family.routes : family.routes.filter((r) => !r.mobileOnly),
      }));

  const userDisplayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.email?.split('@')[0] || 'User';

  const userInitials = user?.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';

  const rightActions = (
    <div className="flex items-center gap-0 sm:gap-1.5">
      {/* Hamburger / Close toggle — desktop only */}
      {!isMobile && (
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 hidden sm:flex mr-2 transition-colors',
            isOpen && 'bg-muted text-foreground',
          )}
          onClick={toggleOverlay}
          data-testid="nav-trigger"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      )}

      {!isMobile && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 hidden sm:flex"
          onClick={() => setLocation('/help')}
          data-testid="button-help"
        >
          <HelpCircle className="h-4 w-4 lg:h-5 lg:w-5" />
        </Button>
      )}

      {isMobile && <CreditBalanceBadge onClick={() => setLocation('/billing')} />}

      <NotificationsPopover />

      {!isMobile && (
        <TrinityMiniButton onClick={handleTrinityClick} data-testid="button-trinity" />
      )}

      {isMobile ? (
        <button
          className="relative inline-flex items-center justify-center w-8 h-8 rounded-full active-elevate-2 flex-shrink-0"
          onClick={() => setLocation('/settings')}
          data-testid="button-user-menu-mobile"
          aria-label="Settings"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={(user as any)?.profileImageUrl || ''} alt={userDisplayName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold tracking-wider">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar>
                <AvatarImage src={(user as any)?.profileImageUrl || ''} alt={userDisplayName} />
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold tracking-wider">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm">
              <div className="font-medium">{userDisplayName}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation('/')}>
              <Home className="mr-2 h-4 w-4" />
              Homepage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocation('/inbox')}>
              <Mail className="mr-2 h-4 w-4" />
              Inbox
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={performLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  useEffect(() => {
    triggerRef.current = document.querySelector<HTMLButtonElement>('[data-testid="nav-trigger"]');
  }, []);

  return (
    <>
      <div className={cn('w-full flex items-center justify-end', className)}>
        {rightActions && <div className="flex items-center gap-2 ml-auto">{rightActions}</div>}
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:bg-black/20"
          onClick={closeOverlay}
          aria-hidden="true"
        />
      )}

      {/* Navigation Overlay */}
      {isOpen && (
        <NavOverlay
          families={families}
          location={location}
          onNavigate={handleNavigate}
          onClose={closeOverlay}
        />
      )}
    </>
  );
}
