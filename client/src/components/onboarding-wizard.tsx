import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, X, CheckCircle2, Sparkles, MessageSquare, Calendar, Briefcase, Activity, Lock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { CoAIleagueLogo } from "@/components/coailleague-logo";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
      "4 Feature Families with 20+ integrated modules",
      "Replace 5+ legacy HR systems with one unified platform",
      "Save $255k annually with automation",
      "Enterprise-grade security (SOC 2, GDPR, ISO 27001)"
    ]
  },
  {
    id: "feature-families",
    family: "overview",
    title: "4 Feature Families Overview",
    description: "CoAIleague organizes features into 4 logical families for easy navigation",
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
      "AI Communications - Organization-wide chatrooms",
      "Private Messages - Secure DMs with purple 'whispered' badges",
      "HelpDesk - Live customer support chat"
    ]
  },
  {
    id: "communications",
    family: "communication",
    title: "AI Communications - Team Chatrooms",
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
    description: "You're ready to start using CoAIleague",
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
      <DialogContent className={cn(
        "max-h-[90vh] overflow-y-auto",
        isMobile ? "max-w-[95vw] w-full p-4" : "max-w-4xl"
      )}>
        <DialogHeader>
          <div className="flex justify-center mb-4 md:mb-6">
            <CoAIleagueLogo width={isMobile ? 150 : 200} height={isMobile ? 38 : 50} showTagline={false} />
          </div>
          <div className={cn(
            "flex items-start justify-between gap-2",
            isMobile && "flex-col"
          )}>
            <div className="flex items-center gap-2 md:gap-3">
              <div className={cn(
                "rounded-xl bg-primary/10 border border-primary/20",
                isMobile ? "p-1.5" : "p-2"
              )}>
                <StepIcon className={cn(isMobile ? "h-5 w-5" : "h-6 w-6", "text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className={cn(isMobile ? "text-lg" : "text-2xl")}>{currentStep.title}</DialogTitle>
                <DialogDescription className={cn(isMobile ? "text-sm" : "text-base", "line-clamp-2")}>
                  {currentStep.description}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className={cn(isMobile && "self-end mt-1")}>
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
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Card className="border-2">
              <CardContent className={cn("pt-4 space-y-3", isMobile ? "pt-3 space-y-2 px-3" : "pt-6 space-y-4")}>
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

                {/* Features List */}
                <div className={cn("space-y-2", isMobile ? "space-y-1.5" : "space-y-3")}>
                  {currentStep.features.map((feature, index) => (
                    <motion.div 
                      key={index} 
                      className={cn(
                        "flex items-start gap-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors",
                        isMobile ? "p-2 gap-2" : "p-3 gap-3"
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
                        <CheckCircle2 className={cn(isMobile ? "h-4 w-4" : "h-5 w-5", "text-primary shrink-0 mt-0.5")} />
                      </motion.div>
                      <span className={cn(isMobile ? "text-xs" : "text-sm", "font-medium")}>{feature}</span>
                    </motion.div>
                  ))}
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
              { name: "Communication", key: "communication" as const, color: "blue" },
              { name: "Operations", key: "operations" as const, color: "indigo" },
              { name: "Growth", key: "growth" as const, color: "violet" },
              { name: "Platform", key: "platform" as const, color: "red" }
            ].map((family, idx) => (
              <motion.div 
                key={family.key}
                className={cn(
                  `text-center rounded-lg bg-${family.color}-500/10 border border-${family.color}-500/20 hover:bg-${family.color}-500/20 transition-colors`,
                  isMobile ? "p-1.5" : "p-2"
                )}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.08 }}
                whileHover={{ scale: 1.02 }}
              >
                <div className={cn(
                  `font-bold ${family.color === 'red' ? 'text-red-400' : 'text-blue-700 dark:text-blue-400'}`,
                  isMobile ? "text-[10px]" : "text-xs"
                )}>
                  {isMobile ? family.name.substring(0, 4) : family.name}
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
          "flex items-center justify-between gap-2 pt-4 border-t",
          isMobile && "flex-col-reverse gap-3"
        )}>
          <Button
            variant="ghost"
            onClick={handleSkip}
            size="sm"
            className={cn(isMobile && "w-full")}
            data-testid="button-skip-tour"
          >
            <X className="mr-2 h-4 w-4" />
            Skip Tour
          </Button>

          <div className={cn("flex gap-2", isMobile && "w-full")}>
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              className={cn(isMobile && "flex-1")}
              size={isMobile ? "sm" : "default"}
              data-testid="button-previous-step"
            >
              <ArrowLeft className="mr-1 md:mr-2 h-4 w-4" />
              {isMobile ? "Back" : "Previous"}
            </Button>
            <Button
              onClick={handleNext}
              className={cn(isMobile && "flex-1")}
              size={isMobile ? "sm" : "default"}
              data-testid="button-next-step"
            >
              {currentStepIndex === totalSteps - 1 ? (isMobile ? "Finish" : "Finish Tour") : "Next"}
              <ArrowRight className="ml-1 md:ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
