import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from "react";
import { ProgressScenario } from "@/components/progress-loading-overlay";
import { useOverlayController } from "./overlay-controller";

export type TransitionStatus = "loading" | "success" | "error" | "info";

interface TransitionOptions {
  status?: TransitionStatus;
  message?: string;
  submessage?: string;
  duration?: number;
  onComplete?: () => void;
  scenario?: ProgressScenario;
}

interface TransitionContextType {
  showTransition: (options?: TransitionOptions) => void;
  hideTransition: () => void;
  updateTransition: (options: TransitionOptions) => void;
}

const TransitionContext = createContext<TransitionContextType | undefined>(undefined);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const overlayController = useOverlayController();
  const [options, setOptions] = useState<TransitionOptions>({
    status: "loading",
    message: "Loading...",
  });
  const activeOverlayIdRef = useRef<string | null>(null);
  const isBootCompleteRef = useRef(false);

  // Boot detection - suppress transitions during initial load
  useEffect(() => {
    const htmlLoader = document.getElementById('initial-loader');
    if (!htmlLoader) {
      isBootCompleteRef.current = true;
      return;
    }

    const checkBootComplete = () => {
      const loader = document.getElementById('initial-loader');
      if (!loader) {
        isBootCompleteRef.current = true;
        console.log('[TransitionContext] Boot complete - transitions enabled');
      } else {
        setTimeout(checkBootComplete, 50);
      }
    };
    
    checkBootComplete();
  }, []);

  const showTransition = useCallback((opts?: TransitionOptions) => {
    // SUPPRESS during initial boot - let HTML loader handle it
    if (!isBootCompleteRef.current) {
      console.log('[TransitionContext] Suppressed during boot - using HTML loader');
      return;
    }

    const newOptions = {
      status: "loading" as const,
      message: "Loading...",
      ...opts
    };
    setOptions(newOptions);

    // Show overlay via shared controller with high priority
    const id = overlayController.showOverlay({
      status: newOptions.status || "loading",
      scenario: newOptions.scenario,
      title: newOptions.message,
      duration: newOptions.duration,
      priority: "high", // Transitions are high priority
      onComplete: newOptions.onComplete
    });
    
    activeOverlayIdRef.current = id;
  }, [overlayController]);

  const hideTransition = useCallback(() => {
    if (activeOverlayIdRef.current) {
      overlayController.hideOverlay(activeOverlayIdRef.current);
      activeOverlayIdRef.current = null;
    }
  }, [overlayController]);

  const updateTransition = useCallback((opts: TransitionOptions) => {
    setOptions(prev => ({ ...prev, ...opts }));
    
    if (activeOverlayIdRef.current) {
      overlayController.updateOverlay(activeOverlayIdRef.current, {
        status: opts.status || "loading",
        scenario: opts.scenario,
        title: opts.message,
        duration: opts.duration,
        onComplete: opts.onComplete
      });
    }
  }, [overlayController]);

  // OverlayController owns all dismissal logic via duration/onComplete
  // TransitionContext no longer uses setTimeout to avoid racing with controller

  return (
    <TransitionContext.Provider value={{ showTransition, hideTransition, updateTransition }}>
      {children}
    </TransitionContext.Provider>
  );
}

export function useTransition() {
  const context = useContext(TransitionContext);
  if (!context) {
    throw new Error("useTransition must be used within TransitionProvider");
  }
  return context;
}
