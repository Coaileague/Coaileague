// Universal identity tracking for RBAC - ALL user types
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

interface IdentityResponse {
  // User type classification
  userType: 'employee' | 'support_agent' | 'client' | 'platform_admin' | 'guest';

  // External IDs for RBAC tracking (friendly format)
  externalId: string | null; // EMP-XXXX-00001, SUP-XXXX, CLI-XXXX-00001, ORG-XXXX
  employeeId: string | null; // EMP-XXXX-00001 (if employee)
  supportCode: string | null; // SUP-XXXX (if support agent)
  clientId: string | null; // CLI-XXXX-00001 (if client)
  orgId: string | null; // ORG-XXXX (organization)

  // State license info for regulated industries (e.g., security, healthcare)
  licenseNumber: string | null; // e.g., C11608501 for TX PSB
  licenseState: string | null; // e.g., TX, CA, FL
  licenseExpiry: string | null; // Expiration date
  licenseVerified: boolean; // Trinity AI verified
  licenseVerifiedAt: string | null; // Verification timestamp

  // Database IDs for support/admin visibility
  dbUserId: string | null;
  dbWorkspaceId: string | null;

  // Role information
  platformRole: string | null; // root_admin, deputy_admin, sysop, etc.
  workspaceRole: string | null; // org_owner, manager, staff, etc.

  // Full details (varies by type)
  details: any;
}

/**
 * Universal identity hook for RBAC tracking
 * Returns external IDs for all user types:
 * - Employees: EMP-XXXX-00001
 * - Support Staff: SUP-XXXX
 * - Clients: CLI-XXXX-00001
 * - Organizations: ORG-XXXX
 * 
 * CRITICAL for audit trails and access control
 */
export function useIdentity() {
  const { user, isAuthenticated } = useAuth();

  const { data, isLoading, error } = useQuery<IdentityResponse>({
    queryKey: ["/api/identity/me"],
    retry: false,
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    identity: data,
    isLoading,

    // External IDs for RBAC tracking (friendly format)
    externalId: data?.externalId, // Primary external ID (employee/support/client)
    employeeId: data?.employeeId, // EMP-XXXX-00001
    supportCode: data?.supportCode, // SUP-XXXX
    clientId: data?.clientId, // CLI-XXXX-00001
    orgId: data?.orgId, // ORG-XXXX

    // State license info for regulated industries
    licenseNumber: data?.licenseNumber, // e.g., C11608501 for TX PSB
    licenseState: data?.licenseState, // e.g., TX, CA, FL
    licenseExpiry: data?.licenseExpiry, // Expiration date
    licenseVerified: data?.licenseVerified || false, // Trinity AI verified
    licenseVerifiedAt: data?.licenseVerifiedAt, // Verification timestamp

    // Database IDs for support/admin visibility
    dbUserId: data?.dbUserId, // Actual user ID from database
    dbWorkspaceId: data?.dbWorkspaceId, // Actual workspace UUID

    // User classification
    userType: data?.userType || 'guest',
    isEmployee: data?.userType === 'employee',
    isSupportAgent: data?.userType === 'support_agent',
    isClient: data?.userType === 'client',
    isPlatformAdmin: data?.userType === 'platform_admin',

    // Roles
    platformRole: data?.platformRole,
    workspaceRole: data?.workspaceRole,
  };
}
