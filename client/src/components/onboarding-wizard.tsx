import { useState, useEffect, useRef } from "react";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, X, CheckCircle2, Sparkles, MessageSquare, Calendar, Briefcase, Activity, Lock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';

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
    title: `Welcome to ${PLATFORM_NAME}`,
    description: "The complete workforce optimization platform built for modern enterprises",
    icon: Sparkles,
    features: [
      "4 Feature Families with 20+ integrated modules",
      "Consolidate multiple HR workflows into one unified platform",
      "Reduces administrative overhead across scheduling, payroll, and compliance — actual impact varies by organization",
      "Enterprise-grade security (SOC 2, GDPR, ISO 27001)"
    ]
  },
  {
    id: "feature-families",
    family: "overview",
    title: "4 Feature Families Overview",
    description: `${PLATFORM_NAME} organizes features into 4 logical families for easy navigation`,
    icon: Sparkles,
    features: [
      "Communication & Collaboration - Team chat, DMs, support",
      "Workforce Operations - Scheduling, time, payroll, billing",
      "Growth & Intelligence - Hiring, analytics, engagement",
      "Platform & Control - Integrations, budgets, diagnostics"
    ]
  },
  // Communication Family
  {
    id: "communication-family",
    family: "communication",
    title: "Communication & Collaboration",
    description: "Connect your team with real-time messaging and support tools",
    icon: MessageSquare,
    url: "/category/communication",
    features: [
      "Chatrooms - Organization-wide team conversations",
      "Private Messages - Secure DMs with purple 'whispered' badges",
      "HelpDesk - Live customer support chat"
    ]
  },
  {
    id: "communications",
    family: "communication",
    title: "Chatrooms - Team Conversations",
    description: "Organization-specific chatrooms with access control and real-time messaging",
    icon: MessageSquare,
    url: "/chatrooms",
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
    title: "Workforce Operations",
    description: "Automate daily operations with scheduling, time tracking, and payroll",
    icon: Calendar,
    url: "/category/operations",
    features: [
      "AI Scheduling - AI-powered smart scheduling",
      "Time Platform - Geofencing and mobile clock-in",
      "AI Payroll - Automated payroll processing",
      "Billing Platform - Invoice generation and tracking"
    ]
  },
  {
    id: "schedule",
    family: "operations",
    title: "AI Scheduling - Smart Scheduling",
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
    id: "time-tracking",
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
    title: "Growth & Intelligence",
    description: "Scale with AI-powered recruitment, analytics, and engagement tools",
    icon: Briefcase,
    url: "/category/growth",
    features: [
      "AI Hiring - Recruitment workflow automation",
      "Engagement - Employee engagement analytics",
      "Analytics - Predictive workforce insights",
      "Reports - Automated compliance reports"
    ]
  },
  {
    id: "hiring",
    family: "growth",
    title: "AI Hiring - Recruitment Workflow",
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
    id: "engagement",
    family: "growth",
    title: "Engagement - Employee Engagement",
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
    title: "Platform & Control",
    description: "Enterprise administration, integrations, and diagnostics",
    icon: Activity,
    url: "/category/platform",
    features: [
      "Diagnostics - User diagnostics and troubleshooting",
      "Integrations - Connect external services",
      "Budgeting - Budget planning and control",
      "Command Center - Platform administration"
    ]
  },
  {
    id: "integrations",
    family: "platform",
    title: "AI Integrations - External Services",
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
    id: "diagnostics",
    family: "platform",
    title: "AI Diagnostics - User Diagnostics",
    description: "Platform staff diagnostics for troubleshooting and support (Admin Only)",
    icon: Activity,
    url: "/diagnostics",
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
    description: `You're ready to start using ${PLATFORM_NAME}`,
    icon: CheckCircle2,
    features: [
      "Click any Feature Family in the sidebar to explore modules",
      "Access this tour anytime from Settings - Platform Tour",
      "Check your progress: Communication, Operations, Growth, Platform",
      "Contact support anytime via HelpDesk"
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
  const isMobile = useIsMobile();

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
        setCompletedSteps(prev => [...prev, currentStep.id]);
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
        description: `You've completed the platform tour. Welcome to ${PLATFORM_NAME}!`,
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
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent className={cn(
        "overflow-y-auto",
        isMobile 
          ? "!max-w-[75vw] !w-[75vw] !p-2 !max-h-[60vh] pb-safe mx-auto" 
          : "max-w-4xl max-h-[90vh]"
      )}>
        <UniversalModalHeader className={cn(isMobile && "space-y-1")}>
          <div className={cn("flex justify-center", isMobile ? "mb-1" : "mb-4 md:mb-6")}>
            <UnifiedBrandLogo size={isMobile ? "sm" : "xl"} />
          </div>
          <div className={cn(
            "flex items-start justify-between gap-2",
            isMobile && "flex-col"
          )}>
            <div className="flex items-center gap-1.5 md:gap-3">
              <div className={cn(
                "rounded-lg bg-primary/10 border border-primary/20",
                isMobile ? "p-1" : "p-2"
              )}>
                <StepIcon className={cn(isMobile ? "h-4 w-4" : "h-6 w-6", "text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <UniversalModalTitle className={cn(isMobile ? "text-sm leading-tight" : "text-2xl")}>{currentStep.title}</UniversalModalTitle>
                <UniversalModalDescription className={cn(isMobile ? "text-[11px] leading-tight" : "text-base", "line-clamp-2")}>
                  {currentStep.description}
                </UniversalModalDescription>
              </div>
            </div>
            <Badge variant="outline" className={cn(isMobile && "self-end mt-1")}>
              {currentStepIndex + 1} / {totalSteps}
            </Badge>
          </div>
        </UniversalModalHeader>

        {/* Progress Bar */}
        <div className={cn("space-y-1", isMobile && "py-1")}>
          <div className={cn("flex items-center justify-between gap-2", isMobile ? "text-xs" : "text-sm")}>
            <span className="text-muted-foreground">Progress</span>
            <span className="font-bold">{progressPercentage}%</span>
          </div>
          <Progress value={progressPercentage} className={cn(isMobile ? "h-1.5" : "h-2")} />
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Card className="border">
              <CardContent className={cn("pt-4 space-y-3", isMobile ? "pt-1.5 space-y-1 px-1.5 pb-1.5" : "pt-6 space-y-4")}>
                {/* Screenshot Placeholder */}
                {currentStep.screenshot && (
                  <motion.div 
                    className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                  >
                    <span className="text-muted-foreground">Screenshot: {currentStep.screenshot}</span>
                  </motion.div>
                )}

                {/* Features List - show max 3 on mobile to save space */}
                <div className={cn("space-y-2", isMobile ? "space-y-0.5" : "space-y-3")}>
                  {(isMobile ? currentStep.features.slice(0, 3) : currentStep.features).map((feature, index) => (
                    <motion.div 
                      key={index} 
                      className={cn(
                        "flex items-start gap-2 rounded-md bg-muted/50 hover:bg-muted/70 transition-colors",
                        isMobile ? "p-1 gap-1" : "p-3 gap-3"
                      )}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.08, duration: 0.25, ease: "easeOut" }}
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 + index * 0.08, type: "spring", stiffness: 400 }}
                      >
                        <CheckCircle2 className={cn(isMobile ? "h-3 w-3" : "h-5 w-5", "text-primary shrink-0 mt-0.5")} />
                      </motion.div>
                      <span className={cn(isMobile ? "text-[10px] leading-tight" : "text-sm", "font-medium")}>{feature}</span>
                    </motion.div>
                  ))}
                  {isMobile && currentStep.features.length > 3 && (
                    <div className="text-[9px] text-muted-foreground text-center">
                      +{currentStep.features.length - 3} more
                    </div>
                  )}
                  {/* FTC Disclaimer for savings claims */}
                  {currentStep.id === "welcome" && (
                    <div className={cn(
                      "text-muted-foreground text-center border-t pt-2 mt-2",
                      isMobile ? "text-[8px]" : "text-[10px]"
                    )}>
                      *Savings estimates based on U.S. Bureau of Labor Statistics median wages. Actual results vary by organization.
                    </div>
                  )}
                </div>

                {/* Launch Module Button */}
                {currentStep.url && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + currentStep.features.length * 0.08, duration: 0.25 }}
                  >
                    <Link href={currentStep.url}>
                      <Button className="w-full group" variant="outline" onClick={onClose} data-testid={`button-launch-${currentStep.id}`}>
                        Launch {currentStep.title.split(" ")[0]}
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Family Progress Pills */}
        {currentStepIndex > 1 && (
          <motion.div 
            className={cn("grid gap-2", isMobile ? "grid-cols-2 gap-1.5" : "grid-cols-4")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {[
              { name: "Communication", shortName: "Comm", key: "communication" as const, bgClass: "bg-blue-500/10", borderClass: "border-blue-500/20", hoverClass: "hover:bg-blue-500/20", textClass: "text-blue-700 dark:text-blue-400" },
              { name: "Operations", shortName: "Ops", key: "operations" as const, bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/20", hoverClass: "hover:bg-indigo-500/20", textClass: "text-indigo-700 dark:text-indigo-400" },
              { name: "Growth", shortName: "Grow", key: "growth" as const, bgClass: "bg-violet-500/10", borderClass: "border-violet-500/20", hoverClass: "hover:bg-violet-500/20", textClass: "text-violet-700 dark:text-violet-400" },
              { name: "Platform", shortName: "Plat", key: "platform" as const, bgClass: "bg-red-500/10", borderClass: "border-red-500/20", hoverClass: "hover:bg-red-500/20", textClass: "text-red-400" }
            ].map((family, idx) => (
              <motion.div 
                key={family.key}
                className={cn(
                  "text-center rounded-lg border transition-colors",
                  family.bgClass, family.borderClass, family.hoverClass,
                  isMobile ? "p-1.5" : "p-2"
                )}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.08 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className={cn(
                  "font-bold", family.textClass,
                  isMobile ? "text-[10px]" : "text-xs"
                )}>
                  {isMobile ? family.shortName : family.name}
                </div>
                <motion.div 
                  className={cn(isMobile ? "text-sm" : "text-lg", "font-black")}
                  key={getFamilyProgress(family.key)}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {getFamilyProgress(family.key)}%
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Navigation Buttons */}
        <div className={cn(
          "flex items-center justify-between gap-2 pt-2 border-t",
          isMobile && "flex-row gap-2 pt-2"
        )}>
          <Button
            variant="ghost"
            onClick={handleSkip}
            size="sm"
            className={cn(isMobile && "px-2 text-xs h-8")}
            data-testid="button-skip-tour"
          >
            <X className={cn(isMobile ? "h-3 w-3 mr-1" : "mr-2 h-4 w-4")} />
            Skip
          </Button>

          <div className="flex gap-1.5">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              size="sm"
              className={cn(isMobile && "px-2 text-xs h-8")}
              data-testid="button-previous-step"
            >
              <ArrowLeft className={cn(isMobile ? "h-3 w-3" : "mr-1 h-4 w-4")} />
              {!isMobile && "Back"}
            </Button>
            <Button
              onClick={handleNext}
              size="sm"
              className={cn(isMobile && "px-3 text-xs h-8")}
              data-testid="button-next-step"
            >
              {currentStepIndex === totalSteps - 1 ? "Done" : "Next"}
              <ArrowRight className={cn(isMobile ? "h-3 w-3 ml-1" : "ml-1 h-4 w-4")} />
            </Button>
          </div>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}
