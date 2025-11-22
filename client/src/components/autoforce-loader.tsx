/**
 * AutoForce™ Universal Loader Component
 * 
 * Professional, consistent loading experience across all AutoForce™ platforms
 * Replaces scattered loading states with unified branding and animations
 * Supports multiple scenarios: workspace, schedule, payroll, invoice, email, analytics
 */

import { motion, AnimatePresence } from "framer-motion";
import { AutoForceAFLogo } from "./autoforce-af-logo";
import { Loader2 } from "lucide-react";

export type LoadingScenario = 
  | "workspace" 
  | "onboarding" 
  | "schedule" 
  | "invoice" 
  | "payroll" 
  | "email" 
  | "analytics" 
  | "general";

interface AutoForceLoaderProps {
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
    description: "Initializing AutoForce™ AI Brain"
  },
  onboarding: {
    title: "Setting up your workspace...",
    description: "Configuring AutoForce™ AI Brain for your organization"
  },
  schedule: {
    title: "Optimizing schedule...",
    description: "AI Brain analyzing availability and workload distribution"
  },
  invoice: {
    title: "Generating invoices...",
    description: "AutoForce™ calculating billable hours and costs"
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
    description: "AI Brain analyzing trends and insights"
  },
  general: {
    title: "Loading...",
    description: "AutoForce™ preparing your request"
  }
};

export function AutoForceLoader({
  isVisible,
  message,
  submessage,
  scenario = "general",
  progress,
  variant = "full"
}: AutoForceLoaderProps) {
  const scenarioDefaults = scenarioMessages[scenario];
  const displayMessage = message || scenarioDefaults.title;
  const displaySubmessage = submessage || scenarioDefaults.description;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
          data-testid="autoforce-loader-overlay"
        >
          <div className="flex flex-col items-center gap-6 p-6 text-center">
            {/* AutoForce™ Logo */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-16 h-16">
                <AutoForceAFLogo />
              </div>
            </motion.div>

            {/* Spinner Animation */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-12 h-12 text-blue-500" strokeWidth={1.5} />
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

            {/* AutoForce™ branding */}
            <p className="text-xs text-muted-foreground mt-2">
              Powered by AutoForce™ AI Brain
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
