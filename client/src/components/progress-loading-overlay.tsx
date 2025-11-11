import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ProgressLoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  status?: "loading" | "success" | "error" | "info";
}

const AUTH_MESSAGES = [
  "Connecting to AutoForce™...",
  "Establishing secure connection...",
  "Logging you in...",
  "Verifying credentials...",
  "Checking authentication status...",
  "Validating session token...",
  "Credentials accepted ✓",
  "Loading your workspace...",
  "Syncing account data...",
  "Preparing dashboard...",
  "Finalizing login...",
  "Almost there...",
];

const TECH_MESSAGES = [
  "Initializing workspace...",
  "Loading modules...",
  "Connecting to database...",
  "Authenticating session...",
  "Syncing data...",
  "Preparing dashboard...",
  "Optimizing performance...",
  "Loading components...",
  "Establishing secure connection...",
  "Verifying credentials...",
  "Configuring environment...",
  "Building interface...",
];

export function ProgressLoadingOverlay({ 
  isVisible, 
  title = "Loading",
  status = "loading"
}: ProgressLoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [showError, setShowError] = useState(false);
  const [errorMessage] = useState("Authentication failed. Invalid credentials.");

  // Determine which message set to use
  const isAuthFlow = title.toLowerCase().includes("authenticat") || title.toLowerCase().includes("login");
  const messages = isAuthFlow ? AUTH_MESSAGES : TECH_MESSAGES;

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

    // Set start time RIGHT NOW, when the interval actually begins
    const startTime = Date.now();

    // Simulate realistic loading progress based on elapsed time - STARTS AT 0%
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Progress curve: fast start, slow end (asymptotic to 100)
      let targetProgress = 0;
      if (elapsed < 500) {
        targetProgress = (elapsed / 500) * 30; // 0-30% in first 500ms
      } else if (elapsed < 1500) {
        targetProgress = 30 + ((elapsed - 500) / 1000) * 40; // 30-70% in next 1000ms
      } else if (elapsed < 3000) {
        targetProgress = 70 + ((elapsed - 1500) / 1500) * 20; // 70-90% in next 1500ms
      } else {
        targetProgress = 90 + ((elapsed - 3000) / 2000) * 8; // 90-98% asymptotically
      }

      setProgress(Math.min(98, targetProgress));
    }, 50);

    // Rotate messages every 700ms (slightly faster for more dynamic feel)
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 700);

    return () => {
      clearInterval(interval);
      clearInterval(messageInterval);
    };
  }, [isVisible, status, messages.length]);

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
              <p className="text-sm text-muted-foreground">
                {title}
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
              <div className="h-2 sm:h-3 bg-muted rounded-full overflow-hidden border border-border">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]"
                  style={{ width: `${progress}%` }}
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
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round(progress)}%
                </span>
                <span className="text-xs text-muted-foreground">
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
                  className="text-sm sm:text-base text-primary font-semibold"
                >
                  ✓ {isAuthFlow ? "Login Successful!" : "Complete!"}
                </motion.p>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm sm:text-base text-primary font-medium text-center"
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
