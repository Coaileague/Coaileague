import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIdentity } from "@/hooks/useIdentity";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LogOut,
  Settings,
  User,
  Building2,
  Shield,
  HelpCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MobileUserMenuProps {
  className?: string;
}

export function MobileUserMenu({ className }: MobileUserMenuProps) {
  const { user, isAuthenticated } = useAuth();
  const { externalId, employeeId, supportCode, orgId, workspaceRole: identityRole, platformRole: identityPlatformRole } = useIdentity();
  const { subscriptionTier, isPlatformStaff, workspaceRole: accessRole, platformRole: accessPlatformRole } = useWorkspaceAccess();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Cache last known roles to prevent flickering during refetches
  // Refs persist across renders and survive query revalidations
  const lastKnownWorkspaceRoleRef = useRef<string | null>(null);
  const lastKnownPlatformRoleRef = useRef<string | null>(null);
  const lastKnownIsPlatformStaffRef = useRef<boolean>(false);

  // Update cached roles whenever we get new data
  // CRITICAL: Cache both true AND false values to handle demotions correctly
  useEffect(() => {
    const currentWorkspaceRole = accessRole || identityRole;
    const currentPlatformRole = accessPlatformRole || identityPlatformRole;
    
    // Update workspace role cache if we have a value
    if (currentWorkspaceRole) {
      lastKnownWorkspaceRoleRef.current = currentWorkspaceRole;
    }
    
    // Update platform role cache if we have a value
    if (currentPlatformRole) {
      lastKnownPlatformRoleRef.current = currentPlatformRole;
    }
    
    // CRITICAL: Always update isPlatformStaff cache when we have a defined value
    // This ensures demotions (false) are captured, not just promotions (true)
    if (isPlatformStaff !== undefined) {
      lastKnownIsPlatformStaffRef.current = isPlatformStaff;
    }
  }, [accessRole, identityRole, accessPlatformRole, identityPlatformRole, isPlatformStaff]);

  if (!isAuthenticated || !user) {
    return null;
  }

  // Generate display values
  const displayName = user.firstName && user.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.email || "User";
  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user.email?.[0]?.toUpperCase() || "U";
  const displayExternalId = employeeId || supportCode || externalId;

  // Use current role data if available, otherwise use last known (cached) values
  // This prevents RBAC items from disappearing during query refetches
  // CRITICAL: Use nullish coalescing (??) for booleans to handle false correctly
  const effectiveWorkspaceRole = accessRole || identityRole || lastKnownWorkspaceRoleRef.current;
  const effectivePlatformRole = accessPlatformRole || identityPlatformRole || lastKnownPlatformRoleRef.current;
  const effectiveIsPlatformStaff = isPlatformStaff ?? lastKnownIsPlatformStaffRef.current;

  // RBAC-based menu filtering
  // Always use effective (cached if needed) roles for stable menu rendering
  const canAccessOrgSettings = 
    effectiveWorkspaceRole === 'org_owner' || 
    effectiveWorkspaceRole === 'org_admin' ||
    effectiveIsPlatformStaff;

  const canAccessPlatformSettings = 
    effectivePlatformRole === 'root_admin' ||
    effectivePlatformRole === 'deputy_admin' ||
    effectivePlatformRole === 'sysop';

  // Sign out handler
  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await apiRequest("POST", "/api/auth/logout");
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of AutoForce™",
      });
      setLocation("/auth/login");
    } catch (error) {
      toast({
        title: "Sign out failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={`w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md hover-elevate active-elevate-2 transition ${className || ""}`}
          data-testid="button-user-menu"
        >
          {initials}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] bg-white">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl font-bold text-gray-900">Account</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* User Info Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-600 truncate">{user.email}</p>
              </div>
            </div>

            {/* Identity Badges */}
            <div className="flex flex-wrap gap-1.5">
              {displayExternalId && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 border-blue-200 text-blue-700">
                  {displayExternalId}
                </Badge>
              )}
              {effectiveWorkspaceRole && effectiveWorkspaceRole !== 'staff' && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                  {effectiveWorkspaceRole.replace(/_/g, ' ')}
                </Badge>
              )}
              {orgId && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 border-blue-200 text-blue-700">
                  {orgId}
                </Badge>
              )}
              {subscriptionTier && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-gray-100 border-gray-300 text-gray-700">
                  {subscriptionTier.toUpperCase()}
                </Badge>
              )}
            </div>
          </div>

          <Separator className="bg-gray-200" />

          {/* Menu Items */}
          <div className="space-y-1">
            {/* Personal Settings */}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3 px-3 hover-elevate"
              onClick={() => {
                setOpen(false);
                setLocation("/settings");
              }}
              data-testid="button-settings"
            >
              <User className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">Personal Settings</span>
            </Button>

            {/* Organization Settings (RBAC gated) */}
            {canAccessOrgSettings && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-3 px-3 hover-elevate"
                onClick={() => {
                  setOpen(false);
                  setLocation("/settings/organization");
                }}
                data-testid="button-org-settings"
              >
                <Building2 className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Organization</span>
              </Button>
            )}

            {/* Platform Admin (RBAC gated) */}
            {canAccessPlatformSettings && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-3 px-3 hover-elevate"
                onClick={() => {
                  setOpen(false);
                  setLocation("/admin");
                }}
                data-testid="button-admin"
              >
                <Shield className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Platform Admin</span>
              </Button>
            )}

            {/* Help & Support */}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3 px-3 hover-elevate"
              onClick={() => {
                setOpen(false);
                setLocation("/support");
              }}
              data-testid="button-help"
            >
              <HelpCircle className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">Help & Support</span>
            </Button>
          </div>

          <Separator className="bg-gray-200" />

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-3 border-2 border-gray-300 hover-elevate"
            onClick={handleSignOut}
            disabled={isSigningOut}
            data-testid="button-sign-out"
          >
            <LogOut className="w-5 h-5 text-red-600" />
            <span className="text-sm font-medium text-red-600">
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
