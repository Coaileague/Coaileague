/**
 * Interactive Onboarding Checklist with Progress Visualization
 * 
 * Features:
 * - Animated progress ring
 * - Step-by-step completion tracking
 * - AI-powered suggestions
 * - Mobile-optimized layout
 * - Trinity AI integration
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, Circle, ChevronRight, Sparkles, Trophy,
  Users, Calendar, CreditCard, Settings, Bell, Lock,
  Zap, ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  completed: boolean;
  skipped: boolean;
  order: number;
  action?: {
    label: string;
    route?: string;
    handler?: string;
  };
  aiSuggestion?: string;
}

interface OnboardingProgress {
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  percentComplete: number;
  currentStep: OnboardingStep | null;
  steps: OnboardingStep[];
  isComplete: boolean;
  estimatedMinutesRemaining: number;
}

const STEP_ICONS: Record<string, any> = {
  users: Users,
  calendar: Calendar,
  creditCard: CreditCard,
  settings: Settings,
  bell: Bell,
  lock: Lock,
  zap: Zap,
};

function ProgressRing({ 
  progress, 
  size = 120, 
  strokeWidth = 8,
  compact = false 
}: { 
  progress: number; 
  size?: number; 
  strokeWidth?: number;
  compact?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          className="text-muted/30"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <motion.circle
          className="text-primary"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className={`font-bold ${compact ? 'text-lg' : 'text-2xl'}`}>{Math.round(progress)}%</span>
        {!compact && <span className="text-xs text-muted-foreground">Complete</span>}
      </div>
    </div>
  );
}

function StepCard({ 
  step, 
  onComplete, 
  onSkip, 
  isLoading,
  compact = false
}: { 
  step: OnboardingStep; 
  onComplete: () => void; 
  onSkip: () => void;
  isLoading: boolean;
  compact?: boolean;
}) {
  const Icon = STEP_ICONS[step.icon] || Circle;
  const { hapticSuccess, hapticSelection } = useHapticFeedback();

  const handleComplete = () => {
    hapticSuccess();
    onComplete();
  };

  const handleSkip = () => {
    hapticSelection();
    onSkip();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`relative ${compact ? 'p-3' : 'p-4'} rounded-lg border bg-card hover-elevate transition-all`}
    >
      <div className={`flex items-start gap-${compact ? '2' : '3'}`}>
        <div className={`flex-shrink-0 ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center ${
          step.completed 
            ? 'bg-green-500 text-white' 
            : step.skipped 
            ? 'bg-muted text-muted-foreground' 
            : 'bg-primary/10 text-primary'
        }`}>
          {step.completed ? (
            <CheckCircle2 className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          ) : (
            <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`font-medium ${compact ? 'text-sm' : 'text-base'} ${
              step.completed ? 'text-muted-foreground line-through' : ''
            }`}>
              {step.title}
            </h4>
            {step.completed && (
              <Badge variant="secondary" className="text-xs">Done</Badge>
            )}
            {step.skipped && (
              <Badge variant="outline" className="text-xs">Skipped</Badge>
            )}
          </div>
          <p className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground mt-0.5`}>
            {step.description}
          </p>
          
          {step.aiSuggestion && !step.completed && (
            <div className={`${compact ? 'mt-2' : 'mt-3'} p-2 rounded-md bg-violet-500/10 border border-violet-500/20`}>
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  {step.aiSuggestion}
                </p>
              </div>
            </div>
          )}
          
          {!step.completed && !step.skipped && (
            <div className={`flex items-center gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
              <Button 
                size="sm" 
                onClick={handleComplete}
                disabled={isLoading}
                data-testid={`btn-complete-step-${step.id}`}
              >
                {step.action?.label || 'Mark Complete'}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSkip}
                disabled={isLoading}
                data-testid={`btn-skip-step-${step.id}`}
              >
                Skip
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function InteractiveOnboardingChecklist({ 
  workspaceId,
  compact = false,
  onComplete,
}: { 
  workspaceId?: string;
  compact?: boolean;
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { hapticSuccess } = useHapticFeedback();
  const [showConfetti, setShowConfetti] = useState(false);

  const effectiveCompact = compact || isMobile;

  const { data: progress, isLoading } = useQuery<OnboardingProgress>({
    queryKey: ['/api/experience/onboarding/progress', workspaceId],
    refetchInterval: 30000,
  });

  const completeMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await apiRequest('POST', `/api/experience/onboarding/steps/${stepId}/complete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/experience/onboarding/progress'] });
      toast({ title: 'Step Completed', description: 'Great progress!' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to complete step', variant: 'destructive' });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await apiRequest('POST', `/api/experience/onboarding/steps/${stepId}/skip`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/experience/onboarding/progress'] });
      toast({ title: 'Step Skipped', description: 'You can complete it later' });
    },
  });

  useEffect(() => {
    if (progress?.isComplete && !showConfetti) {
      setShowConfetti(true);
      hapticSuccess();
      onComplete?.();
    }
  }, [progress?.isComplete, showConfetti, hapticSuccess, onComplete]);

  const pendingSteps = useMemo(() => {
    return progress?.steps.filter(s => !s.completed && !s.skipped) || [];
  }, [progress?.steps]);

  const completedSteps = useMemo(() => {
    return progress?.steps.filter(s => s.completed) || [];
  }, [progress?.steps]);

  if (isLoading) {
    return (
      <Card className={effectiveCompact ? 'p-3' : 'p-6'}>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-12 bg-muted rounded-lg" />
          <div className="h-12 bg-muted rounded-lg" />
        </div>
      </Card>
    );
  }

  if (!progress || progress.isComplete) {
    return (
      <Card className={effectiveCompact ? 'p-4' : 'p-6'}>
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <Trophy className={`${effectiveCompact ? 'w-12 h-12' : 'w-16 h-16'} text-yellow-500`} />
          </motion.div>
          <div>
            <h3 className={`font-bold ${effectiveCompact ? 'text-lg' : 'text-xl'}`}>
              All Set!
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              You've completed all onboarding steps
            </p>
          </div>
          <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
            Onboarding Champion
          </Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card className={effectiveCompact ? 'p-0 overflow-hidden' : ''}>
      <CardHeader className={effectiveCompact ? 'p-3 pb-2' : ''}>
        <div className={`flex items-center ${effectiveCompact ? 'gap-3' : 'gap-4'}`}>
          <ProgressRing 
            progress={progress.percentComplete} 
            size={effectiveCompact ? 64 : 100}
            strokeWidth={effectiveCompact ? 6 : 8}
            compact={effectiveCompact}
          />
          <div className="flex-1">
            <CardTitle className={effectiveCompact ? 'text-base' : 'text-lg'}>
              Getting Started
            </CardTitle>
            <CardDescription className="mt-1">
              {progress.completedSteps} of {progress.totalSteps} steps complete
            </CardDescription>
            {progress.estimatedMinutesRemaining > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                ~{progress.estimatedMinutesRemaining} min remaining
              </p>
            )}
          </div>
        </div>
        <Progress 
          value={progress.percentComplete} 
          className={`${effectiveCompact ? 'mt-2 h-1.5' : 'mt-4 h-2'}`} 
        />
      </CardHeader>

      <CardContent className={effectiveCompact ? 'p-3 pt-0' : ''}>
        <div className={`space-y-${effectiveCompact ? '2' : '3'}`}>
          <AnimatePresence mode="popLayout">
            {pendingSteps.map(step => (
              <StepCard
                key={step.id}
                step={step}
                onComplete={() => completeMutation.mutate(step.id)}
                onSkip={() => skipMutation.mutate(step.id)}
                isLoading={completeMutation.isPending || skipMutation.isPending}
                compact={effectiveCompact}
              />
            ))}
          </AnimatePresence>
        </div>

        {completedSteps.length > 0 && (
          <details className={`${effectiveCompact ? 'mt-3' : 'mt-4'}`}>
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
              {completedSteps.length} completed step{completedSteps.length > 1 ? 's' : ''}
            </summary>
            <div className={`space-y-2 ${effectiveCompact ? 'mt-2' : 'mt-3'}`}>
              {completedSteps.map(step => (
                <div 
                  key={step.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="line-through">{step.title}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default InteractiveOnboardingChecklist;
