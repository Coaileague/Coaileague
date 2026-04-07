import { createContext, useContext, useMemo, ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * UniversalLoadingGate - SINGLE SOURCE OF TRUTH for loading visibility
 * 
 * All loading systems (ProtectedRoute, OverlayController, CoAIleagueLoader, etc.)
 * check this gate before rendering any loading overlay.
 * 
 * If we're on a public route, isLoadingBlocked = true
 * ALL loading components must respect this and skip rendering.
 */

interface UniversalLoadingGateContextValue {
  isLoadingBlocked: boolean;
  currentPath: string;
}

const UniversalLoadingGateContext = createContext<UniversalLoadingGateContextValue | null>(null);

const PUBLIC_ROUTES = new Set([
  "/",
  "/homepage",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/pricing",
  "/trinity-features",
  "/contact",
  "/support",
  "/terms",
  "/privacy",
  "/helpdesk",
  "/chat",
  "/chatrooms",
  "/mobile-chat",
  "/live-chat",
  "/helpdesk5",
  "/support/chat",
  "/logo-showcase",
  "/error-403",
  "/error-404",
  "/error-500",
]);

export function UniversalLoadingGateProvider({ children }: { children: ReactNode }) {
  // Use wouter's useLocation to properly react to route changes
  const [location] = useLocation();
  
  // Also track via window.location for SSR safety and initial render
  const [currentPath, setCurrentPath] = useState(() => 
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  
  // Sync with wouter location changes
  useEffect(() => {
    setCurrentPath(location);
  }, [location]);
  
  // Check if current route is public
  const isPublicRoute = PUBLIC_ROUTES.has(currentPath) || 
                        currentPath.startsWith("/onboarding/") ||
                        currentPath.startsWith("/pay-invoice/");
  
  const value = useMemo(() => ({
    isLoadingBlocked: isPublicRoute,
    currentPath,
  }), [isPublicRoute, currentPath]);

  return (
    <UniversalLoadingGateContext.Provider value={value}>
      {children}
    </UniversalLoadingGateContext.Provider>
  );
}

export function useUniversalLoadingGate() {
  const context = useContext(UniversalLoadingGateContext);
  if (!context) {
    throw new Error('useUniversalLoadingGate must be used within UniversalLoadingGateProvider');
  }
  return context;
}
