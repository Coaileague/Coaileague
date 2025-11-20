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
import { PageHeader } from "@/components/page-header";
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
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { format, subDays, addDays } from "date-fns";

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
        title: "✅ AI Scheduling Complete",
        description: `Generated ${data.assignmentsCount || 0} shift assignments. Transaction ID: ${data.transactionId?.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      const isInsufficientCredits = error.message?.includes('402') || error.message?.includes('Insufficient credits');
      toast({
        title: isInsufficientCredits ? "⚠️ Insufficient Credits" : "❌ Scheduling Failed",
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
      const res = await apiRequest('POST', '/api/automation/invoice/generate', {
        anchorDate: new Date().toISOString(),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Invoice Generation Complete",
        description: `Generated ${data.invoicesCount || 0} invoices. Check your Stripe dashboard for details.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Invoicing Failed",
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
        title: "✅ Payroll Processing Complete",
        description: `Processed payroll for ${data.employeesCount || 0} employees. Check Gusto for details.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Payroll Failed",
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
        title: "✅ Compliance Scan Complete",
        description: `Found ${data.totalIssues || 0} issues (${data.summary?.critical || 0} critical). Review in dashboard.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/credits'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Compliance Scan Failed",
        description: error.message || "Failed to run compliance scan",
        variant: "destructive",
      });
    },
  });

  const isAnyAutomationRunning = schedulingMutation.isPending || invoicingMutation.isPending || payrollMutation.isPending || complianceMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="AI Brain Automation Control"
        description="Manually trigger and monitor autonomous AI operations"
        align="left"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] })}
          disabled={statusLoading}
          data-testid="button-refresh-status"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </PageHeader>

      <div className="responsive-container">
        <div className="responsive-spacing-y">
          {/* Credit Balance Alert */}
          {credits && credits.balance < 50 && (
            <Alert className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <strong>Low Credit Balance:</strong> You have {credits.balance} credits remaining. 
                <button
                  className="text-amber-800 dark:text-amber-200 underline ml-2 cursor-pointer hover:text-amber-900 dark:hover:text-amber-100"
                  onClick={() => setLocation('/usage')}
                  data-testid="button-buy-credits"
                >
                  Purchase more credits
                </button>
              </AlertDescription>
            </Alert>
          )}

          {/* Automation Cards */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* AI Scheduling */}
            <Card className="hover-elevate">
              <CardHeader>
                <div className="flex items-start justify-between">
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
                    <div className="flex justify-between">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.scheduling.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.scheduling.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
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
                <div className="flex items-start justify-between">
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
                    <div className="flex justify-between">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.invoicing.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.invoicing.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
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
                <div className="flex items-start justify-between">
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
                    <div className="flex justify-between">
                      <span>Last Run:</span>
                      <span className="font-medium">{format(new Date(status.payroll.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Success Rate:</span>
                      <span className="font-medium">{(status.payroll.successRate * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
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
                <div className="flex items-start justify-between">
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
                    <div className="flex justify-between">
                      <span>Last Scan:</span>
                      <span className="font-medium">{format(new Date(status.compliance.lastRun), 'MMM d, h:mm a')}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Issues Found:</span>
                      <span className="font-medium">{status.compliance.issuesDetected}</span>
                    </div>
                  </div>
                )}
                
                <div className="pt-2 border-t space-y-2">
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
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
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>AI Scheduling</span>
                  </div>
                  <Badge variant="outline">Daily 11:00 PM</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>Invoice Generation</span>
                  </div>
                  <Badge variant="outline">Daily 2:00 AM</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Payroll Processing</span>
                  </div>
                  <Badge variant="outline">Daily 3:00 AM</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
