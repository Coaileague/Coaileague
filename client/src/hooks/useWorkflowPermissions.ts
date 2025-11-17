/**
 * Centralized RBAC + Tier Gating for Workflow Approvals
 * Prevents privilege escalation and enforces tier requirements
 */

import { useMemo } from 'react';
import { useEmployee } from './useEmployee';
import { useQuery } from '@tanstack/react-query';

interface Workspace {
  id: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
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
  const { employee } = useEmployee();
  
  // Fetch workspace to get tier
  const { data: workspace } = useQuery<Workspace>({
    queryKey: ['/api/workspace/current'],
  });

  const tier = workspace?.tier || 'free';
  const workspaceRole = employee?.workspaceRole || null;

  const capabilities = useMemo<WorkflowCapabilities>(() => {
    // View permission: All authenticated workspace members can VIEW approvals
    const canView = !!workspaceRole;
    
    // Approve permission: Only managers, accountants, and HR can APPROVE workflows
    const canApprove = 
      workspaceRole === 'org_owner' || 
      workspaceRole === 'org_admin' || 
      workspaceRole === 'manager' ||
      workspaceRole === 'accountant' ||
      workspaceRole === 'hr_manager';

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
