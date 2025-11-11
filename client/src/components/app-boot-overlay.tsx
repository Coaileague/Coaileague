import { useEffect, useState, useRef } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useTransition } from "@/contexts/transition-context";
import { useAuth } from "@/hooks/useAuth";

/**
 * AppBootOverlay
 * 
 * Orchestrates the ProgressLoadingOverlay during app initial bootstrap.
 * Shows loading overlay on mount and hides it once:
 * - Auth is resolved (success or failure)
 * - Initial critical queries have completed
 * - Or a timeout is reached (fallback)
 * 
 * This keeps loading UX in the transition subsystem without coupling to routing.
 */
export function AppBootOverlay() {
  const { showTransition, hideTransition } = useTransition();
  const { isLoading: authLoading } = useAuth();
  const isFetching = useIsFetching();
  const [isBootComplete, setIsBootComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    // On mount, immediately show loading overlay
    showTransition({
      status: "loading",
      message: "Authenticating",
    });

    // Set a fallback timeout (5 seconds) to ensure overlay doesn't hang
    timeoutRef.current = setTimeout(() => {
      console.log("[AppBootOverlay] Timeout reached - hiding overlay");
      setIsBootComplete(true);
    }, 5000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [showTransition]);

  useEffect(() => {
    // Once auth is resolved AND no critical queries are pending, mark boot complete
    if (!authLoading && isFetching === 0 && !isBootComplete) {
      console.log("[AppBootOverlay] Boot complete - hiding overlay");
      setIsBootComplete(true);
    }
  }, [authLoading, isFetching, isBootComplete]);

  useEffect(() => {
    // When boot is complete, hide the overlay
    if (isBootComplete) {
      // Small delay to let the final state settle
      const timer = setTimeout(() => {
        hideTransition();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [isBootComplete, hideTransition]);

  // This component doesn't render anything - it's just an orchestrator
  return null;
}
