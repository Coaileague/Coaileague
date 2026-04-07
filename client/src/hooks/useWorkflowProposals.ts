/**
 * Shared hook for fetching workflow proposals across mobile and desktop
 * Eliminates code duplication and ensures data sync
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ScheduleProposal {
  id: string;
  workspaceId: string;
  weekStartDate: string;
  weekEndDate: string;
  aiResponse: {
    assignments: Array<{
      employeeId: string;
      employeeName: string;
      shifts: Array<{
        day: string;
        startTime: string;
        endTime: string;
        position: string;
        clientId: string;
        location: string;
      }>;
      totalHours: number;
      reasoning: string;
    }>;
    confidence: number;
    summary: string;
    warnings: string[];
  };
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface InvoiceProposal {
  id: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  clientId: string | null;
  aiResponse: {
    lineItems: Array<{
      description: string;
      quantity: number;
      rate: number;
      amount: number;
    }>;
    summary: string;
    warnings?: string[];
    totalAmount: number;
  };
  confidence: number;
  totalAmount: string;
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface PayrollProposal {
  id: string;
  workspaceId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  aiResponse: {
    employeePayroll: Array<{
      employeeId: string;
      employeeName: string;
      hours: number;
      rate: number;
      grossPay: number;
      taxes: number;
      netPay: number;
    }>;
    summary: string;
    warnings?: string[];
  };
  confidence: number;
  totalPayrollCost: string;
  employeeCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  autoApproved: number;
}

type ProposalType = 'schedule' | 'invoice' | 'payroll';

export function useWorkflowProposals() {
  const { toast } = useToast();

  // Fetch schedule proposals
  const scheduleQuery = useQuery<ScheduleProposal[]>({
    queryKey: ['/api/scheduleos/proposals'],
  });
  
  // Fetch invoice proposals
  const invoiceQuery = useQuery<InvoiceProposal[]>({
    queryKey: ['/api/invoices/proposals'],
  });
  
  // Fetch payroll proposals
  const payrollQuery = useQuery<PayrollProposal[]>({
    queryKey: ['/api/payroll/proposals'],
  });

  // Approval mutation
  const approveMutation = useMutation({
    mutationFn: async ({ 
      id, 
      action, 
      reason, 
      type 
    }: { 
      id: string; 
      action: 'approve' | 'reject'; 
      reason?: string;
      type: ProposalType;
    }) => {
      const endpoint = type === 'schedule' ? '/api/scheduleos/proposals' : 
                       type === 'invoice' ? '/api/invoices/proposals' :
                       '/api/payroll/proposals';
      await apiRequest('PATCH', `${endpoint}/${id}/${action}`, reason ? { reason } : {});
    },
    onSuccess: (_, { action, type }) => {
      // Invalidate all proposal queries to sync across views
      queryClient.invalidateQueries({ queryKey: ['/api/scheduleos/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/proposals'] });
      
      toast({ 
        title: action === 'approve' ? 'Approved' : 'Rejected',
        description: `${type === 'schedule' ? 'Schedule' : type === 'invoice' ? 'Invoice' : 'Payroll'} workflow has been ${action}d`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process approval',
        variant: 'destructive',
      });
    },
  });

  // Compute stats
  const scheduleStats: ApprovalStats = {
    pending: scheduleQuery.data?.filter(p => p.status === 'pending').length || 0,
    approved: scheduleQuery.data?.filter(p => p.status === 'approved').length || 0,
    rejected: scheduleQuery.data?.filter(p => p.status === 'rejected').length || 0,
    autoApproved: scheduleQuery.data?.filter(p => p.status === 'auto_approved').length || 0,
  };

  const invoiceStats: ApprovalStats = {
    pending: invoiceQuery.data?.filter(p => p.status === 'pending').length || 0,
    approved: invoiceQuery.data?.filter(p => p.status === 'approved').length || 0,
    rejected: invoiceQuery.data?.filter(p => p.status === 'rejected').length || 0,
    autoApproved: invoiceQuery.data?.filter(p => p.status === 'auto_approved').length || 0,
  };

  const payrollStats: ApprovalStats = {
    pending: payrollQuery.data?.filter(p => p.status === 'pending').length || 0,
    approved: payrollQuery.data?.filter(p => p.status === 'approved').length || 0,
    rejected: payrollQuery.data?.filter(p => p.status === 'rejected').length || 0,
    autoApproved: payrollQuery.data?.filter(p => p.status === 'auto_approved').length || 0,
  };

  const totalStats: ApprovalStats = {
    pending: scheduleStats.pending + invoiceStats.pending + payrollStats.pending,
    approved: scheduleStats.approved + invoiceStats.approved + payrollStats.approved,
    rejected: scheduleStats.rejected + invoiceStats.rejected + payrollStats.rejected,
    autoApproved: scheduleStats.autoApproved + invoiceStats.autoApproved + payrollStats.autoApproved,
  };

  return {
    // Data
    schedules: scheduleQuery.data || [],
    invoices: invoiceQuery.data || [],
    payroll: payrollQuery.data || [],
    
    // Loading states
    isLoadingSchedules: scheduleQuery.isLoading,
    isLoadingInvoices: invoiceQuery.isLoading,
    isLoadingPayroll: payrollQuery.isLoading,
    isLoading: scheduleQuery.isLoading || invoiceQuery.isLoading || payrollQuery.isLoading,
    
    // Stats
    scheduleStats,
    invoiceStats,
    payrollStats,
    totalStats,
    
    // Actions
    approveProposal: approveMutation.mutate,
    isApproving: approveMutation.isPending,
  };
}

export type { ScheduleProposal, InvoiceProposal, PayrollProposal, ApprovalStats, ProposalType };
