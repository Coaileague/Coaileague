import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export type WorkspaceRole = 
  | 'org_owner' 
  | 'org_admin' 
  | 'department_manager' 
  | 'supervisor' 
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

export type PlatformRole = 
  | 'root_admin' 
  | 'deputy_admin' 
  | 'sysop' 
  | 'support_manager' 
  | 'support_agent' 
  | 'compliance_officer' 
  | 'none';

// Platform staff roles that grant access to Trinity Command Center and admin tools
const PLATFORM_STAFF_ROLES: PlatformRole[] = [
  'root_admin',
  'deputy_admin', 
  'sysop',
  'support_manager',
  'support_agent',
  'compliance_officer'
];

export interface WorkspaceAccess {
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  subscriptionTier: SubscriptionTier;
  platformRole?: PlatformRole;
  isPlatformStaff: boolean;
}

/**
 * Hook to fetch current workspace access context
 * Returns role, tier, and platform staff status
 * 
 * IMPORTANT: This hook waits for auth to be ready before making the API call
 * to avoid race conditions where the session cookie isn't yet available.
 */
export function useWorkspaceAccess() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  // Derive platform staff status from user's platform role immediately
  // This provides faster UI rendering while the full workspace access loads
  const userPlatformRole = (user?.platformRole as PlatformRole) || 'none';
  const isPlatformStaffFromAuth = PLATFORM_STAFF_ROLES.includes(userPlatformRole);
  
  const { data, isLoading: accessLoading, error } = useQuery<WorkspaceAccess>({
    queryKey: ['/api/workspace/access'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    // Only run this query when auth is loaded and user is authenticated
    enabled: !authLoading && isAuthenticated,
    // Retry a few times in case of transient session issues
    retry: 2,
    retryDelay: 500,
  });

  // Use API data if available, otherwise fallback to auth-derived values
  return {
    workspaceRole: data?.workspaceRole || 'staff',
    subscriptionTier: data?.subscriptionTier || 'free',
    // Use platform role from API if available, otherwise from auth
    platformRole: data?.platformRole || userPlatformRole,
    // Use platform staff from API if available, otherwise derive from auth
    isPlatformStaff: data?.isPlatformStaff ?? isPlatformStaffFromAuth,
    workspaceId: data?.workspaceId,
    // Loading if either auth or access is loading
    isLoading: authLoading || (isAuthenticated && accessLoading),
    error,
  };
}
