import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  X, ChevronRight, ChevronLeft, Check, Calendar, 
  Clock, Users, BarChart3, Settings, Bell, Zap,
  MessageSquare, DollarSign, FileText, Sparkles, Rocket
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CoAITwinMascot } from "@/components/coai-twin-mascot";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  highlight?: boolean;
  action?: string;
  showMascot?: boolean;
  mascotMode?: 'IDLE' | 'GREETING' | 'SUCCESS' | 'CELEBRATING';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CoAIleague!',
    description: 'Meet Trinity, your AI-powered workforce management assistant. Let us show you around the key features that will help you manage your team efficiently.',
    icon: <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />,
    position: 'center',
    showMascot: true,
    mascotMode: 'GREETING'
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description: 'This is your command center. Get a quick overview of your workforce metrics, upcoming shifts, and important notifications all in one place.',
    icon: <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />,
    targetSelector: '[data-tour="dashboard"]',
    position: 'bottom'
  },
  {
    id: 'scheduling',
    title: 'Smart Scheduling',
    description: 'Create and manage employee schedules with AI assistance. Set up recurring shifts, handle swap requests, and optimize coverage automatically.',
    icon: <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />,
    targetSelector: '[data-tour="schedule"]',
    position: 'right'
  },
  {
    id: 'time-tracking',
    title: 'Time Tracking',
    description: 'Track employee hours with GPS-enabled clock-in/out. View timesheets, approve hours, and generate reports with one click.',
    icon: <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500" />,
    targetSelector: '[data-tour="time-tracking"]',
    position: 'right'
  },
  {
    id: 'employees',
    title: 'Team Management',
    description: 'Manage your workforce efficiently. Add employees, track certifications, set availability, and maintain compliance effortlessly.',
    icon: <Users className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-500" />,
    targetSelector: '[data-tour="employees"]',
    position: 'right'
  },
  {
    id: 'invoicing',
    title: 'Invoicing & Payroll',
    description: 'Generate invoices from tracked hours, process payroll, and keep your financials organized. All integrated with Stripe for secure payments.',
    icon: <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500" />,
    targetSelector: '[data-tour="invoices"]',
    position: 'right'
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    description: 'Get AI-powered insights into your workforce performance. Track trends, identify issues, and make data-driven decisions.',
    icon: <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-cyan-500" />,
    targetSelector: '[data-tour="analytics"]',
    position: 'right'
  },
  {
    id: 'trinity',
    title: 'Meet Trinity AI',
    description: 'Your intelligent assistant is always ready to help! Ask Trinity questions, get recommendations, and automate routine tasks.',
    icon: <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8 text-violet-500" />,
    targetSelector: '[data-tour="trinity"]',
    position: 'left',
    showMascot: true,
    mascotMode: 'IDLE'
  },
  {
    id: 'notifications',
    title: 'Stay Informed',
    description: 'Never miss important updates. Get real-time notifications for shift changes, approvals, compliance alerts, and more.',
    icon: <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-rose-500" />,
    targetSelector: '[data-tour="notifications"]',
    position: 'bottom'
  },
  {
    id: 'settings',
    title: 'Customize Your Experience',
    description: 'Configure your workspace, set up integrations, manage user roles, and personalize your notification preferences.',
    icon: <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-slate-500" />,
    targetSelector: '[data-tour="settings"]',
    position: 'bottom'
  },
  {
    id: 'complete',
    title: "You're All Set!",
    description: "You've completed the tour! Start exploring CoAIleague and transform how you manage your workforce. Trinity is always here to help you succeed.",
    icon: <Check className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />,
    position: 'center',
    action: 'complete',
    showMascot: true,
    mascotMode: 'CELEBRATING'
  }
];

const STORAGE_KEY_PREFIX = 'coaileague_onboarding_completed';

function getStorageKey(userId?: string, workspaceId?: string): string {
  if (userId && workspaceId) {
    return `${STORAGE_KEY_PREFIX}_${userId}_${workspaceId}`;
  }
  return `${STORAGE_KEY_PREFIX}_global`;
}

interface OnboardingTourProps {
  forceShow?: boolean;
  userId?: string;
  workspaceId?: string;
  onComplete?: () => void;
  onSkip?: () => void;
}

export function OnboardingTour({ forceShow = false, userId, workspaceId, onComplete, onSkip }: OnboardingTourProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const storageKey = getStorageKey(userId, workspaceId);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      return;
    }

    // Only show tour for authenticated users (must have userId)
    if (!userId) return;

    const completed = localStorage.getItem(storageKey);
    if (!completed) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [forceShow, userId, storageKey]);

  useEffect(() => {
    if (!isVisible) return;

    const step = TOUR_STEPS[currentStep];
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightPosition({
          x: rect.left - 8,
          y: rect.top - 8,
          width: rect.width + 16,
          height: rect.height + 16
        });
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setHighlightPosition(null);
      }
    } else {
      setHighlightPosition(null);
    }
  }, [currentStep, isVisible]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onComplete?.();
  }, [onComplete, storageKey]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setIsVisible(false);
    onSkip?.();
  }, [onSkip, storageKey]);

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  if (!isVisible) return null;

  const getCardPosition = () => {
    if (!highlightPosition || step.position === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const padding = isMobile ? 12 : 20;
    switch (step.position) {
      case 'top':
        return { 
          bottom: `${window.innerHeight - highlightPosition.y + padding}px`, 
          left: `${highlightPosition.x + highlightPosition.width / 2}px`,
          transform: 'translateX(-50%)'
        };
      case 'bottom':
        return { 
          top: `${highlightPosition.y + highlightPosition.height + padding}px`, 
          left: `${highlightPosition.x + highlightPosition.width / 2}px`,
          transform: 'translateX(-50%)'
        };
      case 'left':
        return { 
          top: `${highlightPosition.y + highlightPosition.height / 2}px`, 
          right: `${window.innerWidth - highlightPosition.x + padding}px`,
          transform: 'translateY(-50%)'
        };
      case 'right':
        return { 
          top: `${highlightPosition.y + highlightPosition.height / 2}px`, 
          left: `${highlightPosition.x + highlightPosition.width + padding}px`,
          transform: 'translateY(-50%)'
        };
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
  };

  // Trinity mascot component for special steps
  const TrinityMascotDisplay = ({ mode, size }: { mode: 'IDLE' | 'GREETING' | 'SUCCESS' | 'CELEBRATING'; size: number }) => (
    <div className="relative flex items-center justify-center">
      <div 
        className="relative rounded-full overflow-hidden"
        style={{ width: size, height: size }}
      >
        <CoAITwinMascot 
          mode={mode}
          size={size}
          mini={true}
          variant="mini"
        />
      </div>
      {/* Animated glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-primary/30"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{ width: size, height: size }}
      />
    </div>
  );

  // Feature icon with consistent styling
  const FeatureIcon = ({ children }: { children: React.ReactNode }) => (
    <div className="p-2 sm:p-3 bg-gradient-to-br from-muted to-muted/50 rounded-xl border border-border/50 shadow-sm">
      {children}
    </div>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
            onClick={handleSkip}
          />

          {/* Highlight box for targeted elements */}
          {highlightPosition && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed border-2 border-primary rounded-xl z-[9999] pointer-events-none"
              style={{
                left: highlightPosition.x,
                top: highlightPosition.y,
                width: highlightPosition.width,
                height: highlightPosition.height,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 30px 0 hsl(var(--primary) / 0.3)',
              }}
            />
          )}

          {/* Main tour card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed z-[10000] w-[340px] sm:w-[420px] max-w-[92vw]"
            style={getCardPosition()}
          >
            <Card className="shadow-2xl border-2 border-border/80 bg-card/98 backdrop-blur-xl overflow-hidden">
              {/* Gradient accent bar */}
              <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500" />
              
              <CardHeader className="pb-2 sm:pb-3 pt-4 sm:pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {/* Icon or Trinity mascot */}
                    {step.showMascot && step.mascotMode ? (
                      <TrinityMascotDisplay 
                        mode={step.mascotMode} 
                        size={isMobile ? 56 : 72} 
                      />
                    ) : (
                      <FeatureIcon>
                        {step.icon}
                      </FeatureIcon>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg font-semibold leading-tight truncate">
                        {step.title}
                      </CardTitle>
                      <Badge 
                        variant="secondary" 
                        className="mt-1.5 text-xs font-medium bg-primary/10 text-primary border-primary/20"
                      >
                        Step {currentStep + 1} of {TOUR_STEPS.length}
                      </Badge>
                    </div>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleSkip}
                    className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                    data-testid="button-tour-close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="pb-3 sm:pb-4">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
                
                {/* Progress bar with enhanced styling */}
                <div className="mt-4 space-y-1.5">
                  <Progress value={progress} className="h-1.5 bg-muted" />
                  <p className="text-xs text-muted-foreground/70 text-right">
                    {Math.round(progress)}% complete
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-0 pt-0 pb-4">
                <Button
                  variant="outline"
                  size={isMobile ? "sm" : "default"}
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="gap-1.5 w-full sm:w-auto"
                  data-testid="button-tour-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "default"}
                    onClick={handleSkip}
                    className="flex-1 sm:flex-none text-muted-foreground"
                    data-testid="button-tour-skip"
                  >
                    Skip Tour
                  </Button>
                  
                  {step.action === 'complete' ? (
                    <Button
                      size={isMobile ? "sm" : "default"}
                      onClick={handleComplete}
                      className="gap-1.5 flex-1 sm:flex-none bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                      data-testid="button-tour-complete"
                    >
                      <Rocket className="h-4 w-4" />
                      Get Started
                    </Button>
                  ) : (
                    <Button
                      size={isMobile ? "sm" : "default"}
                      onClick={handleNext}
                      className="gap-1.5 flex-1 sm:flex-none"
                      data-testid="button-tour-next"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useTourReset(userId?: string, workspaceId?: string) {
  const storageKey = getStorageKey(userId, workspaceId);
  
  const resetTour = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const isTourCompleted = useCallback(() => {
    return localStorage.getItem(storageKey) === 'true';
  }, [storageKey]);

  return { resetTour, isTourCompleted };
}

export function TourTriggerButton({ userId, workspaceId }: { userId?: string; workspaceId?: string }) {
  const [showTour, setShowTour] = useState(false);
  const { resetTour } = useTourReset(userId, workspaceId);

  const handleClick = () => {
    resetTour();
    setShowTour(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="gap-2"
        data-testid="button-restart-tour"
      >
        <Zap className="h-4 w-4" />
        Tour Guide
      </Button>
      {showTour && (
        <OnboardingTour 
          forceShow={true}
          userId={userId}
          workspaceId={workspaceId}
          onComplete={() => setShowTour(false)}
          onSkip={() => setShowTour(false)}
        />
      )}
    </>
  );
}
