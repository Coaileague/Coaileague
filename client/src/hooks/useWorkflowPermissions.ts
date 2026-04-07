/**
 * Centralized RBAC + Tier Gating for Workflow Approvals
 * Prevents privilege escalation and enforces tier requirements
 */

import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useEmployee } from './useEmployee';
import { useQuery } from '@tanstack/react-query';

interface Workspace {
  id: string;
  tier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
}

interface WorkflowCapabilities {
  canViewApprovals: boolean;
  canApproveSchedules: boolean;
  canApproveInvoices: boolean;
  canApprovePayroll: boolean;
  canAccessInvoiceTab: boolean;
  canAccessPayrollTab: boolean;
  workspaceRole: string | null;
  tier: string;
  lockedFeatures: {
    invoiceAutomation: boolean;
    payrollAutomation: boolean;
  };
}

/**
 * Hook to check workflow approval permissions
 * Combines workspaceRole (RBAC) + workspace tier (feature gating)
 */
export function useWorkflowPermissions(): WorkflowCapabilities {
  const { user } = useAuth();
  const { employee } = useEmployee();
  
  // Fetch workspace to get tier
  const { data: workspace } = useQuery<Workspace>({
    queryKey: ['/api/workspace/current'],
  });

  const tier = workspace?.tier || 'free';
  // SECURITY: Use server-authoritative user.workspaceRole for authorization
  const workspaceRole = user?.workspaceRole || null;

  const capabilities = useMemo<WorkflowCapabilities>(() => {
    // View permission: All authenticated workspace members can VIEW approvals
    const canView = !!workspaceRole;
    
    // Approve permission: Manager-level roles can APPROVE workflows
    const canApprove = 
      workspaceRole === 'org_owner' || 
      workspaceRole === 'co_owner' || 
      workspaceRole === 'admin' ||
      workspaceRole === 'org_manager' ||
      workspaceRole === 'manager' ||
      workspaceRole === 'department_manager' ||
      workspaceRole === 'supervisor';

    // Tier Gating: Professional+ required for invoices/payroll
    const hasProfessionalTier = tier === 'professional' || tier === 'enterprise';
    
    return {
      canViewApprovals: canView,  // All authenticated users can view
      canApproveSchedules: canApprove,
      canApproveInvoices: canApprove && hasProfessionalTier,
      canApprovePayroll: canApprove && hasProfessionalTier,
      canAccessInvoiceTab: hasProfessionalTier,
      canAccessPayrollTab: hasProfessionalTier,
      workspaceRole,
      tier,
      lockedFeatures: {
        invoiceAutomation: !hasProfessionalTier,
        payrollAutomation: !hasProfessionalTier,
      },
    };
  }, [workspaceRole, tier]);

  return capabilities;
}
