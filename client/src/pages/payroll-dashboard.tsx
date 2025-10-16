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
import { Loader2, DollarSign, CheckCircle, Clock, Play, Users } from "lucide-react";

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

  // Fetch payroll runs
  const { data: runs = [], isLoading } = useQuery<PayrollRun[]>({
    queryKey: ['/api/payroll/runs'],
  });

  // Fetch run details
  const { data: runDetails, isLoading: isLoadingDetails } = useQuery<PayrollRunDetail>({
    queryKey: ['/api/payroll/runs', selectedRun],
    enabled: !!selectedRun,
  });

  // Create payroll run mutation
  const createRunMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/payroll/create-run', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      });
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

  // Approve payroll run mutation
  const approveRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest(`/api/payroll/runs/${runId}/approve`, {
        method: 'POST',
      });
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

  // Process payroll run mutation
  const processRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return await apiRequest(`/api/payroll/runs/${runId}/process`, {
        method: 'POST',
      });
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
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive", label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      pending: { variant: "outline", label: "Pending QC" },
      approved: { variant: "default", label: "Approved" },
      processed: { variant: "default", label: "Processed" },
      paid: { variant: "default", label: "Paid" }
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
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

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <DollarSign className="h-8 w-8" />
            PayrollOS™
          </h1>
          <p className="text-muted-foreground mt-1">
            99% Automated Payroll Processing with 1% Human QC
          </p>
        </div>
        <Button
          onClick={() => createRunMutation.mutate()}
          disabled={createRunMutation.isPending}
          data-testid="button-create-payroll"
        >
          {createRunMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Payroll Run
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {runs.filter(r => r.status === 'pending').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total This Period</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-amount">
              ${runs.filter(r => r.status === 'pending' || r.status === 'approved')[0]?.totalNetPay || '0.00'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees Paid</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-employee-count">
              {runs.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.employeeCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Runs</CardTitle>
          <CardDescription>
            View and manage automated payroll processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No payroll runs yet. Create your first automated payroll run.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Gross Pay</TableHead>
                  <TableHead>Net Pay</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} data-testid={`row-payroll-${run.id}`}>
                    <TableCell>
                      {format(new Date(run.periodStart), 'MMM d')} - {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell>{run.employeeCount}</TableCell>
                    <TableCell>${run.totalGrossPay}</TableCell>
                    <TableCell>${run.totalNetPay}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedRun(run.id)}
                              data-testid={`button-view-${run.id}`}
                            >
                              View Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Payroll Run Details</DialogTitle>
                              <DialogDescription>
                                Period: {format(new Date(run.periodStart), 'MMM d')} - {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                              </DialogDescription>
                            </DialogHeader>
                            {isLoadingDetails ? (
                              <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                              </div>
                            ) : runDetails ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Status</p>
                                    <p className="font-medium">{getStatusBadge(runDetails.status)}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Total Gross Pay</p>
                                    <p className="font-medium">${runDetails.totalGrossPay}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Total Net Pay</p>
                                    <p className="font-medium">${runDetails.totalNetPay}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Employees</p>
                                    <p className="font-medium">{runDetails.employeeCount}</p>
                                  </div>
                                </div>

                                <div>
                                  <h3 className="font-semibold mb-2">Employee Paychecks</h3>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
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
                                          <TableCell>{entry.employeeName}</TableCell>
                                          <TableCell>
                                            {entry.regularHours}
                                            {entry.overtimeHours > 0 && (
                                              <span className="text-xs text-muted-foreground ml-1">
                                                (+{entry.overtimeHours} OT)
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell>${entry.grossPay}</TableCell>
                                          <TableCell className="text-xs">
                                            <div>Fed: ${entry.federalTax}</div>
                                            <div>State: ${entry.stateTax}</div>
                                            <div>SS: ${entry.socialSecurity}</div>
                                            <div>Med: ${entry.medicare}</div>
                                          </TableCell>
                                          <TableCell className="font-medium">${entry.netPay}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>

                                <div className="flex justify-end gap-2 pt-4">
                                  {runDetails.status === 'pending' && (
                                    <Button
                                      onClick={() => handleApproveClick(runDetails.id)}
                                      disabled={approveRunMutation.isPending}
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
                            variant="default"
                            size="sm"
                            onClick={() => handleApproveClick(run.id)}
                            disabled={approveRunMutation.isPending}
                            data-testid={`button-approve-${run.id}`}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                        )}

                        {run.status === 'approved' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => processRunMutation.mutate(run.id)}
                            disabled={processRunMutation.isPending}
                            data-testid={`button-process-${run.id}`}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Process
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Payroll Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This is the 1% human QC step. Please review the payroll calculations carefully before approving.
              Once approved, this payroll run can be processed for payment distribution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-approval">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApproval}
              disabled={approveRunMutation.isPending}
              data-testid="button-confirm-approval"
            >
              {approveRunMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve Payroll
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
