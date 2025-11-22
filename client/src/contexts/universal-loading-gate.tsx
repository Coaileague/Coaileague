import { createContext, useContext, useMemo, ReactNode } from 'react';

/**
 * UniversalLoadingGate - SINGLE SOURCE OF TRUTH for loading visibility
 * 
 * All loading systems (ProtectedRoute, OverlayController, AutoForceLoader, etc.)
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
  "/login",
  "/register",
  "/pricing",
  "/contact",
  "/support",
  "/terms",
  "/privacy",
  "/chat",
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
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  
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
