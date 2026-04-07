let wakeLockSentinel: WakeLockSentinel | null = null;
let refCount = 0;
let reacquireCleanup: (() => void) | null = null;

export function isWakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}

export async function requestWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported()) return false;
  refCount++;

  if (wakeLockSentinel) return true;

  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch {
    refCount = Math.max(0, refCount - 1);
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;

  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
    }
    wakeLockSentinel = null;
  }
}

export function setupWakeLockReacquire(): () => void {
  if (reacquireCleanup) return reacquireCleanup;

  const handler = async () => {
    if (document.visibilityState === 'visible' && refCount > 0 && !wakeLockSentinel) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      } catch {
      }
    }
  };
  document.addEventListener('visibilitychange', handler);
  reacquireCleanup = () => {
    document.removeEventListener('visibilitychange', handler);
    reacquireCleanup = null;
  };
  return reacquireCleanup;
}

export function isWakeLockActive(): boolean {
  return wakeLockSentinel !== null;
}
