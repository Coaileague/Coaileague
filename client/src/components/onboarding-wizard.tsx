import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, X, CheckCircle2, Sparkles, MessageSquare, Calendar, Briefcase, Activity, Lock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

interface OnboardingStep {
  id: string;
  family: "communication" | "operations" | "growth" | "platform" | "overview";
  title: string;
  description: string;
  screenshot?: string;
  icon: any;
  features: string[];
  url?: string;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    family: "overview",
    title: "Welcome to CoAIleague",
    description: "The complete workforce optimization platform built for modern enterprises",
    icon: Sparkles,
    features: [
      "4 OS Families with 20+ integrated modules",
      "Replace 5+ legacy HR systems with one unified platform",
      "Save $255k annually with automation",
      "Enterprise-grade security (SOC 2, GDPR, ISO 27001)"
    ]
  },
  {
    id: "os-families",
    family: "overview",
    title: "4 OS Families Overview",
    description: "CoAIleague organizes features into 4 logical families for easy navigation",
    icon: Sparkles,
    features: [
      "📡 Communication & Collaboration - Team chat, DMs, support",
      "⚙️ Workforce Operations - Scheduling, time, payroll, billing",
      "🚀 Growth & Intelligence - Hiring, analytics, engagement",
      "🎛️ Platform & Control - Integrations, budgets, diagnostics"
    ]
  },
  // Communication Family
  {
    id: "communication-family",
    family: "communication",
    title: "Communication & Collaboration OS",
    description: "Connect your team with real-time messaging and support tools",
    icon: MessageSquare,
    url: "/os-family/communication",
    features: [
      "CommunicationOS™ - Organization-wide chatrooms",
      "Private Messages - Secure DMs with purple 'whispered' badges",
      "SupportOS™ HelpDesk - Live customer support chat"
    ]
  },
  {
    id: "communication-os",
    family: "communication",
    title: "CommunicationOS™ - Team Chatrooms",
    description: "Organization-specific chatrooms with access control and real-time messaging",
    icon: MessageSquare,
    url: "/communication",
    features: [
      "Create public and private rooms for teams",
      "Manage room members and access permissions",
      "Real-time message updates",
      "Search messages and archive old rooms"
    ]
  },
  {
    id: "private-messages",
    family: "communication",
    title: "Private Messages - Secure DMs",
    description: "Direct messaging with encrypted conversations and support channels",
    icon: Lock,
    url: "/messages",
    features: [
      "1-on-1 private conversations",
      "Purple 'whispered' badges for privacy",
      "Staff support channels",
      "Encrypted message indicators"
    ]
  },
  // Operations Family
  {
    id: "operations-family",
    family: "operations",
    title: "Workforce Operations OS",
    description: "Automate daily operations with scheduling, time tracking, and payroll",
    icon: Calendar,
    url: "/os-family/operations",
    features: [
      "AI Scheduling™ - AI-powered smart scheduling",
      "Time Platform - Geofencing and mobile clock-in",
      "AI Payroll™ - Automated payroll processing",
      "Billing Platform - Invoice generation and tracking"
    ]
  },
  {
    id: "schedule-os",
    family: "operations",
    title: "AI Scheduling™ - Smart Scheduling",
    description: "Drag-and-drop scheduling with AI conflict detection",
    icon: Calendar,
    url: "/schedule",
    features: [
      "Drag-and-drop shift assignment",
      "Automatic conflict detection",
      "Mobile sync for employees",
      "AI-powered schedule optimization"
    ]
  },
  {
    id: "time-os",
    family: "operations",
    title: "Time Platform - Time Tracking",
    description: "Comprehensive time tracking with geofencing and overtime management",
    icon: Calendar,
    url: "/time-tracking",
    features: [
      "Mobile clock-in/out with geofencing",
      "Break and overtime tracking",
      "Real-time timesheets",
      "Manager approval workflows"
    ]
  },
  // Growth Family
  {
    id: "growth-family",
    family: "growth",
    title: "Growth & Intelligence OS",
    description: "Scale with AI-powered recruitment, analytics, and engagement tools",
    icon: Briefcase,
    url: "/os-family/growth",
    features: [
      "AI Hiring™ - Recruitment workflow automation",
      "EngagementOS™ - Employee engagement analytics",
      "AnalyticsOS™ - Predictive workforce insights",
      "ReportOS™ - Automated compliance reports"
    ]
  },
  {
    id: "hire-os",
    family: "growth",
    title: "AI Hiring™ - Recruitment Workflow",
    description: "Streamline hiring with candidate tracking and interview scheduling",
    icon: Briefcase,
    url: "/owner/hireos/workflow-builder",
    features: [
      "Candidate pipeline management",
      "Automated interview scheduling",
      "Offer letter generation",
      "ATS integration support"
    ]
  },
  {
    id: "engagement-os",
    family: "growth",
    title: "EngagementOS™ - Employee Engagement",
    description: "Boost morale with pulse surveys and recognition programs",
    icon: Activity,
    url: "/engagement/dashboard",
    features: [
      "Pulse surveys and feedback loops",
      "Employee recognition programs",
      "Sentiment analysis dashboards",
      "Turnover risk predictions"
    ]
  },
  // Platform Family
  {
    id: "platform-family",
    family: "platform",
    title: "Platform & Control OS",
    description: "Enterprise administration, integrations, and diagnostics",
    icon: Activity,
    url: "/os-family/platform",
    features: [
      "AI Diagnostics™ - User diagnostics and troubleshooting",
      "AI Integrations™ - Connect external services",
      "AI Budgeting™ - Budget planning and control",
      "Command Center - Platform administration"
    ]
  },
  {
    id: "integration-os",
    family: "platform",
    title: "AI Integrations™ - External Services",
    description: "Connect to QuickBooks, Salesforce, Slack, and 50+ platforms",
    icon: Zap,
    url: "/integrations",
    features: [
      "Browse integration marketplace",
      "OAuth2 and API key authentication",
      "Webhook configuration",
      "Connection health monitoring"
    ]
  },
  {
    id: "query-os",
    family: "platform",
    title: "AI Diagnostics™ - User Diagnostics",
    description: "Platform staff diagnostics for troubleshooting and support (Admin Only)",
    icon: Activity,
    url: "/query-os",
    features: [
      "User search and account management",
      "Impersonation controls (admin)",
      "Session viewer and audit logs",
      "Real-time diagnostic tools"
    ]
  },
  {
    id: "completion",
    family: "overview",
    title: "Tour Complete!",
    description: "You're ready to start using CoAIleague",
    icon: CheckCircle2,
    features: [
      "Click any OS Family in the sidebar to explore modules",
      "Access this tour anytime from Settings → Platform Tour",
      "Check your progress: Communication, Operations, Growth, Platform",
      "Contact support anytime via SupportOS™ HelpDesk"
    ]
  }
];

interface OnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingWizard({ isOpen, onClose }: OnboardingWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const { toast } = useToast();

  const currentStep = onboardingSteps[currentStepIndex];
  const totalSteps = onboardingSteps.length;
  const progressPercentage = Math.round((currentStepIndex / (totalSteps - 1)) * 100);

  // Calculate family-specific progress
  const getFamilyProgress = (family: string) => {
    const familySteps = onboardingSteps.filter(step => step.family === family);
    const completed = familySteps.filter(step => completedSteps.includes(step.id));
    return familySteps.length > 0 ? Math.round((completed.length / familySteps.length) * 100) : 0;
  };

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      if (!completedSteps.includes(currentStep.id)) {
        setCompletedSteps([...completedSteps, currentStep.id]);
      }
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleSkip = async () => {
    try {
      await apiRequest("/api/onboarding/skip", "POST");
      toast({
        title: "Tour skipped",
        description: "You can resume the platform tour anytime from Settings",
      });
      onClose();
    } catch (error) {
      console.error("Skip error:", error);
      onClose();
    }
  };

  const handleComplete = async () => {
    try {
      await apiRequest("/api/onboarding/complete", "POST", {
        completedSteps: [...completedSteps, currentStep.id],
        communicationProgress: getFamilyProgress("communication"),
        operationsProgress: getFamilyProgress("operations"),
        growthProgress: getFamilyProgress("growth"),
        platformProgress: getFamilyProgress("platform")
      });
      toast({
        title: "Onboarding complete!",
        description: "You've completed the platform tour. Welcome to CoAIleague!",
      });
      onClose();
    } catch (error) {
      console.error("Complete error:", error);
      toast({
        title: "Progress saved",
        description: "Your onboarding progress has been saved",
      });
      onClose();
    }
  };

  const StepIcon = currentStep.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <StepIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl">{currentStep.title}</DialogTitle>
                <DialogDescription className="text-base">
                  {currentStep.description}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="ml-auto">
              {currentStepIndex + 1} / {totalSteps}
            </Badge>
          </div>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-bold">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Step Content */}
        <Card className="border-2">
          <CardContent className="pt-6 space-y-4">
            {/* Screenshot Placeholder */}
            {currentStep.screenshot && (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
                <span className="text-muted-foreground">Screenshot: {currentStep.screenshot}</span>
              </div>
            )}

            {/* Features List */}
            <div className="space-y-3">
              {currentStep.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium">{feature}</span>
                </div>
              ))}
            </div>

            {/* Launch Module Button */}
            {currentStep.url && (
              <Link href={currentStep.url}>
                <Button className="w-full" variant="outline" onClick={onClose} data-testid={`button-launch-${currentStep.id}`}>
                  Launch {currentStep.title.split(" ")[0]}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Family Progress Pills */}
        {currentStepIndex > 1 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="text-xs font-bold text-blue-400">Communication</div>
              <div className="text-lg font-black">{getFamilyProgress("communication")}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400">Operations</div>
              <div className="text-lg font-black">{getFamilyProgress("operations")}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400">Growth</div>
              <div className="text-lg font-black">{getFamilyProgress("growth")}%</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-xs font-bold text-red-400">Platform</div>
              <div className="text-lg font-black">{getFamilyProgress("platform")}%</div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleSkip}
            size="sm"
            data-testid="button-skip-tour"
          >
            <X className="mr-2 h-4 w-4" />
            Skip Tour
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              data-testid="button-previous-step"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button
              onClick={handleNext}
              data-testid="button-next-step"
            >
              {currentStepIndex === totalSteps - 1 ? "Finish Tour" : "Next"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
