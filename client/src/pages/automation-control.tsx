import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Calendar,
  FileText,
  DollarSign,
  Shield,
  Zap,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Play,
  CreditCard,
  RotateCcw,
  XCircle,
  SkipForward,
  History,
  ChevronDown,
  ChevronRight,
  Pause,
  Pencil,
  Brain,
  ThumbsUp,
  ThumbsDown,
  ChevronUp,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format, subDays, addDays } from "date-fns";

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface AutomationStepState {
  name: string;
  label: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attemptCount: number;
}

interface AutomationCheckpoint {
  version: 1;
  feature: string;
  requestId: string;
  steps: AutomationStepState[];
  resumable: boolean;
  resumeFromStep?: string;
  partialResults: Record<string, any>;
}

interface AutomationHistoryItem {
  requestId: string;
  feature: string;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed' | 'partially_completed' | 'paused';
  summary: string;
  createdAt: string;
  executedAt?: string;
  approvedBy?: string;
  rejectedBy?: string;
  checkpoint?: AutomationCheckpoint | null;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
  revisedPayload?: Record<string, any> | null;
  revisionNotes?: string | null;
  revisionHistory?: Array<{ revisedBy: string; revisedAt: string; notes: string }>;
  trinityReanalysis?: string | null;
  trinityReanalysisAt?: string | null;
  preview?: any;
  details?: any;
}

interface AutomationStatus {
  scheduling: {
    enabled: boolean;
    lastRun: string | null;
    nextRun: string | null;
    successRate: number;
  };
  invoicing: {
    enabled: boolean;
    lastRun: string | null;
    nextRun: string | null;
    successRate: number;
  };
  payroll: {
    enabled: boolean;
    lastRun: string | null;
    nextRun: string | null;
    successRate: number;
  };
  compliance: {
    enabled: boolean;
    lastRun: string | null;
    issuesDetected: number;
  };
}

export default function AutomationControl() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedDateRange, setSelectedDateRange] = useState({
    start: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    end: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
  });

  // Fetch automation status
  const { data: status, isLoading: statusLoading } = useQuery<AutomationStatus>({
    queryKey: ['/api/automation/status'],
  });

  // Fetch credit balance
  const { data: credits } = useQuery<{ balance: number; tier: string }>({
    queryKey: ['/api/billing/credits'],
  });

  // AI Scheduling mutation
  const schedulingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/automation/schedule/generate', {
        startDate: new Date(selectedDateRange.start).toISOString(),
        endDate: new Date(selectedDateRange.end).toISOString(),
        requirements: 'Manual trigger from automation control panel',
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI Scheduling Complete",
        description: `Generated ${data.assignmentsCount || 0} shift assignments. Transaction ID: ${data.transactionId?.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      const isInsufficientCredits = error.message?.includes('402') || error.message?.includes('Insufficient credits');
      toast({
        title: isInsufficientCredits ? "Insufficient Credits" : "Scheduling Failed",
        description: isInsufficientCredits 
          ? "You need 25 credits to generate a schedule. Please purchase more credits."
          : error.message || "Failed to generate schedule",
        variant: "destructive",
      });
    },
  });

  // Invoice Generation mutation
  const invoicingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/automation/invoice/anchor-close', {
        anchorDate: new Date().toISOString(),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invoice Generation Complete",
        description: `Generated ${data.stats?.total ?? data.invoicesCount ?? data.invoices?.length ?? 0} invoices. Check your Stripe dashboard for details.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "Invoicing Failed",
        description: error.message || "Failed to generate invoices",
        variant: "destructive",
      });
    },
  });

  // Payroll Processing mutation
  const payrollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/automation/payroll/generate', {
        anchorDate: new Date().toISOString(),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payroll Processing Complete",
        description: `Processed payroll for ${data.employeesCount || 0} employees. Check Gusto for details.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "Payroll Failed",
        description: error.message || "Failed to process payroll",
        variant: "destructive",
      });
    },
  });

  // Compliance Monitoring mutation
  const complianceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/automation/compliance/scan', {});
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Compliance Scan Complete",
        description: `Found ${data.totalIssues || 0} issues (${data.summary?.critical || 0} critical). Review in dashboard.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "Compliance Scan Failed",
        description: error.message || "Failed to run compliance scan",
        variant: "destructive",
      });
    },
  });

  const isAnyAutomationRunning = schedulingMutation.isPending || invoicingMutation.isPending || payrollMutation.isPending || complianceMutation.isPending;

  // Fetch recent automation history
  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: AutomationHistoryItem[] }>({
    queryKey: ['/api/automation/trinity/history'],
    refetchInterval: 15000,
  });

  const history = historyData?.history ?? [];
  const recentHistory = history.slice(0, 10);

  // Resume automation mutation
  const resumeMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/automation/trinity/resume/${requestId}`, {});
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Automation Resumed",
        description: data.summary || "Automation resumed from checkpoint successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Resume Failed",
        description: error.message || "Failed to resume automation",
        variant: "destructive",
      });
    },
  });

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [reviseModalId, setReviseModalId] = useState<string | null>(null);
  const [revisePayloadText, setRevisePayloadText] = useState('');
  const [reviseNotes, setReviseNotes] = useState('');
  const [trinityAnalysisOpen, setTrinityAnalysisOpen] = useState<string | null>(null);

  const toggleExpanded = (requestId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/automation/trinity/approve/${requestId}`, {});
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Automation approved and queued for execution." });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
    },
    onError: (error: any) => {
      toast({ title: "Approval Failed", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/automation/trinity/reject/${requestId}`, { reason: 'Rejected via review queue' });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Automation request has been rejected." });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
    },
    onError: (error: any) => {
      toast({ title: "Rejection Failed", description: error.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const res = await apiRequest('POST', `/api/automation/trinity/pause/${requestId}`, { reason });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Paused", description: "Automation paused. Checkpoint saved. Resume when ready." });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
    },
    onError: (error: any) => {
      toast({ title: "Pause Failed", description: error.message, variant: "destructive" });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async ({ requestId, revisedPayload, notes }: { requestId: string; revisedPayload: Record<string, any>; notes: string }) => {
      const res = await apiRequest('PATCH', `/api/automation/trinity/revise/${requestId}`, { revisedPayload, notes });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Payload Revised", description: "Your changes have been staged. Approve to execute with revised data." });
      setReviseModalId(null);
      setRevisePayloadText('');
      setReviseNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
    },
    onError: (error: any) => {
      toast({ title: "Revision Failed", description: error.message, variant: "destructive" });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/automation/trinity/reanalyze/${requestId}`, {});
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Trinity Analysis Ready", description: "Re-analysis complete. Expand the item to view." });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/trinity/history'] });
      if (data.requestId) setTrinityAnalysisOpen(data.requestId);
    },
    onError: (error: any) => {
      toast({ title: "Analysis Failed", description: error.message, variant: "destructive" });
    },
  });

  const openReviseModal = (item: AutomationHistoryItem) => {
    const payload = item.revisedPayload || item.preview || item.checkpoint?.partialResults || {};
    setRevisePayloadText(JSON.stringify(payload, null, 2));
    setReviseNotes(item.revisionNotes || '');
    setReviseModalId(item.requestId);
  };

  const submitRevision = () => {
    if (!reviseModalId) return;
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(revisePayloadText);
    } catch {
      toast({ title: "Invalid JSON", description: "Please fix the JSON format before saving.", variant: "destructive" });
      return;
    }
    if (!reviseNotes.trim()) {
      toast({ title: "Notes Required", description: "Please add a note explaining what you changed.", variant: "destructive" });
      return;
    }
    reviseMutation.mutate({ requestId: reviseModalId, revisedPayload: parsed, notes: reviseNotes });
  };

  const pageConfig: CanvasPageConfig = {
    id: 'automation-control',
    title: 'Trinity™ Automation Control',
    subtitle: 'Manually trigger and monitor autonomous AI operations',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
          {/* Token Usage Alert */}
          {credits && credits.balance < 50 && (
            <Alert className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <strong>Token Usage Notice:</strong> Your AI token usage is elevated this period. Overages are billed automatically at $2.00/100K tokens.
                <button
                  className="text-amber-800 dark:text-amber-200 underline ml-2 cursor-pointer hover:text-amber-900 dark:hover:text-amber-100"
                  onClick={() => setLocation('/settings/billing')}
                  data-testid="button-upgrade-plan"
                >
                  Manage plan
                </button>
              </AlertDescription>
            </Alert>
          )}

          {/* Automation Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* AI Scheduling */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">AI Scheduling</CardTitle>
                      <CardDescription className="text-xs">Generate optimized schedules</CardDescription>
                    </div>
                  </div>
                  <Badge variant={status?.scheduling.enabled ? "default" : "secondary"}>
                    {status?.scheduling.enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.scheduling.lastRun && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.scheduling.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.scheduling.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-1">
                    <span>Credit Cost:</span>
                    <span className="font-semibold flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      25 credits
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => schedulingMutation.mutate()}
                    disabled={schedulingMutation.isPending || isAnyAutomationRunning}
                    data-testid="button-trigger-scheduling"
                  >
                    {schedulingMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Schedule...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Generate Schedule Now
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Smart Invoicing */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-950/30 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Smart Invoicing</CardTitle>
                      <CardDescription className="text-xs">Auto-generate client invoices</CardDescription>
                    </div>
                  </div>
                  <Badge variant={status?.invoicing.enabled ? "default" : "secondary"}>
                    {status?.invoicing.enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.invoicing.lastRun && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.invoicing.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.invoicing.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-1">
                    <span>Credit Cost:</span>
                    <span className="font-semibold flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      15 credits
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => invoicingMutation.mutate()}
                    disabled={invoicingMutation.isPending || isAnyAutomationRunning}
                    data-testid="button-trigger-invoicing"
                  >
                    {invoicingMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Invoices...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Generate Invoices Now
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Auto Payroll */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Auto Payroll</CardTitle>
                      <CardDescription className="text-xs">Process employee payroll</CardDescription>
                    </div>
                  </div>
                  <Badge variant={status?.payroll.enabled ? "default" : "secondary"}>
                    {status?.payroll.enabled ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.payroll.lastRun && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.payroll.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.payroll.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-1">
                    <span>Credit Cost:</span>
                    <span className="font-semibold flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      20 credits
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => payrollMutation.mutate()}
                    disabled={payrollMutation.isPending || isAnyAutomationRunning}
                    data-testid="button-trigger-payroll"
                  >
                    {payrollMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing Payroll...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Process Payroll Now
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Compliance Monitoring */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Compliance Monitoring</CardTitle>
                      <CardDescription className="text-xs">Scan for regulation issues</CardDescription>
                    </div>
                  </div>
                  <Badge variant={status?.compliance.enabled ? "default" : "secondary"}>
                    {status?.compliance.enabled ? "Active" : "Beta"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.compliance.lastRun && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>Last Scan:</span>
                      <span className="font-medium">{format(new Date(status.compliance.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-1">
                      <span>Issues Found:</span>
                      <span className="font-medium">{status.compliance.issuesDetected}</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-1">
                    <span>Credit Cost:</span>
                    <span className="font-semibold flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      10 credits
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => complianceMutation.mutate()}
                    disabled={complianceMutation.isPending || isAnyAutomationRunning}
                    data-testid="button-trigger-compliance"
                  >
                    {complianceMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scanning Compliance...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Compliance Scan
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Automation Schedule Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Automated Schedule
              </CardTitle>
              <CardDescription>
                These automations run automatically based on your workspace configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>AI Scheduling</span>
                  </div>
                  <Badge variant="outline">Daily 11:00 PM</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Invoice Generation</span>
                  </div>
                  <Badge variant="outline">Daily 2:00 AM</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Payroll Processing</span>
                  </div>
                  <Badge variant="outline">Daily 3:00 AM</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Automation Runs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Automation Runs
              </CardTitle>
              <CardDescription>
                Track execution history and resume interrupted automations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Loading history...</span>
                </div>
              ) : recentHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No automation runs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentHistory.map((item) => {
                    const isExpanded = expandedItems.has(item.requestId);
                    const checkpoint = item.checkpoint;
                    const hasResumable = (checkpoint?.resumable === true &&
                      (item.status === 'failed' || item.status === 'partially_completed')) ||
                      item.status === 'paused';
                    const hasPendingActions = item.status === 'pending' || item.status === 'paused';
                    const canPause = item.status === 'executing' || item.status === 'pending';

                    const featureLabel: Record<string, string> = {
                      invoicing: 'Invoice Generation',
                      payroll: 'Payroll Processing',
                      scheduling: 'AI Scheduling',
                      time_tracking: 'Time Entry Approval',
                    };
                    const featureIcon: Record<string, JSX.Element> = {
                      invoicing: <FileText className="h-4 w-4" />,
                      payroll: <DollarSign className="h-4 w-4" />,
                      scheduling: <Calendar className="h-4 w-4" />,
                      time_tracking: <Clock className="h-4 w-4" />,
                    };

                    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
                      pending:              { label: 'Pending Approval', variant: 'outline' },
                      approved:             { label: 'Approved', variant: 'secondary' },
                      executing:            { label: 'Running', variant: 'default' },
                      completed:            { label: 'Completed', variant: 'default' },
                      failed:               { label: 'Failed', variant: 'destructive' },
                      partially_completed:  { label: 'Partial', variant: 'destructive' },
                      rejected:             { label: 'Rejected', variant: 'secondary' },
                      paused:               { label: 'Paused', variant: 'outline' },
                    };
                    const sc = statusConfig[item.status] ?? { label: item.status, variant: 'outline' as const };

                    const stepStatusIcon = (s: StepStatus) => {
                      if (s === 'completed') return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
                      if (s === 'failed')    return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
                      if (s === 'running')   return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
                      if (s === 'skipped')   return <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
                      return <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />;
                    };

                    const completedCount = checkpoint?.steps.filter(s => s.status === 'completed').length ?? 0;
                    const totalCount = checkpoint?.steps.length ?? 0;

                    return (
                      <div
                        key={item.requestId}
                        className="rounded-lg border border-border bg-card"
                        data-testid={`automation-history-${item.requestId}`}
                      >
                        {/* Row: icon + feature + status + time + expand toggle */}
                        <button
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                          onClick={() => toggleExpanded(item.requestId)}
                          data-testid={`button-expand-${item.requestId}`}
                          aria-expanded={isExpanded}
                        >
                          <div className="shrink-0 text-muted-foreground">
                            {featureIcon[item.feature] ?? <Zap className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {featureLabel[item.feature] ?? item.feature}
                              </span>
                              <Badge variant={sc.variant} className="text-xs">
                                {item.status === 'executing' && (
                                  <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                                )}
                                {sc.label}
                              </Badge>
                              {hasResumable && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                                  Resumable
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {format(new Date(item.createdAt), 'MMM d, h:mm a')}
                              {checkpoint && totalCount > 0 && (
                                <span className="ml-2">· {completedCount}/{totalCount} steps</span>
                              )}
                            </p>
                          </div>
                          <div className="shrink-0 text-muted-foreground">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                            }
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                            {/* Summary */}
                            {item.summary && (
                              <p className="text-xs text-muted-foreground">{item.summary}</p>
                            )}

                            {/* Step progress */}
                            {checkpoint && checkpoint.steps.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium text-foreground">Execution Steps</p>
                                {/* Progress bar */}
                                <Progress
                                  value={totalCount > 0 ? (completedCount / totalCount) * 100 : 0}
                                  className="h-1.5"
                                />
                                <div className="space-y-1 mt-2">
                                  {checkpoint.steps.map((step) => (
                                    <div
                                      key={step.name}
                                      className="flex items-start gap-2"
                                      data-testid={`step-${step.name}`}
                                    >
                                      {stepStatusIcon(step.status)}
                                      <div className="flex-1 min-w-0">
                                        <span className={`text-xs ${
                                          step.status === 'failed' ? 'text-destructive font-medium' :
                                          step.status === 'completed' ? 'text-foreground' :
                                          step.status === 'running' ? 'text-primary font-medium' :
                                          'text-muted-foreground'
                                        }`}>
                                          {step.label}
                                        </span>
                                        {step.status === 'failed' && step.error && (
                                          <p className="text-[10px] text-destructive/80 mt-0.5 leading-snug">
                                            {step.error}
                                          </p>
                                        )}
                                        {step.name === checkpoint.resumeFromStep && step.status !== 'completed' && (
                                          <span className="ml-1.5 text-[10px] text-amber-600 font-medium">
                                            · resume point
                                          </span>
                                        )}
                                      </div>
                                      {step.attemptCount > 1 && (
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                          ×{step.attemptCount}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Pause reason / info for paused items */}
                            {item.status === 'paused' && item.pauseReason && (
                              <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1.5">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span><strong>Paused:</strong> {item.pauseReason}</span>
                              </div>
                            )}

                            {/* Revision indicator */}
                            {item.revisedPayload && (
                              <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5">
                                <Pencil className="h-3.5 w-3.5 shrink-0" />
                                <span><strong>Payload Revised:</strong> {item.revisionNotes}</span>
                              </div>
                            )}

                            {/* Trinity re-analysis display */}
                            {item.trinityReanalysis && trinityAnalysisOpen === item.requestId && (
                              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                  <Brain className="h-3.5 w-3.5" />
                                  Trinity Re-Analysis
                                </div>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap">{item.trinityReanalysis}</p>
                              </div>
                            )}
                            {item.trinityReanalysis && trinityAnalysisOpen !== item.requestId && (
                              <button
                                onClick={() => setTrinityAnalysisOpen(item.requestId)}
                                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                                data-testid={`button-show-analysis-${item.requestId}`}
                              >
                                <Brain className="h-3 w-3" />
                                Trinity analysis available — click to view
                              </button>
                            )}

                            {/* Action buttons row */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {/* Approve/Reject for pending */}
                              {item.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => approveMutation.mutate(item.requestId)}
                                    disabled={approveMutation.isPending}
                                    data-testid={`button-approve-${item.requestId}`}
                                  >
                                    {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => rejectMutation.mutate(item.requestId)}
                                    disabled={rejectMutation.isPending}
                                    data-testid={`button-reject-${item.requestId}`}
                                  >
                                    {rejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />}
                                    Reject
                                  </Button>
                                </>
                              )}

                              {/* Pause for executing/pending */}
                              {canPause && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => pauseMutation.mutate({ requestId: item.requestId, reason: 'Paused for review' })}
                                  disabled={pauseMutation.isPending}
                                  data-testid={`button-pause-${item.requestId}`}
                                >
                                  {pauseMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Pause className="h-3.5 w-3.5 mr-1.5" />}
                                  Pause
                                </Button>
                              )}

                              {/* Resume for paused or failed-with-checkpoint */}
                              {hasResumable && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resumeMutation.mutate(item.requestId)}
                                  disabled={resumeMutation.isPending}
                                  data-testid={`button-resume-${item.requestId}`}
                                >
                                  {resumeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                                  Resume
                                </Button>
                              )}

                              {/* Revise payload for pending/paused */}
                              {hasPendingActions && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openReviseModal(item)}
                                  data-testid={`button-revise-${item.requestId}`}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                                  Revise
                                </Button>
                              )}

                              {/* Ask Trinity for pending/paused */}
                              {hasPendingActions && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setTrinityAnalysisOpen(item.requestId);
                                    reanalyzeMutation.mutate(item.requestId);
                                  }}
                                  disabled={reanalyzeMutation.isPending}
                                  data-testid={`button-ask-trinity-${item.requestId}`}
                                >
                                  {reanalyzeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
                                  Ask Trinity
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      {/* Revise Payload Modal */}
      <Dialog open={!!reviseModalId} onOpenChange={(open) => { if (!open) { setReviseModalId(null); setRevisePayloadText(''); setReviseNotes(''); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revise Automation Payload</DialogTitle>
            <DialogDescription>
              Edit the staged payload below before approving. Your revision will be logged with a note.
              When approved, Trinity will execute using the revised data instead of the original.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="revise-payload">Payload (JSON)</Label>
              <Textarea
                id="revise-payload"
                value={revisePayloadText}
                onChange={(e) => setRevisePayloadText(e.target.value)}
                className="font-mono text-xs min-h-48 resize-y"
                placeholder="{}"
                data-testid="textarea-revise-payload"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revise-notes">Revision Notes <span className="text-destructive">*</span></Label>
              <Textarea
                id="revise-notes"
                value={reviseNotes}
                onChange={(e) => setReviseNotes(e.target.value)}
                placeholder="Explain what you changed and why (required for audit trail)"
                className="min-h-20 resize-none"
                data-testid="textarea-revise-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviseModalId(null); setRevisePayloadText(''); setReviseNotes(''); }}>
              Cancel
            </Button>
            <Button
              onClick={submitRevision}
              disabled={reviseMutation.isPending}
              data-testid="button-submit-revision"
            >
              {reviseMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Pencil className="h-4 w-4 mr-2" />Save Revision</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CanvasHubPage>
  );
}
