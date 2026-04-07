import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getPositionById, getFeaturePermissions, type FeaturePermissions } from "@shared/positionRegistry";
import type { Capability } from "@/lib/sidebarModules";

export type WorkspaceRole = 
  | 'org_owner' 
  | 'co_owner' 
  | 'org_admin'
  | 'manager'
  | 'department_manager' 
  | 'supervisor' 
  | 'employee'
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

export type PlatformRole = 
  | 'root_admin' 
  | 'deputy_admin' 
  | 'sysop' 
  | 'support_manager' 
  | 'support_agent' 
  | 'compliance_officer' 
  | 'none';

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
  employeePosition?: string;
}

const PERMISSION_TO_CAPABILITY: Record<string, Capability[]> = {
  edit_org_settings: ['manage_workspace'],
  manage_billing: ['manage_invoices', 'view_invoices'],
  add_remove_users: ['manage_employees'],
  edit_all_schedules: ['manage_schedules'],
  edit_own_schedule: ['view_schedules'],
  view_all_reports: ['view_reports', 'advanced_analytics'],
  submit_reports: ['view_reports'],
  cad_full_access: ['manage_schedules'],
  edit_clients: ['manage_clients'],
  view_clients: ['view_reports'],
  payroll_access: ['view_payroll', 'process_payroll'],
  qb_integration: ['manage_integrations'],
  manage_employees: ['manage_employees'],
  view_analytics: ['advanced_analytics'],
  manage_compliance: ['view_audit_logs'],
  manage_equipment: ['manage_schedules'],
};

function deriveCapabilitiesFromPosition(positionId: string | undefined): Capability[] {
  if (!positionId) return [];
  const perms = getFeaturePermissions(positionId);
  const caps = new Set<Capability>();
  for (const [permKey, capList] of Object.entries(PERMISSION_TO_CAPABILITY)) {
    if (perms[permKey as keyof FeaturePermissions]) {
      capList.forEach(c => caps.add(c));
    }
  }
  return Array.from(caps);
}

export function useWorkspaceAccess() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const userPlatformRole = (user?.platformRole as PlatformRole) || 'none';
  const isPlatformStaffFromAuth = PLATFORM_STAFF_ROLES.includes(userPlatformRole);
  
  const { data, isLoading: accessLoading, error } = useQuery<WorkspaceAccess>({
    queryKey: ['/api/workspace/access'],
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && isAuthenticated,
    retry: 2,
    retryDelay: 500,
  });

  const employeePosition = data?.employeePosition || (user as any)?.position as string | undefined;
  const positionCapabilities = deriveCapabilitiesFromPosition(employeePosition);

  return {
    workspaceRole: data?.workspaceRole || 'staff',
    subscriptionTier: data?.subscriptionTier || 'free',
    platformRole: data?.platformRole || userPlatformRole,
    isPlatformStaff: data?.isPlatformStaff ?? isPlatformStaffFromAuth,
    workspaceId: data?.workspaceId,
    isLoading: authLoading || (isAuthenticated && accessLoading),
    error,
    employeePosition,
    positionCapabilities,
  };
}
