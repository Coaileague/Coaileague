import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from '@/components/ui/universal-modal';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  UserCheck, 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';

interface SchedulingMutation {
  id: string;
  type: string;
  description: string;
  employeeName?: string;
  clientName?: string;
  startTime?: string;
  endTime?: string;
  estimatedHours?: number;
  estimatedCost?: number;
  reason?: string;
}

interface SchedulingSummary {
  shiftsCreated: number;
  shiftsEdited: number;
  shiftsDeleted: number;
  employeesSwapped: number;
  openShiftsFilled: number;
  totalHoursScheduled: number;
  estimatedLaborCost: number;
}

interface TrinitySchedulingResult {
  success: boolean;
  sessionId: string;
  executionId: string;
  totalMutations: number;
  mutations?: SchedulingMutation[];
  summary: SchedulingSummary;
  aiSummary: string;
  requiresVerification: boolean;
  verificationDeadline?: string;
}

interface TrinitySchedulingSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: TrinitySchedulingResult | null;
  workspaceId: string;
  onVerified?: () => void;
  onRejected?: () => void;
}

function getMutationIcon(type: string) {
  switch (type) {
    case 'create_shift':
      return <Plus className="h-4 w-4 text-green-500" />;
    case 'edit_shift':
      return <Pencil className="h-4 w-4 text-blue-500" />;
    case 'delete_shift':
      return <Trash2 className="h-4 w-4 text-red-500" />;
    case 'swap_employees':
      return <RefreshCw className="h-4 w-4 text-purple-500" />;
    case 'fill_open_shift':
      return <UserCheck className="h-4 w-4 text-teal-500" />;
    default:
      return <Calendar className="h-4 w-4 text-muted-foreground" />;
  }
}

function getMutationBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (type) {
    case 'create_shift':
    case 'fill_open_shift':
      return 'default';
    case 'delete_shift':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function TrinitySchedulingSummaryModal({
  open,
  onOpenChange,
  result,
  workspaceId,
  onVerified,
  onRejected,
}: TrinitySchedulingSummaryModalProps) {
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!result?.executionId) throw new Error('No execution ID');
      return await apiRequest('POST', `/api/execution-tracker/executions/${result.executionId}/verify`, {
        workspaceId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/execution-tracker'] });
      toast({
        title: 'Changes Verified',
        description: 'The schedule changes have been confirmed and saved.',
      });
      onOpenChange(false);
      onVerified?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Verification Failed',
        description: error.message,
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!result?.executionId) throw new Error('No execution ID');
      return await apiRequest('POST', `/api/execution-tracker/executions/${result.executionId}/reject`, {
        workspaceId,
        reason: 'User rejected scheduling changes',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/execution-tracker'] });
      toast({
        title: 'Changes Rejected',
        description: 'The schedule changes have been rolled back.',
      });
      onOpenChange(false);
      onRejected?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Rejection Failed',
        description: error.message,
      });
    },
  });

  if (!result) return null;

  const { summary, aiSummary, totalMutations, mutations = [] } = result;

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange} size="lg" className="flex flex-col" showHomeButton={false} data-testid="modal-trinity-scheduling-summary">
        <UniversalModalHeader>
          <UniversalModalTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Trinity Scheduling Complete
          </UniversalModalTitle>
          <UniversalModalDescription>
            Review the changes Trinity made to optimize your schedule
          </UniversalModalDescription>
        </UniversalModalHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            <Card data-testid="card-ai-summary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ai-summary">
                  {aiSummary}
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="flex justify-center mb-2">
                    <Plus className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold" data-testid="stat-shifts-created">{summary.shiftsCreated}</p>
                  <p className="text-xs text-muted-foreground">Shifts Created</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="flex justify-center mb-2">
                    <UserCheck className="h-5 w-5 text-teal-500" />
                  </div>
                  <p className="text-2xl font-bold" data-testid="stat-shifts-filled">{summary.openShiftsFilled}</p>
                  <p className="text-xs text-muted-foreground">Gaps Filled</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="flex justify-center mb-2">
                    <RefreshCw className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold" data-testid="stat-swaps">{summary.employeesSwapped}</p>
                  <p className="text-xs text-muted-foreground">Reassignments</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="flex justify-center mb-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold" data-testid="stat-hours">{summary.totalHoursScheduled.toFixed(0)}h</p>
                  <p className="text-xs text-muted-foreground">Hours Scheduled</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium">Estimated Labor Cost</span>
                  </div>
                  <span className="text-lg font-bold text-green-600" data-testid="stat-labor-cost">
                    ${summary.estimatedLaborCost.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {mutations.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Change Details ({totalMutations} changes)
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {mutations.map((mutation) => (
                      <div
                        key={mutation.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                        data-testid={`mutation-item-${mutation.id}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {getMutationIcon(mutation.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getMutationBadgeVariant(mutation.type)} className="text-xs">
                              {mutation.type.replace(/_/g, ' ')}
                            </Badge>
                            {mutation.employeeName && (
                              <span className="text-xs text-muted-foreground">
                                {mutation.employeeName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1">{mutation.description}</p>
                          {mutation.startTime && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(mutation.startTime), 'EEE, MMM d h:mm a')}
                              {mutation.endTime && ` - ${format(new Date(mutation.endTime), 'h:mm a')}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      Human Verification Required
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      AI can make mistakes. Our service requires human verification of all automated schedules before publishing. 
                      Please review the changes above carefully and confirm or reject them.
                      {result.requiresVerification && ' Changes will be reverted if not verified within 24 hours.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <UniversalModalFooter className="gap-2 sm:gap-0 pt-4">
          <Button
            variant="outline"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || verifyMutation.isPending}
            data-testid="button-reject-changes"
          >
            <X className="h-4 w-4 mr-2" />
            {rejectMutation.isPending ? 'Rolling Back...' : 'Reject Changes'}
          </Button>
          <Button
            onClick={() => verifyMutation.mutate()}
            disabled={rejectMutation.isPending || verifyMutation.isPending}
            data-testid="button-verify-changes"
          >
            <Check className="h-4 w-4 mr-2" />
            {verifyMutation.isPending ? 'Confirming...' : 'Confirm Changes'}
          </Button>
        </UniversalModalFooter>
    </UniversalModal>
  );
}
