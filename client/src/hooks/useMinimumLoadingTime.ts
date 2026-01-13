/**
 * useMinimumLoadingTime - Ensures loading states display for at least a minimum duration
 * This allows users to appreciate the Trinity mascot animation before content appears
 */

import { useState, useEffect, useRef } from 'react';

const DEFAULT_MIN_DURATION = 1800; // 1.8 seconds to enjoy the animation

export function useMinimumLoadingTime(
  isActuallyLoading: boolean,
  minDurationMs: number = DEFAULT_MIN_DURATION
): boolean {
  const [showLoading, setShowLoading] = useState(isActuallyLoading);
  const loadingStartTime = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActuallyLoading) {
      // Loading started - record start time
      loadingStartTime.current = Date.now();
      setShowLoading(true);
      
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (loadingStartTime.current !== null) {
      // Loading finished - check if minimum time has passed
      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = minDurationMs - elapsed;

      if (remaining > 0) {
        // Need to wait longer
        timeoutRef.current = setTimeout(() => {
          setShowLoading(false);
          loadingStartTime.current = null;
        }, remaining);
      } else {
        // Minimum time already passed
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

export const LOADING_DURATIONS = {
  quick: 1200,      // Brief transitions
  standard: 1800,   // Default - enough to appreciate animation
  extended: 2500,   // For major page loads
  initial: 3000,    // First app load - full experience
} as const;
