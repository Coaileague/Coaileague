/**
 * Workflow Approval Page - AutoForce™
 * 99% AI, 1% Human Governance approval system
 * 
 * RBAC: owner, admin, manager, accountant, hr_manager roles
 * 
 * Approves:
 * - AI Scheduling™ AI-generated schedules (schedule_proposals)
 * - Billing Platform Auto-generated invoices
 * - OperationsOS™ Auto-generated payroll
 * 
 * Features:
 * - Multi-level approval chains
 * - Confidence-based auto-approval thresholds
 * - Audit trail tracking
 * - Delegation system
 */

import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWorkflowProposals } from '@/hooks/useWorkflowProposals';
import { useWorkflowPermissions } from '@/hooks/useWorkflowPermissions';
import type { ProposalType } from '@/hooks/useWorkflowProposals';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LockedFeature } from '@/components/LockedFeature';
import { 
  CheckCircle, XCircle, Clock, Calendar, DollarSign, Users, 
  Bot, AlertTriangle, Sparkles, Shield
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
  
  // Use shared hooks for data and permissions
  const {
    schedules,
    invoices,
    payroll,
    isLoadingSchedules,
    isLoadingInvoices,
    isLoadingPayroll,
    scheduleStats,
    invoiceStats,
    payrollStats,
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
  const recentSchedules = schedules.filter(p => p.status !== 'pending').slice(0, 10);
  
  const pendingInvoices = invoices.filter(p => p.status === 'pending');
  const recentInvoices = invoices.filter(p => p.status !== 'pending').slice(0, 10);
  
  const pendingPayroll = payroll.filter(p => p.status === 'pending');
  const recentPayroll = payroll.filter(p => p.status !== 'pending').slice(0, 10);

  // RBAC Check - Use centralized permissions hook
  if (!permissions.canViewApprovals) {
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
        <p className="text-gray-600">
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
            <div className="text-3xl font-bold" data-testid="text-pending-count">{totalStats?.pending || 0}</div>
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
            <div className="text-3xl font-bold text-green-600" data-testid="text-approved-count">{totalStats?.approved || 0}</div>
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
            <div className="text-3xl font-bold text-destructive" data-testid="text-rejected-count">{totalStats?.rejected || 0}</div>
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
            <div className="text-3xl font-bold text-blue-600" data-testid="text-auto-approved-count">{totalStats?.autoApproved || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
        <TabsList className={`${isMobile ? 'w-full' : ''}`}>
          <TabsTrigger value="schedules" className="flex-1" data-testid="tab-schedules">
            <Calendar className="w-4 h-4 mr-2" />
            AI Scheduling™
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1" data-testid="tab-invoices">
            <DollarSign className="w-4 h-4 mr-2" />
            Billing Platform
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex-1" data-testid="tab-payroll">
            <Users className="w-4 h-4 mr-2" />
            AI Payroll™
          </TabsTrigger>
        </TabsList>

        {/* AI Scheduling™ Proposals */}
        <TabsContent value="schedules" className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            {isLoadingSchedules ? (
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
                        <p className="text-sm text-gray-700">{proposal.aiResponse.summary}</p>
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
                              <span className="text-gray-700">
                                {assignment.shifts.length} shifts • {assignment.totalHours}h
                              </span>
                            </div>
                          ))}
                          {proposal.aiResponse.assignments.length > 3 && (
                            <p className="text-xs text-gray-600 text-center">
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

        {/* Billing Platform Invoice Proposals */}
        <TabsContent value="invoices" className="flex-1 flex flex-col">
          {permissions.lockedFeatures.invoiceAutomation ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <LockedFeature
                featureName="Invoice Automation"
                description="Unlock AI-powered invoice generation with automated billing cycles, client notifications, and Stripe integration."
                requiredTier="Professional"
                price="$99/mo"
              />
            </div>
          ) : (
          <ScrollArea className="flex-1">
            {isLoadingInvoices ? (
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
                        <p className="text-sm text-gray-700">{proposal.aiResponse?.summary || 'No summary available'}</p>
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
                          disabled={!permissions.canApproveInvoices}
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
          )}
        </TabsContent>

        {/* OperationsOS™ Payroll Proposals */}
        <TabsContent value="payroll" className="flex-1 flex flex-col">
          {permissions.lockedFeatures.payrollAutomation ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <LockedFeature
                featureName="Payroll Automation"
                description="Unlock AI-powered payroll processing with automated calculations, compliance checks, and Gusto integration."
                requiredTier="Professional"
                price="$99/mo"
              />
            </div>
          ) : (
          <ScrollArea className="flex-1">
            {isLoadingPayroll ? (
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
                        <p className="text-sm text-gray-700">{proposal.aiResponse?.summary || 'No summary available'}</p>
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
                          disabled={!permissions.canApprovePayroll}
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
          )}
        </TabsContent>
      </Tabs>

      {/* Approval Dialog */}
      {isMobile ? (
        <Sheet open={showApprovalSheet} onOpenChange={setShowApprovalSheet}>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader>
              <SheetTitle>Review Proposal</SheetTitle>
              <SheetDescription>
                {approvalAction === 'approve' ? 'Approve this AI-generated workflow' : 'Reject and provide feedback'}
              </SheetDescription>
            </SheetHeader>
            
            {approvalAction === 'reject' && (
              <div className="py-4 space-y-2">
                <Label htmlFor="rejection-reason-mobile">Reason for Rejection</Label>
                <Textarea
                  id="rejection-reason-mobile"
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
            
            <SheetFooter className="mt-auto space-y-2">
              <Button
                variant="outline"
                onClick={() => setShowApprovalSheet(false)}
                className="w-full"
                data-testid="button-cancel-approval"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmApproval}
                disabled={isApproving || (approvalAction === 'reject' && !rejectionReason.trim())}
                className={`w-full ${approvalAction === 'approve' 
                  ? 'bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]'
                  : ''}`}
                variant={approvalAction === 'reject' ? 'destructive' : 'default'}
                data-testid="button-confirm-approval"
              >
                {isApproving ? (
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
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={showApprovalSheet} onOpenChange={setShowApprovalSheet}>
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
              onClick={() => setShowApprovalSheet(false)}
              data-testid="button-cancel-approval"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApproval}
              disabled={isApproving || (approvalAction === 'reject' && !rejectionReason.trim())}
              className={approvalAction === 'approve' 
                ? 'bg-gradient-to-r from-[#3b82f6] to-[#22d3ee] hover:from-[#2563eb] hover:to-[#06b6d4]'
                : ''
              }
              variant={approvalAction === 'reject' ? 'destructive' : 'default'}
              data-testid="button-confirm-approval"
            >
              {isApproving ? (
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
      )}
    </div>
  );
}
