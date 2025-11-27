/**
 * Universal Page Wrapper Component
 * =================================
 * All pages MUST use this wrapper to ensure consistent:
 * - RBAC permission checking
 * - Branding from central config
 * - Loading states
 * - Error boundaries
 * - Layout consistency
 * 
 * Usage:
 * <UniversalPage
 *   title="Dashboard"
 *   permission="view:dashboard"
 *   requireAuth={true}
 * >
 *   <YourPageContent />
 * </UniversalPage>
 */

import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PLATFORM, PERMISSIONS, hasPermission, MESSAGES } from "@shared/platformConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, Home } from "lucide-react";
import { useLocation } from "wouter";

interface UniversalPageProps {
  children: ReactNode;
  title?: string;
  description?: string;
  permission?: string;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requirePlatformAdmin?: boolean;
  showBranding?: boolean;
  loading?: boolean;
  loadingMessage?: string;
  className?: string;
  fullWidth?: boolean;
  noPadding?: boolean;
}

export function UniversalPage({
  children,
  title,
  description,
  permission,
  requireAuth = true,
  requireAdmin = false,
  requirePlatformAdmin = false,
  showBranding = false,
  loading = false,
  loadingMessage,
  className = "",
  fullWidth = false,
  noPadding = false,
}: UniversalPageProps) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // Show loading while checking auth
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Check authentication
  if (requireAuth && !isAuthenticated) {
    return (
      <AccessDenied
        type="auth"
        message="Please log in to access this page."
        onAction={() => navigate("/login")}
        actionLabel="Go to Login"
      />
    );
  }

  // Check permission
  if (permission && user) {
    const userRole = user.role || "employee";
    if (!hasPermission(userRole, permission)) {
      return (
        <AccessDenied
          type="permission"
          message={MESSAGES.errors.unauthorized}
          onAction={() => navigate("/dashboard")}
          actionLabel="Go to Dashboard"
        />
      );
    }
  }

  // Check admin requirement
  if (requireAdmin && user) {
    const adminRoles = ["admin", "owner", "root_admin", "platform_admin"];
    if (!adminRoles.includes(user.role || "")) {
      return (
        <AccessDenied
          type="permission"
          message="This page requires administrator access."
          onAction={() => navigate("/dashboard")}
          actionLabel="Go to Dashboard"
        />
      );
    }
  }

  // Check platform admin requirement
  if (requirePlatformAdmin && user) {
    const platformRoles = ["root_admin", "platform_admin"];
    if (!platformRoles.includes(user.role || "")) {
      return (
        <AccessDenied
          type="permission"
          message="This page requires platform administrator access."
          onAction={() => navigate("/dashboard")}
          actionLabel="Go to Dashboard"
        />
      );
    }
  }

  // Show loading state
  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className={`min-h-full ${fullWidth ? "" : "container mx-auto"} ${noPadding ? "" : "p-4 md:p-6"} ${className}`}>
      {/* Page Header */}
      {(title || showBranding) && (
        <div className="mb-6">
          {showBranding && (
            <div className="flex items-center gap-2 mb-2">
              <img src="/logo.svg" alt={PLATFORM.name} className="h-8 w-8" />
              <span className="text-sm font-medium text-muted-foreground">
                {PLATFORM.name}
              </span>
            </div>
          )}
          {title && (
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="page-title">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-muted-foreground mt-1" data-testid="page-description">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Page Content */}
      <div data-testid="page-content">
        {children}
      </div>
    </div>
  );
}

// Access Denied Component
interface AccessDeniedProps {
  type: "auth" | "permission";
  message: string;
  onAction: () => void;
  actionLabel: string;
}

function AccessDenied({ type, message, onAction, actionLabel }: AccessDeniedProps) {
  const Icon = type === "auth" ? Lock : AlertTriangle;
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Icon className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">
            {type === "auth" ? "Authentication Required" : "Access Denied"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message}</p>
          <Button onClick={onAction} data-testid="button-access-action">
            <Home className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Export permission constants for convenience
export { PERMISSIONS } from "@shared/platformConfig";
