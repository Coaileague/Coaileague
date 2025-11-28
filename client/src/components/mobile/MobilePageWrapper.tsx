/**
 * MobilePageWrapper - Responsive page container with proper mobile handling
 * 
 * Features:
 * - Responsive padding based on screen size
 * - Safe area insets for notched devices
 * - Optional bottom navigation spacing
 * - Keyboard-aware height adjustments
 * - Smooth scroll behavior
 */

import { ReactNode, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const TABLET_BREAKPOINT = 1024;

function useIsTablet() {
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      return width >= 768 && width < TABLET_BREAKPOINT;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsTablet(width >= 768 && width < TABLET_BREAKPOINT);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isTablet;
}

interface MobilePageWrapperProps {
  children: ReactNode;
  title?: string;
  hasBottomNav?: boolean;
  className?: string;
  contentClassName?: string;
  fullHeight?: boolean;
  noScroll?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  centered?: boolean;
  'data-testid'?: string;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export function MobilePageWrapper({
  children,
  title,
  hasBottomNav = true,
  className,
  contentClassName,
  fullHeight = false,
  noScroll = false,
  maxWidth = '7xl',
  centered = false,
  'data-testid': testId,
}: MobilePageWrapperProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  
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
  
  useEffect(() => {
    if (typeof window !== 'undefined' && CSS.supports('padding-bottom: env(safe-area-inset-bottom)')) {
      const testEl = document.createElement('div');
      testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
      document.body.appendChild(testEl);
      const computed = getComputedStyle(testEl);
      setSafeAreaBottom(parseInt(computed.paddingBottom) || 0);
      document.body.removeChild(testEl);
    }
  }, []);
  
  const showBottomNavSpace = hasBottomNav && isMobile && !keyboardVisible;
  const bottomNavHeight = 68;
  const totalBottomPadding = showBottomNavSpace ? bottomNavHeight + safeAreaBottom : 16;
  
  return (
    <div
      className={cn(
        'w-full',
        fullHeight ? 'h-full' : 'min-h-full',
        noScroll ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
        'scroll-smooth',
        className
      )}
      data-testid={testId}
      role="main"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full',
          maxWidthClasses[maxWidth],
          centered && 'mx-auto',
          isMobile ? 'px-3 py-3' : isTablet ? 'px-4 py-4' : 'px-6 py-5',
          isMobile && 'pt-safe',
          contentClassName
        )}
        style={{ paddingBottom: `${totalBottomPadding}px` }}
      >
        {children}
      </div>
    </div>
  );
}

interface MobileSectionProps {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
  'data-testid'?: string;
}

export function MobileSection({
  children,
  title,
  description,
  className,
  'data-testid': testId,
}: MobileSectionProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  return (
    <section
      className={cn(
        isMobile ? 'mb-4' : isTablet ? 'mb-5' : 'mb-6',
        className
      )}
      data-testid={testId}
    >
      {(title || description) && (
        <div className={cn('mb-3', isMobile ? 'mb-2' : 'mb-4')}>
          {title && (
            <h2 className={cn(
              'font-semibold text-foreground',
              isMobile ? 'text-lg' : 'text-xl'
            )}>
              {title}
            </h2>
          )}
          {description && (
            <p className={cn(
              'text-muted-foreground mt-1',
              isMobile ? 'text-sm' : 'text-base'
            )}>
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  cols?: {
    mobile?: 1 | 2;
    tablet?: 2 | 3;
    desktop?: 3 | 4 | 5 | 6;
  };
  gap?: 'sm' | 'md' | 'lg';
  'data-testid'?: string;
}

const gapClasses = {
  sm: 'gap-2 md:gap-3',
  md: 'gap-3 md:gap-4',
  lg: 'gap-4 md:gap-6',
};

export function ResponsiveGrid({
  children,
  className,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 'md',
  'data-testid': testId,
}: ResponsiveGridProps) {
  const mobileCol = cols.mobile || 1;
  const tabletCol = cols.tablet || 2;
  const desktopCol = cols.desktop || 3;
  
  const gridColsClass = cn(
    mobileCol === 1 ? 'grid-cols-1' : 'grid-cols-2',
    tabletCol === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3',
    desktopCol === 3 ? 'lg:grid-cols-3' : 
    desktopCol === 4 ? 'lg:grid-cols-4' : 
    desktopCol === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-6'
  );
  
  return (
    <div
      className={cn('grid', gridColsClass, gapClasses[gap], className)}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

interface ResponsiveStackProps {
  children: ReactNode;
  className?: string;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  'data-testid'?: string;
}

const stackGapClasses = {
  xs: 'space-y-1 md:space-y-2',
  sm: 'space-y-2 md:space-y-3',
  md: 'space-y-3 md:space-y-4',
  lg: 'space-y-4 md:space-y-6',
};

export function ResponsiveStack({
  children,
  className,
  gap = 'md',
  'data-testid': testId,
}: ResponsiveStackProps) {
  return (
    <div className={cn('flex flex-col', stackGapClasses[gap], className)} data-testid={testId}>
      {children}
    </div>
  );
}

interface MobileCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  'data-testid'?: string;
}

export function MobileCard({
  children,
  className,
  onClick,
  interactive = false,
  'data-testid': testId,
}: MobileCardProps) {
  const isMobile = useIsMobile();
  
  const Component = onClick || interactive ? 'button' : 'div';
  
  return (
    <Component
      className={cn(
        'w-full rounded-lg border border-border bg-card text-card-foreground',
        isMobile ? 'p-3' : 'p-4',
        (onClick || interactive) && 'hover-elevate active-elevate-2 cursor-pointer text-left',
        (onClick || interactive) && 'min-h-[44px]',
        className
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Component>
  );
}
