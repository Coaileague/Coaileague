import { secureFetch } from "@/lib/csrf";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle, Clock, MessageCircle, AlertCircle, TrendingUp, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { TicketViewModel } from "@shared/helpdeskUtils";
import { 
  LIFECYCLE_PHASE_CONFIG, 
  mapUIStatusToLifecyclePhase,
  type TicketLifecyclePhase,
  type TicketPriority 
} from "@shared/helpdeskUtils";

interface ProgressHeaderProps {
  ticketId?: string;
  fetchLiveData?: boolean;
  className?: string;
  isStaff?: boolean;
}

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-500' },
  normal: { label: 'Normal', color: 'bg-emerald-500' },
  high: { label: 'High', color: 'bg-blue-500' },
  urgent: { label: 'Urgent', color: 'bg-red-500' }
};

const LIFECYCLE_STEPS: TicketLifecyclePhase[] = [
  'intake',
  'triage',
  'diagnosing',
  'validating',
  'completed'
];

export function HelpDeskProgressHeader({
  ticketId,
  fetchLiveData = true,
  className,
  isStaff: propIsStaff
}: ProgressHeaderProps) {
  const { user } = useAuth();
  
  const { data: ticketData, isLoading, isError } = useQuery<TicketViewModel>({
    queryKey: ['/api/chat/tickets', ticketId],
    queryFn: async () => {
      const response = await secureFetch(`/api/chat/tickets/${ticketId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ticket: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: fetchLiveData && !!ticketId,
    refetchInterval: 30000,
  });
  
  // Loading state
  if (isLoading) {
    return (
      <Card className={cn("border-0 shadow-none", className)}>
        <div className="px-4 py-3 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-400 animate-pulse" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Loading ticket information...
            </span>
          </div>
        </div>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className={cn("border-0 shadow-none", className)}>
        <div className="px-4 py-3 rounded-lg bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400">
              Unable to load ticket information
            </span>
          </div>
        </div>
      </Card>
    );
  }

  // No data state (query disabled or no ticket ID)
  if (!ticketData) {
    return (
      <Card className={cn("border-0 shadow-none", className)}>
        <div className="px-4 py-3 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {!ticketId ? 'No ticket selected' : 'Loading ticket information...'}
            </span>
          </div>
        </div>
      </Card>
    );
  }
  
  const lifecyclePhase = mapUIStatusToLifecyclePhase(ticketData.status);
  const isEscalated = ticketData.status === 'escalated';
  
  const config = LIFECYCLE_PHASE_CONFIG[lifecyclePhase];
  const isStaffUser = propIsStaff ?? ((user as any)?.platformRole && 
    ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((user as any).platformRole));
  
  const displayLabel = isEscalated 
    ? (isStaffUser ? 'Platform Escalated' : 'Escalated to Senior Support')
    : (isStaffUser ? config.label : config.customerLabel);
  const currentStepOrder = config.order;

  return (
    <Card className={cn("border-0 shadow-none", className)} data-testid="helpdesk-progress-header">
      <div className={cn(
        "px-4 py-3 rounded-lg border",
        isEscalated 
          ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-red-300 dark:border-red-700"
          : "bg-gradient-to-r from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 border-slate-200 dark:border-slate-700"
      )}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              isEscalated ? 'bg-red-500 animate-pulse' :
              lifecyclePhase === 'completed' ? 'bg-emerald-500' :
              'bg-blue-500 animate-pulse'
            )} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isEscalated && (
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                )}
                <span className={cn(
                  "font-semibold text-sm",
                  isEscalated ? 'text-red-600 dark:text-red-400' : config.color
                )} data-testid="status-label">
                  {displayLabel}
                </span>
                {ticketData.ticketNumber && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    #{ticketData.ticketNumber.slice(-8)}
                  </span>
                )}
              </div>
              {isStaffUser && ticketData.assignedAgent && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5" data-testid="assigned-agent">
                  Agent: {ticketData.assignedAgent}
                </p>
              )}
              {!isStaffUser && isEscalated && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 font-medium">
                  Your request has been escalated to our senior support team
                </p>
              )}
              {!isStaffUser && !isEscalated && lifecyclePhase !== 'completed' && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  We're working on your request
                </p>
              )}
              {!isStaffUser && !isEscalated && lifecyclePhase === 'completed' && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                  Your request has been resolved
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge 
              variant="secondary" 
              className={cn("text-white text-xs", priorityConfig[ticketData.priority].color)}
              data-testid="priority-badge"
            >
              {priorityConfig[ticketData.priority].label}
            </Badge>
            {isStaffUser && ticketData.slaRemaining > 0 && (
              <Badge variant="outline" className="text-xs" data-testid="sla-badge">
                <Clock className="w-3 h-3 mr-1" />
                {Math.floor(ticketData.slaRemaining / 60)}m
              </Badge>
            )}
          </div>
        </div>

        {/* Progressive Color Bars - CoAIleague emerald/cyan gradient (or red for escalated) */}
        <div className="mt-3 flex items-center gap-1">
          {LIFECYCLE_STEPS.map((step) => {
            const stepConfig = LIFECYCLE_PHASE_CONFIG[step];
            const isCompleted = stepConfig.order < currentStepOrder;
            const isCurrent = stepConfig.order === currentStepOrder;
            const isPending = stepConfig.order > currentStepOrder;

            return (
              <div 
                key={step}
                className={cn(
                  "h-1.5 rounded-full flex-1 transition-all duration-500",
                  isCompleted && "bg-gradient-to-r from-emerald-500 to-cyan-500",
                  isCurrent && isEscalated && "bg-gradient-to-r from-red-500 to-orange-500 animate-pulse",
                  isCurrent && !isEscalated && `bg-gradient-to-r ${stepConfig.gradient} animate-pulse`,
                  isPending && "bg-slate-200 dark:bg-slate-700"
                )}
                data-testid={`progress-step-${step}`}
                title={isEscalated && isCurrent ? 'Escalated to Platform Support' : (isStaffUser ? stepConfig.label : stepConfig.customerLabel)}
                aria-label={isEscalated && isCurrent ? 'Escalated to Platform Support' : (isStaffUser ? stepConfig.label : stepConfig.customerLabel)}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
}
