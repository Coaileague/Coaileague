/**
 * useMinimumLoadingTime - Ensures loading states display for at least a minimum duration
 * Kept short to avoid blocking the user from seeing the app.
 */

import { useState, useEffect, useRef } from 'react';

const DEFAULT_MIN_DURATION = 300;

export function useMinimumLoadingTime(
  isActuallyLoading: boolean,
  minDurationMs: number = DEFAULT_MIN_DURATION
): boolean {
  const [showLoading, setShowLoading] = useState(isActuallyLoading);
  const loadingStartTime = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActuallyLoading) {
      loadingStartTime.current = Date.now();
      setShowLoading(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (loadingStartTime.current !== null) {
      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = minDurationMs - elapsed;

      if (remaining > 0) {
        timeoutRef.current = setTimeout(() => {
          setShowLoading(false);
          loadingStartTime.current = null;
        }, remaining);
      } else {
        setShowLoading(false);
        loadingStartTime.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActuallyLoading, minDurationMs]);

  return showLoading;
}

/**
 * Loading duration tiers — kept short so the app feels snappy
 */
export const LOADING_DURATIONS = {
  quick: 0,        // Inline actions, no delay needed
  standard: 300,   // Default — just enough to avoid flicker
  extended: 500,   // Major page loads
  initial: 600,    // First app load
  showcase: 800,   // Marketing/demo screens
} as const;

/**
 * Progressive loading messages
 */
export const LOADING_MESSAGES = {
  default: [
    "Loading your workspace...",
    "Almost ready...",
  ],
  dashboard: [
    "Gathering your insights...",
    "Preparing your dashboard...",
  ],
  schedule: [
    "Optimizing your schedule...",
    "Finding the best shifts...",
  ],
  auth: [
    "Securing your session...",
    "Welcome back...",
  ],
} as const;
