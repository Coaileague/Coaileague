import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTransition } from "@/contexts/transition-context";

export function useRouteTransition() {
  const [location] = useLocation();
  const { showTransition, hideTransition } = useTransition();

  useEffect(() => {
    // Show brief transition on route change
    showTransition({
      status: "loading",
      message: "Loading page...",
      duration: 400,
      onComplete: hideTransition
    });
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
