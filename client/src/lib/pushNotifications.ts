import { apiRequest, queryClient } from "@/lib/queryClient";

const CORE_ACTION_KEY = "coaileague-has-performed-core-action";

export function markCoreActionPerformed(): void {
  try {
    localStorage.setItem(CORE_ACTION_KEY, Date.now().toString());
  } catch {}
}

// Readiness Section 4 — day-one field-officer experience.
// When an officer performs a core action (clock-in, incident report), mark
// engagement AND silently attempt to subscribe to push so shift reminders,
// incident escalations, and duress responses reach them from the first
// shift — not after the 7-day engagement window.
//
// Silent: the browser still shows the native permission prompt the first
// time, but we do not show a second custom "enable notifications" card.
// Failures (unsupported, permission denied, already subscribed) are
// swallowed — this is a best-effort side-effect of a core action, not a
// gating step.
const AUTO_SUB_ATTEMPTED_KEY = 'coaileague-push-auto-sub-attempted';
export async function markCoreActionAndAutoSubscribe(): Promise<void> {
  markCoreActionPerformed();
  try {
    if (localStorage.getItem(AUTO_SUB_ATTEMPTED_KEY)) return;
    localStorage.setItem(AUTO_SUB_ATTEMPTED_KEY, Date.now().toString());
  } catch { /* storage unavailable — try anyway */ }
  try {
    if (!isPushSupported()) return;
    if (Notification.permission === 'denied') return;
    await subscribeToPush();
  } catch { /* best-effort; intentional swallow */ }
}

export function shouldShowPushPrompt(): boolean {
  try {
    return localStorage.getItem(CORE_ACTION_KEY) !== null;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const data = await apiRequest("GET", "/api/push/vapid-public-key");
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });

    await apiRequest("POST", "/api/push/subscribe", {
      subscription: subscription.toJSON(),
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      },
    });

    queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
    return true;
  } catch (err) {
    console.error("[PushNotifications] Subscribe error:", err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint });
    } else {
      await apiRequest("DELETE", "/api/push/unsubscribe", {});
    }

    queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
    return true;
  } catch (err) {
    console.error("[PushNotifications] Unsubscribe error:", err);
    return false;
  }
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

export async function sendTestPush(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiRequest("POST", "/api/push/test", {});
    return await res.json();
  } catch (err: unknown) {
    return { success: false, message: err.message || "Failed to send test" };
  }
}
