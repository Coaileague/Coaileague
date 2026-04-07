/**
 * Workflow Approval Page - CoAIleague
 * 99% AI, 1% Human Governance approval system
 */

import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWorkflowProposals, type ProposalType } from '@/hooks/useWorkflowProposals';
import { useWorkflowPermissions } from '@/hooks/useWorkflowPermissions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LockedFeature } from '@/components/LockedFeature';
import { 
  CheckCircle, XCircle, Clock, Bot, Shield
} from 'lucide-react';
import { 
  DsPageHeader, DsStatCard, DsTabBar, DsEmptyState, 
  DsSectionCard, DsBadge, DsPageWrapper, DsButton 
} from "@/components/ui/ds-components";
import { 
  UniversalModal, UniversalModalHeader, UniversalModalTitle, 
  UniversalModalContent, UniversalModalFooter 
} from '@/components/ui/universal-modal';

export default function WorkflowApprovals() {
  const isMobile = useIsMobile();
  
  const {
    schedules,
    invoices,
    payroll,
    isLoadingSchedules,
    isLoadingInvoices,
    isLoadingPayroll,
    totalStats,
    approveProposal,
    isApproving,
  } = useWorkflowProposals();
  
  const permissions = useWorkflowPermissions();
  
  const [selectedTab, setSelectedTab] = useState('schedules');
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [showApprovalSheet, setShowApprovalSheet] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [proposalType, setProposalType] = useState<ProposalType>('schedule');

  const handleApprove = (proposal: any, type: ProposalType) => {
    setSelectedProposal(proposal);
    setProposalType(type);
    setApprovalAction('approve');
    setShowApprovalSheet(true);
  };

  const handleReject = (proposal: any, type: ProposalType) => {
    setSelectedProposal(proposal);
    setProposalType(type);
    setApprovalAction('reject');
    setShowApprovalSheet(true);
  };

  const confirmApproval = () => {
    if (!selectedProposal || !approvalAction) return;
    
    approveProposal({
      id: selectedProposal.id,
      action: approvalAction,
      reason: approvalAction === 'reject' ? rejectionReason : undefined,
      type: proposalType,
    });
    
    setShowApprovalSheet(false);
    setSelectedProposal(null);
    setApprovalAction(null);
    setRejectionReason('');
  };

  const pendingSchedules = schedules.filter(p => p.status === 'pending');
  const pendingInvoices = invoices.filter(p => p.status === 'pending');
  const pendingPayroll = payroll.filter(p => p.status === 'pending');

  if (!permissions.canViewApprovals) {
    return (
      <DsPageWrapper>
        <div className="flex items-center justify-center h-[60vh]">
          <DsSectionCard title="Access Restricted">
            <div className="flex flex-col items-center text-center p-6 space-y-4">
              <Shield className="w-12 h-12 text-ds-danger" />
              <p className="text-ds-text-muted">
                You don't have permission to view workflow approvals.
                Contact your organization owner or admin for access.
              </p>
            </div>
          </DsSectionCard>
        </div>
      </DsPageWrapper>
    );
  }

  return (
    <DsPageWrapper>
      <DsPageHeader 
        title="Workflow Approvals"
        subtitle="99% AI, 1% Human Governance - Review and approve AI-generated workflows"
      />

      {/* Stats Cards */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-4 mb-6`}>
        <DsStatCard 
          label="Pending"
          value={totalStats?.pending || 0}
          icon={Clock}
          color="warning"
        />
        <DsStatCard 
          label="Approved"
          value={totalStats?.approved || 0}
          icon={CheckCircle}
          color="success"
        />
        <DsStatCard 
          label="Rejected"
          value={totalStats?.rejected || 0}
          icon={XCircle}
          color="danger"
        />
        <DsStatCard 
          label="Auto-Approved"
          value={totalStats?.autoApproved || 0}
          icon={Bot}
          color="info"
        />
      </div>

      <DsTabBar 
        tabs={[
          { id: 'schedules', label: 'AI Scheduling' },
          { id: 'invoices', label: 'Billing Platform' },
          { id: 'payroll', label: 'AI Payroll' }
        ]}
        activeTab={selectedTab}
        onTabChange={setSelectedTab}
        className="mb-6"
      />

      <div className="flex-1 overflow-auto">
        {selectedTab === 'schedules' && (
          <div className="space-y-4">
            {isLoadingSchedules ? (
              <div className="flex justify-center py-12"><Bot className="animate-pulse" /></div>
            ) : pendingSchedules.length === 0 ? (
              <DsEmptyState icon={CheckCircle} title="All caught up!" subtitle="No pending schedule approvals." />
            ) : (
              pendingSchedules.map(proposal => (
                <DsSectionCard 
                  key={proposal.id}
                  title={`Week of ${new Date(proposal.weekStartDate).toLocaleDateString()}`}
                  actions={
                    <DsBadge color={proposal.confidence >= 95 ? "success" : "danger"}>
                      {proposal.confidence}% Confidence
                    </DsBadge>
                  }
                >
                  <div className="space-y-4">
                    <div className="p-3 bg-ds-navy-light rounded-lg">
                      <p className="text-xs text-ds-text-muted uppercase mb-1">AI Summary</p>
                      <p className="text-sm">{proposal.aiResponse.summary}</p>
                    </div>
                    <div className="flex gap-2">
                      <DsButton variant="outline" size="sm" className="flex-1" onClick={() => handleReject(proposal, 'schedule')}>
                        <XCircle size={14} className="mr-2" /> Reject
                      </DsButton>
                      <DsButton variant="primary" size="sm" className="flex-1" onClick={() => handleApprove(proposal, 'schedule')}>
                        <CheckCircle size={14} className="mr-2" /> Approve
                      </DsButton>
                    </div>
                  </div>
                </DsSectionCard>
              ))
            )}
          </div>
        )}

        {selectedTab === 'invoices' && (
           permissions.lockedFeatures.invoiceAutomation ? (
            <div className="p-6">
              <LockedFeature featureName="Invoice Automation" description="Unlock AI-powered invoice generation." requiredTier="Professional" price="$99/mo" />
            </div>
           ) : (
            <div className="space-y-4">
              {isLoadingInvoices ? (
                <div className="flex justify-center py-12"><Bot className="animate-pulse" /></div>
              ) : pendingInvoices.length === 0 ? (
                <DsEmptyState icon={CheckCircle} title="All caught up!" subtitle="No pending invoice approvals." />
              ) : (
                pendingInvoices.map(proposal => (
                  <DsSectionCard key={proposal.id} title={`Invoice: ${new Date(proposal.periodStart).toLocaleDateString()} - ${new Date(proposal.periodEnd).toLocaleDateString()}`}>
                    <div className="flex justify-between items-center">
                       <span className="text-xl font-bold text-ds-gold">${proposal.totalAmount}</span>
                       <div className="flex gap-2">
                         <DsButton variant="outline" size="sm" onClick={() => handleReject(proposal, 'invoice')}>Reject</DsButton>
                         <DsButton variant="primary" size="sm" onClick={() => handleApprove(proposal, 'invoice')}>Approve</DsButton>
                       </div>
                    </div>
                  </DsSectionCard>
                ))
              )
            }
            </div>
           )
        )}

        {selectedTab === 'payroll' && (
           permissions.lockedFeatures.payrollAutomation ? (
            <div className="p-6">
              <LockedFeature featureName="Payroll Automation" description="Unlock AI-powered payroll calculations." requiredTier="Professional" price="$99/mo" />
            </div>
           ) : (
            <div className="space-y-4">
              {isLoadingPayroll ? (
                <div className="flex justify-center py-12"><Bot className="animate-pulse" /></div>
              ) : pendingPayroll.length === 0 ? (
                <DsEmptyState icon={CheckCircle} title="All caught up!" subtitle="No pending payroll approvals." />
              ) : (
                pendingPayroll.map(proposal => (
                  <DsSectionCard key={proposal.id} title={`Payroll: ${new Date(proposal.payPeriodStart).toLocaleDateString()} - ${new Date(proposal.payPeriodEnd).toLocaleDateString()}`}>
                    <div className="flex justify-between items-center">
                        <span className="text-xl font-bold text-ds-gold">${proposal.totalPayrollCost}</span>
                        <div className="flex gap-2">
                          <DsButton variant="outline" size="sm" onClick={() => handleReject(proposal, 'payroll')}>Reject</DsButton>
                          <DsButton variant="primary" size="sm" onClick={() => handleApprove(proposal, 'payroll')}>Approve</DsButton>
                        </div>
                    </div>
                  </DsSectionCard>
                ))
              )}
            </div>
           )
        )}
      </div>

      <UniversalModal open={showApprovalSheet} onOpenChange={setShowApprovalSheet}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>{approvalAction === 'approve' ? 'Confirm Approval' : 'Reject Proposal'}</UniversalModalTitle>
          </UniversalModalHeader>
          {approvalAction === 'reject' && (
            <div className="space-y-2 p-4">
              <Label>Reason for Rejection</Label>
              <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
            </div>
          )}
          <UniversalModalFooter>
             <DsButton variant="ghost" onClick={() => setShowApprovalSheet(false)}>Cancel</DsButton>
             <DsButton 
                variant={approvalAction === 'approve' ? 'primary' : 'danger'} 
                onClick={confirmApproval}
                disabled={isApproving}
             >
                {isApproving ? 'Processing...' : (approvalAction === 'approve' ? 'Confirm Approval' : 'Reject Proposal')}
             </DsButton>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </DsPageWrapper>
  );
}
