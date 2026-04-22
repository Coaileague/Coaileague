import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, CheckCircle2, Loader2, UserCheck, AlertCircle, 
  ChevronDown, ChevronUp, Activity, FileCode, Lightbulb, ClipboardCheck,
  Timer
} from 'lucide-react';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTrinitySchedulingProgress, type SchedulingProgressStep, type ThinkingStep } from '@/hooks/use-trinity-scheduling-progress';

interface TrinitySchedulingProgressProps {
  workspaceId?: string;
  embedded?: boolean;
  progressData?: SchedulingProgressStep[];
}

function ThinkingStepItem({ step }: { step: ThinkingStep }) {
  const getTypeIcon = (type: ThinkingStep['type']) => {
    switch (type) {
      case 'analysis':
        return <Activity className="h-3 w-3 text-purple-500" />;
      case 'decision':
        return <Lightbulb className="h-3 w-3 text-yellow-500" />;
      case 'action':
        return <FileCode className="h-3 w-3 text-blue-500" />;
      case 'review':
        return <ClipboardCheck className="h-3 w-3 text-green-500" />;
      default:
        return <Activity className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusStyle = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete':
        return 'border-l-green-500 bg-green-500/5';
      case 'active':
        return 'border-l-blue-500 bg-blue-500/5';
      case 'error':
        return 'border-l-red-500 bg-red-500/5';
      default:
        return 'border-l-muted-foreground bg-muted/20';
    }
  };

  const getStatusIcon = (status: ThinkingStep['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'active':
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <div className="h-3 w-3 rounded-full border border-muted-foreground/40" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-start gap-2 p-1.5 rounded-r border-l-2 ${getStatusStyle(step.status)}`}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        {getStatusIcon(step.status)}
        {getTypeIcon(step.type)}
      </div>
      <span className="text-xs leading-relaxed">{step.message}</span>
    </motion.div>
  );
}

function ThoughtBox({ progress }: { progress: SchedulingProgressStep }) {
  const [isOpen, setIsOpen] = useState(true);

  const defaultThinkingSteps: ThinkingStep[] = [
    {
      id: '1',
      message: 'Reading employee availability and preferences...',
      status: progress.step === 'analyzing' ? 'active' : 'complete',
      timestamp: Date.now() - 3000,
      type: 'analysis',
    },
    {
      id: '2',
      message: 'Analyzing skill requirements and certifications...',
      status: progress.step === 'analyzing' ? 'active' : 'complete',
      timestamp: Date.now() - 2500,
      type: 'analysis',
    },
    {
      id: '3',
      message: 'Checking overtime and compliance rules...',
      status: progress.step === 'matching' ? 'active' : progress.step === 'analyzing' ? 'pending' : 'complete',
      timestamp: Date.now() - 2000,
      type: 'decision',
    },
    {
      id: '4',
      message: 'Calculating profit optimization scores...',
      status: progress.step === 'matching' ? 'active' : progress.step === 'analyzing' ? 'pending' : 'complete',
      timestamp: Date.now() - 1500,
      type: 'decision',
    },
    {
      id: '5',
      message: progress.assignedEmployee 
        ? `Assigning to ${progress.assignedEmployee.name} (best match)...`
        : 'Finding best employee match...',
      status: progress.step === 'assigning' ? 'active' : (progress.step === 'complete' ? 'complete' : 'pending'),
      timestamp: Date.now() - 1000,
      type: 'action',
    },
    {
      id: '6',
      message: 'Verifying assignment and updating schedule...',
      status: progress.step === 'complete' ? 'complete' : 'pending',
      timestamp: Date.now(),
      type: 'review',
    },
  ];

  const thinkingSteps = progress.thinkingSteps?.length ? progress.thinkingSteps : defaultThinkingSteps;
  const completedSteps = thinkingSteps.filter(s => s.status === 'complete').length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between gap-1 h-6 px-2 text-xs font-medium"
          data-testid="button-thought-box-toggle"
        >
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-purple-500" />
            <span>Trinity Thinking</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {completedSteps}/{thinkingSteps.length}
            </Badge>
          </div>
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="h-32 mt-2">
          <div className="space-y-1 pr-2">
            {thinkingSteps.map(step => (
              <ThinkingStepItem key={step.id} step={step} />
            ))}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProgressItem({ progress }: { progress: SchedulingProgressStep }) {
  const stepIcons = {
    analyzing: <Loader2 className="h-4 w-4 animate-spin text-purple-500" />,
    matching: <MessageCircle className="h-4 w-4 animate-pulse text-blue-500" />,
    assigning: <UserCheck className="h-4 w-4 text-teal-500" />,
    complete: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    no_match: <AlertCircle className="h-4 w-4 text-orange-500" />,
    error: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  const getModeIcon = (mode?: string) => {
    switch (mode) {
      case 'turbo':
      case 'instant':
        return <Activity className="h-3 w-3 text-yellow-500" />;
      case 'fast':
        return <Timer className="h-3 w-3 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="p-3 border border-cyan-200 dark:border-cyan-800 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <TrinityLogo size={16} className="text-white" />
            </div>
            {progress.step !== 'complete' && progress.step !== 'no_match' && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border border-white dark:border-gray-800 animate-pulse" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {stepIcons[progress.step]}
              <span className="text-sm font-medium truncate">{progress.message}</span>
              {progress.executionMode && progress.executionMode !== 'normal' && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 flex items-center gap-0.5">
                  {getModeIcon(progress.executionMode)}
                  {progress.executionMode}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Progress 
                value={progress.progress} 
                className="h-1.5 flex-1"
              />
              <Badge variant="outline" className="text-xs h-5">
                {progress.progress}%
              </Badge>
            </div>

            {progress.creditsCharged && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <TrinityLogo size={12} className="text-purple-400" />
                <span>{progress.creditsCharged} credits</span>
              </div>
            )}
            
            {progress.assignedEmployee && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <UserCheck className="h-3 w-3 text-teal-500" />
                <span>{progress.assignedEmployee.name}</span>
                <Badge variant="secondary" className="text-xs h-4">
                  Score: {progress.assignedEmployee.score.toFixed(0)}
                </Badge>
              </motion.div>
            )}
            
            {progress.businessMetrics && progress.step === 'complete' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 flex items-center gap-3 text-xs"
              >
                <span className="text-green-600 dark:text-green-400">
                  +${progress.businessMetrics.totalProfit.toFixed(2)} profit
                </span>
                <span className="text-muted-foreground">
                  {(progress.businessMetrics.avgProfitMargin * 100).toFixed(0)}% margin
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {progress.step !== 'complete' && progress.step !== 'no_match' && progress.step !== 'error' && (
          <div className="mt-3 pt-3 border-t border-cyan-200/50 dark:border-cyan-700/50">
            <ThoughtBox progress={progress} />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export function TrinitySchedulingProgress({ workspaceId, embedded = false, progressData }: TrinitySchedulingProgressProps) {
  const hookResult = useTrinitySchedulingProgress(progressData ? undefined : workspaceId);
  
  const activeProgress = progressData || hookResult.activeProgress;
  const hasActiveProgress = progressData ? progressData.length > 0 : hookResult.hasActiveProgress;

  if (!hasActiveProgress) {
    return null;
  }

  if (embedded) {
    return (
      <div className="space-y-2" data-testid="panel-trinity-scheduling-progress-embedded">
        <AnimatePresence mode="popLayout">
          {activeProgress.map((progress) => (
            <div key={progress.shiftId} className="space-y-1">
              <div className="flex items-center gap-2">
                {progress.step === 'complete' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : progress.step === 'error' ? (
                  <AlertCircle className="h-3 w-3 text-red-500" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-purple-500" />
                )}
                <span className="text-xs font-medium">{progress.message}</span>
                <Progress value={progress.progress} className="h-1 flex-1 max-w-24" />
                <span className="text-xs text-muted-foreground">{progress.progress}%</span>
              </div>
              {progress.step !== 'complete' && progress.step !== 'error' && (
                <ThoughtBox progress={progress} />
              )}
            </div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] sm:w-96 max-w-md space-y-2" data-testid="panel-trinity-scheduling-progress">
      <AnimatePresence mode="popLayout">
        {activeProgress.map((progress) => (
          <ProgressItem key={progress.shiftId} progress={progress} />
        ))}
      </AnimatePresence>
    </div>
  );
}
