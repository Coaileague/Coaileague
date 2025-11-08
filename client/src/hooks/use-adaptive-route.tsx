/**
 * useAdaptiveRoute Hook
 * Resolves the correct route based on device platform (mobile/tablet/desktop)
 * Used throughout AutoForce™ for intelligent routing
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMobile } from './use-mobile';
import type { DevicePlatform } from '@/data/quickActions';

/**
 * Get device platform category
 */
export function useDevicePlatform(): DevicePlatform {
  const { isMobile, isTablet } = useMobile();
  
  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

/**
 * Resolve platform-specific route
 * Maps features to appropriate mobile/desktop paths
 */
export function useAdaptiveRoute() {
  const platform = useDevicePlatform();
  const [, setLocation] = useLocation();
  
  /**
   * Resolve a feature to its platform-specific path
   */
  const resolve = useCallback((
    desktopPath: string,
    mobilePath?: string
  ): string => {
    // Mobile gets special mobile-optimized routes if available
    if (platform === 'mobile' && mobilePath) {
      return mobilePath;
    }
    
    // Tablet and desktop use desktop paths
    return desktopPath;
  }, [platform]);
  
  /**
   * Navigate to a platform-aware route
   */
  const navigate = useCallback((
    desktopPath: string,
    mobilePath?: string
  ) => {
    const resolvedPath = resolve(desktopPath, mobilePath);
    setLocation(resolvedPath);
  }, [resolve, setLocation]);
  
  /**
   * Handle hash anchor scrolling
   */
  const scrollToAnchor = useCallback((hash: string) => {
    // Remove the # if present
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    const element = document.getElementById(id);
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  
  return {
    platform,
    resolve,
    navigate,
    scrollToAnchor,
    isMobile: platform === 'mobile',
    isTablet: platform === 'tablet',
    isDesktop: platform === 'desktop'
  };
}

/**
 * Hook to track last visited dashboard route
 * Persists across sessions using sessionStorage
 */
export function useLastDashboardRoute() {
  const [lastRoute, setLastRoute] = useState<string>('/dashboard');
  
  useEffect(() => {
    // Load from session storage on mount
    const stored = sessionStorage.getItem('autoforce_last_dashboard');
    if (stored) {
      setLastRoute(stored);
    }
  }, []);
  
  const updateLastRoute = useCallback((route: string) => {
    setLastRoute(route);
    sessionStorage.setItem('autoforce_last_dashboard', route);
  }, []);
  
  const clearLastRoute = useCallback(() => {
    setLastRoute('/dashboard');
    sessionStorage.removeItem('autoforce_last_dashboard');
  }, []);
  
  return {
    lastRoute,
    updateLastRoute,
    clearLastRoute
  };
}

/**
 * Feature-specific route maps
 * Centralized routing logic for key AutoForce™ features
 */
export const FEATURE_ROUTES = {
  chat: {
    desktop: '/comm-os',
    mobile: '/private-messages',
    tablet: '/comm-os'
  },
  helpdesk: {
    desktop: '/chat',
    mobile: '/chat', // Already responsive
    tablet: '/chat'
  },
  dashboard: {
    desktop: '/dashboard',
    mobile: '/dashboard', // Already responsive
    tablet: '/dashboard'
  },
  rootDashboard: {
    desktop: '/root-admin-dashboard',
    mobile: '/root-admin-dashboard', // Already responsive
    tablet: '/root-admin-dashboard'
  },
  schedule: {
    desktop: '/schedule',
    mobile: '/schedule', // Already responsive
    tablet: '/schedule'
  },
  'time-tracking': {
    desktop: '/time-tracking',
    mobile: '/time-tracking', // Already responsive
    tablet: '/time-tracking'
  },
  settings: {
    desktop: '/settings',
    mobile: '/settings', // Already responsive
    tablet: '/settings'
  }
} as const;

/**
 * Valid feature identifiers for routing
 */
export type FeatureKey = keyof typeof FEATURE_ROUTES;

/**
 * Get platform-specific route for a feature
 */
export function getFeatureRoute(
  feature: FeatureKey,
  platform: DevicePlatform
): string {
  const routes = FEATURE_ROUTES[feature];
  return routes[platform] || routes.desktop;
}
