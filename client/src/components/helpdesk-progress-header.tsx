import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle, Clock, MessageCircle, AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { TicketViewModel } from "@shared/helpdeskUtils";

type TicketStatus = 'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated';

interface ProgressHeaderProps {
  status?: TicketStatus;
  assignedAgent?: string;
  slaRemaining?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  ticketId?: string;
  fetchLiveData?: boolean;
  className?: string;
}

const statusConfig: Record<TicketStatus, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  new: {
    label: 'New',
    icon: AlertCircle,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-950/30'
  },
  assigned: {
    label: 'Assigned',
    icon: Clock,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-950/30'
  },
  investigating: {
    label: 'Investigating',
    icon: MessageCircle,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-950/30'
  },
  waiting_user: {
    label: 'Waiting on You',
    icon: Clock,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-950/30'
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-950/30'
  },
  escalated: {
    label: 'Escalated',
    icon: TrendingUp,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-950/30'
  }
};

const priorityConfig = {
  low: { label: 'Low', color: 'bg-gray-500' },
  normal: { label: 'Normal', color: 'bg-blue-500' },
  high: { label: 'High', color: 'bg-amber-500' },
  urgent: { label: 'Urgent', color: 'bg-red-500' }
};

export function HelpDeskProgressHeader({
  status: propStatus,
  assignedAgent: propAssignedAgent,
  slaRemaining: propSlaRemaining,
  priority: propPriority = 'normal',
  ticketId,
  fetchLiveData = false,
  className
}: ProgressHeaderProps) {
  const { data: ticketData } = useQuery<TicketViewModel>({
    queryKey: ['/api/chat/tickets', ticketId],
    enabled: fetchLiveData && !!ticketId,
    refetchInterval: 30000,
  });
  
  const status = (ticketData?.status || propStatus || 'new') as TicketStatus;
  const assignedAgent = ticketData?.assignedAgent || propAssignedAgent;
  const slaRemaining = ticketData?.slaRemaining ?? propSlaRemaining;
  const priority = (ticketData?.priority || propPriority) as 'low' | 'normal' | 'high' | 'urgent';
  const displayTicketId = ticketData?.ticketNumber || ticketId;
  
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Card className={cn("border-0 shadow-none", className)} data-testid="helpdesk-progress-header">
      <div className={cn("px-4 py-3 rounded-lg", config.bgColor)}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={cn("w-5 h-5 flex-shrink-0", config.color)} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("font-semibold text-sm", config.color)} data-testid="status-label">
                  {config.label}
                </span>
                {displayTicketId && (
                  <span className="text-xs text-muted-foreground">
                    #{typeof displayTicketId === 'string' && displayTicketId.length > 8 ? displayTicketId.slice(-8) : displayTicketId}
                  </span>
                )}
              </div>
              {assignedAgent && (
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="assigned-agent">
                  Agent: {assignedAgent}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {priority && (
              <Badge 
                variant="secondary" 
                className={cn("text-white", priorityConfig[priority].color)}
                data-testid="priority-badge"
              >
                {priorityConfig[priority].label}
              </Badge>
            )}
            {slaRemaining !== undefined && slaRemaining > 0 && (
              <Badge variant="outline" className="text-xs" data-testid="sla-badge">
                <Clock className="w-3 h-3 mr-1" />
                {Math.floor(slaRemaining / 60)}m
              </Badge>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mt-3 flex items-center gap-2">
          {['assigned', 'investigating', 'waiting_user', 'resolved'].map((step, idx) => {
            const isActive = ['new', 'assigned'].includes(status) && idx === 0 ||
                           status === 'investigating' && idx <= 1 ||
                           status === 'waiting_user' && idx <= 2 ||
                           ['resolved', 'escalated'].includes(status) && idx <= 3;
            const isCurrent = statusConfig[status as TicketStatus].label === statusConfig[step as TicketStatus].label;

            return (
              <div key={step} className="flex items-center gap-2 flex-1">
                <div 
                  className={cn(
                    "h-1 rounded-full flex-1 transition-colors",
                    isActive ? "bg-current" : "bg-muted",
                    isCurrent && config.color
                  )}
                  data-testid={`progress-step-${step}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
