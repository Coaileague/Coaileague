/**
 * Universal Navigation Hook
 * Use this in place of window.location for all navigation
 */

import { useLocation } from "wouter";
import { useCallback } from "react";
import { navConfig } from "@/config/navigationConfig";

export function useNavigation() {
  const [location, setLocation] = useLocation();

  const navigateTo = useCallback(
    (path: string, options?: { replace?: boolean }) => {
      if (options?.replace) {
        window.location.replace(path);
      } else {
        setLocation(path);
      }
    },
    [setLocation]
  );

  const navigateToDashboard = useCallback(() => {
    setLocation(navConfig.app.dashboard);
  }, [setLocation]);

  const navigateToLogin = useCallback(() => {
    window.location.href = navConfig.auth.login;
  }, []);

  const navigateToSettings = useCallback(() => {
    setLocation(navConfig.app.settings);
  }, [setLocation]);

  const navigateToNotFound = useCallback(() => {
    setLocation(navConfig.error.notFound);
  }, [setLocation]);

  const navigateToEmployees = useCallback(() => {
    setLocation(navConfig.app.employees);
  }, [setLocation]);

  const navigateToChat = useCallback(() => {
    setLocation(navConfig.app.chat);
  }, [setLocation]);

  const canNavigate = useCallback((path: string) => {
    return path === location ? false : true;
  }, [location]);

  return {
    navigateTo,
    navigateToDashboard,
    navigateToLogin,
    navigateToSettings,
    navigateToNotFound,
    navigateToEmployees,
    navigateToChat,
    canNavigate,
    currentLocation: location,
  };
}

/**
 * Hook for getting navigation config values
 */
export function useNavConfig() {
  return navConfig;
}
