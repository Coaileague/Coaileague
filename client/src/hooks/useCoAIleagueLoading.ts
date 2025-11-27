/**
 * useCoAIleagueLoading - Hook for managing CoAIleague loading states
 * 
 * Provides a simple interface for showing/hiding the universal CoAIleague loader
 * Usage:
 *   const { showLoading, hideLoading, updateMessage } = useCoAIleagueLoading();
 *   showLoading('workspace');
 *   await doSomething();
 *   hideLoading();
 */

import { useState, useCallback } from "react";
import type { LoadingScenario } from "@/components/coaileague-loader";

export function useCoAIleagueLoading() {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [submessage, setSubmessage] = useState<string | undefined>();
  const [scenario, setScenario] = useState<LoadingScenario>("general");
  const [progress, setProgress] = useState<number | undefined>();

  const showLoading = useCallback((
    loaderScenario: LoadingScenario = "general",
    customMessage?: string,
    customSubmessage?: string
  ) => {
    setScenario(loaderScenario);
    setMessage(customMessage);
    setSubmessage(customSubmessage);
    setProgress(undefined);
    setIsVisible(true);
  }, []);

  const hideLoading = useCallback(() => {
    setIsVisible(false);
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
