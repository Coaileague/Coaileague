import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

// Routes that are PUBLIC and should NEVER show loading screens
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

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  // Check if on public route - NEVER show loading screen for public routes
  const isPublicRoute = PUBLIC_ROUTES.has(window.location.pathname) || 
                        window.location.pathname.startsWith("/onboarding/") ||
                        window.location.pathname.startsWith("/pay-invoice/");

  useEffect(() => {
    // Only redirect if not on a public route
    if (!isPublicRoute && !isLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isAuthenticated, isLoading, isPublicRoute]);

  // CRITICAL: Never show loading spinner for public routes - render children immediately
  if (isLoading && !isPublicRoute) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  // If not authenticated and not public route, show nothing (will redirect via useEffect)
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
