import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { CONTACTS, DOMAINS } from "@shared/platformConfig";
import { motion } from 'framer-motion';
import { Mail, Zap, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIdentity } from '@/hooks/useIdentity';
import { Button } from '@/components/ui/button';

interface Step {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    id: 1,
    title: 'Meet Your Workspace Email',
    description:
      'This is where Trinity works. All your team communication, scheduling, and coordination happens here. Trinity monitors it 24/7.',
    icon: <Mail className="w-16 h-16 text-blue-500" />,
  },
  {
    id: 2,
    title: 'What Trinity Does With Email',
    description:
      'Trinity monitors your inbox, extracts key information, identifies patterns, routes messages to the right people, and provides intelligent suggestions. All automated.',
    icon: <Zap className="w-16 h-16 text-yellow-500" />,
  },
  {
    id: 3,
    title: 'Your First Email',
    description:
      "This is Trinity welcoming you. She'll send regular updates about your workspace, opportunities, and important reminders.",
    icon: <CheckCircle className="w-16 h-16 text-green-500" />,
  },
];

export default function OnboardingEmailIntro() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { dbWorkspaceId } = useIdentity();

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const firstName = user?.firstName || user?.email?.split('@')[0] || 'there';

  // Auto-advance after 90s per step
  useEffect(() => {
    if (isPaused || currentStep >= steps.length - 1) return;

    const timer = setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    }, 90_000);

    return () => clearTimeout(timer);
  }, [currentStep, isPaused]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_email_intro_skipped', 'true');
    setLocation('/dashboard');
  };

  const handleOpenInbox = () => {
    localStorage.setItem('onboarding_email_intro_completed', 'true');
    setLocation('/inbox');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Step {currentStep + 1} of {steps.length}
            </h2>
            <button
              onClick={handleSkip}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              Skip Tour
            </button>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <motion.div
              className="bg-blue-500 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Card */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-card dark:bg-slate-800 rounded-xl shadow-xl p-8 md:p-12"
        >
          {/* Icon */}
          <div className="flex justify-center mb-6">{currentStepData.icon}</div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-center mb-4 text-slate-900 dark:text-slate-100">
            {currentStepData.title}
          </h1>

          {/* Description */}
          <p className="text-lg text-center text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
            {currentStepData.description}
          </p>

          {/* Step 1: Show workspace email address */}
          {currentStep === 0 && dbWorkspaceId && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                Your Workspace Email:
              </p>
              <p className="text-lg font-mono font-semibold text-blue-600 dark:text-blue-400">
                operations@{dbWorkspaceId.toLowerCase().substring(0, 8)}-{DOMAINS.root}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                This is your shared inbox where Trinity works
              </p>
            </div>
          )}

          {/* Step 3: First email preview */}
          {currentStep === 2 && (
            <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4 mb-8">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-2 font-semibold">
                Trinity's Welcome:
              </div>
              <div className="bg-card dark:bg-slate-800 rounded p-3 border border-slate-200 dark:border-slate-600">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <strong>Subject:</strong> Welcome to your workspace! Meet Trinity.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Hi {firstName},
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  I'm Trinity, your dedicated AI assistant. I handle your scheduling, email,
                  payroll, and team coordination 24/7...
                </p>
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">
                This email is in your inbox &rarr;
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-4">
            {/* Pause/Resume (if not on last step) */}
            {currentStep < steps.length - 1 && (
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {isPaused ? 'Resume Auto-Play' : 'Pause Auto-Play'}
              </button>
            )}

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                onClick={handleBack}
                disabled={currentStep === 0}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>

              {currentStep === steps.length - 1 ? (
                <Button
                  onClick={handleOpenInbox}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Open Inbox <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Next
                </Button>
              )}
            </div>

            {/* Dot navigation */}
            <div className="flex justify-center gap-2 mt-6">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentStep(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === currentStep
                      ? 'bg-blue-500 w-6'
                      : 'bg-slate-300 dark:bg-slate-600 w-2 hover:bg-slate-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
          <p>
            Questions? Trinity is available 24/7.{' '}
            <a
              href={`mailto:${CONTACTS.support}`}
              className="text-blue-500 hover:underline"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
