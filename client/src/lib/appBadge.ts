let badgeCount = 0;

export function isAppBadgeSupported(): boolean {
  return 'setAppBadge' in navigator;
}

export async function setAppBadge(count: number): Promise<void> {
  badgeCount = count;
  if (!isAppBadgeSupported()) return;
  try {
    if (count > 0) {
      await (navigator as any).setAppBadge(count);
    } else {
      await (navigator as any).clearAppBadge();
    }
  } catch (e) {
  }
}

export async function clearAppBadge(): Promise<void> {
  badgeCount = 0;
  if (!isAppBadgeSupported()) return;
  try {
    await (navigator as any).clearAppBadge();
  } catch (e) {
  }
}

export function setupBadgeClearOnFocus(): () => void {
  const focusHandler = () => {
    clearAppBadge();
  };
  window.addEventListener('focus', focusHandler);

  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      clearAppBadge();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  const swMessageHandler = (event: MessageEvent) => {
    if (event.data?.type === 'BADGE_UPDATE') {
      if (event.data.action === 'increment') {
        badgeCount++;
        setAppBadge(badgeCount);
      } else if (event.data.action === 'clear') {
        clearAppBadge();
      }
    }
  };
  navigator.serviceWorker?.addEventListener('message', swMessageHandler);

  return () => {
    window.removeEventListener('focus', focusHandler);
    document.removeEventListener('visibilitychange', visibilityHandler);
    navigator.serviceWorker?.removeEventListener('message', swMessageHandler);
  };
}
