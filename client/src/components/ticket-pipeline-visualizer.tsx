/**
 * Ticket Pipeline Visualizer Component
 * Shows the 7-step workflow: TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * NO HARDCODED VALUES - All configuration from ticketWorkflow.ts
 */

import { cn } from "@/lib/utils";
import { 
  TICKET_PIPELINE_STEPS, 
  PIPELINE_STATUS_STYLES,
  type PipelineStepId, 
  type PipelineState 
} from "@/config/ticketWorkflow";
import { 
  Play, Download, Shield, Cpu, Database, CheckCircle, Bell, 
  AlertCircle, Loader2 
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Play,
  Download,
  Shield,
  Cpu,
  Database,
  CheckCircle,
  Bell,
};

const styles = PIPELINE_STATUS_STYLES;

interface TicketPipelineVisualizerProps {
  pipelineState: PipelineState;
  compact?: boolean;
  className?: string;
}

export function TicketPipelineVisualizer({
  pipelineState,
  compact = false,
  className,
}: TicketPipelineVisualizerProps) {
  const { currentStep, completedSteps, error, isComplete } = pipelineState;

  const getStepStatus = (stepId: PipelineStepId): 'completed' | 'current' | 'pending' | 'error' => {
    if (error?.step === stepId) return 'error';
    if (completedSteps.includes(stepId)) return 'completed';
    if (stepId === currentStep && !isComplete) return 'current';
    return 'pending';
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)} data-testid="pipeline-compact">
        {TICKET_PIPELINE_STEPS.map((step, index) => {
          const status = getStepStatus(step.id);
          const isLast = index === TICKET_PIPELINE_STEPS.length - 1;

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  status === 'completed' && styles.completed.dot,
                  status === 'current' && cn(step.bgColor, styles.current.dotAnimation),
                  status === 'pending' && styles.pending.dot,
                  status === 'error' && styles.error.dot
                )}
                title={`${step.label}: ${step.description}`}
                data-testid={`pipeline-dot-${step.id}`}
              />
              {!isLast && (
                <div className={cn(
                  "w-3 h-0.5 mx-0.5",
                  status === 'completed' ? styles.completed.connector : styles.pending.connector
                )} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("p-4", className)} data-testid="pipeline-visualizer">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Pipeline Progress
        </span>
        {isComplete && (
          <span className={cn("text-xs font-medium flex items-center gap-1", styles.completed.text)}>
            <CheckCircle className="w-3 h-3" />
            Complete
          </span>
        )}
        {error && (
          <span className={cn("text-xs font-medium flex items-center gap-1", styles.error.text)}>
            <AlertCircle className="w-3 h-3" />
            Error at {error.step}
          </span>
        )}
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-1">
          {TICKET_PIPELINE_STEPS.map((step, index) => {
            const status = getStepStatus(step.id);
            const Icon = iconMap[step.icon] || CheckCircle;
            const isLast = index === TICKET_PIPELINE_STEPS.length - 1;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300",
                      status === 'completed' && cn(styles.completed.bg, styles.completed.border, styles.completed.textWhite),
                      status === 'current' && cn(step.bgColor, step.borderColor, step.color),
                      status === 'pending' && cn(styles.pending.bg, styles.pending.border, styles.pending.text),
                      status === 'error' && cn(styles.error.bg, styles.error.border, styles.error.text)
                    )}
                    data-testid={`pipeline-step-${step.id}`}
                  >
                    {status === 'current' && !error ? (
                      <Loader2 className={cn("w-4 h-4", styles.current.iconAnimation)} />
                    ) : status === 'completed' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : status === 'error' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium text-center",
                    status === 'completed' && styles.completed.text,
                    status === 'current' && step.color,
                    status === 'pending' && styles.pending.text,
                    status === 'error' && styles.error.text
                  )}>
                    {step.label}
                  </span>
                </div>
                
                {!isLast && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-1 mt-4 transition-all duration-300",
                    status === 'completed' ? styles.completed.connector : styles.pending.connector
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className={cn("mt-3 p-2 border rounded text-xs", styles.error.containerBg, styles.error.containerBorder, styles.error.containerText)} data-testid="pipeline-error">
          {error.message}
        </div>
      )}
    </div>
  );
}

export function PipelineStepIndicator({
  stepId,
  status,
  showLabel = true,
}: {
  stepId: PipelineStepId;
  status: 'completed' | 'current' | 'pending' | 'error';
  showLabel?: boolean;
}) {
  const step = TICKET_PIPELINE_STEPS.find(s => s.id === stepId);
  if (!step) return null;

  const Icon = iconMap[step.icon] || CheckCircle;

  return (
    <div className="flex items-center gap-2" data-testid={`step-indicator-${stepId}`}>
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
          status === 'completed' && cn(styles.completed.bg, styles.completed.border, styles.completed.textWhite),
          status === 'current' && cn(step.bgColor, step.borderColor, step.color),
          status === 'pending' && cn(styles.pending.bg, styles.pending.border, styles.pending.text),
          status === 'error' && cn(styles.error.bg, styles.error.border, styles.error.text)
        )}
      >
        {status === 'current' ? (
          <Loader2 className={cn("w-3 h-3", styles.current.iconAnimation)} />
        ) : status === 'completed' ? (
          <CheckCircle className="w-3 h-3" />
        ) : (
          <Icon className="w-3 h-3" />
        )}
      </div>
      {showLabel && (
        <div>
          <span className={cn(
            "text-xs font-medium",
            status === 'completed' && styles.completed.text,
            status === 'current' && step.color,
            status === 'pending' && styles.pending.text,
            status === 'error' && styles.error.text
          )}>
            {step.label}
          </span>
          <p className="text-[10px] text-muted-foreground">{step.description}</p>
        </div>
      )}
    </div>
  );
}
