import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Scenario-based configuration type
export type ProgressScenario = "login" | "logout" | "heavyOperation" | "aiProcessing" | "dataSync" | "dashboardLoading";

export interface ScenarioConfig {
  messages: string[];
  duration?: number;
  title: string;
}

// Scenario-based message catalogs with creative workflow messages
const SCENARIO_CONFIGS: Record<ProgressScenario, ScenarioConfig> = {
  login: {
    title: "Signing In",
    duration: 3500,
    messages: [
      "Connecting to AutoForce™ ⚡",
      "Establishing secure connection 🔒",
      "Verifying credentials 🔐",
      "Validating session token ✨",
      "Credentials accepted ✓",
      "Loading workspace preferences 📋",
      "Syncing user permissions 🎯",
      "Initializing dashboard modules 📊",
      "Configuring workspace settings ⚙️",
      "Loading recent activity 📈",
      "Preparing your workspace 🚀",
      "Verifying access controls 🛡️",
      "Calibrating neural pathways 🧠",
      "Quantum-entangling your session 🔬",
      "Compiling enterprise magic ✨",
      "Defragmenting productivity matrix 💫",
      "Aligning autonomous systems 🎰",
      "Finalizing authentication 🏁",
      "Almost there... hang tight! 🎉",
    ],
  },
  logout: {
    title: "Signing Out",
    duration: 3000,
    messages: [
      "Closing active sessions 🔌",
      "Clearing cached credentials 🧹",
      "Invalidating session tokens 🚫",
      "Saving workspace state 💾",
      "Cleaning up temporary data 🗑️",
      "Removing access tokens 🔓",
      "Signing you out securely 🛡️",
      "Terminating active connections 📡",
      "Saving final preferences 📝",
      "Clearing local cache 🧽",
      "Wiping fingerprints from the mainframe 🕵️",
      "De-ionizing quantum traces 🔬",
      "Powering down neural engines 🧠",
      "Goodbye! Come back soon 👋",
    ],
  },
  heavyOperation: {
    title: "Processing",
    duration: 4000,
    messages: [
      "Processing request 🔄",
      "Analyzing data patterns 🔍",
      "Optimizing database queries ⚡",
      "Synchronizing records 🔄",
      "Validating data integrity ✅",
      "Computing analytics 📊",
      "Generating insights 💡",
      "Applying business rules 📜",
      "Updating indexes 📚",
      "Crunching big numbers 🔢",
      "Consulting the oracle database 🔮",
      "Reticulating splines 📐",
      "Finalizing operations ⚙️",
      "Complete ✓",
    ],
  },
  aiProcessing: {
    title: "AI Automation",
    duration: 5000,
    messages: [
      "Initializing AI engine 🤖",
      "Loading neural network 🧠",
      "Analyzing patterns with ML 🔬",
      "Training models on dataset 📚",
      "Running predictive algorithms 🎯",
      "Optimizing parameters ⚙️",
      "Processing natural language 💬",
      "Computing recommendations 💡",
      "Generating AI predictions 🔮",
      "Validating AI results ✅",
      "Teaching robots to dream 🌙",
      "Feeding the neural hamsters 🐹",
      "Awakening the machine spirits 👻",
      "Consulting with Skynet (kidding!) 🤖",
      "Finalizing AI automation 🏁",
      "Complete ✓",
    ],
  },
  dataSync: {
    title: "Synchronizing",
    duration: 3500,
    messages: [
      "Connecting to data sources 📡",
      "Fetching latest updates 📥",
      "Synchronizing changes 🔄",
      "Validating data consistency ✅",
      "Resolving conflicts 🤝",
      "Updating local cache 💾",
      "Committing transactions 📝",
      "Verifying sync status 🔍",
      "Refreshing indexes 📚",
      "Harmonizing data dimensions 🌌",
      "Untangling data spaghetti 🍝",
      "Convincing databases to cooperate 🤝",
      "Sync complete ✓",
    ],
  },
  dashboardLoading: {
    title: "Loading Dashboard",
    duration: 3000,
    messages: [
      "Assembling dashboard widgets 📊",
      "Loading analytics modules 📈",
      "Fetching workspace metrics 🎯",
      "Initializing quick actions ⚡",
      "Compiling system statistics 💻",
      "Rendering performance charts 📉",
      "Calibrating metrics (the good kind) 🔧",
      "Waking up the analytics hamsters 🐹",
      "Polishing those beautiful graphs ✨",
      "Counting all the important numbers 🔢",
      "Organizing chaos into insights 🌪️",
      "Persuading data to look pretty 🎨",
      "Dashboard ready ✓",
    ],
  },
};

interface ProgressLoadingOverlayProps {
  isVisible: boolean;
  scenario?: ProgressScenario;
  title?: string;
  status?: "loading" | "success" | "error" | "info";
  duration?: number;
  messages?: string[];
}

export function ProgressLoadingOverlay({ 
  isVisible, 
  scenario = "login",
  title,
  status = "loading",
  duration,
  messages: customMessages,
}: ProgressLoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showError, setShowError] = useState(false);
  const [errorMessage] = useState("Operation failed. Please try again.");

  // Get scenario configuration
  const config = SCENARIO_CONFIGS[scenario];
  const effectiveTitle = title || config.title;
  const effectiveDuration = duration || config.duration || 3500;
  const messages = customMessages || config.messages;

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setMessageIndex(0);
      setShowError(false);
      return;
    }

    if (status !== "loading") {
      // Jump to 100% when complete
      setProgress(100);
      return;
    }

    // Reset progress and message immediately when visible
    setProgress(0);
    setMessageIndex(0);

    // Generate randomized progress steps with varied increments
    // Progress increment options: 0.5%, 5%, 10%, 15%
    const incrementOptions = [0.5, 5, 10, 15];
    const progressSteps: { progress: number; duration: number }[] = [];
    let currentProgress = 0;

    // Generate steps to reach ~95% with random increments
    while (currentProgress < 95) {
      // Weighted random selection (favor smaller increments early, larger later)
      const weights = currentProgress < 30 
        ? [3, 2, 1, 1]  // Early: favor 0.5% and 5%
        : currentProgress < 70
        ? [1, 2, 3, 2]  // Mid: favor 5% and 10%
        : [1, 1, 2, 3]; // Late: favor 10% and 15%
      
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      const random = Math.random() * totalWeight;
      let cumulative = 0;
      let selectedIncrement = incrementOptions[0];
      
      for (let i = 0; i < incrementOptions.length; i++) {
        cumulative += weights[i];
        if (random <= cumulative) {
          selectedIncrement = incrementOptions[i];
          break;
        }
      }

      currentProgress = Math.min(currentProgress + selectedIncrement, 95);
      
      // Random duration for this step (distribute total duration)
      const stepDuration = Math.floor((effectiveDuration / 15) + Math.random() * 300);
      
      progressSteps.push({ progress: Math.round(currentProgress * 10) / 10, duration: stepDuration });
    }

    // Final push to 100%
    progressSteps.push({ progress: 100, duration: 400 });

    let stepIndex = 0;
    let messageRotationIndex = 0;

    function runNextStep() {
      if (stepIndex >= progressSteps.length) return;

      const step = progressSteps[stepIndex];
      setProgress(step.progress);
      
      // Rotate through messages
      setMessageIndex(messageRotationIndex % messages.length);
      messageRotationIndex++;
      
      stepIndex++;
      if (stepIndex < progressSteps.length) {
        setTimeout(runNextStep, step.duration);
      }
    }

    // Start the progress animation
    const startTimeout = setTimeout(runNextStep, 100);

    return () => {
      clearTimeout(startTimeout);
    };
  }, [isVisible, status, messages, effectiveDuration]);

  // When loading completes, jump to 100%
  useEffect(() => {
    if (status === "success") {
      setProgress(100);
      setShowError(false);
    } else if (status === "error") {
      setProgress(100);
      setShowError(true);
    }
  }, [status]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm"
        >
          <div className="w-[90vw] max-w-md px-6">
            {/* Title */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center mb-8"
            >
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                AutoForce™
              </h2>
              <p className="text-sm" style={{ color: "#06b6d4" }}>
                {effectiveTitle}
              </p>
            </motion.div>

            {/* Progress Bar */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              {/* Progress background */}
              <div className="h-3 sm:h-4 rounded-full overflow-hidden border-2" style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)" }}>
                <motion.div
                  className="h-full bg-[length:200%_100%]"
                  style={{ 
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, #10b981, #06b6d4, #10b981)"
                  }}
                  animate={{
                    backgroundPosition: ["0% 0%", "100% 0%"],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </div>

              {/* Percentage */}
              <div className="flex justify-between items-center mt-2 px-1">
                <span className="text-xs font-mono" style={{ color: "#10b981" }}>
                  {Math.round(progress)}%
                </span>
                <span className="text-xs" style={{ color: "#06b6d4" }}>
                  {status === "success" ? "Complete" : status === "error" ? "Error" : "Loading"}
                </span>
              </div>
            </motion.div>

            {/* Dynamic Status Messages */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="h-12 flex items-center justify-center"
            >
              {showError ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center"
                >
                  <p className="text-sm sm:text-base text-red-400 font-semibold mb-1">
                    ✗ Credentials Denied
                  </p>
                  <p className="text-xs text-red-300/80">
                    {errorMessage}
                  </p>
                </motion.div>
              ) : status === "success" ? (
                <motion.p
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-sm sm:text-base font-semibold"
                  style={{ color: "#10b981" }}
                >
                  ✓ {scenario === "login" ? "Login Successful!" : scenario === "logout" ? "Logged Out!" : "Complete!"}
                </motion.p>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm sm:text-base font-medium text-center"
                    style={{ color: "#06b6d4" }}
                  >
                    {messages[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              )}
            </motion.div>

            {/* Decorative elements */}
            <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
              <motion.div
                className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/5 rounded-full blur-3xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1.5,
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for programmatically controlling the progress overlay
 * 
 * Usage:
 * ```tsx
 * const { show, hide, ProgressOverlay } = useProgressOverlay();
 * 
 * // Show loading overlay
 * show({ scenario: "login", duration: 3500 });
 * 
 * // Hide when done
 * hide();
 * 
 * // Render in component
 * return <ProgressOverlay />;
 * ```
 */
export function useProgressOverlay() {
  const [isVisible, setIsVisible] = useState(false);
  const [scenario, setScenario] = useState<ProgressScenario>("login");
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "success" | "error" | "info">("loading");

  const show = (config?: {
    scenario?: ProgressScenario;
    duration?: number;
  }) => {
    if (config?.scenario) setScenario(config.scenario);
    if (config?.duration) setDuration(config.duration);
    setStatus("loading");
    setIsVisible(true);
  };

  const hide = () => {
    setIsVisible(false);
    setTimeout(() => {
      setStatus("loading");
    }, 300);
  };

  const resolve = () => {
    setStatus("success");
    setTimeout(hide, 1000);
  };

  const reject = () => {
    setStatus("error");
    setTimeout(hide, 2000);
  };

  const ProgressOverlay = () => (
    <ProgressLoadingOverlay
      isVisible={isVisible}
      scenario={scenario}
      duration={duration}
      status={status}
    />
  );

  return {
    isVisible,
    scenario,
    duration,
    status,
    show,
    hide,
    resolve,
    reject,
    ProgressOverlay,
  };
}

/**
 * Wrapper for async operations with automatic loading overlay
 * 
 * Usage:
 * ```tsx
 * await withProgressOverlay(
 *   async () => {
 *     // Your async operation
 *     await someApiCall();
 *   },
 *   { scenario: "aiProcessing", minDuration: 1000 }
 * );
 * ```
 */
export async function withProgressOverlay<T>(
  asyncFn: () => Promise<T>,
  config?: {
    scenario?: ProgressScenario;
    minDuration?: number;
  }
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await asyncFn();
    
    // Ensure minimum duration for smooth UX
    const elapsed = Date.now() - startTime;
    const minDuration = config?.minDuration || 800;
    
    if (elapsed < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
    }
    
    return result;
  } catch (error) {
    // Still enforce minimum duration even on error
    const elapsed = Date.now() - startTime;
    const minDuration = config?.minDuration || 800;
    
    if (elapsed < minDuration) {
      await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
    }
    
    throw error;
  }
}
