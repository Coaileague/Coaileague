/**
 * Centralized Loading State Hook
 * Handles progress simulation, message rotation, and completion detection
 * All variants consume this hook to ensure consistent timing behavior
 */

import { useState, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";

// Professional loading messages pool
const PROFESSIONAL_MESSAGES = [
  "Initializing AutoForce™...",
  "Loading workspace modules...",
  "Preparing your dashboard...",
  "Securing your connection...",
  "Synchronizing data...",
  "Finalizing setup...",
  "Optimizing performance...",
  "Loading resources...",
  "Establishing secure session...",
  "Almost ready...",
];

const COMPLETION_MESSAGES = [
  "Complete!",
  "Ready!",
  "Success!",
  "All set!",
  "Done!",
];

interface UseLoadingStateOptions {
  externalProgress?: number;
  customMessage?: string;
  onProgressComplete?: () => void;
}

export function useLoadingState({ 
  externalProgress, 
  customMessage,
  onProgressComplete 
}: UseLoadingStateOptions = {}) {
  const [progress, setProgress] = useState(0);
  const [displayMessage, setDisplayMessage] = useState(getRandomMessage(0));
  const { user } = useAuth();
  const completedRef = useRef(false);
  const progressRef = useRef(0); // Track latest progress without triggering re-renders

  // Simulate progress if not externally controlled
  useEffect(() => {
    if (externalProgress !== undefined) {
      setProgress(externalProgress);
      progressRef.current = externalProgress; // Keep ref in sync
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          progressRef.current = 100; // Keep ref in sync
          return 100;
        }
        // Fast progression 0-90%, slow 90-100%
        const next = prev >= 90 
          ? prev + Math.random() * 0.8 
          : prev + Math.random() * 4;
        const newProgress = Math.min(next, 100);
        progressRef.current = newProgress; // Keep ref in sync
        return newProgress;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [externalProgress]);

  // Rotate messages every 2 seconds using ref to access latest progress
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setDisplayMessage(getRandomMessage(progressRef.current)); // Use ref for latest progress
    }, 2000);
    return () => clearInterval(messageInterval);
  }, []); // Empty deps - interval runs continuously without resetting

  // Notify when progress completes (but don't auto-dismiss - that's overlay controller's job)
  useEffect(() => {
    if (progress >= 100 && !completedRef.current && onProgressComplete) {
      completedRef.current = true;
      onProgressComplete();
    }
  }, [progress, onProgressComplete]);

  const userName = user?.firstName || user?.email?.split('@')[0] || 'there';
  const finalMessage = customMessage || displayMessage;

  return {
    progress: Math.round(progress),
    message: finalMessage,
    userName,
  };
}

/**
 * Get random message based on progress
 */
function getRandomMessage(progress: number): string {
  if (progress >= 100) {
    return COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)];
  }
  return PROFESSIONAL_MESSAGES[Math.floor(Math.random() * PROFESSIONAL_MESSAGES.length)];
}
