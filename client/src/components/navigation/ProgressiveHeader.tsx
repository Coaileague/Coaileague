/**
 * ProgressiveHeader - Combined Slim Header + Navigation Overlay
 * 
 * Platform-wide progressive disclosure navigation system that:
 * - Maximizes viewport space with 48px slim header
 * - Shows navigation overlay on hover (desktop) or click (mobile)
 * - Integrates with Trinity modal (close one when other opens)
 * - Handles keyboard accessibility (Escape to close)
 */

import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { HelpCircle, Settings, LogOut, Mail, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SlimHeader } from './SlimHeader';
import { NavigationOverlay } from './NavigationOverlay';
import { useNavigationOverlay } from '@/hooks/useNavigationOverlay';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrinityModal } from '@/components/trinity-chat-modal';
import { TrinityMiniButton } from '@/components/trinity-button';
import { NotificationsPopover } from '@/components/notifications-popover';
import { SimpleModeToggle } from '@/components/SimpleModeToggle';
import { performLogout, setLogoutTransitionLoader } from '@/lib/logoutHandler';
import { useTransitionLoaderIfMounted } from '@/components/canvas-hub';
import { CreditBalanceBadge } from '@/components/credit-balance';
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

export function ProgressiveHeader({ pageTitle, className }: ProgressiveHeaderProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { openModal: openTrinityModal, isOpen: isTrinityOpen } = useTrinityModal();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const transitionLoader = useTransitionLoaderIfMounted();

  useEffect(() => {
    if (transitionLoader) {
      setLogoutTransitionLoader(transitionLoader);
    }
  }, [transitionLoader]);

  const {
    isOpen,
    animationState,
    activeCategory,
    handleMouseEnter,
    handleMouseLeave,
    handleOverlayMouseEnter,
    handleOverlayMouseLeave,
    toggleOverlay,
    closeOverlay,
    setActiveCategory,
  } = useNavigationOverlay({
    onOpen: () => {
      document.body.setAttribute('data-nav-overlay-open', 'true');
    },
    onClose: () => {
      document.body.removeAttribute('data-nav-overlay-open');
      triggerRef.current?.focus();
    },
  });

  useEffect(() => {
    if (isTrinityOpen && isOpen) {
      closeOverlay();
    }
  }, [isTrinityOpen, isOpen, closeOverlay]);

  const handleTrinityClick = useCallback(() => {
    if (isOpen) {
      closeOverlay();
    }
    openTrinityModal();
  }, [isOpen, closeOverlay, openTrinityModal]);

  const userDisplayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split('@')[0] || 'User';
  
  const userInitials = user?.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';

  const rightActions = (
    <div className="flex items-center gap-0 sm:gap-1.5">
      {!isMobile && <SimpleModeToggle variant="default" />}
      
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

      {isMobile && (
        <CreditBalanceBadge onClick={() => setLocation('/billing')} />
      )}

      <NotificationsPopover />

      {!isMobile && (
        <TrinityMiniButton 
          onClick={handleTrinityClick}
          data-testid="button-trinity"
        />
      )}

      {isMobile ? (
        <button
          className="relative inline-flex items-center justify-center w-8 h-8 rounded-full active-elevate-2 flex-shrink-0"
          onClick={() => setLocation('/settings')}
          data-testid="button-user-menu-mobile"
          aria-label="Settings"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={(user as any)?.profilePhotoUrl || (user as any)?.avatarUrl || ''} alt={userDisplayName} />
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
                <AvatarImage src={(user as any)?.profilePhotoUrl || (user as any)?.avatarUrl || ''} alt={userDisplayName} />
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
      <SlimHeader
        pageTitle={pageTitle}
        isOverlayOpen={!isMobile && isOpen}
        onTriggerMouseEnter={!isMobile ? handleMouseEnter : undefined}
        onTriggerMouseLeave={!isMobile ? handleMouseLeave : undefined}
        onTriggerClick={isMobile ? () => setLocation('/') : () => toggleOverlay('hover')}
        rightActions={rightActions}
        className={className}
      />

      {!isMobile && (
        <NavigationOverlay
          isOpen={isOpen}
          animationState={animationState}
          activeCategory={activeCategory}
          onCategoryHover={setActiveCategory}
          onClose={closeOverlay}
          onMouseEnter={handleOverlayMouseEnter}
          onMouseLeave={handleOverlayMouseLeave}
        />
      )}
    </>
  );
}
