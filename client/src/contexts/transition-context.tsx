import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { UniversalTransitionOverlay, TransitionStatus } from "@/components/universal-transition-overlay";

interface TransitionOptions {
  status?: TransitionStatus;
  message?: string;
  submessage?: string;
  duration?: number;
  onComplete?: () => void;
}

interface TransitionContextType {
  showTransition: (options?: TransitionOptions) => void;
  hideTransition: () => void;
  updateTransition: (options: TransitionOptions) => void;
}

const TransitionContext = createContext<TransitionContextType | undefined>(undefined);

export function TransitionProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [options, setOptions] = useState<TransitionOptions>({
    status: "loading",
    message: "Loading...",
  });

  const showTransition = useCallback((opts?: TransitionOptions) => {
    setOptions({
      status: "loading",
      message: "Loading...",
      ...opts
    });
    setIsVisible(true);
  }, []);

  const hideTransition = useCallback(() => {
    setIsVisible(false);
  }, []);

  const updateTransition = useCallback((opts: TransitionOptions) => {
    setOptions(prev => ({ ...prev, ...opts }));
  }, []);

  const handleComplete = useCallback(() => {
    if (options.onComplete) {
      options.onComplete();
    }
    hideTransition();
  }, [options, hideTransition]);

  return (
    <TransitionContext.Provider value={{ showTransition, hideTransition, updateTransition }}>
      {children}
      <UniversalTransitionOverlay
        isVisible={isVisible}
        status={options.status}
        message={options.message}
        submessage={options.submessage}
        duration={options.duration}
        onComplete={handleComplete}
      />
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
