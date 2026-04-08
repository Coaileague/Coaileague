/**
 * SplashScreen — the branded launch experience shown on first app boot.
 *
 * DESIGN RESTORED (2026-04-08):
 *   The splash is a BRANDED DARK NAVY LAUNCH EXPERIENCE. Intentionally
 *   dark. Intentionally not theme-aware. This is the Trinity AI Co-Pilot
 *   brand moment — the three-arrow Trinity mark, the CoAIleague wordmark,
 *   the status text, the progress bar. The layout and visual identity
 *   match the canonical April 6 reference screenshots.
 *
 *   A previous cleanup pass (commit 96f59d42) incorrectly treated the
 *   splash as general UI and replaced it with a theme-aware `bg-background`
 *   + <UniversalLogoSpinner> layout. That was wrong. The splash and
 *   loading screen are a standalone branded launch surface with their
 *   own intentional design — they were never meant to participate in
 *   the general-UI theme system. Restored.
 *
 * IMPLEMENTATION:
 *   The visual is provided by <LoadingScreen /> (which is a fully
 *   self-contained 441-line component with all SVG + keyframes inlined).
 *   SplashScreen wraps it in a framer-motion AnimatePresence + a
 *   minimum-display-time gate so the brand moment is always perceived
 *   as deliberate (3 seconds by default, never a flash).
 *
 *   Why reuse LoadingScreen instead of duplicating: the splash (first
 *   boot) and the loading screen (auth-resolving) should look identical.
 *   Duplicating 441 lines of SVG + keyframes would be a maintenance
 *   hazard. One visual, two lifecycles.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingScreen } from "@/components/LoadingScreen";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

// Default minimum display time = 3000 ms. Bumped from 800 → 1800 → 3000
// after user feedback that the splash flickered past too fast to register
// the brand. 3000 ms matches the HTML-loader floor in index.html so there
// is no perceptible jump between the pre-React HTML loader phase and the
// React-mounted SplashScreen phase.
export function SplashScreen({
  onComplete,
  minDisplayTime = 3000,
}: SplashScreenProps) {
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
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0"
          style={{ zIndex: "var(--z-splash)" }}
          data-testid="splash-screen"
        >
          <LoadingScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
