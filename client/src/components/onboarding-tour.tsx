import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  X, ChevronRight, ChevronLeft, Check, Calendar, 
  Clock, Users, BarChart3, Settings, Bell, Zap,
  MessageSquare, DollarSign, FileText, Sparkles, Rocket,
  Shield, Smartphone, Brain, TrendingUp, Award, 
  Globe, Layers, Star, Mail, Camera, BellRing, LayoutDashboard
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CoAITwinMascot } from "@/components/coai-twin-mascot";
import MASCOT_CONFIG from "@/config/mascotConfig";

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
  mascotMode?: 'IDLE' | 'GREETING' | 'SUCCESS' | 'CELEBRATING' | 'THINKING' | 'ADVISING';
  category?: string;
  upgradeHint?: string;
}

const TOUR_STEPS: TourStep[] = [
  // 1. Welcome & Trinity Introduction
  {
    id: 'welcome',
    title: 'Welcome to CoAIleague!',
    description: 'Meet Trinity, your AI-powered workforce management assistant. She learns your business patterns and automates repetitive tasks so you can focus on growing your team.',
    icon: <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />,
    position: 'center',
    showMascot: true,
    mascotMode: 'GREETING',
    category: 'Introduction'
  },
  // 2. Dashboard & Widgets
  {
    id: 'dashboard',
    title: 'Your Command Center',
    description: 'Get a real-time overview of everything happening in your business. Customizable widgets show workforce metrics, upcoming shifts, pending approvals, and alerts. Drag and drop to arrange your perfect view.',
    icon: <LayoutDashboard className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />,
    targetSelector: '[data-tour="dashboard"]',
    position: 'bottom',
    category: 'Core Features'
  },
  // 3. Smart Scheduling
  {
    id: 'scheduling',
    title: 'AI-Powered Scheduling',
    description: 'Create optimized schedules in seconds. Trinity analyzes employee availability, skills, and preferences to suggest the best coverage. Set up recurring shifts, handle swap requests, and duplicate entire weeks with one click.',
    icon: <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />,
    targetSelector: '[data-tour="schedule"]',
    position: 'right',
    category: 'Core Features',
    upgradeHint: 'Pro: AI auto-fills gaps and predicts no-shows'
  },
  // 4. Time Tracking
  {
    id: 'time-tracking',
    title: 'GPS Time Tracking',
    description: 'Track employee hours with precision. GPS-enabled clock-in/out ensures accurate location verification. View timesheets, approve hours, and generate payroll-ready reports instantly.',
    icon: <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500" />,
    targetSelector: '[data-tour="time-tracking"]',
    position: 'right',
    category: 'Core Features'
  },
  // 5. Team Management
  {
    id: 'employees',
    title: 'Team Management',
    description: 'Manage your entire workforce from one place. Add employees, track certifications, set availability preferences, assign roles, and maintain compliance documentation effortlessly.',
    icon: <Users className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-500" />,
    targetSelector: '[data-tour="employees"]',
    position: 'right',
    category: 'Core Features'
  },
  // 6. Compliance
  {
    id: 'compliance',
    title: 'Compliance & Certifications',
    description: 'Never miss a certification expiry again. Trinity automatically tracks all employee credentials and alerts you 30 days before expiration. Stay audit-ready with complete compliance history.',
    icon: <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />,
    targetSelector: '[data-tour="compliance"]',
    position: 'right',
    category: 'Compliance',
    upgradeHint: 'Pro: Auto-renewal reminders sent to employees'
  },
  // 7. Invoicing & Payroll
  {
    id: 'invoicing',
    title: 'Invoicing & Payroll',
    description: 'Generate professional invoices from tracked hours automatically. Process payroll with built-in tax calculations and direct Stripe integration for secure payments. Export reports for your accountant.',
    icon: <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500" />,
    targetSelector: '[data-tour="invoices"]',
    position: 'right',
    category: 'Financial'
  },
  // 8. Analytics
  {
    id: 'analytics',
    title: 'Analytics & Insights',
    description: 'Make data-driven decisions with AI-powered analytics. Track labor costs, overtime trends, attendance patterns, and productivity metrics. Get actionable recommendations to optimize your workforce.',
    icon: <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-cyan-500" />,
    targetSelector: '[data-tour="analytics"]',
    position: 'right',
    category: 'Analytics',
    upgradeHint: 'Pro: Predictive analytics and custom reports'
  },
  // 9. Daily Digest Emails
  {
    id: 'daily-digest',
    title: 'Daily Digest Emails',
    description: 'Start every day informed. Receive personalized morning emails at 7 AM with your shift schedule, pending approvals, compliance alerts, and weekly hours summary. Never miss what matters.',
    icon: <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-pink-500" />,
    targetSelector: '[data-tour="email-settings"]',
    position: 'bottom',
    category: 'Communication'
  },
  // 10. Feedback & Screenshots
  {
    id: 'feedback',
    title: 'Quick Feedback',
    description: 'Found a bug or have an idea? Submit feedback instantly with optional screenshot capture. Your voice shapes how CoAIleague evolves. We read every submission.',
    icon: <Camera className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />,
    targetSelector: '[data-tour="feedback"]',
    position: 'bottom',
    category: 'Support'
  },
  // 11. Push Notifications
  {
    id: 'push-notifications',
    title: 'Instant Push Alerts',
    description: 'Never miss urgent updates. Enable browser push notifications for shift reminders, approval requests, and compliance deadlines. Get alerted even when CoAIleague is closed.',
    icon: <BellRing className="h-6 w-6 sm:h-8 sm:w-8 text-violet-500" />,
    targetSelector: '[data-tour="push-notifications"]',
    position: 'bottom',
    category: 'Communication'
  },
  // 12. Trinity AI Orchestration - Sales Pitch
  {
    id: 'trinity-ai',
    title: 'Trinity AI Orchestration',
    description: 'Trinity is your 24/7 AI business partner. She handles scheduling conflicts, payroll anomalies, compliance alerts, and employee questions automatically. The more you use CoAIleague, the smarter Trinity becomes.',
    icon: <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-violet-500" />,
    position: 'center',
    showMascot: true,
    mascotMode: 'THINKING',
    category: 'AI Power'
  },
  // 13. Trinity Capabilities
  {
    id: 'trinity-capabilities',
    title: 'What Trinity Can Do',
    description: 'Auto-generate optimized schedules • Detect payroll anomalies before they cost you • Send shift reminders and compliance alerts • Answer employee questions instantly • Generate reports on demand • Learn your patterns for smarter automation',
    icon: <Layers className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />,
    position: 'center',
    showMascot: true,
    mascotMode: 'ADVISING',
    category: 'AI Power',
    upgradeHint: 'Upgrade to unlock full AI orchestration power'
  },
  // 14. Notifications
  {
    id: 'notifications',
    title: 'Smart Notifications',
    description: 'Stay informed without the noise. Get real-time alerts for shift changes, time-off requests, compliance deadlines, and urgent issues. Configure preferences to receive updates your way.',
    icon: <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-rose-500" />,
    targetSelector: '[data-tour="notifications"]',
    position: 'bottom',
    category: 'Communication'
  },
  // 15. Integrations
  {
    id: 'integrations',
    title: 'Powerful Integrations',
    description: 'Connect CoAIleague with tools you already use. Sync with Google Calendar, export to QuickBooks, process payments via Stripe, and send SMS alerts through Twilio. Your data flows seamlessly.',
    icon: <Globe className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400" />,
    targetSelector: '[data-tour="integrations"]',
    position: 'bottom',
    category: 'Integrations'
  },
  // 16. Mobile App
  {
    id: 'mobile',
    title: 'Mobile-First Experience',
    description: 'Manage your workforce from anywhere. Employees can clock in/out, view schedules, request time off, and swap shifts from their phones. Managers get instant notifications and approve on the go.',
    icon: <Smartphone className="h-6 w-6 sm:h-8 sm:w-8 text-slate-500" />,
    position: 'center',
    category: 'Mobile'
  },
  // 17. Settings
  {
    id: 'settings',
    title: 'Customize Everything',
    description: 'Configure your workspace to match your business. Set up departments, locations, job roles, pay rates, overtime rules, and notification preferences. Import existing employee data in minutes.',
    icon: <Settings className="h-6 w-6 sm:h-8 sm:w-8 text-gray-500" />,
    targetSelector: '[data-tour="settings"]',
    position: 'bottom',
    category: 'Settings'
  },
  // 18. Upgrade CTA
  {
    id: 'upgrade',
    title: 'Unlock Full Potential',
    description: 'Ready to supercharge your business? Upgrade to Pro for unlimited AI credits, advanced analytics, priority support, and full Trinity orchestration. Most businesses save 10+ hours per week.',
    icon: <Star className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />,
    position: 'center',
    showMascot: true,
    mascotMode: 'ADVISING',
    category: 'Upgrade',
    upgradeHint: 'Special launch pricing available!'
  },
  // 19. Completion
  {
    id: 'complete',
    title: "You're Ready to Go!",
    description: "You've seen what CoAIleague can do. Start by adding your first employee or creating a schedule. Trinity is always here in the corner to help - just click on her anytime!",
    icon: <Rocket className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />,
    position: 'center',
    action: 'complete',
    showMascot: true,
    mascotMode: 'CELEBRATING',
    category: 'Complete'
  }
];

const STORAGE_KEY_PREFIX = 'coaileague_onboarding_completed';

function getStorageKey(userId?: string, workspaceId?: string): string {
  if (userId && workspaceId) {
    return `${STORAGE_KEY_PREFIX}_${userId}_${workspaceId}`;
  }
  return `${STORAGE_KEY_PREFIX}_global`;
}

// Get live mascot position from DOM
function getMascotPosition(): { x: number; y: number; width: number; height: number } | null {
  const mascotEl = document.querySelector('[data-testid="mascot-container"]');
  if (mascotEl) {
    const rect = mascotEl.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }
  return null;
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
  const [mascotPos, setMascotPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const storageKey = getStorageKey(userId, workspaceId);

  // Track live mascot position
  useEffect(() => {
    if (!isVisible) return;
    
    const updateMascotPos = () => {
      const pos = getMascotPosition();
      if (pos) {
        setMascotPos(pos);
      }
    };
    
    updateMascotPos();
    const interval = setInterval(updateMascotPos, 500);
    window.addEventListener('resize', updateMascotPos);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateMascotPos);
    };
  }, [isVisible]);

  // Trinity safe zone - use live mascot position with fallback
  const trinitySafeZone = useMemo(() => {
    if (mascotPos) {
      const padding = 20;
      return {
        x: mascotPos.x - padding,
        y: mascotPos.y - padding,
        width: mascotPos.width + padding * 2,
        height: mascotPos.height + padding * 2
      };
    }
    // Fallback to default bottom-right position
    const safeWidth = isMobile ? 120 : 160;
    const safeHeight = isMobile ? 120 : 160;
    return {
      x: window.innerWidth - safeWidth - 20,
      y: window.innerHeight - safeHeight - 20,
      width: safeWidth,
      height: safeHeight
    };
  }, [mascotPos, isMobile]);

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

  // Calculate card position while avoiding Trinity safe zone
  const getCardPosition = () => {
    const cardWidth = isMobile ? 320 : 420;
    
    if (!highlightPosition || step.position === 'center') {
      // Center position - ensure we don't overlap Trinity
      // Position in upper-center to avoid Trinity in bottom-right
      return { 
        top: isMobile ? '35%' : '40%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)' 
      };
    }

    const padding = isMobile ? 12 : 20;
    let position: Record<string, string> = {};
    
    switch (step.position) {
      case 'top':
        position = { 
          bottom: `${window.innerHeight - highlightPosition.y + padding}px`, 
          left: `${Math.min(Math.max(highlightPosition.x + highlightPosition.width / 2, cardWidth / 2 + 10), window.innerWidth - cardWidth / 2 - 10)}px`,
          transform: 'translateX(-50%)'
        };
        break;
      case 'bottom':
        position = { 
          top: `${highlightPosition.y + highlightPosition.height + padding}px`, 
          left: `${Math.min(Math.max(highlightPosition.x + highlightPosition.width / 2, cardWidth / 2 + 10), window.innerWidth - cardWidth / 2 - 10)}px`,
          transform: 'translateX(-50%)'
        };
        break;
      case 'left':
        position = { 
          top: `${highlightPosition.y + highlightPosition.height / 2}px`, 
          right: `${window.innerWidth - highlightPosition.x + padding}px`,
          transform: 'translateY(-50%)'
        };
        break;
      case 'right':
        position = { 
          top: `${highlightPosition.y + highlightPosition.height / 2}px`, 
          left: `${highlightPosition.x + highlightPosition.width + padding}px`,
          transform: 'translateY(-50%)'
        };
        break;
      default:
        position = { top: '40%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    
    return position;
  };

  // Trinity mascot component for special steps - rendered INSIDE the card
  const TrinityMascotDisplay = ({ mode, size }: { mode: 'IDLE' | 'GREETING' | 'SUCCESS' | 'CELEBRATING' | 'THINKING' | 'ADVISING'; size: number }) => (
    <div className="relative flex items-center justify-center">
      <div 
        className="relative rounded-full overflow-hidden bg-gradient-to-br from-purple-500/10 to-blue-500/10"
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
        className="absolute inset-0 rounded-full border-2 border-primary/40"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.7, 0.4],
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
    <div className="p-2.5 sm:p-3 bg-gradient-to-br from-muted to-muted/50 rounded-xl border border-border/50 shadow-sm shrink-0">
      {children}
    </div>
  );

  // Generate CSS mask to create transparent hole for Trinity
  const getTrinityMask = () => {
    const { x, y, width, height } = trinitySafeZone;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.max(width, height) / 2;
    
    // Radial gradient mask: transparent circle at Trinity position, black everywhere else
    // Black = visible backdrop, Transparent = hole for Trinity
    return `radial-gradient(circle ${radius + 20}px at ${centerX}px ${centerY}px, transparent 0%, transparent ${radius}px, black ${radius + 10}px, black 100%)`;
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop overlay with transparent hole for Trinity */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{ 
              zIndex: MASCOT_CONFIG.zIndex - 10, // Below mascot (10001)
              background: 'rgba(0, 0, 0, 0.75)',
              WebkitMaskImage: getTrinityMask(),
              maskImage: getTrinityMask(),
            }}
            onClick={handleSkip}
          />
          
          {/* Blur layer with same Trinity hole */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-[2px] pointer-events-none"
            style={{ 
              zIndex: MASCOT_CONFIG.zIndex - 11,
              WebkitMaskImage: getTrinityMask(),
              maskImage: getTrinityMask(),
            }}
          />

          {/* Highlight box for targeted elements */}
          {highlightPosition && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed border-2 border-primary rounded-xl pointer-events-none"
              style={{
                left: highlightPosition.x,
                top: highlightPosition.y,
                width: highlightPosition.width,
                height: highlightPosition.height,
                boxShadow: '0 0 30px 0 hsl(var(--primary) / 0.4)',
                zIndex: MASCOT_CONFIG.zIndex - 9,
              }}
            />
          )}

          {/* Main tour card - below Trinity */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed w-[320px] sm:w-[420px] max-w-[92vw]"
            style={{
              ...getCardPosition(),
              zIndex: MASCOT_CONFIG.zIndex - 8, // Below mascot
            }}
          >
            <Card className="shadow-2xl border-2 border-border/80 bg-card/98 backdrop-blur-xl overflow-hidden max-h-[85vh] flex flex-col">
              {/* Gradient accent bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 shrink-0" />
              
              <CardHeader className="pb-2 sm:pb-3 pt-4 sm:pt-5 shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {/* Icon or Trinity mascot in card */}
                    {step.showMascot && step.mascotMode ? (
                      <TrinityMascotDisplay 
                        mode={step.mascotMode} 
                        size={isMobile ? 56 : 70} 
                      />
                    ) : (
                      <FeatureIcon>
                        {step.icon}
                      </FeatureIcon>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base sm:text-lg font-semibold leading-tight">
                        {step.title}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge 
                          variant="secondary" 
                          className="text-xs font-medium bg-primary/10 text-primary border-primary/20"
                        >
                          {currentStep + 1} / {TOUR_STEPS.length}
                        </Badge>
                        {step.category && (
                          <Badge 
                            variant="outline" 
                            className="text-xs font-normal text-muted-foreground"
                          >
                            {step.category}
                          </Badge>
                        )}
                      </div>
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
              
              {/* Scrollable content area for small screens */}
              <CardContent className="pb-3 sm:pb-4 overflow-y-auto flex-1">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
                
                {/* Upgrade hint badge */}
                {step.upgradeHint && (
                  <div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                        {step.upgradeHint}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Progress bar */}
                <div className="mt-4 space-y-1.5">
                  <Progress value={progress} className="h-2 bg-muted" />
                  <div className="flex justify-between text-xs text-muted-foreground/70">
                    <span>{Math.round(progress)}% complete</span>
                    <span>{TOUR_STEPS.length - currentStep - 1} steps left</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 sm:gap-3 pt-0 pb-4 shrink-0">
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
                    Skip
                  </Button>
                  
                  {step.action === 'complete' ? (
                    <Button
                      size={isMobile ? "sm" : "default"}
                      onClick={handleComplete}
                      className="gap-1.5 flex-1 sm:flex-none bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
                      data-testid="button-tour-complete"
                    >
                      <Rocket className="h-4 w-4" />
                      Let's Go!
                    </Button>
                  ) : step.id === 'upgrade' ? (
                    <Button
                      size={isMobile ? "sm" : "default"}
                      onClick={handleNext}
                      className="gap-1.5 flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                      data-testid="button-tour-next"
                    >
                      Continue
                      <ChevronRight className="h-4 w-4" />
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
