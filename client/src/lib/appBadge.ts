/**
 * App Badge API utilities
 * Wraps the navigator.setAppBadge / navigator.clearAppBadge APIs
 * for showing notification counts on the app icon (PWA / installed apps).
 */

export function setAppBadge(count: number): void {
  try {
    if ("setAppBadge" in navigator) {
      (navigator as any).setAppBadge(count).catch(() => {});
    }
  } catch {
    // Badge API not supported or permission denied — silently ignore
  }
}

export function clearAppBadge(): void {
  try {
    if ("clearAppBadge" in navigator) {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  } catch {
    // Badge API not supported — silently ignore
  }
}

/**
 * Clears the app badge when the window regains focus.
 * Returns a cleanup function to remove the event listener.
 */
export function setupBadgeClearOnFocus(): () => void {
  const handler = () => clearAppBadge();
  window.addEventListener("focus", handler);
  return () => window.removeEventListener("focus", handler);
}
