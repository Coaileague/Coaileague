import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Database,
  Users,
  Calendar,
  Receipt,
  DollarSign,
  RefreshCw,
  Link2,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  icon: typeof CheckCircle2;
  actionPath?: string;
  actionLabel?: string;
}

interface FlowState {
  flowId: string;
  workspaceId: string;
  stage: string;
  importedEmployeeCount: number;
  automationSettings: {
    autoInvoice: boolean;
    autoPayroll: boolean;
    autoSchedule: boolean;
  };
  errors: string[];
  warnings: string[];
  startedAt: string;
  completedAt?: string;
}

interface AutomationTrigger {
  id: string;
  automationType: string;
  enabled: boolean;
  lastTriggeredAt?: string;
  lastResultStatus?: string;
}

function StepIcon({ status }: { status: OnboardingStep['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />;
    case 'in_progress':
      return <Loader2 className="h-5 w-5 text-blue-500 dark:text-blue-400 animate-spin" />;
    case 'failed':
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    case 'skipped':
      return <Circle className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: OnboardingStep['status'] }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: 'default',
    in_progress: 'secondary',
    failed: 'destructive',
    pending: 'outline',
    skipped: 'outline',
  };
  const labels: Record<string, string> = {
    completed: 'Complete',
    in_progress: 'In Progress',
    failed: 'Failed',
    pending: 'Pending',
    skipped: 'Skipped',
  };
  return (
    <Badge variant={variants[status] || 'outline'}>
      {labels[status] || status}
    </Badge>
  );
}

function mapStageToSteps(flowState: FlowState | null): OnboardingStep[] {
  const baseSteps: OnboardingStep[] = [
    {
      id: 'connect',
      label: 'Connect QuickBooks',
      description: 'Link your QuickBooks account for automated data sync',
      status: 'pending',
      icon: Link2,
      actionPath: '/accounting-integrations',
      actionLabel: 'Connect',
    },
    {
      id: 'sync',
      label: 'Initial Data Sync',
      description: 'Import employees, customers, and historical data',
      status: 'pending',
      icon: Database,
    },
    {
      id: 'employees',
      label: 'Employee Import',
      description: 'Review and confirm imported employee records',
      status: 'pending',
      icon: Users,
      actionPath: '/employees',
      actionLabel: 'View Employees',
    },
    {
      id: 'schedules',
      label: 'Schedule Generation',
      description: 'AI-generated initial schedules based on historical patterns',
      status: 'pending',
      icon: Calendar,
    },
    {
      id: 'automation',
      label: 'Automation Setup',
      description: 'Configure automated invoicing, payroll, and scheduling',
      status: 'pending',
      icon: Sparkles,
      actionPath: '/automation-settings',
      actionLabel: 'Configure',
    },
  ];

  if (!flowState) {
    return baseSteps;
  }

  const stageMap: Record<string, { stepId: string; status: OnboardingStep['status'] }[]> = {
    oauth_initiated: [{ stepId: 'connect', status: 'in_progress' }],
    oauth_completed: [{ stepId: 'connect', status: 'completed' }],
    initial_sync_running: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'in_progress' },
    ],
    initial_sync_complete: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
    ],
    employees_importing: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'in_progress' },
    ],
    employees_imported: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'completed' },
    ],
    schedule_generating: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'completed' },
      { stepId: 'schedules', status: 'in_progress' },
    ],
    schedule_generated: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'completed' },
      { stepId: 'schedules', status: 'completed' },
    ],
    automation_configuring: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'completed' },
      { stepId: 'schedules', status: 'completed' },
      { stepId: 'automation', status: 'in_progress' },
    ],
    flow_complete: [
      { stepId: 'connect', status: 'completed' },
      { stepId: 'sync', status: 'completed' },
      { stepId: 'employees', status: 'completed' },
      { stepId: 'schedules', status: 'completed' },
      { stepId: 'automation', status: 'completed' },
    ],
    flow_failed: [],
  };

  const updates = stageMap[flowState.stage] || [];
  updates.forEach(update => {
    const step = baseSteps.find(s => s.id === update.stepId);
    if (step) {
      step.status = update.status;
    }
  });

  if (flowState.stage === 'flow_failed') {
    const lastCompletedIdx = baseSteps.findIndex(s => s.status === 'pending');
    if (lastCompletedIdx > 0) {
      baseSteps[lastCompletedIdx - 1].status = 'failed';
    }
  }

  return baseSteps;
}

export default function WorkspaceOnboarding() {
  const { toast } = useToast();
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const { user, workspace } = useAuth();

  const { data: flowData, isLoading: flowLoading } = useQuery<{
    success: boolean;
    flow: FlowState | null;
  }>({
    queryKey: ['/api/quickbooks/onboarding-flow', workspace?.id],
    enabled: !!workspace?.id,
  });

  const { data: triggersData, isLoading: triggersLoading } = useQuery<{
    success: boolean;
    triggers: AutomationTrigger[];
  }>({
    queryKey: ['/api/automation/triggers', workspace?.id],
    enabled: !!workspace?.id,
  });

  const retryMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const res = await apiRequest("POST", `/api/quickbooks/flow/${flowId}/retry`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Retry Initiated", description: "The flow is being retried." });
        queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/onboarding-flow'] });
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const flow = flowData?.flow;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const steps = mapStageToSteps(flow);
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / steps.length) * 100;
  const isComplete = flow?.stage === 'flow_complete';
  const hasFailed = flow?.stage === 'flow_failed';

  const triggers = triggersData?.triggers || [];
  const activeAutomations = triggers.filter(t => t.enabled);

  if (!workspace) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Please select a workspace to view onboarding status.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const setupCompleteBadge = isComplete ? (
    <Badge variant="default" className="gap-1">
      <CheckCircle2 className="h-4 w-4" />
      Setup Complete
    </Badge>
  ) : undefined;

  const pageConfig: CanvasPageConfig = {
    id: 'workspace-onboarding',
    title: 'Workspace Onboarding',
    subtitle: 'Track your setup progress and automation status',
    category: 'operations',
    headerActions: setupCompleteBadge,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                Setup Progress
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {isComplete 
                  ? 'Your workspace is fully configured and automations are active.'
                  : `${completedSteps} of ${steps.length} steps completed`
                }
              </CardDescription>
            </div>
            {hasFailed && flow && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => retryMutation.mutate(flow.flowId)}
                disabled={retryMutation.isPending}
                data-testid="button-retry-flow"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Retry
              </Button>
            )}
          </div>
          <Progress value={progress} className="mt-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-3 sm:gap-4" data-testid={`step-${step.id}`}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <StepIcon status={step.status} />
                  {idx < steps.length - 1 && (
                    <div className="w-px h-8 bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                    <div className="min-w-0">
                      <h4 className="font-medium text-sm sm:text-base">{step.label}</h4>
                      <p className="text-xs sm:text-sm text-muted-foreground">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mt-1 sm:mt-0">
                      <StatusBadge status={step.status} />
                      {step.actionPath && step.status === 'pending' && (
                        <Link href={step.actionPath}>
                          <Button variant="outline" size="sm" data-testid={`button-action-${step.id}`}>
                            {step.actionLabel}
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {flow?.errors && flow.errors.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <h4 className="font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Errors
                </h4>
                {flow.errors.map((error, idx) => (
                  <p key={idx} className="text-sm text-destructive/80">{error}</p>
                ))}
              </div>
            </>
          )}

          {flow?.warnings && flow.warnings.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <h4 className="font-medium text-amber-500 dark:text-amber-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Warnings
                </h4>
                {flow.warnings.map((warning, idx) => (
                  <p key={idx} className="text-sm text-amber-500/80 dark:text-amber-400/80">{warning}</p>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees Imported</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-employee-count">
              {flow?.importedEmployeeCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">from QuickBooks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Automations</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-automation-count">
              {activeAutomations.length}
            </div>
            <p className="text-xs text-muted-foreground">configured triggers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Setup Started</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-started-at">
              {flow?.startedAt 
                ? new Date(flow.startedAt).toLocaleDateString()
                : 'Not started'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {flow?.completedAt && `Completed ${new Date(flow.completedAt).toLocaleDateString()}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {isComplete && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Automation Active
            </CardTitle>
            <CardDescription>
              Your workspace is configured for automated operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${flow?.automationSettings.autoSchedule ? 'bg-green-500/10' : 'bg-muted'}`}>
                  <Calendar className={`h-5 w-5 ${flow?.automationSettings.autoSchedule ? 'text-green-600' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-medium">Auto-Scheduling</p>
                  <p className="text-sm text-muted-foreground">
                    {flow?.automationSettings.autoSchedule ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${flow?.automationSettings.autoInvoice ? 'bg-green-500/10' : 'bg-muted'}`}>
                  <Receipt className={`h-5 w-5 ${flow?.automationSettings.autoInvoice ? 'text-green-600' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-medium">Auto-Invoicing</p>
                  <p className="text-sm text-muted-foreground">
                    {flow?.automationSettings.autoInvoice ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${flow?.automationSettings.autoPayroll ? 'bg-green-500/10' : 'bg-muted'}`}>
                  <DollarSign className={`h-5 w-5 ${flow?.automationSettings.autoPayroll ? 'text-green-600' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-medium">Auto-Payroll</p>
                  <p className="text-sm text-muted-foreground">
                    {flow?.automationSettings.autoPayroll ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </CanvasHubPage>
  );
}
