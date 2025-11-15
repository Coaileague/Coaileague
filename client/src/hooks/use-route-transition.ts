import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useTransition } from "@/contexts/transition-context";

export function useRouteTransition() {
  const [location] = useLocation();
  const { showTransition, hideTransition } = useTransition();
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    // Skip showing transition on initial mount/first render
    // Only show transition for actual route changes
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    // Show brief transition on route change
    showTransition({
      status: "loading",
      message: "Loading page...",
      duration: 400,
      onComplete: hideTransition
    });
    // Note: showTransition and hideTransition are memoized with useCallback in TransitionProvider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
}

// Helper function for programmatic navigation with transition
export function useNavigateWithTransition() {
  const { showTransition } = useTransition();

  return (path: string, message?: string) => {
    showTransition({
      status: "loading",
      message: message || "Navigating...",
      duration: 300,
      onComplete: () => {
        window.location.href = path;
      }
    });
  };
}
