import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, ChevronRight, ChevronLeft, Sparkles, Lightbulb, Target, CheckCircle2 } from "lucide-react";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  icon?: React.ReactNode;
  action?: string;
}

interface FeatureTutorialOverlayProps {
  featureId: string;
  featureName: string;
  steps: TutorialStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function FeatureTutorialOverlay({
  featureId,
  featureName,
  steps,
  isOpen,
  onClose,
  onComplete
}: FeatureTutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const updatePosition = () => {
      if (isOpen && steps[currentStep]?.targetSelector) {
        const target = document.querySelector(steps[currentStep].targetSelector!);
        if (target) {
          const rect = target.getBoundingClientRect();
          setHighlightPosition({
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          });
        }
      } else {
        setHighlightPosition(null);
      }
    };
    
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [currentStep, isOpen, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(`tutorial_${featureId}_completed`, 'true');
    onComplete?.();
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem(`tutorial_${featureId}_skipped`, 'true');
    onClose();
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[9999]" data-testid={`tutorial-overlay-${featureId}`}>
      {/* Dark overlay with cutout */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Highlight area */}
      {highlightPosition && (
        <div
          className="absolute border-2 border-primary rounded-lg animate-pulse-glow"
          style={{
            top: highlightPosition.top,
            left: highlightPosition.left,
            width: highlightPosition.width,
            height: highlightPosition.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6), 0 0 20px rgba(168, 85, 247, 0.5)',
          }}
        />
      )}
      
      {/* Tutorial Card */}
      <div className={`absolute ${highlightPosition ? 'bottom-8 left-1/2 -translate-x-1/2' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}`}>
        <Card className="w-[400px] max-w-[90vw] p-6 animate-success-pop bg-card/95 backdrop-blur-md border-primary/20">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary animate-sparkles-combined" />
              </div>
              <div>
                <Badge variant="secondary" className="mb-1">
                  New Feature
                </Badge>
                <h3 className="font-semibold text-lg">{featureName}</h3>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSkip} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Step Content */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              {step.icon || <Lightbulb className="h-4 w-4 text-amber-500" />}
              <h4 className="font-medium">{step.title}</h4>
            </div>
            <p className="text-sm text-muted-foreground">{step.description}</p>
            {step.action && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium">{step.action}</span>
              </div>
            )}
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-2 mb-4">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentStep + 1} of {steps.length}
            </span>
            <Button onClick={handleNext} className="gap-1">
              {isLastStep ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Complete
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function useTutorial(featureId: string) {
  const [isOpen, setIsOpen] = useState(false);
  
  const hasCompletedTutorial = () => {
    return localStorage.getItem(`tutorial_${featureId}_completed`) === 'true';
  };
  
  const hasSkippedTutorial = () => {
    return localStorage.getItem(`tutorial_${featureId}_skipped`) === 'true';
  };
  
  const shouldShowTutorial = () => {
    return !hasCompletedTutorial() && !hasSkippedTutorial();
  };
  
  const showTutorial = () => setIsOpen(true);
  const hideTutorial = () => setIsOpen(false);
  const resetTutorial = () => {
    localStorage.removeItem(`tutorial_${featureId}_completed`);
    localStorage.removeItem(`tutorial_${featureId}_skipped`);
  };
  
  return {
    isOpen,
    showTutorial,
    hideTutorial,
    resetTutorial,
    shouldShowTutorial,
    hasCompletedTutorial,
  };
}
