import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  Building2, 
  CreditCard, 
  Users, 
  UserPlus, 
  Calendar, 
  Settings,
  Zap,
  Gift,
  Star,
  Rocket,
  Sparkles,
  Lock,
  LockOpen,
  HelpCircle,
  MessageSquare
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { thoughtManager } from "@/lib/mascot/ThoughtManager";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  mascotMessage: string;
  icon: any;
  href: string;
  isCompleted: boolean;
  points: number;
  category: 'setup' | 'configuration' | 'engagement' | 'billing';
}

interface OnboardingProgressData {
  workspaceId: string;
  currentStep: number;
  totalSteps: number;
  isCompleted: boolean;
  steps: {
    step1CompanyInfo: boolean;
    step2BillingInfo: boolean;
    step3RolesPermissions: boolean;
    step4InviteEmployees: boolean;
    step5AddCustomers: boolean;
    step6ConfigurePayroll: boolean;
    step7SetupIntegrations: boolean;
    step8ReviewLaunch: boolean;
  };
  totalPoints: number;
  earnedPoints: number;
  discountAvailable: boolean;
  discountCode?: string;
  automationUnlocked: boolean;
}

const ONBOARDING_STEPS: Omit<OnboardingStep, 'isCompleted'>[] = [
  {
    id: 'step1CompanyInfo',
    stepNumber: 1,
    title: 'Company Profile',
    description: 'Set up your organization details and business info',
    mascotMessage: "Let's start by telling me about your company! This helps personalize your experience.",
    icon: Building2,
    href: '/settings',
    points: 15,
    category: 'setup',
  },
  {
    id: 'step2BillingInfo',
    stepNumber: 2,
    title: 'Billing Setup',
    description: 'Configure payment methods and billing preferences',
    mascotMessage: "Time to set up billing! Complete this to unlock your 10% first-time discount.",
    icon: CreditCard,
    href: '/settings',
    points: 25,
    category: 'billing',
  },
  {
    id: 'step3RolesPermissions',
    stepNumber: 3,
    title: 'Roles & Permissions',
    description: 'Define access levels for your team members',
    mascotMessage: "Define who can do what. Set up roles to keep your organization secure!",
    icon: Settings,
    href: '/settings',
    points: 15,
    category: 'configuration',
  },
  {
    id: 'step4InviteEmployees',
    stepNumber: 4,
    title: 'Invite Employees',
    description: 'Add your first team members to the platform',
    mascotMessage: "Your team awaits! Invite employees to start building your workforce.",
    icon: UserPlus,
    href: '/employees',
    points: 20,
    category: 'setup',
  },
  {
    id: 'step5AddCustomers',
    stepNumber: 5,
    title: 'Add Clients',
    description: 'Set up your client list for billing and scheduling',
    mascotMessage: "Got clients? Add them now to enable invoicing and project tracking!",
    icon: Users,
    href: '/clients',
    points: 15,
    category: 'setup',
  },
  {
    id: 'step6ConfigurePayroll',
    stepNumber: 6,
    title: 'Payroll Setup',
    description: 'Configure pay rates, schedules, and tax settings',
    mascotMessage: "Almost there! Set up payroll to automate your payment workflows.",
    icon: CreditCard,
    href: '/payroll',
    points: 20,
    category: 'configuration',
  },
  {
    id: 'step7SetupIntegrations',
    stepNumber: 7,
    title: 'Connect Integrations',
    description: 'Link external tools like QuickBooks, Slack, or calendars',
    mascotMessage: "Power up with integrations! Connect your favorite tools to supercharge your workflow.",
    icon: Zap,
    href: '/integrations',
    points: 15,
    category: 'engagement',
  },
  {
    id: 'step8ReviewLaunch',
    stepNumber: 8,
    title: 'Review & Launch',
    description: 'Final review and unlock all automation features',
    mascotMessage: "You're ready for liftoff! Complete this final step to unlock AI automation.",
    icon: Rocket,
    href: '/dashboard',
    points: 25,
    category: 'setup',
  },
];

interface MascotOnboardingPanelProps {
  variant?: 'card' | 'inline' | 'minimal';
  showReward?: boolean;
  onStepClick?: (step: OnboardingStep) => void;
}

export function MascotOnboardingPanel({ 
  variant = 'card',
  showReward = true,
  onStepClick 
}: MascotOnboardingPanelProps) {
  const [, setLocation] = useLocation();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const { data: progress, isLoading } = useQuery<OnboardingProgressData>({
    queryKey: ['/api/organization-onboarding/status'],
    refetchInterval: 30000,
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest(`/api/organization-onboarding/step/${stepId}/complete`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organization-onboarding/status'] });
    },
  });

  const steps: OnboardingStep[] = ONBOARDING_STEPS.map(step => ({
    ...step,
    isCompleted: progress?.steps?.[step.id as keyof typeof progress.steps] ?? false,
  }));

  const completedCount = steps.filter(s => s.isCompleted).length;
  const totalSteps = steps.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);
  const earnedPoints = steps.filter(s => s.isCompleted).reduce((sum, s) => sum + s.points, 0);
  const totalPoints = steps.reduce((sum, s) => sum + s.points, 0);

  useEffect(() => {
    if (progress) {
      // Update mascot's onboarding progress tracking
      // This enables persistent reminders until completion, then advisor mode
      thoughtManager.updateOnboardingProgress(completedCount, totalSteps);
    }
  }, [progress?.isCompleted, completedCount, totalSteps]);

  const handleStepClick = (step: OnboardingStep) => {
    if (onStepClick) {
      onStepClick(step);
    }
    
    thoughtManager.triggerAIInsight(step.mascotMessage, 'high');

    if (!step.isCompleted) {
      setLocation(step.href);
    }
  };

  const isAllComplete = completedCount === totalSteps;
  const nextIncompleteStep = steps.find(s => !s.isCompleted);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-3/4 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className="flex items-center gap-3 p-3 bg-card rounded-lg border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Setup Progress</span>
        </div>
        <Progress value={progressPercent} className="flex-1 h-2" />
        <Badge variant={isAllComplete ? "default" : "outline"}>
          {completedCount}/{totalSteps}
        </Badge>
        {!isAllComplete && nextIncompleteStep && (
          <Button 
            size="sm" 
            variant="ghost"
            onClick={() => handleStepClick(nextIncompleteStep)}
            data-testid="button-continue-onboarding"
          >
            Continue
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn(
      "relative overflow-hidden",
      isAllComplete && "border-primary/50 bg-primary/5"
    )}>
      {isAllComplete && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-amber-500" />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isAllComplete 
                ? "bg-primary/10 text-primary" 
                : "bg-muted text-muted-foreground"
            )}>
              {isAllComplete ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Organization Setup
                {isAllComplete && (
                  <Badge variant="default" className="bg-gradient-to-r from-cyan-500 to-purple-500">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Complete!
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isAllComplete 
                  ? "All automation features are now unlocked!" 
                  : `Complete ${totalSteps - completedCount} more steps to unlock AI automation`
                }
              </CardDescription>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{progressPercent}%</div>
            <div className="text-xs text-muted-foreground">{earnedPoints}/{totalPoints} pts</div>
          </div>
        </div>

        <Progress value={progressPercent} className="mt-4 h-2" />
      </CardHeader>

      <CardContent className="space-y-2">
        <AnimatePresence>
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <button
                onClick={() => handleStepClick(step)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all",
                  "hover-elevate active-elevate-2",
                  step.isCompleted 
                    ? "bg-primary/5 border border-primary/20" 
                    : "bg-muted/50 hover:bg-muted",
                  expandedStep === step.id && "ring-2 ring-primary/30"
                )}
                data-testid={`button-onboarding-step-${step.stepNumber}`}
              >
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                  step.isCompleted 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground border-2"
                )}>
                  {step.isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-sm font-bold">{step.stepNumber}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <step.icon className={cn(
                      "h-4 w-4 flex-shrink-0",
                      step.isCompleted ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "font-medium truncate",
                      step.isCompleted && "text-primary"
                    )}>
                      {step.title}
                    </span>
                    {!step.isCompleted && (
                      <Badge variant="secondary" className="text-xs">
                        +{step.points} pts
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {step.description}
                  </p>
                </div>

                <ChevronRight className={cn(
                  "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                  step.isCompleted ? "text-primary" : "group-hover:translate-x-1"
                )} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </CardContent>

      {showReward && (
        <>
          <Separator />
          <CardFooter className="pt-4">
            <div className={cn(
              "w-full flex items-center gap-4 p-4 rounded-lg",
              isAllComplete 
                ? "bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20" 
                : "bg-muted/50"
            )}>
              <div className={cn(
                "p-3 rounded-full",
                isAllComplete ? "bg-amber-500/20" : "bg-muted"
              )}>
                <Gift className={cn(
                  "h-6 w-6",
                  isAllComplete ? "text-amber-500" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <div className="font-semibold flex items-center gap-2">
                  <Star className={cn(
                    "h-4 w-4",
                    isAllComplete ? "text-amber-500 fill-amber-500" : "text-muted-foreground"
                  )} />
                  10% First-Time Discount
                </div>
                <p className="text-sm text-muted-foreground">
                  {isAllComplete 
                    ? "Congratulations! Your discount is ready to use." 
                    : "Complete all setup steps to unlock your exclusive discount."
                  }
                </p>
              </div>
              {isAllComplete && (
                <Button 
                  variant="default" 
                  className="bg-amber-500 hover:bg-amber-600"
                  data-testid="button-claim-discount"
                >
                  Claim Now
                </Button>
              )}
            </div>
          </CardFooter>
          <div className="px-6 pb-4 flex items-center justify-center gap-4 text-sm">
            <Link href="/help" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" data-testid="link-onboarding-help">
              <HelpCircle className="h-4 w-4" />
              Need Help?
            </Link>
            <span className="text-muted-foreground">|</span>
            <Link href="/chat" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1" data-testid="link-onboarding-chat">
              <MessageSquare className="h-4 w-4" />
              Chat with Support
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

export function OnboardingProgressBadge() {
  const { data: progress } = useQuery<OnboardingProgressData>({
    queryKey: ['/api/organization-onboarding/status'],
  });

  if (!progress || progress.isCompleted) return null;

  const steps = ONBOARDING_STEPS.map(step => ({
    ...step,
    isCompleted: progress?.steps?.[step.id as keyof typeof progress.steps] ?? false,
  }));
  
  const completedCount = steps.filter(s => s.isCompleted).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <Link href="/dashboard">
      <Badge 
        variant="outline" 
        className="cursor-pointer hover:bg-primary/10 transition-colors"
        data-testid="badge-onboarding-progress"
      >
        <Sparkles className="h-3 w-3 mr-1 text-primary" />
        Setup {progressPercent}%
      </Badge>
    </Link>
  );
}
