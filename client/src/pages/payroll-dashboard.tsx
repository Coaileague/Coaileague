import { parseLocalDate, formatDate } from "@/lib/dates";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useState, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/apiError";
import { PayrollRunListResponse, PayrollRunDetailResponse } from "@shared/schemas/responses/payroll";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow,  } from "@/components/ui/table";
import { ResponsiveTableWrapper, DataSummaryCard, type DataField } from "@/components/DataSummaryCard";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalContent } from '@/components/ui/universal-modal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,  } from "@/components/ui/alert-dialog";
import { Loader2, DollarSign, CheckCircle, Clock, Play, Users, Sparkles, TrendingUp, FileText, Zap, Brain, ArrowRight, Calendar, Banknote, Receipt, CircleDollarSign, Download, AlertCircle, Trash2 } from "lucide-react";
;
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub/CanvasHubRegistry";

interface PayrollRun {
  id: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'pending' | 'approved' | 'processed' | 'paid';
  totalGrossPay: string;
  totalNetPay: string;
  employeeCount: number;
  createdBy: string;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
  anomalyFlags?: Array<{ id: string; description: string }>;
}

interface PayrollEntry {
  id: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: string;
  netPay: string;
  federalTax: string;
  stateTax: string;
  socialSecurity: string;
  medicare: string;
}

interface PayrollRunDetail extends PayrollRun {
  entries: PayrollEntry[];
}

import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";

export default function PayrollDashboard() {
  const { toast } = useToast();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [runToApprove, setRunToApprove] = useState<string | null>(null);

  const { workspaceId } = useWorkspaceAccess();

  const runsQuery = useQuery<PayrollRun[]>({
    queryKey: ['/api/payroll/runs', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => apiFetch('/api/payroll/runs', PayrollRunListResponse) as unknown as Promise<PayrollRun[]>,
    retry: (failureCount, error: any) => error?.status >= 500 && failureCount < 2,
  });
  const {
    data: runsData,
    isLoading,
    isError,
    error,
    isEmpty: isRunsEmpty,
  } = useAsyncData(runsQuery, (d) => d.length === 0);
  const runs = runsData ?? [];

  const { data: runDetails, isLoading: isLoadingDetails, isError: isErrorDetails, error: errorDetails } = useQuery<PayrollRunDetail>({
    queryKey: ['/api/payroll/runs', workspaceId, selectedRun],
    enabled: !!selectedRun,
    queryFn: () => apiFetch(`/api/payroll/runs/${selectedRun}`, PayrollRunDetailResponse) as unknown as Promise<PayrollRunDetail>,
    retry: (failureCount, error: any) => error?.status >= 500 && failureCount < 2,
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/create-run', { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId] });
      toast({
        title: "Payroll Run Created",
        description: "Automated payroll processing complete. Ready for QC approval."
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Create Payroll Failed",
        description: error instanceof Error ? error.message : "Failed to create payroll run. Please check your data and try again."
      });
    }
  });

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('POST', `/api/payroll/runs/${runId}/approve`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workspace/health'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trinity/context'] });
      if (selectedRun) {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId, selectedRun] });
      }
      setShowApprovalDialog(false);
      setRunToApprove(null);
      toast({
        title: "Payroll Approved",
        description: "Payroll run has been approved and is ready for processing."
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: error instanceof Error ? error.message : "Failed to approve payroll run. Please ensure you have the necessary permissions."
      });
    }
  });

  const processRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('POST', `/api/payroll/runs/${runId}/process`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId] });
      if (selectedRun) {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId, selectedRun] });
      }
      toast({
        title: "Payroll Processed",
        description: "Payments have been initiated."
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process payroll run. Please verify disbursement settings."
      });
    }
  });

  const markPaidMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('POST', `/api/payroll/runs/${runId}/mark-paid`, { disbursementMethod: 'ach', workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId] });
      if (selectedRun) {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId, selectedRun] });
      }
      toast({
        title: "Payroll Marked as Paid",
        description: "ACH disbursement confirmed. Payroll run is now closed."
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Mark Paid Failed",
        description: error instanceof Error ? error.message : "Failed to mark payroll run as paid. Please check the disbursement status."
      });
    }
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('DELETE', `/api/payroll/runs/${runId}`, { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', workspaceId] });
      toast({
        title: "Payroll Run Deleted",
        description: "Draft payroll run has been removed."
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete payroll run."
      });
    }
  });

  const runPtoAccrualMutation = useMutation({
    mutationFn: async () => {
      // V1.1: PTO accrual endpoint launches in V1.1
      throw new Error('PTO accrual is launching in V1.1 — coming shortly after go-live.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/pto'] });
      toast({ title: '✅ PTO Accrual Run Complete', description: 'All employee PTO balances updated.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'PTO Accrual Failed', description: error.message || 'Failed to run PTO accrual. Please try again.' });
    },
  });

  const actionButton = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() => runPtoAccrualMutation.mutate()}
        disabled={runPtoAccrualMutation.isPending}
        data-testid="button-run-pto-accrual"
      >
        {runPtoAccrualMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {runPtoAccrualMutation.isPending ? 'Running…' : 'Run PTO Accrual'}
      </Button>
      <Button
        onClick={() => createRunMutation.mutate()}
        disabled={createRunMutation.isPending}
        className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-sm shadow-cyan-500/25 border-0"
        data-testid="button-create-payroll"
      >
        {createRunMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Zap className="mr-2 h-4 w-4" />
        )}
        Create Payroll Run
      </Button>
    </div>
  );

  const pageConfig: CanvasPageConfig = {
    id: "payroll-dashboard",
    title: "AI Payroll Processing",
    subtitle: "Automated payroll processing with human review for compliance verification",
    category: "operations",
    headerActions: actionButton,
  };

  // Hooks must be declared before any conditional returns
  const pendingCount = useMemo(() => runs?.filter(r => r.status === 'pending').length ?? 0, [runs]);
  const totalThisPeriod = useMemo(() => (runs ?? [])
    .filter(r => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + parseFloat(r.totalNetPay || '0'), 0)
    .toFixed(2), [runs]);
  const employeesPaid = useMemo(() => (runs ?? []).filter(r => r.status === 'paid').reduce((sum, r) => sum + (r.employeeCount || 0), 0), [runs]);

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CanvasHubPage>
    );
  }

  if (isError) return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load data. Please refresh."}
        </p>
      </div>
    </CanvasHubPage>
  );

  const isAnyActionPending = approveRunMutation.isPending || processRunMutation.isPending || markPaidMutation.isPending;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string, label: string }> = {
      draft: { className: "bg-slate-500/10 text-slate-400 border-slate-500/30", label: "Draft" },
      pending: { className: "bg-amber-500/10 text-amber-400 border-amber-500/30", label: "Pending QC" },
      approved: { className: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", label: "Approved" },
      processed: { className: "bg-blue-500/10 text-blue-400 border-blue-500/30", label: "Processed" },
      paid: { className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", label: "Paid" }
    };
    const config = variants[status] || variants.draft;
    return (
      <Badge 
        variant="outline" 
        className={config.className}
        data-testid={`badge-status-${status}`}
      >
        {config.label}
      </Badge>
    );
  };

  const handleApproveClick = (runId: string) => {
    setRunToApprove(runId);
    setShowApprovalDialog(true);
  };

  const confirmApproval = () => {
    if (runToApprove) {
      approveRunMutation.mutate(runToApprove);
    }
  };

  const handleDownloadNacha = async (runId: string) => {
    try {
      const res = await apiRequest('GET', `/api/payroll/runs/${runId}/nacha`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Download failed' }));
        toast({ title: 'Download Failed', description: err.message, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-nacha-${runId}.ach`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'NACHA File Downloaded', description: 'Submit this ACH file to your bank for processing.' });
    } catch {
      toast({ title: 'Download Failed', description: 'Could not generate NACHA file.', variant: 'destructive' });
    }
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <>
      {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50 shadow-sm">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
              <div className="w-10 h-10 rounded-md bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid="text-pending-count">
                {formatNumber(pendingCount)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting QC review
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50 shadow-sm">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total This Period</CardTitle>
              <div className="w-10 h-10 rounded-md bg-cyan-500/10 flex items-center justify-center">
                <CircleDollarSign className="h-5 w-5 text-cyan-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500" data-testid="text-total-amount">
                {formatCurrency(totalThisPeriod)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Net payroll amount
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50 shadow-sm">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employees Paid</CardTitle>
              <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-employee-count">
                {formatNumber(employeesPaid)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This pay cycle
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ACH Bank Account Status */}

        {/* Payroll Runs Card */}
        <Card className="border-slate-200 dark:border-slate-700/50 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <CardTitle className="text-lg">Payroll Runs</CardTitle>
                <CardDescription>
                  View and manage automated payroll processing
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center p-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border border-cyan-500/20 animate-pulse" />
                    <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-cyan-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">Loading payroll data...</span>
                </div>
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-md bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 flex items-center justify-center">
                    <Banknote className="h-12 w-12 text-slate-400" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-md bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-sm shadow-cyan-500/25">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">No payroll runs yet</h3>
                <p className="text-muted-foreground text-sm max-w-sm mb-6">
                  Create your first automated payroll run. Our AI will calculate hours, deductions, and taxes automatically.
                </p>
                <Button
                  onClick={() => createRunMutation.mutate()}
                  disabled={createRunMutation.isPending}
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
                  data-testid="button-create-first-payroll"
                >
                  {createRunMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  Create First Payroll Run
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <ResponsiveTableWrapper
                breakpoint="md"
                data-testid="table-payroll-runs"
                desktopTable={
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <TableHead className="font-semibold">Period</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Employees</TableHead>
                        <TableHead className="font-semibold">Gross Pay</TableHead>
                        <TableHead className="font-semibold">Net Pay</TableHead>
                        <TableHead className="font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow 
                          key={run.id} 
                          className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                          data-testid={`row-payroll-${run.id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {(() => {
                                const start = parseLocalDate(run.periodStart);
                                const end = parseLocalDate(run.periodEnd);
                                if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
                                return `${formatDate(start, 'MM/dd')} - ${formatDate(end, 'MM/dd/yyyy')}`;
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatNumber(run.employeeCount)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatCurrency(run.totalGrossPay)}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold">{formatCurrency(run.totalNetPay)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              {run.status === 'draft' && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      data-testid={`button-delete-run-${run.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payroll Run?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this draft payroll run? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => deleteRunMutation.mutate(run.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete Run
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              <UniversalModal open={selectedRun === run.id} onOpenChange={(open) => !open && setSelectedRun(null)}>
                                <UniversalModalTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedRun(run.id)}
                                    data-testid={`button-view-${run.id}`}
                                  >
                                    <FileText className="mr-1 h-3.5 w-3.5" />
                                    Details
                                  </Button>
                                </UniversalModalTrigger>
                                <UniversalModalContent size="full" className="max-h-[80vh] overflow-y-auto">
                                  <UniversalModalHeader>
                                    <UniversalModalTitle className="flex items-center gap-2">
                                      <Receipt className="h-5 w-5" />
                                      Payroll Run Details
                                    </UniversalModalTitle>
                                    <UniversalModalDescription className="whitespace-nowrap">
                                      Period: {(() => {
                                        const start = parseLocalDate(run.periodStart);
                                        const end = parseLocalDate(run.periodEnd);
                                        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
                                        return `${formatDate(start, 'MM/dd')} - ${formatDate(end, 'MM/dd/yyyy')}`;
                                      })()}
                                    </UniversalModalDescription>
                                  </UniversalModalHeader>
                                  {isLoadingDetails ? (
                                    <div className="space-y-4 p-4">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                          <div key={i} className="p-4 rounded-md bg-muted/50 space-y-2">
                                            <Skeleton className="h-3 w-16" />
                                            <Skeleton className="h-6 w-24" />
                                          </div>
                                        ))}
                                      </div>
                                      <Skeleton className="h-4 w-32" />
                                      <div className="space-y-2">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                          <Skeleton key={i} className="h-12 w-full" />
                                        ))}
                                      </div>
                                    </div>
                                  ) : isErrorDetails ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-center">
                                      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                                      <p className="text-sm text-muted-foreground">
                                        {errorDetails instanceof Error ? errorDetails.message : "Failed to load details. Please try again."}
                                      </p>
                                    </div>
                                  ) : runDetails ? (
                                    <div className="space-y-6">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Status</p>
                                          {getStatusBadge(runDetails.status)}
                                        </div>
                                        <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Total Gross</p>
                                          <p className="font-semibold">{formatCurrency(runDetails.totalGrossPay)}</p>
                                        </div>
                                        <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Total Net</p>
                                          <p className="font-semibold text-cyan-600 dark:text-cyan-400">{formatCurrency(runDetails.totalNetPay)}</p>
                                        </div>
                                        <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Employees</p>
                                          <p className="font-semibold">{formatNumber(runDetails.employeeCount)}</p>
                                        </div>
                                      </div>

                                      <div>
                                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                                          <Users className="h-4 w-4" />
                                          Employee Paychecks
                                        </h3>
                                        <div className="rounded-md border overflow-hidden">
                                          <Table>
                                            <TableHeader>
                                              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                                                <TableHead>Employee</TableHead>
                                                <TableHead>Hours</TableHead>
                                                <TableHead>Gross</TableHead>
                                                <TableHead>Taxes</TableHead>
                                                <TableHead>Net</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {runDetails.entries.map((entry) => (
                                                <TableRow key={entry.id} data-testid={`row-payroll-entry-${entry.id}`}>
                                                  <TableCell className="font-medium" data-testid={`text-employee-name-${entry.id}`}>{entry.employeeName}</TableCell>
                                                  <TableCell data-testid={`text-hours-${entry.id}`}>
                                                    {formatNumber(entry.regularHours)}
                                                    {entry.overtimeHours > 0 && (
                                                      <Badge variant="outline" className="ml-1.5 text-xs bg-amber-500/10 text-amber-600 border-amber-500/30" data-testid={`badge-ot-hours-${entry.id}`}>
                                                        +{formatNumber(entry.overtimeHours)} OT
                                                      </Badge>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="font-mono text-sm" data-testid={`text-gross-pay-${entry.id}`}>{formatCurrency(entry.grossPay)}</TableCell>
                                                  <TableCell className="text-xs space-y-0.5" data-testid={`text-taxes-${entry.id}`}>
                                                    <div className="text-muted-foreground">Fed: {formatCurrency(entry.federalTax)}</div>
                                                    <div className="text-muted-foreground">State: {formatCurrency(entry.stateTax)}</div>
                                                    <div className="text-muted-foreground">SS: {formatCurrency(entry.socialSecurity)}</div>
                                                    <div className="text-muted-foreground">Med: {formatCurrency(entry.medicare)}</div>
                                                  </TableCell>
                                                  <TableCell className="font-mono font-semibold text-emerald-600 dark:text-emerald-400" data-testid={`text-net-pay-${entry.id}`}>{formatCurrency(entry.netPay)}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>

                                      {runDetails.anomalyFlags && runDetails.anomalyFlags.length > 0 && (
                                        <Alert variant="destructive" data-testid="alert-anomaly-flags">
                                          <AlertCircle className="h-4 w-4" />
                                          <AlertTitle>Anomalies Detected — Review Before Approving</AlertTitle>
                                          <AlertDescription>
                                            <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
                                              {runDetails.anomalyFlags.map(flag => (
                                                <li key={flag.id}>{flag.description}</li>
                                              ))}
                                            </ul>
                                          </AlertDescription>
                                        </Alert>
                                      )}

                                      <div className="flex justify-end gap-2 pt-4 border-t">
                                        {runDetails.status === 'pending' && (
                                          <Button
                                            onClick={() => handleApproveClick(runDetails.id)}
                                            disabled={isAnyActionPending}
                                            className="bg-gradient-to-r from-teal-500 to-cyan-500"
                                            data-testid="button-approve"
                                          >
                                            {approveRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                            Approve (QC)
                                          </Button>
                                        )}
                                        {runDetails.status === 'approved' && (
                                          <Button
                                            onClick={() => processRunMutation.mutate(runDetails.id)}
                                            disabled={isAnyActionPending}
                                            className="bg-gradient-to-r from-emerald-500 to-teal-500"
                                            data-testid="button-process"
                                          >
                                            {processRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                            Process Payments
                                          </Button>
                                        )}
                                        {(runDetails.status === 'processed' || runDetails.status === 'paid') && (
                                          <Button
                                            variant="outline"
                                            onClick={() => handleDownloadNacha(runDetails.id)}
                                            data-testid="button-download-nacha"
                                          >
                                            <Download className="mr-2 h-4 w-4" />
                                            Download NACHA File
                                          </Button>
                                        )}
                                        {runDetails.status === 'processed' && (
                                          <Button
                                            onClick={() => markPaidMutation.mutate(runDetails.id)}
                                            disabled={isAnyActionPending}
                                            className="bg-gradient-to-r from-green-600 to-emerald-600"
                                            data-testid="button-mark-paid"
                                          >
                                            {markPaidMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
                                            Mark as Paid
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </UniversalModalContent>
                              </UniversalModal>

                              {run.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveClick(run.id)}
                                  disabled={isAnyActionPending}
                                  className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
                                  data-testid={`button-approve-payroll-${run.id}`}
                                >
                                  {approveRunMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-1 h-3.5 w-3.5" />}
                                  Approve
                                </Button>
                              )}

                              {run.status === 'approved' && (
                                <Button
                                  size="sm"
                                  onClick={() => processRunMutation.mutate(run.id)}
                                  disabled={isAnyActionPending}
                                  className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                                  data-testid={`button-process-payroll-${run.id}`}
                                >
                                  {processRunMutation.isPending ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="mr-1 h-3.5 w-3.5" />
                                  )}
                                  Process
                                </Button>
                              )}
                              {(run.status === 'processed' || run.status === 'paid') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadNacha(run.id)}
                                  data-testid={`button-download-nacha-${run.id}`}
                                  aria-label="Download NACHA file"
                                >
                                  <Download className="mr-1 h-3.5 w-3.5" />
                                  NACHA
                                </Button>
                              )}
                              {run.status === 'processed' && (
                                <Button
                                  size="sm"
                                  onClick={() => markPaidMutation.mutate(run.id)}
                                  disabled={isAnyActionPending}
                                  className="bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                                  data-testid={`button-mark-paid-${run.id}`}
                                >
                                  {markPaidMutation.isPending ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Banknote className="mr-1 h-3.5 w-3.5" />
                                  )}
                                  Mark Paid
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
                mobileCards={
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {runs.map((run) => {
                      const periodText = `${format(new Date(run.periodStart), 'MMM d')} - ${format(new Date(run.periodEnd), 'MMM d, yyyy')}`;
                      
                      const fields: DataField[] = [
                        { key: 'period', label: 'Period', value: periodText, priority: 'P1' },
                        { key: 'status', label: 'Status', value: getStatusBadge(run.status), priority: 'P1' },
                        { key: 'netPay', label: 'Net Pay', value: formatCurrency(run.totalNetPay), priority: 'P1' },
                        { key: 'employees', label: 'Employees', value: formatNumber(run.employeeCount), priority: 'P2' },
                        { key: 'grossPay', label: 'Gross Pay', value: formatCurrency(run.totalGrossPay), priority: 'P2' },
                      ];

                      const actions = (
                        <div className="flex items-center gap-2">
                          <UniversalModal open={selectedRun === run.id} onOpenChange={(open) => !open && setSelectedRun(null)}>
                            <UniversalModalTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedRun(run.id)}
                                data-testid={`button-view-${run.id}`}
                              >
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                Details
                              </Button>
                            </UniversalModalTrigger>
                            <UniversalModalContent size="full" className="max-h-[80vh] overflow-y-auto">
                              <UniversalModalHeader>
                                <UniversalModalTitle className="flex items-center gap-2">
                                  <Receipt className="h-5 w-5" />
                                  Payroll Run Details
                                </UniversalModalTitle>
                                <UniversalModalDescription>
                                  Period: {periodText}
                                </UniversalModalDescription>
                              </UniversalModalHeader>
                              {isLoadingDetails ? (
                                <div className="flex justify-center p-8">
                                  <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                                </div>
                              ) : runDetails ? (
                                <div className="space-y-6">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                                      {getStatusBadge(runDetails.status)}
                                    </div>
                                    <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Total Gross</p>
                                      <p className="font-semibold">{formatCurrency(runDetails.totalGrossPay)}</p>
                                    </div>
                                    <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Total Net</p>
                                      <p className="font-semibold text-cyan-600 dark:text-cyan-400">{formatCurrency(runDetails.totalNetPay)}</p>
                                    </div>
                                    <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Employees</p>
                                      <p className="font-semibold">{formatNumber(runDetails.employeeCount)}</p>
                                    </div>
                                  </div>

                                  <div>
                                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                                      <Users className="h-4 w-4" />
                                      Employee Paychecks
                                    </h3>
                                    <div className="space-y-3">
                                      {runDetails.entries.map((entry) => (
                                        <div key={entry.id} className="p-3 rounded-md border bg-card">
                                          <div className="flex justify-between gap-2 items-start mb-2">
                                            <span className="font-medium">{entry.employeeName}</span>
                                            <span className="font-mono font-semibold text-emerald-600">{formatCurrency(entry.netPay)}</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                            <div>Hours: {formatNumber(entry.regularHours)}{entry.overtimeHours > 0 && ` (+${formatNumber(entry.overtimeHours)} OT)`}</div>
                                            <div>Gross: {formatCurrency(entry.grossPay)}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {runDetails.anomalyFlags && runDetails.anomalyFlags.length > 0 && (
                                    <Alert variant="destructive" data-testid="alert-anomaly-flags-mobile">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Anomalies Detected — Review Before Approving</AlertTitle>
                                      <AlertDescription>
                                        <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
                                          {runDetails.anomalyFlags.map(flag => (
                                            <li key={flag.id}>{flag.description}</li>
                                          ))}
                                        </ul>
                                      </AlertDescription>
                                    </Alert>
                                  )}

                                  <div className="flex justify-end gap-2 pt-4 border-t">
                                    {runDetails.status === 'pending' && (
                                      <Button
                                        onClick={() => handleApproveClick(runDetails.id)}
                                        disabled={approveRunMutation.isPending}
                                        className="bg-gradient-to-r from-teal-500 to-cyan-500"
                                        data-testid="button-approve"
                                      >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Approve (QC)
                                      </Button>
                                    )}
                                    {runDetails.status === 'approved' && (
                                      <Button
                                        onClick={() => processRunMutation.mutate(runDetails.id)}
                                        disabled={processRunMutation.isPending}
                                        className="bg-gradient-to-r from-emerald-500 to-teal-500"
                                        data-testid="button-process"
                                      >
                                        <Play className="mr-2 h-4 w-4" />
                                        Process Payments
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </UniversalModalContent>
                          </UniversalModal>

                          {run.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => handleApproveClick(run.id)}
                              disabled={approveRunMutation.isPending}
                              className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
                              data-testid={`button-approve-${run.id}`}
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          )}

                          {run.status === 'approved' && (
                            <Button
                              size="sm"
                              onClick={() => processRunMutation.mutate(run.id)}
                              disabled={processRunMutation.isPending}
                              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                              data-testid={`button-process-${run.id}`}
                            >
                              <Play className="mr-1 h-3.5 w-3.5" />
                              Process
                            </Button>
                          )}
                        </div>
                      );

                      return (
                        <DataSummaryCard
                          key={run.id}
                          id={run.id}
                          fields={fields}
                          actions={actions}
                          data-testid={`card-payroll-${run.id}`}
                        />
                      );
                    })}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>

      <AlertDialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-md bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <AlertDialogTitle className="text-xl">Approve Payroll Run?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base">
              This is the 1% human QC step. Please review the payroll calculations carefully before approving.
              Once approved, this payroll run can be processed for payment distribution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-approval" disabled={approveRunMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApproval}
              disabled={approveRunMutation.isPending}
              className="bg-gradient-to-r from-teal-500 to-cyan-500"
              data-testid="button-confirm-approval"
            >
              {approveRunMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                "Approve Payroll"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </CanvasHubPage>
  );
}

