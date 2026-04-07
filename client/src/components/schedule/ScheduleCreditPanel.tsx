import { useQuery } from '@tanstack/react-query';
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Zap, CheckCircle, Clock,
  XCircle, Loader2, Activity, ArrowRight,
} from 'lucide-react';

interface OperationStep {
  step: string;
  status: string;
  durationMs?: number;
}

interface ActiveOperation {
  orchestrationId: string;
  domain: string;
  actionName: string;
  status: string;
  currentStep: string;
  stepStatus: string;
  steps: OperationStep[];
  createdAt: string;
}

const STEP_ORDER = ['TRIGGER', 'FETCH', 'VALIDATE', 'PROCESS', 'MUTATE', 'CONFIRM', 'NOTIFY'] as const;

const STEP_LABELS: Record<string, string> = {
  TRIGGER: 'Initiated',
  FETCH: 'Loading Data',
  VALIDATE: 'Validating',
  PROCESS: 'AI Processing',
  MUTATE: 'Applying Changes',
  CONFIRM: 'Confirming',
  NOTIFY: 'Notifying',
};

const STEP_ICONS: Record<string, typeof Zap> = {
  TRIGGER: Zap,
  FETCH: Activity,
  VALIDATE: CheckCircle,
  PROCESS: Loader2,
  MUTATE: ArrowRight,
  CONFIRM: CheckCircle,
  NOTIFY: Activity,
};

function StepStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === 'started' || status === 'in_progress') return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function OperationStepTracker({ operation }: { operation: ActiveOperation }) {
  const completedSteps = operation.steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / 7) * 100;

  return (
    <div className="space-y-2" data-testid={`operation-tracker-${operation.orchestrationId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate">{operation.actionName.replace(/_/g, ' ')}</span>
        <Badge variant="outline" className="text-[10px]">
          {operation.status === 'in_progress' ? 'Running' : operation.status}
        </Badge>
      </div>
      <Progress value={progress} className="h-1.5" />
      <div className="grid grid-cols-7 gap-0.5">
        {STEP_ORDER.map((step) => {
          const stepData = operation.steps.find(s => s.step === step);
          const status = stepData?.status || 'pending';
          return (
            <div
              key={step}
              className="flex flex-col items-center"
              title={`${STEP_LABELS[step]}: ${status}`}
              data-testid={`step-${step.toLowerCase()}`}
            >
              <StepStatusIcon status={status} />
              <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">
                {step.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OperationVisibilityPanel({
  workspaceId,
  orchestrationId,
}: {
  workspaceId: string | undefined;
  orchestrationId: string | null;
}) {
  const { data: stepsData } = useQuery({
    queryKey: ['/api/orchestrated-schedule/orchestration', orchestrationId, 'steps'],
    enabled: !!orchestrationId,
    refetchInterval: 2000,
    queryFn: () => apiFetch(`/api/orchestrated-schedule/orchestration/${orchestrationId}/steps`, AnyResponse),
  });

  if (!orchestrationId || !stepsData) return null;

  const steps = (stepsData as any)?.steps || [];
  const status = (stepsData as any)?.status || 'unknown';
  const completedSteps = steps.filter((s: any) => s.status === 'completed').length;

  return (
    <Card className="p-3 space-y-2" data-testid="operation-visibility-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Pipeline Progress</span>
        </div>
        <Badge variant={status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'outline'}>
          {status === 'in_progress' ? `${completedSteps}/7` : status}
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        {STEP_ORDER.map((step, i) => {
          const stepData = steps.find((s: any) => s.step === step);
          const stepStatus = stepData?.status || 'pending';
          const isActive = stepStatus === 'started' || stepStatus === 'in_progress';
          const isCompleted = stepStatus === 'completed';
          const isFailed = stepStatus === 'failed';

          return (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`flex flex-col items-center flex-1 ${
                  isActive ? 'scale-105' : ''
                }`}
                title={`${STEP_LABELS[step]} - ${stepStatus}${stepData?.durationMs ? ` (${stepData.durationMs}ms)` : ''}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isCompleted
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : isFailed
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                      : isActive
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 animate-pulse'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : 
                   isFailed ? <XCircle className="w-3.5 h-3.5" /> :
                   isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                   i + 1}
                </div>
                <span className="text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap">
                  {STEP_LABELS[step]}
                </span>
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div className={`h-px flex-shrink-0 w-2 ${
                  isCompleted ? 'bg-green-400' : 'bg-border'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {steps.some((s: any) => s.status === 'failed') && (
        <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-md px-2 py-1">
          {steps.find((s: any) => s.status === 'failed')?.error || 'Step failed - check escalation status'}
        </div>
      )}
    </Card>
  );
}
