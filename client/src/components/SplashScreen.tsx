import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UniversalLogoSpinner } from "@/components/ui/universal-logo-spinner";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

// Default minimum display time bumped from 800ms → 1800ms → 3000ms after
// repeated user feedback that the splash flickered past too fast to register
// the brand. 3000ms matches the HTML-loader floor in index.html so there is
// no perceptible jump between the two phases. The minimum exists so the
// splash is always perceived as deliberate, never a flash.
//
// Task 2A (2026-04-08): the splash now uses the theme-aware `bg-background`
// token (white in light mode, dark navy in dark mode) instead of the
// hardcoded navy `.overlay-blocking` class. Text colors use `text-foreground`
// and `text-muted-foreground` so they stay readable in both modes.
//
// Task 2B/C: the bulky `.css-spinner` has been replaced with the new
// <UniversalLogoSpinner size="xl" /> — one living animation source across
// the entire app.
export function SplashScreen({ onComplete, minDisplayTime = 3000 }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (hasCompletedRef.current) return;

    const exitTimer = setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        setIsVisible(false);
        onCompleteRef.current();
      }
    }, minDisplayTime);

    return () => clearTimeout(exitTimer);
  }, [minDisplayTime]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background text-foreground pointer-events-none"
          style={{ zIndex: "var(--z-splash)" }}
          data-testid="splash-screen"
        >
          <div className="flex flex-col items-center gap-8 pointer-events-auto">
            <UniversalLogoSpinner size="xl" />

            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {PLATFORM_NAME}
              </h2>
              <p className="text-sm text-muted-foreground">
                AI-Powered Workforce Intelligence
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">
                Initializing Trinity AI
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
