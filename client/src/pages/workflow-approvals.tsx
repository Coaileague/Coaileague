/**
 * Workflow Approval Page - AutoForce™
 * 99% AI, 1% Human Governance approval system
 * 
 * RBAC: owner, admin, manager, accountant, hr_manager roles
 * 
 * Approves:
 * - ScheduleOS™ AI-generated schedules (schedule_proposals)
 * - BillOS™ Auto-generated invoices
 * - OperationsOS™ Auto-generated payroll
 * 
 * Features:
 * - Multi-level approval chains
 * - Confidence-based auto-approval thresholds
 * - Audit trail tracking
 * - Delegation system
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEmployee } from '@/hooks/useEmployee';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  CheckCircle, XCircle, Clock, Calendar, DollarSign, Users, 
  Bot, AlertTriangle, FileText, ArrowRight, Sparkles, Shield
} from 'lucide-react';

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

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  autoApproved: number;
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

export default function WorkflowApprovals() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { employee } = useEmployee();
  
  const [selectedTab, setSelectedTab] = useState('schedules');
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [proposalType, setProposalType] = useState<'schedule' | 'invoice' | 'payroll'>('schedule');

  // Fetch proposals
  const { data: scheduleProposals = [], isLoading: loadingSchedules } = useQuery<ScheduleProposal[]>({
    queryKey: ['/api/scheduleos/proposals'],
  });
  
  const { data: invoiceProposals = [], isLoading: loadingInvoices } = useQuery<InvoiceProposal[]>({
    queryKey: ['/api/invoices/proposals'],
  });
  
  const { data: payrollProposals = [], isLoading: loadingPayroll } = useQuery<PayrollProposal[]>({
    queryKey: ['/api/payroll/proposals'],
  });

  // Compute stats per tab
  const scheduleStats: ApprovalStats = useMemo(() => {
    if (!scheduleProposals) return { pending: 0, approved: 0, rejected: 0, autoApproved: 0 };
    return {
      pending: scheduleProposals.filter(p => p.status === 'pending').length,
      approved: scheduleProposals.filter(p => p.status === 'approved').length,
      rejected: scheduleProposals.filter(p => p.status === 'rejected').length,
      autoApproved: scheduleProposals.filter(p => p.status === 'auto_approved').length,
    };
  }, [scheduleProposals]);
  
  const invoiceStats: ApprovalStats = useMemo(() => {
    if (!invoiceProposals) return { pending: 0, approved: 0, rejected: 0, autoApproved: 0 };
    return {
      pending: invoiceProposals.filter(p => p.status === 'pending').length,
      approved: invoiceProposals.filter(p => p.status === 'approved').length,
      rejected: invoiceProposals.filter(p => p.status === 'rejected').length,
      autoApproved: invoiceProposals.filter(p => p.status === 'auto_approved').length,
    };
  }, [invoiceProposals]);
  
  const payrollStats: ApprovalStats = useMemo(() => {
    if (!payrollProposals) return { pending: 0, approved: 0, rejected: 0, autoApproved: 0 };
    return {
      pending: payrollProposals.filter(p => p.status === 'pending').length,
      approved: payrollProposals.filter(p => p.status === 'approved').length,
      rejected: payrollProposals.filter(p => p.status === 'rejected').length,
      autoApproved: payrollProposals.filter(p => p.status === 'auto_approved').length,
    };
  }, [payrollProposals]);
  
  // Combined stats for cards
  const stats: ApprovalStats = useMemo(() => {
    return {
      pending: scheduleStats.pending + invoiceStats.pending + payrollStats.pending,
      approved: scheduleStats.approved + invoiceStats.approved + payrollStats.approved,
      rejected: scheduleStats.rejected + invoiceStats.rejected + payrollStats.rejected,
      autoApproved: scheduleStats.autoApproved + invoiceStats.autoApproved + payrollStats.autoApproved,
    };
  }, [scheduleStats, invoiceStats, payrollStats]);

  // Generic mutation for all proposal types
  const approveMutation = useMutation({
    mutationFn: async ({ id, action, reason, type }: { id: string; action: 'approve' | 'reject'; reason?: string; type: 'schedule' | 'invoice' | 'payroll' }) => {
      const endpoints = {
        schedule: `/api/scheduleos/proposals/${id}/${action}`,
        invoice: `/api/invoices/proposals/${id}/${action}`,
        payroll: `/api/payroll/proposals/${id}/${action}`,
      };
      return await apiRequest('PATCH', endpoints[type], { reason });
    },
    onSuccess: (_, variables) => {
      const queryKeys = {
        schedule: ['/api/scheduleos/proposals'],
        invoice: ['/api/invoices/proposals'],
        payroll: ['/api/payroll/proposals'],
      };
      queryClient.invalidateQueries({ queryKey: queryKeys[variables.type] });
      toast({
        title: approvalAction === 'approve' ? 'Proposal Approved' : 'Proposal Rejected',
        description: approvalAction === 'approve' 
          ? 'Changes will be applied automatically'
          : 'AI will generate a new proposal with your feedback',
      });
      setShowApprovalDialog(false);
      setSelectedProposal(null);
      setRejectionReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process approval',
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (proposal: any, type: 'schedule' | 'invoice' | 'payroll') => {
    setSelectedProposal(proposal);
    setProposalType(type);
    setApprovalAction('approve');
    setShowApprovalDialog(true);
  };

  const handleReject = (proposal: any, type: 'schedule' | 'invoice' | 'payroll') => {
    setSelectedProposal(proposal);
    setProposalType(type);
    setApprovalAction('reject');
    setShowApprovalDialog(true);
  };

  const confirmApproval = () => {
    if (!selectedProposal || !approvalAction) return;
    
    approveMutation.mutate({
      id: selectedProposal.id,
      action: approvalAction,
      reason: approvalAction === 'reject' ? rejectionReason : undefined,
      type: proposalType,
    });
  };

  const pendingSchedules = scheduleProposals.filter(p => p.status === 'pending');
  const recentSchedules = scheduleProposals.filter(p => p.status !== 'pending').slice(0, 10);
  
  const pendingInvoices = invoiceProposals.filter(p => p.status === 'pending');
  const recentInvoices = invoiceProposals.filter(p => p.status !== 'pending').slice(0, 10);
  
  const pendingPayroll = payrollProposals.filter(p => p.status === 'pending');
  const recentPayroll = payrollProposals.filter(p => p.status !== 'pending').slice(0, 10);

  // RBAC Check
  const canApprove = employee?.role === 'org_owner' || 
                     employee?.role === 'org_admin' || 
                     employee?.role === 'department_manager';

  if (!canApprove) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Access Restricted
            </CardTitle>
            <CardDescription>
              You don't have permission to view workflow approvals
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Contact your organization owner or admin for access to the approval dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col ${isMobile ? 'p-4' : 'p-6'}`}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-blue-500" />
          Workflow Approvals
        </h1>
        <p className="text-muted-foreground">
          99% AI, 1% Human Governance - Review and approve AI-generated workflows
        </p>
      </div>

      {/* Stats Cards */}
      <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-4 mb-6`}>
        <Card data-testid="card-stat-pending">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-pending-count">{stats?.pending || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-approved">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Approved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600" data-testid="text-approved-count">{stats?.approved || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-rejected">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              Rejected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive" data-testid="text-rejected-count">{stats?.rejected || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-auto-approved">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" />
              Auto-Approved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600" data-testid="text-auto-approved-count">{stats?.autoApproved || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
        <TabsList className={`${isMobile ? 'w-full' : ''}`}>
          <TabsTrigger value="schedules" className="flex-1" data-testid="tab-schedules">
            <Calendar className="w-4 h-4 mr-2" />
            ScheduleOS™
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1" data-testid="tab-invoices">
            <DollarSign className="w-4 h-4 mr-2" />
            BillOS™
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex-1" data-testid="tab-payroll">
            <Users className="w-4 h-4 mr-2" />
            PayrollOS™
          </TabsTrigger>
        </TabsList>

        {/* ScheduleOS™ Proposals */}
        <TabsContent value="schedules" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            {loadingSchedules ? (
              <div className="flex items-center justify-center py-12" data-testid="loading-schedules">
                <div className="text-center">
                  <Bot className="w-12 h-12 text-blue-500 animate-pulse mx-auto mb-3" />
                  <p className="text-muted-foreground">Loading proposals...</p>
                </div>
              </div>
            ) : pendingSchedules.length === 0 ? (
              <div className="flex items-center justify-center py-12" data-testid="empty-schedules">
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No pending approvals</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4">Pending Approvals ({pendingSchedules.length})</h2>
                
                {pendingSchedules.map((proposal) => (
                  <Card key={proposal.id} className="hover-elevate" data-testid={`card-proposal-${proposal.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-week-${proposal.id}`}>
                            <Calendar className="w-5 h-5" />
                            Week of {new Date(proposal.weekStartDate).toLocaleDateString()}
                          </CardTitle>
                          <CardDescription data-testid={`text-generated-${proposal.id}`}>
                            Generated {new Date(proposal.createdAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge 
                          variant={proposal.confidence >= 95 ? "default" : "destructive"}
                          className="flex items-center gap-1"
                          data-testid={`badge-confidence-${proposal.id}`}
                        >
                          <Bot className="w-3 h-3" />
                          {proposal.confidence}% Confidence
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* AI Summary */}
                      <div className="bg-muted/50 rounded-lg p-3" data-testid={`text-summary-${proposal.id}`}>
                        <p className="text-sm font-medium mb-1">AI Summary:</p>
                        <p className="text-sm text-muted-foreground">{proposal.aiResponse.summary}</p>
                      </div>

                      {/* Warnings */}
                      {proposal.aiResponse.warnings && proposal.aiResponse.warnings.length > 0 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-destructive mb-1">Warnings:</p>
                              <ul className="text-sm text-destructive/90 space-y-1">
                                {proposal.aiResponse.warnings.map((warning, i) => (
                                  <li key={i}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Assignments Summary */}
                      <div>
                        <p className="text-sm font-medium mb-2">
                          {proposal.aiResponse.assignments.length} Employees Assigned
                        </p>
                        <div className="space-y-2">
                          {proposal.aiResponse.assignments.slice(0, 3).map((assignment, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-muted/30 rounded p-2">
                              <span className="font-medium">{assignment.employeeName}</span>
                              <span className="text-muted-foreground">
                                {assignment.shifts.length} shifts • {assignment.totalHours}h
                              </span>
                            </div>
                          ))}
                          {proposal.aiResponse.assignments.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center">
                              +{proposal.aiResponse.assignments.length - 3} more employees
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleReject(proposal, 'schedule')}
                          variant="outline"
                          className="flex-1"
                          data-testid={`button-reject-${proposal.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => handleApprove(proposal, 'schedule')}
                          className="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                          data-testid={`button-approve-${proposal.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve & Deploy
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Recent History */}
                {recentSchedules.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-xl font-bold mb-4">Recent History</h2>
                    <div className="space-y-2">
                      {recentSchedules.map((proposal) => (
                        <Card key={proposal.id} className="bg-muted/30" data-testid={`card-history-${proposal.id}`}>
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium" data-testid={`text-history-week-${proposal.id}`}>
                                  Week of {new Date(proposal.weekStartDate).toLocaleDateString()}
                                </p>
                                <p className="text-xs text-muted-foreground" data-testid={`text-history-details-${proposal.id}`}>
                                  {proposal.aiResponse.assignments.length} employees • {proposal.confidence}% confidence
                                </p>
                              </div>
                              <Badge 
                                variant={
                                  proposal.status === 'approved' || proposal.status === 'auto_approved'
                                    ? 'default' 
                                    : 'destructive'
                                }
                                data-testid={`badge-status-${proposal.id}`}
                              >
                                {proposal.status === 'auto_approved' ? 'Auto-Approved' : proposal.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* BillOS™ Invoice Proposals */}
        <TabsContent value="invoices" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-12" data-testid="loading-invoices">
                <div className="text-center">
                  <Bot className="w-12 h-12 text-blue-500 animate-pulse mx-auto mb-3" />
                  <p className="text-muted-foreground">Loading invoice proposals...</p>
                </div>
              </div>
            ) : pendingInvoices.length === 0 ? (
              <div className="flex items-center justify-center py-12" data-testid="empty-invoices">
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No pending invoice approvals</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4">Pending Approvals ({pendingInvoices.length})</h2>
                {pendingInvoices.map((proposal) => (
                  <Card key={proposal.id} className="hover-elevate" data-testid={`card-invoice-${proposal.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-period-${proposal.id}`}>
                            <DollarSign className="w-5 h-5" />
                            {new Date(proposal.periodStart).toLocaleDateString()} - {new Date(proposal.periodEnd).toLocaleDateString()}
                          </CardTitle>
                          <CardDescription data-testid={`text-invoice-generated-${proposal.id}`}>
                            Generated {new Date(proposal.createdAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge 
                          variant={proposal.confidence >= 95 ? "default" : "destructive"}
                          className="flex items-center gap-1"
                          data-testid={`badge-invoice-confidence-${proposal.id}`}
                        >
                          <Bot className="w-3 h-3" />
                          {proposal.confidence}% Confidence
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/50 rounded-lg p-3" data-testid={`text-invoice-summary-${proposal.id}`}>
                        <p className="text-sm font-medium mb-1">AI Summary:</p>
                        <p className="text-sm text-muted-foreground">{proposal.aiResponse?.summary || 'No summary available'}</p>
                      </div>
                      {proposal.aiResponse?.warnings && proposal.aiResponse.warnings.length > 0 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-destructive mb-1">Warnings:</p>
                              <ul className="text-sm text-destructive/90 space-y-1">
                                {proposal.aiResponse.warnings.map((warning, i) => (
                                  <li key={i}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleReject(proposal, 'invoice')}
                          variant="outline"
                          className="flex-1"
                          data-testid={`button-invoice-reject-${proposal.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => handleApprove(proposal, 'invoice')}
                          className="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                          data-testid={`button-invoice-approve-${proposal.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve & Generate
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* OperationsOS™ Payroll Proposals */}
        <TabsContent value="payroll" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            {loadingPayroll ? (
              <div className="flex items-center justify-center py-12" data-testid="loading-payroll">
                <div className="text-center">
                  <Bot className="w-12 h-12 text-blue-500 animate-pulse mx-auto mb-3" />
                  <p className="text-muted-foreground">Loading payroll proposals...</p>
                </div>
              </div>
            ) : pendingPayroll.length === 0 ? (
              <div className="flex items-center justify-center py-12" data-testid="empty-payroll">
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No pending payroll approvals</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4">Pending Approvals ({pendingPayroll.length})</h2>
                {pendingPayroll.map((proposal) => (
                  <Card key={proposal.id} className="hover-elevate" data-testid={`card-payroll-${proposal.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-pay-period-${proposal.id}`}>
                            <Users className="w-5 h-5" />
                            {new Date(proposal.payPeriodStart).toLocaleDateString()} - {new Date(proposal.payPeriodEnd).toLocaleDateString()}
                          </CardTitle>
                          <CardDescription data-testid={`text-payroll-generated-${proposal.id}`}>
                            Generated {new Date(proposal.createdAt).toLocaleString()} • {proposal.employeeCount} employees
                          </CardDescription>
                        </div>
                        <Badge 
                          variant={proposal.confidence >= 95 ? "default" : "destructive"}
                          className="flex items-center gap-1"
                          data-testid={`badge-payroll-confidence-${proposal.id}`}
                        >
                          <Bot className="w-3 h-3" />
                          {proposal.confidence}% Confidence
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/50 rounded-lg p-3" data-testid={`text-payroll-summary-${proposal.id}`}>
                        <p className="text-sm font-medium mb-1">AI Summary:</p>
                        <p className="text-sm text-muted-foreground">{proposal.aiResponse?.summary || 'No summary available'}</p>
                      </div>
                      {proposal.aiResponse?.warnings && proposal.aiResponse.warnings.length > 0 && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-destructive mb-1">Warnings:</p>
                              <ul className="text-sm text-destructive/90 space-y-1">
                                {proposal.aiResponse.warnings.map((warning, i) => (
                                  <li key={i}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleReject(proposal, 'payroll')}
                          variant="outline"
                          className="flex-1"
                          data-testid={`button-payroll-reject-${proposal.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          onClick={() => handleApprove(proposal, 'payroll')}
                          className="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]"
                          data-testid={`button-payroll-approve-${proposal.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve & Process
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' 
                ? `Approve ${proposalType === 'schedule' ? 'Schedule' : proposalType === 'invoice' ? 'Invoice' : 'Payroll'}` 
                : `Reject ${proposalType === 'schedule' ? 'Schedule' : proposalType === 'invoice' ? 'Invoice' : 'Payroll'}`}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve'
                ? proposalType === 'schedule' 
                  ? 'This will create all shifts and notify employees'
                  : proposalType === 'invoice'
                  ? 'This will generate the invoice and send to client'
                  : 'This will process payroll for all employees'
                : 'AI will learn from your feedback and generate a new proposal'}
            </DialogDescription>
          </DialogHeader>

          {approvalAction === 'reject' && (
            <div className="py-4 space-y-2">
              <Label htmlFor="rejection-reason">Reason for Rejection</Label>
              <Textarea
                id="rejection-reason"
                placeholder="e.g., Too many hours for John, Sarah unavailable Friday..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                data-testid="textarea-rejection-reason"
              />
              <p className="text-xs text-muted-foreground">
                AI will use this feedback to improve the next proposal
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
              data-testid="button-cancel-approval"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApproval}
              disabled={approveMutation.isPending || (approvalAction === 'reject' && !rejectionReason.trim())}
              className={approvalAction === 'approve' 
                ? 'bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]'
                : ''
              }
              variant={approvalAction === 'reject' ? 'destructive' : 'default'}
              data-testid="button-confirm-approval"
            >
              {approveMutation.isPending ? (
                'Processing...'
              ) : (
                <>
                  {approvalAction === 'approve' ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Deploy
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
