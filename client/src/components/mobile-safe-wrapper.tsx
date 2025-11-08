import type { ReactNode } from 'react';

/**
 * MobileSafeWrapper - Ensures content doesn't overflow on mobile devices
 * Use this to wrap page content and prevent borders/text from going off-screen
 */

interface MobileSafeWrapperProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
}

export function MobileSafeWrapper({ 
  children, 
  className = '', 
  maxWidth = '7xl' 
}: MobileSafeWrapperProps) {
  const maxWidthClass = maxWidth === 'full' ? '' : `max-w-${maxWidth}`;
  
  return (
    <div className={`min-h-screen bg-background overflow-x-hidden w-full max-w-full ${className}`}>
      <div className={`mobile-safe-container ${maxWidthClass} mx-auto`}>
        {children}
      </div>
    </div>
  );
}
