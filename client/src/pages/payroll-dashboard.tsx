import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ResponsiveTableWrapper, 
  DataSummaryCard,
  type DataField 
} from "@/components/DataSummaryCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Loader2, DollarSign, CheckCircle, Clock, Play, Users, 
  Sparkles, TrendingUp, FileText, Zap, Brain, ArrowRight,
  Calendar, Banknote, Receipt, CircleDollarSign
} from "lucide-react";
import { WorkspaceLayout } from "@/components/workspace-layout";

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

export default function PayrollDashboard() {
  const { toast } = useToast();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [runToApprove, setRunToApprove] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery<PayrollRun[]>({
    queryKey: ['/api/payroll/runs'],
  });

  const { data: runDetails, isLoading: isLoadingDetails } = useQuery<PayrollRunDetail>({
    queryKey: ['/api/payroll/runs', selectedRun],
    enabled: !!selectedRun,
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/payroll/create-run', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs'] });
      toast({
        title: "Payroll Run Created",
        description: "Automated payroll processing complete. Ready for QC approval."
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create payroll run"
      });
    }
  });

  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('POST', `/api/payroll/runs/${runId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs'] });
      if (selectedRun) {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', selectedRun] });
      }
      setShowApprovalDialog(false);
      setRunToApprove(null);
      toast({
        title: "Payroll Approved",
        description: "Payroll run has been approved and is ready for processing."
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve payroll run"
      });
    }
  });

  const processRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest('POST', `/api/payroll/runs/${runId}/process`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs'] });
      if (selectedRun) {
        queryClient.invalidateQueries({ queryKey: ['/api/payroll/runs', selectedRun] });
      }
      toast({
        title: "Payroll Processed",
        description: "Payments have been initiated."
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to process payroll run"
      });
    }
  });

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

  const pendingCount = runs.filter(r => r.status === 'pending').length;
  const totalThisPeriod = runs
    .filter(r => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + parseFloat(r.totalNetPay || '0'), 0)
    .toFixed(2);
  const employeesPaid = runs.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.employeeCount, 0);

  return (
    <WorkspaceLayout maxWidth="7xl">
      <div className="space-y-6">
        {/* Hero Header Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-500/10 via-cyan-500/5 to-blue-500/10" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/20 to-transparent rounded-full blur-3xl" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <Brain className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
                    AI Payroll Processing
                  </h1>
                  <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    PayrollOS
                  </Badge>
                </div>
                <p className="text-slate-400 text-sm md:text-base">
                  99% Automated Processing with 1% Human QC for compliance verification
                </p>
              </div>
            </div>
            
            <Button
              onClick={() => createRunMutation.mutate()}
              disabled={createRunMutation.isPending}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-cyan-500/25 border-0"
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
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-pending-count">
                {pendingCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting QC review
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total This Period</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <CircleDollarSign className="h-5 w-5 text-cyan-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-cyan-500" data-testid="text-total-amount">
                ${totalThisPeriod}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Net payroll amount
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-slate-200 dark:border-slate-700/50 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employees Paid</CardTitle>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-employee-count">
                {employeesPaid}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This pay cycle
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Payroll Runs Card */}
        <Card className="border-slate-200 dark:border-slate-700/50">
          <CardHeader className="border-b border-slate-100 dark:border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
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
                    <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 animate-pulse" />
                    <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-cyan-500" />
                  </div>
                  <span className="text-sm text-muted-foreground">Loading payroll data...</span>
                </div>
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700/50 dark:to-slate-800/50 flex items-center justify-center">
                    <Banknote className="h-12 w-12 text-slate-400" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
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
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
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
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(run.periodStart), 'MMM d')} - {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              {run.employeeCount}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">${run.totalGrossPay}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold">${run.totalNetPay}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedRun(run.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`button-view-${run.id}`}
                                  >
                                    <FileText className="mr-1 h-3.5 w-3.5" />
                                    Details
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <Receipt className="h-5 w-5" />
                                      Payroll Run Details
                                    </DialogTitle>
                                    <DialogDescription>
                                      Period: {format(new Date(run.periodStart), 'MMM d')} - {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                                    </DialogDescription>
                                  </DialogHeader>
                                  {isLoadingDetails ? (
                                    <div className="flex justify-center p-8">
                                      <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                                    </div>
                                  ) : runDetails ? (
                                    <div className="space-y-6">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Status</p>
                                          {getStatusBadge(runDetails.status)}
                                        </div>
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Total Gross</p>
                                          <p className="font-semibold">${runDetails.totalGrossPay}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Total Net</p>
                                          <p className="font-semibold text-cyan-600 dark:text-cyan-400">${runDetails.totalNetPay}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                          <p className="text-xs text-muted-foreground mb-1">Employees</p>
                                          <p className="font-semibold">{runDetails.employeeCount}</p>
                                        </div>
                                      </div>

                                      <div>
                                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                                          <Users className="h-4 w-4" />
                                          Employee Paychecks
                                        </h3>
                                        <div className="rounded-xl border overflow-hidden">
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
                                                <TableRow key={entry.id}>
                                                  <TableCell className="font-medium">{entry.employeeName}</TableCell>
                                                  <TableCell>
                                                    {entry.regularHours}
                                                    {entry.overtimeHours > 0 && (
                                                      <Badge variant="outline" className="ml-1.5 text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                                                        +{entry.overtimeHours} OT
                                                      </Badge>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="font-mono text-sm">${entry.grossPay}</TableCell>
                                                  <TableCell className="text-xs space-y-0.5">
                                                    <div className="text-muted-foreground">Fed: ${entry.federalTax}</div>
                                                    <div className="text-muted-foreground">State: ${entry.stateTax}</div>
                                                    <div className="text-muted-foreground">SS: ${entry.socialSecurity}</div>
                                                    <div className="text-muted-foreground">Med: ${entry.medicare}</div>
                                                  </TableCell>
                                                  <TableCell className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">${entry.netPay}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>

                                      <div className="flex justify-end gap-2 pt-4 border-t">
                                        {runDetails.status === 'pending' && (
                                          <Button
                                            onClick={() => handleApproveClick(runDetails.id)}
                                            disabled={approveRunMutation.isPending}
                                            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
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
                                            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                                            data-testid="button-process"
                                          >
                                            <Play className="mr-2 h-4 w-4" />
                                            Process Payments
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </DialogContent>
                              </Dialog>

                              {run.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveClick(run.id)}
                                  disabled={approveRunMutation.isPending}
                                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
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
                                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                                  data-testid={`button-process-${run.id}`}
                                >
                                  <Play className="mr-1 h-3.5 w-3.5" />
                                  Process
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
                        { key: 'netPay', label: 'Net Pay', value: `$${run.totalNetPay}`, priority: 'P1' },
                        { key: 'employees', label: 'Employees', value: run.employeeCount, priority: 'P2' },
                        { key: 'grossPay', label: 'Gross Pay', value: `$${run.totalGrossPay}`, priority: 'P2' },
                      ];

                      const actions = (
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedRun(run.id)}
                                data-testid={`button-view-${run.id}`}
                              >
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Receipt className="h-5 w-5" />
                                  Payroll Run Details
                                </DialogTitle>
                                <DialogDescription>
                                  Period: {periodText}
                                </DialogDescription>
                              </DialogHeader>
                              {isLoadingDetails ? (
                                <div className="flex justify-center p-8">
                                  <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                                </div>
                              ) : runDetails ? (
                                <div className="space-y-6">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                                      {getStatusBadge(runDetails.status)}
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Total Gross</p>
                                      <p className="font-semibold">${runDetails.totalGrossPay}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Total Net</p>
                                      <p className="font-semibold text-cyan-600 dark:text-cyan-400">${runDetails.totalNetPay}</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                      <p className="text-xs text-muted-foreground mb-1">Employees</p>
                                      <p className="font-semibold">{runDetails.employeeCount}</p>
                                    </div>
                                  </div>

                                  <div>
                                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                                      <Users className="h-4 w-4" />
                                      Employee Paychecks
                                    </h3>
                                    <div className="space-y-3">
                                      {runDetails.entries.map((entry) => (
                                        <div key={entry.id} className="p-3 rounded-xl border bg-card">
                                          <div className="flex justify-between items-start mb-2">
                                            <span className="font-medium">{entry.employeeName}</span>
                                            <span className="font-mono font-semibold text-emerald-600">${entry.netPay}</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                            <div>Hours: {entry.regularHours}{entry.overtimeHours > 0 && ` (+${entry.overtimeHours} OT)`}</div>
                                            <div>Gross: ${entry.grossPay}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

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
                            </DialogContent>
                          </Dialog>

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
      </div>

      <AlertDialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
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
            <AlertDialogCancel data-testid="button-cancel-approval">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApproval}
              disabled={approveRunMutation.isPending}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
              data-testid="button-confirm-approval"
            >
              {approveRunMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve Payroll
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  );
}
