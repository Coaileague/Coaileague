import { useQuery } from "@tanstack/react-query";

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
 */
export function useWorkspaceAccess() {
  const { data, isLoading, error } = useQuery<WorkspaceAccess>({
    queryKey: ['/api/workspace/access'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    workspaceRole: data?.workspaceRole || 'staff',
    subscriptionTier: data?.subscriptionTier || 'free',
    platformRole: data?.platformRole || 'none',
    isPlatformStaff: data?.isPlatformStaff || false,
    workspaceId: data?.workspaceId,
    isLoading,
    error,
  };
}
