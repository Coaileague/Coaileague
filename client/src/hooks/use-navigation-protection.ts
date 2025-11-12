import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

interface NavigationProtectionOptions {
  /**
   * The route path that should be protected (e.g., '/premium-chat', '/chat', '/mobile-chat')
   */
  currentRoute: string;
  
  /**
   * Condition that determines if navigation should be blocked
   * Example: isConnected || messages.length > 0
   */
  shouldProtect: boolean;
  
  /**
   * Custom warning message shown to users
   */
  warningMessage?: string;
}

const DEFAULT_WARNING = 'You are currently connected to live chat support. Navigating away will disconnect you.\n\nAre you sure you want to leave?';
const DEFAULT_BEFOREUNLOAD_MESSAGE = 'You are currently in a chat session. Leaving will disconnect you from support. Are you sure?';

/**
 * Reusable hook to protect against accidental navigation from chat pages
 * 
 * Provides multi-layer protection:
 * - beforeunload: Warns on refresh/close/external navigation
 * - popstate: Warns on back button press
 * - useLocation: Warns on in-app route changes (sidebar clicks, Link clicks)
 * 
 * Usage:
 * ```tsx
 * const { isProtected } = useNavigationProtection({
 *   currentRoute: '/chat',
 *   shouldProtect: isConnected || messages.length > 0
 * });
 * ```
 */
export function useNavigationProtection({
  currentRoute,
  shouldProtect,
  warningMessage = DEFAULT_WARNING
}: NavigationProtectionOptions) {
  const [location, setLocation] = useLocation();
  const [shouldWarnOnNavigation, setShouldWarnOnNavigation] = useState(false);
  const currentLocationRef = useRef(location);

  // Track if we should warn on navigation
  useEffect(() => {
    setShouldWarnOnNavigation(shouldProtect);
  }, [shouldProtect]);

  // LAYER 1: Warn before page unload (refresh, close tab, external navigation)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldWarnOnNavigation) {
        e.preventDefault();
        e.returnValue = DEFAULT_BEFOREUNLOAD_MESSAGE;
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldWarnOnNavigation]);

  // LAYER 2: Prevent accidental back button navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (shouldWarnOnNavigation) {
        const shouldLeave = window.confirm(warningMessage);
        if (!shouldLeave) {
          e.preventDefault();
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Push state ONCE on mount to enable popstate detection (avoid history pollution)
    window.history.pushState(null, '', window.location.href);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [shouldWarnOnNavigation, warningMessage]);

  // LAYER 3: Intercept in-app navigation attempts (Wouter route changes, sidebar links)
  useEffect(() => {
    if (location !== currentLocationRef.current) {
      // Location changed
      if (shouldWarnOnNavigation && location !== currentRoute) {
        const shouldLeave = window.confirm(warningMessage);
        if (!shouldLeave) {
          // Prevent navigation by restoring previous location
          setLocation(currentLocationRef.current);
        } else {
          // Allow navigation - update ref
          currentLocationRef.current = location;
        }
      } else {
        // No warning needed or user stayed on protected page
        currentLocationRef.current = location;
      }
    }
  }, [location, shouldWarnOnNavigation, currentRoute, warningMessage, setLocation]);

  return {
    isProtected: shouldWarnOnNavigation,
  };
}
