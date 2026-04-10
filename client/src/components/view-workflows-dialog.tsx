import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Workflow {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'failed' | 'pending';
  startTime: string;
  endTime?: string;
  progress: number;
  steps: { name: string; status: 'pending' | 'running' | 'completed' | 'failed' }[];
}

interface ViewWorkflowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
}

export function ViewWorkflowsDialog({
  open,
  onOpenChange,
  workspaceId,
}: ViewWorkflowsDialogProps) {
  const { data: workflows, isLoading } = useQuery({
    queryKey: ['/api/workflows/status'],
    retry: 1,
    enabled: open,
  });

  const statusBadges = {
    active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const workflowList: Workflow[] = workflows?.data || [
    {
      id: '1',
      name: 'Schedule Auto-Fill',
      status: 'active',
      startTime: new Date().toISOString(),
      progress: 65,
      steps: [
        { name: 'Fetch Open Shifts', status: 'completed' },
        { name: 'Analyze Patterns', status: 'running' },
        { name: 'Match Employees', status: 'pending' },
        { name: 'Assign Shifts', status: 'pending' },
      ],
    },
    {
      id: '2',
      name: 'Payroll Processing',
      status: 'completed',
      startTime: '2 hours ago',
      endTime: '30 minutes ago',
      progress: 100,
      steps: [
        { name: 'Calculate Hours', status: 'completed' },
        { name: 'Apply Deductions', status: 'completed' },
        { name: 'Generate Paystubs', status: 'completed' },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Active Workflows
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="space-y-4 pr-4">
            {isLoading ? (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            ) : (
              workflowList.map((workflow) => (
                <div
                  key={workflow.id}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-800"
                  data-testid={`workflow-card-${workflow.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{workflow.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{workflow.startTime}</span>
                      </div>
                    </div>
                    <Badge className={statusBadges[workflow.status]}>
                      {workflow.status.charAt(0).toUpperCase() + workflow.status.slice(1)}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{workflow.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${workflow.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-2">
                    {workflow.steps.map((step: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`workflow-step-${idx}`}
                      >
                        {step.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                        {step.status === 'running' && (
                          <Activity className="w-4 h-4 text-blue-600 animate-spin" />
                        )}
                        {step.status === 'failed' && (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        {step.status === 'pending' && (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                        <span className="text-muted-foreground">{step.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
