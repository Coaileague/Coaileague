import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/**
 * Simple mobile detection hook (backward compatibility)
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    // Initialize immediately from window.innerWidth to avoid flash
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
 * Advanced Mobile/Responsive Context
 */
interface MobileContextValue {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  isTouchDevice: boolean;
  hasHover: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isPWA: boolean;
  canInstallPWA: boolean;
  promptPWAInstall: () => void;
}

const MobileContext = createContext<MobileContextValue | undefined>(undefined);

export function ResponsiveAppFrame({ children }: { children: ReactNode }) {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const isMobile = screenWidth < MOBILE_BREAKPOINT;
  const isTablet = screenWidth >= MOBILE_BREAKPOINT && screenWidth < TABLET_BREAKPOINT;
  const isDesktop = screenWidth >= TABLET_BREAKPOINT;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasHover = window.matchMedia('(hover: hover)').matches;

  const isPortrait = screenHeight > screenWidth;
  const isLandscape = screenWidth > screenHeight;

  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);

  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://');

  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const promptPWAInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`CoAIleague PWA install: ${outcome}`);
    setDeferredPrompt(null);
  };

  const value: MobileContextValue = {
    isMobile,
    isTablet,
    isDesktop,
    screenWidth,
    screenHeight,
    isTouchDevice,
    hasHover,
    isPortrait,
    isLandscape,
    isIOS,
    isAndroid,
    isPWA,
    canInstallPWA: !!deferredPrompt,
    promptPWAInstall,
  };

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
