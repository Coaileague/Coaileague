import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { MOBILE_CONFIG } from '@/config/mobileConfig';

const MOBILE_BREAKPOINT = MOBILE_CONFIG.breakpoints.tablet; // 768
const TABLET_BREAKPOINT = MOBILE_CONFIG.breakpoints.desktop; // 1024
const SMALL_MOBILE_BREAKPOINT = MOBILE_CONFIG.breakpoints.small; // 480

/**
 * Simple mobile detection hook (backward compatibility)
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/**
 * Advanced Mobile/Responsive Context with comprehensive device detection
 */
interface MobileContextValue {
  // Screen size breakpoints
  isMobile: boolean;           // < 768px
  isTablet: boolean;           // 768-1024px
  isDesktop: boolean;          // >= 1024px
  isSmallMobile: boolean;      // < 480px (very small phones)
  isLargeMobile: boolean;      // 480-768px (larger phones, small tablets)
  
  // Screen dimensions
  screenWidth: number;
  screenHeight: number;
  
  // Device capabilities
  isTouchDevice: boolean;
  hasHover: boolean;
  hasCoarsePointer: boolean;   // Touch-based pointer
  hasFinePointer: boolean;     // Mouse/trackpad
  
  // Orientation
  isPortrait: boolean;
  isLandscape: boolean;
  
  // Platform detection
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  
  // PWA detection
  isPWA: boolean;
  canInstallPWA: boolean;
  promptPWAInstall: () => void;
  
  // Safe areas (for notched devices)
  safeAreaTop: number;
  safeAreaBottom: number;
  
  // Responsive utilities
  getResponsiveValue: <T>(mobile: T, tablet: T, desktop: T) => T;
  getBreakpoint: () => 'mobile' | 'tablet' | 'desktop';
  
  // Viewport info
  viewportHeight: number;  // Visual viewport height (accounts for keyboard)
  keyboardVisible: boolean;
}

const MobileContext = createContext<MobileContextValue | undefined>(undefined);

export function ResponsiveAppFrame({ children }: { children: ReactNode }) {
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [screenHeight, setScreenHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 768);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 768);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [safeAreaTop, setSafeAreaTop] = useState(0);
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);

  // Breakpoint calculations
  const isMobile = screenWidth < MOBILE_BREAKPOINT;
  const isTablet = screenWidth >= MOBILE_BREAKPOINT && screenWidth < TABLET_BREAKPOINT;
  const isDesktop = screenWidth >= TABLET_BREAKPOINT;
  const isSmallMobile = screenWidth < SMALL_MOBILE_BREAKPOINT;
  const isLargeMobile = screenWidth >= SMALL_MOBILE_BREAKPOINT && screenWidth < MOBILE_BREAKPOINT;

  // Device capabilities
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const hasHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
  const hasCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const hasFinePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

  // Orientation
  const isPortrait = screenHeight > screenWidth;
  const isLandscape = screenWidth > screenHeight;

  // Platform detection
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  const isChrome = /chrome/.test(userAgent) && !/edge/.test(userAgent);

  // PWA detection
  const isPWA = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );

  // Handle resize with debouncing
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let orientationTimeoutId: NodeJS.Timeout;
    
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setScreenWidth(window.innerWidth);
        setScreenHeight(window.innerHeight);
      }, 100);
    };

    const handleOrientationChange = () => {
      clearTimeout(orientationTimeoutId);
      orientationTimeoutId = setTimeout(() => {
        setScreenWidth(window.innerWidth);
        setScreenHeight(window.innerHeight);
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      clearTimeout(timeoutId);
      clearTimeout(orientationTimeoutId);
    };
  }, []);

  // Visual viewport handling (for keyboard detection)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'visualViewport' in window && window.visualViewport) {
      const vv = window.visualViewport;
      
      const handleViewportChange = () => {
        const newHeight = vv.height;
        setViewportHeight(newHeight);
        
        // Keyboard is visible if viewport height is significantly less than screen height
        const heightDiff = screenHeight - newHeight;
        setKeyboardVisible(heightDiff > 150);
      };
      
      vv.addEventListener('resize', handleViewportChange);
      vv.addEventListener('scroll', handleViewportChange);
      
      return () => {
        vv.removeEventListener('resize', handleViewportChange);
        vv.removeEventListener('scroll', handleViewportChange);
      };
    }
  }, [screenHeight]);

  // Safe area insets (for notched devices)
  useEffect(() => {
    if (typeof window !== 'undefined' && CSS.supports('padding-top: env(safe-area-inset-top)')) {
      const testEl = document.createElement('div');
      testEl.style.paddingTop = 'env(safe-area-inset-top)';
      testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
      document.body.appendChild(testEl);
      
      const computed = getComputedStyle(testEl);
      setSafeAreaTop(parseInt(computed.paddingTop) || 0);
      setSafeAreaBottom(parseInt(computed.paddingBottom) || 0);
      
      document.body.removeChild(testEl);
    }
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const promptPWAInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Responsive value helper
  const getResponsiveValue = useCallback(<T,>(mobile: T, tablet: T, desktop: T): T => {
    if (isDesktop) return desktop;
    if (isTablet) return tablet;
    return mobile;
  }, [isDesktop, isTablet]);

  // Get current breakpoint
  const getBreakpoint = useCallback((): 'mobile' | 'tablet' | 'desktop' => {
    if (isDesktop) return 'desktop';
    if (isTablet) return 'tablet';
    return 'mobile';
  }, [isDesktop, isTablet]);

  const value = useMemo<MobileContextValue>(() => ({
    isMobile,
    isTablet,
    isDesktop,
    isSmallMobile,
    isLargeMobile,
    screenWidth,
    screenHeight,
    isTouchDevice,
    hasHover,
    hasCoarsePointer,
    hasFinePointer,
    isPortrait,
    isLandscape,
    isIOS,
    isAndroid,
    isSafari,
    isChrome,
    isPWA,
    canInstallPWA: !!deferredPrompt,
    promptPWAInstall,
    safeAreaTop,
    safeAreaBottom,
    getResponsiveValue,
    getBreakpoint,
    viewportHeight,
    keyboardVisible,
  }), [
    isMobile, isTablet, isDesktop, isSmallMobile, isLargeMobile,
    screenWidth, screenHeight, isTouchDevice, hasHover, hasCoarsePointer, hasFinePointer,
    isPortrait, isLandscape, isIOS, isAndroid, isSafari, isChrome,
    isPWA, deferredPrompt, promptPWAInstall, safeAreaTop, safeAreaBottom,
    getResponsiveValue, getBreakpoint, viewportHeight, keyboardVisible
  ]);

  // Apply CSS custom properties for safe areas and viewport
  useEffect(() => {
    document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
    document.documentElement.style.setProperty('--screen-width', `${screenWidth}px`);
    document.documentElement.style.setProperty('--keyboard-visible', keyboardVisible ? '1' : '0');
  }, [viewportHeight, screenWidth, keyboardVisible]);

  return (
    <MobileContext.Provider value={value}>
      {children}
    </MobileContext.Provider>
  );
}

/**
 * Hook to access mobile/responsive context
 */
export function useMobile() {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error('useMobile must be used within ResponsiveAppFrame');
  }
  return context;
}

/**
 * Hook for responsive class names
 */
export function useResponsiveClasses() {
  const { isMobile, isTablet, isDesktop, isSmallMobile } = useMobile();
  
  return useMemo(() => ({
    // Container classes
    container: isMobile ? 'px-3' : isTablet ? 'px-4' : 'px-6',
    
    // Grid classes
    gridCols: isSmallMobile ? 'grid-cols-1' : isMobile ? 'grid-cols-1' : isTablet ? 'grid-cols-2' : 'grid-cols-3',
    gridColsCard: isSmallMobile ? 'grid-cols-1' : isMobile ? 'grid-cols-1' : isTablet ? 'grid-cols-2' : 'grid-cols-4',
    
    // Text classes
    heading: isMobile ? 'text-xl' : isTablet ? 'text-2xl' : 'text-3xl',
    subheading: isMobile ? 'text-base' : 'text-lg',
    body: isMobile ? 'text-sm' : 'text-base',
    
    // Spacing classes
    gap: isMobile ? 'gap-3' : isTablet ? 'gap-4' : 'gap-6',
    padding: isMobile ? 'p-3' : isTablet ? 'p-4' : 'p-6',
    margin: isMobile ? 'm-3' : isTablet ? 'm-4' : 'm-6',
    
    // Card classes
    cardPadding: isMobile ? 'p-3' : 'p-4',
    
    // Button sizes
    buttonSize: isMobile ? 'h-11' : 'h-9',
    
    // Hide/show utilities
    hideOnMobile: isMobile ? 'hidden' : '',
    showOnMobile: isMobile ? '' : 'hidden',
    hideOnTablet: isTablet ? 'hidden' : '',
    hideOnDesktop: isDesktop ? 'hidden' : '',
  }), [isMobile, isTablet, isDesktop, isSmallMobile]);
}
