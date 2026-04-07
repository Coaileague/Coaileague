import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface SplashScreenProps {
  onComplete: () => void;
  minDisplayTime?: number;
}

export function SplashScreen({ onComplete, minDisplayTime = 800 }: SplashScreenProps) {
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
          className="overlay-blocking"
          style={{ zIndex: 'var(--z-splash)' }}
          data-testid="splash-screen"
        >
          <div className="flex flex-col items-center gap-8">
            <div className="css-spinner" style={{ width: 56, height: 56, borderWidth: 5 }} />

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
              <span className="text-xs text-muted-foreground">Initializing Trinity AI</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
