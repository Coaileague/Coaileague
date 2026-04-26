import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTransition } from "@/contexts/transition-context";
import { useAuth } from "@/hooks/useAuth";

// Define public routes that should never show loading transition
const PUBLIC_ROUTES = ['/', '/login', '/register', '/pricing', '/contact', '/support', '/terms', '/privacy', '/chat'];

export function useRouteTransition() {
  const [location] = useLocation();
  const { showTransition, hideTransition } = useTransition();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    // Skip showing transition on initial mount/first render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    // Don't show transition on:
    // 1. Public routes
    // 2. While auth is still loading
    // 3. For unauthenticated users
    const isPublicRoute = PUBLIC_ROUTES.includes(location);
    if (isPublicRoute || authLoading || !isAuthenticated) {
      return;
    }

    // Show brief transition on route change for authenticated users on private pages only
    showTransition({
      status: "loading",
      message: "Loading page...",
      duration: 400,
      onComplete: hideTransition
    });
    // Note: showTransition and hideTransition are memoized with useCallback in TransitionProvider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isAuthenticated, authLoading]);
}

// Helper function for programmatic navigation with transition
export function useNavigateWithTransition() {
  const { showTransition } = useTransition();

  return (path: string, message?: string) => {
    showTransition({
      status: "loading",
      message: message || "Navigating...",
      duration: 300,
      onComplete: () => {
        window.location.href = path;
      }
    });
  };
}
