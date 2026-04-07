/**
 * AGENT PROGRESS TRACKER
 * ======================
 * Shows X/Y completed steps with ETA and current action.
 * Updates in real-time as Trinity executes.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { Progress as ProgressData } from '@/hooks/use-trinity-state';

interface AgentProgressTrackerProps {
  progress: ProgressData | null;
  isExecuting?: boolean;
  hasError?: boolean;
}

export function AgentProgressTracker({ progress, isExecuting, hasError }: AgentProgressTrackerProps) {
  if (!progress && !isExecuting) {
    return null;
  }

  const percentage = progress 
    ? (progress.completed / progress.total) * 100 
    : 0;
  
  const isComplete = progress?.completed === progress?.total && progress?.total > 0;
  
  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card data-testid="panel-progress-tracker">
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : hasError ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : null}
              <span className="text-sm font-medium">
                {isComplete ? 'Complete' : hasError ? 'Error' : 'Progress'}
              </span>
            </div>
            <Badge variant="outline" className="text-xs">
              {progress?.completed || 0}/{progress?.total || 0}
            </Badge>
          </div>

          <Progress 
            value={percentage} 
            className={`h-2 ${hasError ? '[&>div]:bg-destructive' : isComplete ? '[&>div]:bg-emerald-500' : ''}`}
          />

          <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
            <span className="truncate max-w-[200px]" title={progress?.currentAction}>
              {progress?.currentAction || 'Initializing...'}
            </span>
            {!isComplete && progress?.eta !== undefined && progress.eta > 0 && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="h-3 w-3" />
                ~{formatETA(progress.eta)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
