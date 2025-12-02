/**
 * Universal Mobile Handler Hook
 * 
 * Automatically handles:
 * - Dynamic viewport-aware scaling
 * - Text size adjustments based on screen size
 * - Border/padding adjustments for small screens
 * - Safe area handling for notches/home indicators
 * - Touch target optimization
 * 
 * This hook should be used at the app root level to provide
 * global mobile responsiveness without per-component configuration.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { MOBILE_CONFIG } from '@/config/mobileConfig';

export interface MobileState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
  fontScale: number;
  spacingScale: number;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  breakpoint: 'mobile' | 'small' | 'tablet' | 'desktop' | 'wide' | 'ultrawide';
}

export interface MobileStyles {
  fontSize: string;
  padding: string;
  gap: string;
  borderRadius: string;
  maxWidth: string;
}

const CSS_VAR_PREFIX = '--mobile-handler';

export function useUniversalMobileHandler() {
  const [state, setState] = useState<MobileState>(() => getInitialState());

  // Calculate font scale based on screen width
  const calculateFontScale = useCallback((width: number): number => {
    const { breakpoints } = MOBILE_CONFIG;
    
    if (width < breakpoints.mobile) {
      return 0.85; // Very small screens
    } else if (width < breakpoints.small) {
      return 0.9;
    } else if (width < breakpoints.tablet) {
      return 0.95;
    } else if (width < breakpoints.desktop) {
      return 1.0;
    } else {
      return 1.0;
    }
  }, []);

  // Calculate spacing scale for margins/padding
  const calculateSpacingScale = useCallback((width: number): number => {
    const { breakpoints } = MOBILE_CONFIG;
    
    if (width < breakpoints.mobile) {
      return 0.6;
    } else if (width < breakpoints.small) {
      return 0.75;
    } else if (width < breakpoints.tablet) {
      return 0.85;
    } else {
      return 1.0;
    }
  }, []);

  // Get current breakpoint name
  const getBreakpoint = useCallback((width: number): MobileState['breakpoint'] => {
    const { breakpoints } = MOBILE_CONFIG;
    
    if (width < breakpoints.small) return 'mobile';
    if (width < breakpoints.tablet) return 'small';
    if (width < breakpoints.desktop) return 'tablet';
    if (width < breakpoints.wide) return 'desktop';
    if (width < breakpoints.ultrawide) return 'wide';
    return 'ultrawide';
  }, []);

  // Get safe area insets
  const getSafeAreaInsets = useCallback(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    return {
      top: parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0') || 0,
      bottom: parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0') || 0,
      left: parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0') || 0,
      right: parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0') || 0,
    };
  }, []);

  // Apply CSS custom properties to document
  const applyCSSVariables = useCallback((newState: MobileState) => {
    const root = document.documentElement;
    
    // Font scaling
    root.style.setProperty(`${CSS_VAR_PREFIX}-font-scale`, String(newState.fontScale));
    root.style.setProperty(`${CSS_VAR_PREFIX}-spacing-scale`, String(newState.spacingScale));
    
    // Breakpoint flag classes
    root.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
    if (newState.isMobile) {
      root.classList.add('mobile-view');
    } else if (newState.isTablet) {
      root.classList.add('tablet-view');
    } else {
      root.classList.add('desktop-view');
    }
    
    // Orientation
    root.classList.remove('portrait', 'landscape');
    root.classList.add(newState.orientation);
    
    // Dynamic base font size for rem units
    const baseFontSize = 16 * newState.fontScale;
    root.style.setProperty(`${CSS_VAR_PREFIX}-base-font`, `${baseFontSize}px`);
    
    // Dynamic spacing
    const baseSpacing = MOBILE_CONFIG.spacing.md * newState.spacingScale;
    root.style.setProperty(`${CSS_VAR_PREFIX}-spacing`, `${baseSpacing}px`);
    
    // Safe area insets
    root.style.setProperty(`${CSS_VAR_PREFIX}-safe-top`, `${newState.safeAreaInsets.top}px`);
    root.style.setProperty(`${CSS_VAR_PREFIX}-safe-bottom`, `${newState.safeAreaInsets.bottom}px`);
    root.style.setProperty(`${CSS_VAR_PREFIX}-safe-left`, `${newState.safeAreaInsets.left}px`);
    root.style.setProperty(`${CSS_VAR_PREFIX}-safe-right`, `${newState.safeAreaInsets.right}px`);
    
    // Touch target adjustment
    const touchTarget = newState.isMobile ? MOBILE_CONFIG.touchTargets.minHeight : 36;
    root.style.setProperty(`${CSS_VAR_PREFIX}-touch-target`, `${touchTarget}px`);
    
    // Max content width
    root.style.setProperty(`${CSS_VAR_PREFIX}-max-width`, getMaxWidth(newState.breakpoint));
    
    // Container padding
    const containerPadding = getContainerPadding(newState.breakpoint);
    root.style.setProperty(`${CSS_VAR_PREFIX}-container-padding`, `${containerPadding}px`);
  }, []);

  // Update state on resize/orientation change
  useEffect(() => {
    const updateState = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const { breakpoints } = MOBILE_CONFIG;
      
      const newState: MobileState = {
        isMobile: width < breakpoints.tablet,
        isTablet: width >= breakpoints.tablet && width < breakpoints.desktop,
        isDesktop: width >= breakpoints.desktop,
        screenWidth: width,
        screenHeight: height,
        orientation: height > width ? 'portrait' : 'landscape',
        fontScale: calculateFontScale(width),
        spacingScale: calculateSpacingScale(width),
        safeAreaInsets: getSafeAreaInsets(),
        breakpoint: getBreakpoint(width),
      };
      
      setState(newState);
      applyCSSVariables(newState);
    };

    // Initial update
    updateState();

    // Listen for resize and orientation changes
    window.addEventListener('resize', updateState);
    window.addEventListener('orientationchange', updateState);
    
    // Also listen for viewport meta changes (zoom)
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', updateState);

    return () => {
      window.removeEventListener('resize', updateState);
      window.removeEventListener('orientationchange', updateState);
      mediaQuery.removeEventListener('change', updateState);
    };
  }, [calculateFontScale, calculateSpacingScale, getBreakpoint, getSafeAreaInsets, applyCSSVariables]);

  // Computed styles based on current state
  const styles = useMemo<MobileStyles>(() => ({
    fontSize: `calc(1rem * var(${CSS_VAR_PREFIX}-font-scale, 1))`,
    padding: `var(${CSS_VAR_PREFIX}-container-padding, 16px)`,
    gap: `calc(${MOBILE_CONFIG.spacing.md}px * var(${CSS_VAR_PREFIX}-spacing-scale, 1))`,
    borderRadius: state.isMobile ? '8px' : '12px',
    maxWidth: `var(${CSS_VAR_PREFIX}-max-width, 100%)`,
  }), [state.isMobile]);

  // Utility to get responsive value
  const getResponsiveValue = useCallback(<T,>(mobile: T, tablet: T, desktop: T): T => {
    if (state.isMobile) return mobile;
    if (state.isTablet) return tablet;
    return desktop;
  }, [state.isMobile, state.isTablet]);

  // Inject global CSS for mobile optimizations
  useEffect(() => {
    const styleId = 'universal-mobile-handler-styles';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      /* Universal Mobile Handler - Auto-injected styles */
      
      /* Base scaling */
      html {
        font-size: var(${CSS_VAR_PREFIX}-base-font, 16px);
      }
      
      /* Mobile-specific adjustments */
      .mobile-view {
        /* Prevent horizontal overflow */
        overflow-x: hidden;
      }
      
      .mobile-view * {
        /* Ensure text doesn't overflow containers */
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      /* Responsive text sizing */
      .mobile-view h1 { font-size: ${MOBILE_CONFIG.typography.h1Mobile}px !important; }
      .mobile-view h2 { font-size: ${MOBILE_CONFIG.typography.h2Mobile}px !important; }
      .mobile-view h3 { font-size: ${MOBILE_CONFIG.typography.h3Mobile}px !important; }
      .mobile-view p, .mobile-view span, .mobile-view div { 
        font-size: max(${MOBILE_CONFIG.typography.bodyMobile}px, inherit); 
      }
      
      .tablet-view h1 { font-size: ${MOBILE_CONFIG.typography.h1Tablet}px; }
      .tablet-view h2 { font-size: ${MOBILE_CONFIG.typography.h2Tablet}px; }
      .tablet-view h3 { font-size: ${MOBILE_CONFIG.typography.h3Tablet}px; }
      
      /* Touch target optimization */
      .mobile-view button,
      .mobile-view [role="button"],
      .mobile-view input,
      .mobile-view select,
      .mobile-view a {
        min-height: var(${CSS_VAR_PREFIX}-touch-target, 44px);
        min-width: var(${CSS_VAR_PREFIX}-touch-target, 44px);
      }
      
      /* Safe area padding */
      .mobile-safe-area {
        padding-top: var(${CSS_VAR_PREFIX}-safe-top, 0);
        padding-bottom: var(${CSS_VAR_PREFIX}-safe-bottom, 0);
        padding-left: var(${CSS_VAR_PREFIX}-safe-left, 0);
        padding-right: var(${CSS_VAR_PREFIX}-safe-right, 0);
      }
      
      /* Responsive containers */
      .mobile-container {
        max-width: var(${CSS_VAR_PREFIX}-max-width, 100%);
        padding-left: var(${CSS_VAR_PREFIX}-container-padding, 16px);
        padding-right: var(${CSS_VAR_PREFIX}-container-padding, 16px);
        margin: 0 auto;
      }
      
      /* Border radius scaling */
      .mobile-view .rounded-lg { border-radius: 8px !important; }
      .mobile-view .rounded-xl { border-radius: 10px !important; }
      .mobile-view .rounded-2xl { border-radius: 12px !important; }
      
      /* Scrollable containers on mobile */
      .mobile-view .overflow-hidden {
        overflow: visible;
      }
      
      .mobile-view .mobile-scroll-x {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      /* Grid adjustments */
      .mobile-view .grid {
        grid-template-columns: repeat(${MOBILE_CONFIG.grid.columnsMobile}, 1fr) !important;
      }
      
      @media (min-width: ${MOBILE_CONFIG.breakpoints.small}px) {
        .mobile-view .grid {
          grid-template-columns: repeat(${MOBILE_CONFIG.grid.columnsSmall}, 1fr) !important;
        }
      }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `;

    return () => {
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, []);

  return {
    ...state,
    styles,
    getResponsiveValue,
    cssVarPrefix: CSS_VAR_PREFIX,
  };
}

// Helper functions
function getInitialState(): MobileState {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const height = typeof window !== 'undefined' ? window.innerHeight : 768;
  const { breakpoints } = MOBILE_CONFIG;
  
  return {
    isMobile: width < breakpoints.tablet,
    isTablet: width >= breakpoints.tablet && width < breakpoints.desktop,
    isDesktop: width >= breakpoints.desktop,
    screenWidth: width,
    screenHeight: height,
    orientation: height > width ? 'portrait' : 'landscape',
    fontScale: 1,
    spacingScale: 1,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    breakpoint: 'desktop',
  };
}

function getMaxWidth(breakpoint: MobileState['breakpoint']): string {
  const { maxWidth } = MOBILE_CONFIG.containers;
  switch (breakpoint) {
    case 'mobile':
    case 'small':
      return maxWidth.mobile;
    case 'tablet':
      return maxWidth.tablet;
    case 'desktop':
      return maxWidth.desktop;
    default:
      return maxWidth.wide;
  }
}

function getContainerPadding(breakpoint: MobileState['breakpoint']): number {
  const { paddingMobile, paddingTablet, paddingDesktop } = MOBILE_CONFIG.containers;
  switch (breakpoint) {
    case 'mobile':
    case 'small':
      return paddingMobile;
    case 'tablet':
      return paddingTablet;
    default:
      return paddingDesktop;
  }
}

export default useUniversalMobileHandler;
