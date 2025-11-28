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

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';

interface MobilePageWrapperProps {
  children: ReactNode;
  
  /** Page title for accessibility */
  title?: string;
  
  /** Show bottom navigation spacing */
  hasBottomNav?: boolean;
  
  /** Custom className for the wrapper */
  className?: string;
  
  /** Custom className for the content container */
  contentClassName?: string;
  
  /** Use full height (100vh) layout */
  fullHeight?: boolean;
  
  /** Disable scroll */
  noScroll?: boolean;
  
  /** Max width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  
  /** Center content horizontally */
  centered?: boolean;
  
  /** Test ID for automated testing */
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
  const { isMobile, isTablet, keyboardVisible, safeAreaBottom } = useMobile();
  
  // Calculate bottom padding for navigation
  const bottomPadding = hasBottomNav && isMobile && !keyboardVisible 
    ? 'pb-20' // 80px for bottom nav
    : 'pb-4';
  
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
          // Responsive padding
          isMobile ? 'px-3 py-3' : isTablet ? 'px-4 py-4' : 'px-6 py-5',
          bottomPadding,
          // Safe area for notched devices
          isMobile && 'pt-safe',
          contentClassName
        )}
        style={{
          paddingBottom: safeAreaBottom > 0 && hasBottomNav 
            ? `calc(5rem + ${safeAreaBottom}px)` 
            : undefined
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * MobileSection - Consistent section spacing for mobile
 */
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
  const { isMobile, isTablet } = useMobile();
  
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

/**
 * ResponsiveGrid - Grid that adapts to screen size
 */
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

/**
 * ResponsiveStack - Vertical stack with responsive spacing
 */
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

/**
 * MobileCard - Touch-friendly card component
 */
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
  const { isMobile } = useMobile();
  
  const Component = onClick || interactive ? 'button' : 'div';
  
  return (
    <Component
      className={cn(
        'w-full rounded-lg border border-border bg-card text-card-foreground',
        isMobile ? 'p-3' : 'p-4',
        (onClick || interactive) && 'tap hover-elevate active-elevate-2 cursor-pointer text-left',
        className
      )}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Component>
  );
}
