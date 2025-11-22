import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUniversalLoadingGate } from "@/contexts/universal-loading-gate";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isLoadingBlocked } = useUniversalLoadingGate();

  useEffect(() => {
    // Only redirect if not on a public route
    if (!isLoadingBlocked && !isLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isAuthenticated, isLoading, isLoadingBlocked]);

  // CRITICAL: UniversalLoadingGate blocks loading on public routes
  // Never show loading spinner if gate says no
  if (isLoading && !isLoadingBlocked) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  // If not authenticated and not public route, show nothing (will redirect via useEffect)
  if (!isAuthenticated && !isLoadingBlocked) {
    return null;
  }

  return <>{children}</>;
}
