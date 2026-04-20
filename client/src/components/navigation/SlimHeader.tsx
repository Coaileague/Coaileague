/**
 * SlimHeader - 48px Progressive Disclosure Header
 * 
 * Fortune 500-grade minimal header that maximizes viewport space:
 * - Left: Logo (trigger zone for navigation overlay)
 * - Center: Optional page title/breadcrumb
 * - Right: Quick actions (Pro badge, notifications, avatar)
 * 
 * Hover on logo (desktop) or tap (mobile) reveals navigation overlay
 */

import { ReactNode, forwardRef, useCallback, KeyboardEvent, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, HelpCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UnifiedBrandLogo } from '@/components/unified-brand-logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { CreditBalanceBadge } from '@/components/plan-status';

interface SlimHeaderProps {
  pageTitle?: string;
  breadcrumb?: ReactNode;
  isOverlayOpen?: boolean;
  onTriggerMouseEnter?: () => void;
  onTriggerMouseLeave?: () => void;
  onTriggerClick?: () => void;
  rightActions?: ReactNode;
  className?: string;
}

export const SlimHeader = forwardRef<HTMLDivElement, SlimHeaderProps>(({
  pageTitle,
  breadcrumb,
  isOverlayOpen = false,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerClick,
  rightActions,
  className,
}, ref) => {
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const mainContent = document.querySelector('main');
        const isScrolled = window.scrollY > 10 || (mainContent?.scrollTop ?? 0) > 10;
        header.setAttribute('data-scrolled', String(isScrolled));
        ticking = false;
      });
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll, { passive: true });
    }
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (mainContent) {
        mainContent.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTriggerClick?.();
    }
  }, [onTriggerClick]);

  return (
    <header
      ref={(el) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        headerRef.current = el;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as any).current = el;
      }}
      data-scrolled="false"
      data-testid="sticky-header"
      role="banner"
      aria-label="Site header"
      className={cn(
        "slim-header h-12 bg-background border-b border-border",
        "flex items-center justify-between px-2 sm:px-4 gap-1.5 sm:gap-4",
        "sticky top-0 z-[1030]",
        className
      )}
      style={{ height: 'var(--header-height, 48px)' }}
    >
      <button 
        type="button"
        className={cn(
          "nav-trigger-zone flex items-center gap-1.5 cursor-pointer flex-shrink-0",
          "min-h-[36px] sm:min-h-[44px] px-1.5 sm:px-2 -ml-1.5 sm:-ml-2 rounded-lg",
          "transition-colors duration-150 border-none bg-transparent",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isOverlayOpen && "bg-muted/50"
        )}
        onMouseEnter={!isMobile ? onTriggerMouseEnter : undefined}
        onMouseLeave={!isMobile ? onTriggerMouseLeave : undefined}
        onClick={onTriggerClick}
        onKeyDown={handleKeyDown}
        aria-expanded={!isMobile && isOverlayOpen}
        aria-haspopup={!isMobile ? "menu" : undefined}
        aria-controls={!isMobile ? "nav-overlay" : undefined}
        aria-label={isMobile ? "Go to home" : (isOverlayOpen ? "Close navigation menu" : "Open navigation menu")}
        data-testid="nav-trigger"
      >
        <UnifiedBrandLogo 
          size={isMobile ? "xs" : "sm"} 
          variant={isMobile ? "icon" : "full"} 
          className="cursor-pointer" 
        />
        {!isMobile && (
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
              isOverlayOpen && "rotate-180"
            )} 
          />
        )}
      </button>

      {(pageTitle || breadcrumb) && (
        <div className="hidden md:flex items-center gap-2 flex-1 justify-center">
          {breadcrumb || (
            <span className="text-sm font-medium text-muted-foreground">
              {pageTitle}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-0.5 sm:gap-1.5 flex-shrink-0">
        {rightActions || (
          <>
            {isMobile ? (
              <CreditBalanceBadge onClick={() => navigate('/billing')} />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-help"
              >
                <HelpCircle className="h-4 w-4 lg:h-5 lg:w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="button-notifications"
            >
              <Bell className="h-4 w-4 lg:h-5 lg:w-5" />
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-destructive text-destructive-foreground text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                3
              </span>
            </Button>
            <Avatar className="h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9 cursor-pointer flex-shrink-0">
              <AvatarImage src="" alt="User" />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px] sm:text-xs font-semibold">
                DU
              </AvatarFallback>
            </Avatar>
          </>
        )}
      </div>
    </header>
  );
});

SlimHeader.displayName = 'SlimHeader';
