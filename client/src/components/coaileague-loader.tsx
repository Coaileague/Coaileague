/**
 * CoAIleague Universal Loader Component
 * 
 * Professional, consistent loading experience across all CoAIleague platforms
 * Replaces scattered loading states with unified branding and animations
 * Supports multiple scenarios: workspace, schedule, payroll, invoice, email, analytics
 */

import { motion, AnimatePresence } from "framer-motion";
import { Suspense, lazy, useState, useEffect } from "react";
import { useUniversalLoadingGate } from "@/contexts/universal-loading-gate";
import { useMinimumLoadingTime, LOADING_DURATIONS } from "@/hooks/useMinimumLoadingTime";
const TrinityRedesign = lazy(() => import("@/components/trinity-redesign"));

export type LoadingScenario = 
  | "workspace" 
  | "onboarding" 
  | "schedule" 
  | "invoice" 
  | "payroll" 
  | "email" 
  | "analytics" 
  | "general";

const PROGRESSIVE_MESSAGES: Record<LoadingScenario, string[]> = {
  workspace: [
    "Loading your workspace...",
    "Gathering your data...",
    "Setting up your environment...",
    "Almost ready...",
  ],
  onboarding: [
    "Setting up your workspace...",
    "Configuring your organization...",
    "Preparing your dashboard...",
    "Almost there...",
  ],
  schedule: [
    "Optimizing schedule...",
    "Analyzing availability...",
    "Finding best shifts...",
    "Finalizing schedule...",
  ],
  invoice: [
    "Generating invoices...",
    "Calculating hours...",
    "Preparing documents...",
    "Almost done...",
  ],
  payroll: [
    "Processing payroll...",
    "Computing wages...",
    "Calculating deductions...",
    "Finalizing...",
  ],
  email: [
    "Sending notifications...",
    "Preparing messages...",
    "Delivering...",
    "Almost done...",
  ],
  analytics: [
    "Generating analytics...",
    "Analyzing trends...",
    "Computing insights...",
    "Preparing report...",
  ],
  general: [
    "Loading...",
    "Processing...",
    "Preparing...",
    "Almost ready...",
  ]
};

interface CoAIleagueLoaderProps {
  isVisible: boolean;
  message?: string;
  submessage?: string;
  scenario?: LoadingScenario;
  progress?: number; // 0-100 for progress bar
  variant?: "minimal" | "full"; // minimal = logo + message, full = with progress
}

const scenarioMessages: Record<LoadingScenario, { title: string; description: string }> = {
  workspace: {
    title: "Loading your workspace...",
    description: "Powered by Trinity™"
  },
  onboarding: {
    title: "Setting up your workspace...",
    description: "Powered by Trinity™ for your organization"
  },
  schedule: {
    title: "Optimizing schedule...",
    description: "Trinity™ analyzing availability and workload distribution"
  },
  invoice: {
    title: "Generating invoices...",
    description: "CoAIleague calculating billable hours and costs"
  },
  payroll: {
    title: "Processing payroll...",
    description: "Computing wages, taxes, and deductions"
  },
  email: {
    title: "Sending notifications...",
    description: "Preparing and delivering messages"
  },
  analytics: {
    title: "Generating analytics...",
    description: "Trinity™ analyzing trends and insights"
  },
  general: {
    title: "Loading...",
    description: "CoAIleague preparing your request"
  }
};

export function CoAIleagueLoader({
  isVisible,
  message,
  submessage,
  scenario = "general",
  progress,
  variant = "full"
}: CoAIleagueLoaderProps) {
  // CRITICAL: Respect universal loading gate - NEVER show on public routes
  const { isLoadingBlocked } = useUniversalLoadingGate();
  
  // Ensure minimum display time so users can enjoy Trinity animation
  const shouldShow = useMinimumLoadingTime(isVisible, LOADING_DURATIONS.standard);
  
  // Progressive message cycling for premium loading experience
  const [messageIndex, setMessageIndex] = useState(0);
  const progressiveMessages = PROGRESSIVE_MESSAGES[scenario];
  
  useEffect(() => {
    if (!shouldShow) {
      setMessageIndex(0);
      return;
    }
    
    // Reset message index when scenario changes
    setMessageIndex(0);
    
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % progressiveMessages.length);
    }, 700);
    
    return () => clearInterval(interval);
  }, [shouldShow, scenario, progressiveMessages.length]);
  
  // If loading is blocked (public route), don't render anything
  if (isLoadingBlocked) {
    return null;
  }

  const scenarioDefaults = scenarioMessages[scenario];
  const displayMessage = message || progressiveMessages[messageIndex] || scenarioDefaults.title;
  const displaySubmessage = submessage || scenarioDefaults.description;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
          data-testid="coaileague-loader-overlay"
        >
          <div className="flex flex-col items-center gap-6 p-6 text-center">
            {/* Trinity Mascot - Real canvas mascot for loading */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Suspense fallback={<div className="w-24 h-24" />}>
                <TrinityRedesign 
                  size={96} 
                  mode={scenario === "workspace" || scenario === "onboarding" || scenario === "analytics" ? "THINKING" : "ANALYZING"} 
                />
              </Suspense>
            </motion.div>

            {/* Messages */}
            <div className="space-y-2 max-w-sm">
              <h3 className="font-semibold text-lg text-foreground">
                {displayMessage}
              </h3>
              <p className="text-sm text-muted-foreground">
                {displaySubmessage}
              </p>
            </div>

            {/* Progress Bar (optional) */}
            {variant === "full" && progress !== undefined && (
              <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}

            {/* CoAIleague branding */}
            <p className="text-xs text-muted-foreground mt-2">
              Powered by Trinity™
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
