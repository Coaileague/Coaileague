import { useState, useEffect } from 'react';

/**
 * Returns true until maxMs has elapsed, then false.
 * Prevents skeleton screens from showing forever when a query hangs.
 * Use: const timedOut = useLoadingTimeout(4000);
 * Then: if (isLoading && !timedOut) return <Skeleton />;
 */
export function useLoadingTimeout(maxMs = 4000): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), maxMs);
    return () => clearTimeout(timer);
  }, [maxMs]);
  return timedOut;
}
