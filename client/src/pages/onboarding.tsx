/** Onboarding checklist page — accessible at /onboarding (requires auth).
 *  Complements the <OnboardingWizard /> modal overlay by providing a full-page
 *  progress view and step-by-step guidance for new workspace owners. */
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  Circle, 
  Gift, 
  Sparkles, 
  Trophy, 
  Clock, 
  ChevronRight,
  Zap,
  Star,
  PartyPopper,
  Loader2
} from 'lucide-react';
import { UnifiedBrandLogo } from '@/components/unified-brand-logo';
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';

interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  category: string;
  points: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  requiredForReward: boolean;
  currentProgress?: number;
  targetProgress?: number;
  progressUnit?: string;
  isAiGenerated?: boolean;
  completedAt?: string;
}

interface OnboardingReward {
  id: string;
  title: string;
  description: string;
  discountPercent: number;
  status: 'locked' | 'unlocked' | 'applied' | 'expired';
  stripePromotionCode?: string;
  expiresAt?: string;
}

interface OnboardingProgress {
  workspaceId: string;
  pipelineStatus: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  totalPoints: number;
  earnedPoints: number;
  completionPercent: number;
  tasks: OnboardingTask[];
  reward: OnboardingReward | null;
  isRewardUnlocked: boolean;
  daysUntilTrialExpires: number | null;
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'setup': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'configuration': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'engagement': return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'billing': return 'bg-teal-500/10 text-teal-600 dark:text-teal-400';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'setup': return 'Setup';
    case 'configuration': return 'Configuration';
    case 'engagement': return 'Engagement';
    case 'billing': return 'Billing';
    default: return category;
  }
}

function TaskItem({ 
  task, 
  onComplete,
  isCompleting 
}: { 
  task: OnboardingTask; 
  onComplete: (taskId: string) => void;
  isCompleting: boolean;
}) {
  const isCompleted = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  const hasProgress = task.targetProgress && task.targetProgress > 1;
  
  return (
    <div 
      className={['flex items-start gap-4 p-4 rounded-lg border transition-all', isCompleted 
          ? 'bg-green-500/5 border-green-500/20' 
          : isSkipped 
          ? 'bg-muted/50 border-muted opacity-60' 
          : 'bg-card hover-elevate'].join(' ')}
      data-testid={`task-item-${task.id}`}
    >
      <div className="mt-0.5">
        {isCompleted ? (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        ) : (
          <Circle className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className={`font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </h4>
          <Badge variant="secondary" className={getCategoryColor(task.category)}>
            {getCategoryLabel(task.category)}
          </Badge>
          {task.isAiGenerated && (
            <Badge variant="secondary" className="bg-gradient-to-r from-cyan-500/10 to-blue-600/10 text-cyan-600 dark:text-cyan-400">
              <Sparkles className="w-3 h-3 mr-1" />
              AI
            </Badge>
          )}
          {task.requiredForReward && !isCompleted && (
            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <Star className="w-3 h-3 mr-1" />
              Required
            </Badge>
          )}
        </div>
        
        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
        
        {hasProgress && !isCompleted && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <Progress value={((task.currentProgress || 0) / task.targetProgress!) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground">
                {task.currentProgress || 0}/{task.targetProgress} {task.progressUnit}
              </span>
            </div>
          </div>
        )}
        
        <div className="flex items-center gap-4 mt-2">
          <span className="text-sm flex items-center gap-1">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className={isCompleted ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
              {task.points} pts
            </span>
          </span>
          {task.completedAt && (
            <span className="text-xs text-muted-foreground">
              Completed {new Date(task.completedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      
      {!isCompleted && !isSkipped && (
        <Button 
          size="sm" 
          onClick={() => onComplete(task.id)}
          disabled={isCompleting}
          data-testid={`button-complete-task-${task.id}`}
        >
          {isCompleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Complete
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function RewardCard({ 
  reward, 
  isUnlocked,
  onApply,
  isApplying
}: { 
  reward: OnboardingReward | null; 
  isUnlocked: boolean;
  onApply: () => void;
  isApplying: boolean;
}) {
  if (!reward && !isUnlocked) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="p-6 text-center">
          <Gift className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Unlock Your Reward!</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Complete all required tasks to unlock a special 10% discount on your first invoice.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Star className="w-4 h-4 text-yellow-500" />
            Complete all starred tasks
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (reward?.status === 'applied') {
    return (
      <Card className="border-green-500/50 bg-green-500/5">
        <CardContent className="p-6 text-center">
          <PartyPopper className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <h3 className="font-semibold text-lg mb-2 text-green-600 dark:text-green-400">Reward Applied!</h3>
          <p className="text-muted-foreground text-sm">
            Your 10% discount has been applied to your account.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  if (reward?.status === 'expired') {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="p-6 text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2 text-muted-foreground">Reward Expired</h3>
          <p className="text-muted-foreground text-sm">
            Unfortunately, this reward has expired.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-yellow-500/50 bg-gradient-to-br from-yellow-500/5 to-orange-500/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-yellow-500/10">
            <Trophy className="w-8 h-8 text-yellow-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{reward?.title || 'Welcome Discount: 10% Off'}</h3>
            <p className="text-sm text-muted-foreground">
              {reward?.description || 'Apply this discount to your next invoice!'}
            </p>
            {reward?.stripePromotionCode && (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  {reward.stripePromotionCode}
                </Badge>
                <span className="text-xs text-muted-foreground">Promo Code</span>
              </div>
            )}
            {reward?.expiresAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Expires: {new Date(reward.expiresAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <Button 
            onClick={onApply}
            disabled={isApplying}
            className="bg-gradient-to-r from-yellow-500 to-orange-500"
            data-testid="button-apply-reward"
          >
            {isApplying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Gift className="w-4 h-4 mr-2" />
                Apply
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OnboardingPage() {
  const { toast } = useToast();
  
  const { data: progress, isLoading, error } = useQuery<OnboardingProgress>({
    queryKey: ['/api/onboarding/progress'],
  });
  
  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest('POST', `/api/onboarding/tasks/${taskId}/complete`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      toast({
        title: 'Task completed!',
        description: 'Great progress - keep going!',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete task',
        variant: 'destructive',
      });
    },
  });
  
  const applyRewardMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/onboarding/rewards/reward/apply', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      toast({
        title: 'Reward applied!',
        description: 'Your 10% discount has been activated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to apply reward',
        variant: 'destructive',
      });
    },
  });
  
  const initializeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/onboarding/initialize', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      toast({
        title: 'Onboarding initialized',
        description: 'Your personalized tasks are ready!',
      });
    },
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your onboarding progress...</p>
        </div>
      </div>
    );
  }
  
  if (error || !progress) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="flex justify-center mb-6">
              <UnifiedBrandLogo size="lg" showTagline={false} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to CoAIleague</h1>
            <p className="text-muted-foreground mb-6">
              Let's get you started with a personalized onboarding experience.
            </p>
            <Button 
              onClick={() => initializeMutation.mutate()} 
              disabled={initializeMutation.isPending}
              className="w-full"
              size="lg"
              data-testid="button-start-onboarding"
            >
              {initializeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2" />
              )}
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const requiredTasks = progress.tasks.filter(t => t.requiredForReward);
  const optionalTasks = progress.tasks.filter(t => !t.requiredForReward);
  
  const trialBadge = progress.daysUntilTrialExpires !== null ? (
    <Badge variant="secondary" className="text-sm py-1 px-3">
      <Clock className="w-4 h-4 mr-1" />
      {progress.daysUntilTrialExpires} days left in trial
    </Badge>
  ) : undefined;

  const pageConfig: CanvasPageConfig = {
    id: 'onboarding',
    title: 'Welcome to CoAIleague',
    subtitle: 'Complete these tasks to get the most out of your platform',
    category: 'workspace',
    headerActions: trialBadge,
  };
  
  return (
    <CanvasHubPage config={pageConfig}>
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-semibold text-lg">Overall Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {progress.completedTasks} of {progress.totalTasks} tasks completed
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  <span className="text-2xl font-bold">{progress.earnedPoints}</span>
                  <span className="text-muted-foreground">/ {progress.totalPoints} pts</span>
                </div>
              </div>
            </div>
            <Progress value={progress.completionPercent} className="h-3" />
            <div className="flex justify-between gap-2 mt-2 text-sm text-muted-foreground">
              <span>{progress.completionPercent}% complete</span>
              {progress.isRewardUnlocked && (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Trophy className="w-4 h-4" />
                  Reward Unlocked!
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        
        <RewardCard 
          reward={progress.reward} 
          isUnlocked={progress.isRewardUnlocked}
          onApply={() => applyRewardMutation.mutate()}
          isApplying={applyRewardMutation.isPending}
        />
        
        <Separator className="my-8" />
        
        {requiredTasks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Required Tasks
              <Badge variant="secondary" className="ml-2">
                {requiredTasks.filter(t => t.status === 'completed').length}/{requiredTasks.length}
              </Badge>
            </h2>
            <div className="space-y-3">
              {requiredTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task}
                  onComplete={(taskId) => completeMutation.mutate(taskId)}
                  isCompleting={completeMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
        
        {optionalTasks.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Optional Tasks
              <Badge variant="secondary" className="ml-2">
                {optionalTasks.filter(t => t.status === 'completed').length}/{optionalTasks.length}
              </Badge>
            </h2>
            <div className="space-y-3">
              {optionalTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task}
                  onComplete={(taskId) => completeMutation.mutate(taskId)}
                  isCompleting={completeMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
    </CanvasHubPage>
  );
}
