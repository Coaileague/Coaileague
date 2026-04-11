/**
 * CheckpointAlert Component
 * Displays alert when Trinity™ automation is paused (checkpoint saved)
 * Shows resume point, credits needed, and purchase/resume options
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { secureFetch } from '@/lib/csrf';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Play, CreditCard, Clock } from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

interface Checkpoint {
  id: string;
  workspaceId: string;
  automationType: string;
  status: 'paused' | 'resumed' | 'failed' | 'expired';
  stateSnapshot: Record<string, any>;
  partialResults: Record<string, any> | null;
  creditsNeeded: number;
  resumeParams: Record<string, any>;
  createdAt: string;
  resumedAt: string | null;
  expiresAt: string;
}

interface CheckpointAlertProps {
  workspaceId: string | null;
  variant?: 'compact' | 'detailed';
}

export function CheckpointAlert({ workspaceId, variant = 'detailed' }: CheckpointAlertProps) {
  const { toast } = useToast();

  // Fetch paused checkpoints
  const { data: checkpoints = [], isLoading } = useQuery<Checkpoint[]>({
    queryKey: ['/api/ai-brain/checkpoints', workspaceId],
    enabled: !!workspaceId,
  });

  // Resume automation mutation
  const resumeMutation = useMutation({
    mutationFn: async (checkpointId: string) => {
      const response = await secureFetch(`/api/ai-brain/checkpoints/${checkpointId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resume automation');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Automation Resumed",
        description: "Trinity™ is continuing from where it left off.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/checkpoints'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Resume Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading || !workspaceId || checkpoints.length === 0) {
    return null;
  }

  const pausedCheckpoints = checkpoints.filter(cp => cp.status === 'paused');
  if (pausedCheckpoints.length === 0) {
    return null;
  }

  const getAutomationLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'ai_scheduling': 'AI Scheduling',
      'smart_billing': 'Smart Billing',
      'auto_payroll': 'Auto Payroll',
      'ai_hiring': 'AI Hiring',
      'ai_chat': 'AI Chat',
      'ai_analytics': 'AI Analytics',
    };
    return labels[type] || type;
  };

  if (variant === 'compact') {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900 dark:text-amber-100">
          {pausedCheckpoints.length} Automation{pausedCheckpoints.length > 1 ? 's' : ''} Paused
        </AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Insufficient credits - automations paused at checkpoint.
          <Link href="/billing">
            <Button 
              variant="ghost" 
              className="h-auto p-0 ml-1 text-amber-900 dark:text-amber-100"
              data-testid="link-view-checkpoints"
            >
              View Details
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {pausedCheckpoints.map((checkpoint) => (
        <Card key={checkpoint.id} className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid={`checkpoint-${checkpoint.id}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                    {getAutomationLabel(checkpoint.automationType)} Paused
                  </h3>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                    Trinity™ saved your progress. Resume to continue — token usage will be billed at overage rate if allowance is exceeded.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-900 dark:text-amber-100">
                    ~<strong>{checkpoint.creditsNeeded.toLocaleString()}</strong> tokens estimated
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-800 dark:text-amber-200">
                    Paused {formatDistanceToNow(new Date(checkpoint.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <Badge variant="outline" className="border-amber-300 text-amber-900 dark:text-amber-100">
                  Expires {formatDistanceToNow(new Date(checkpoint.expiresAt), { addSuffix: true })}
                </Badge>
              </div>

              {checkpoint.partialResults && (
                <div className="text-sm text-amber-800 dark:text-amber-200 bg-amber-100/50 dark:bg-amber-900/20 rounded p-2">
                  <strong>Progress saved:</strong> {JSON.stringify(checkpoint.partialResults).substring(0, 100)}...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => resumeMutation.mutate(checkpoint.id)}
                disabled={resumeMutation.isPending}
                size="sm"
                variant="default"
                className="bg-primary hover:bg-primary/90"
                data-testid="button-resume-automation"
              >
                <Play className="h-4 w-4 mr-1" />
                {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
              </Button>
              <Link href="/settings/billing">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  data-testid="button-purchase-credits"
                >
                  <CreditCard className="h-4 w-4 mr-1" />
                  View Plan
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
