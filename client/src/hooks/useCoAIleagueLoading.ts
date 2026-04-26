/**
 * useCoAIleagueLoading - Hook for managing CoAIleague loading states
 * 
 * Provides a simple interface for showing/hiding the universal CoAIleague loader
 * with a minimum display duration to ensure loaders are visible to users.
 * 
 * Usage:
 *   const { showLoading, hideLoading, updateMessage } = useCoAIleagueLoading();
 *   showLoading('workspace');
 *   await doSomething();
 *   hideLoading(); // Will wait for minimum display time if needed
 */

import { useState, useCallback, useRef } from "react";
import type { LoadingScenario } from "@/components/coaileague-loader";

// Minimum time the loader must be visible (300ms) - prevents flash of loading state
const MIN_DISPLAY_DURATION_MS = 300;

export function useCoAIleagueLoading() {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [submessage, setSubmessage] = useState<string | undefined>();
  const [scenario, setScenario] = useState<LoadingScenario>("general");
  const [progress, setProgress] = useState<number | undefined>();
  
  // Track when loading started to enforce minimum display time
  const showTimeRef = useRef<number>(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLoading = useCallback((
    loaderScenario: LoadingScenario = "general",
    customMessage?: string,
    customSubmessage?: string
  ) => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    setScenario(loaderScenario);
    setMessage(customMessage);
    setSubmessage(customSubmessage);
    setProgress(undefined);
    setIsVisible(true);
    showTimeRef.current = Date.now();
  }, []);

  const hideLoading = useCallback(() => {
    const elapsed = Date.now() - showTimeRef.current;
    const remaining = MIN_DISPLAY_DURATION_MS - elapsed;
    
    if (remaining > 0) {
      // Wait for minimum display time to elapse
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        hideTimeoutRef.current = null;
      }, remaining);
    } else {
      // Already past minimum time, hide immediately
      setIsVisible(false);
    }
  }, []);

  const updateMessage = useCallback((msg: string, submsg?: string) => {
    setMessage(msg);
    if (submsg) setSubmessage(submsg);
  }, []);

  const updateProgress = useCallback((value: number) => {
    setProgress(Math.min(value, 100));
  }, []);

  return {
    isVisible,
    message,
    submessage,
    scenario,
    progress,
    showLoading,
    hideLoading,
    updateMessage,
    updateProgress
  };
}
