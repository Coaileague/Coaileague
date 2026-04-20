import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type SWNotificationAction =
  | "accepted"
  | "declined"
  | "approved"
  | "acknowledged"
  | "dismissed";

interface NotificationActionMessage {
  type: "NOTIFICATION_ACTION";
  notificationId: string;
  notificationType?: string;
  action: SWNotificationAction;
  url?: string;
  offerId?: string;
  shiftId?: string;
  documentId?: string;
  approvalId?: string;
  entityId?: string;
  entityType?: string;
}

interface BadgeUpdateMessage {
  type: "BADGE_UPDATE";
  action: "increment" | "clear";
}

type SWMessage = NotificationActionMessage | BadgeUpdateMessage | { type: string };

async function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0 && nav.setAppBadge) {
      await nav.setAppBadge(count);
    } else if (nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  } catch {
    // Badging API unsupported on this platform — safe to ignore.
  }
}

async function refreshBadgeFromUnreadCount() {
  try {
    const res = await apiRequest("GET", "/api/notifications/unread-count");
    if (!res.ok) return;
    const body = (await res.json()) as { count?: number; unreadCount?: number };
    const count = body.count ?? body.unreadCount ?? 0;
    await setAppBadge(count);
  } catch {
    // Network failure is non-fatal — the badge just won't update this cycle.
  }
}

export function ServiceWorkerMessageListener() {
  const { toast } = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handle = async (event: MessageEvent) => {
      const msg = event.data as SWMessage | undefined;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "BADGE_UPDATE") {
        const badge = msg as BadgeUpdateMessage;
        if (badge.action === "clear") {
          await setAppBadge(0);
        } else {
          await refreshBadgeFromUnreadCount();
        }
        return;
      }

      if (msg.type !== "NOTIFICATION_ACTION") return;
      const m = msg as NotificationActionMessage;

      try {
        switch (m.action) {
          case "accepted": {
            if (m.offerId) {
              const res = await apiRequest("POST", `/api/shifts/offers/${m.offerId}/accept`);
              if (res.ok) {
                toast({ title: "Shift accepted", description: "You're on the schedule." });
                queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
                queryClient.invalidateQueries({ queryKey: ["/api/schedule"] });
                queryClient.invalidateQueries({ queryKey: ["/api/shifts/offers"] });
              } else {
                toast({
                  title: "Couldn't accept shift",
                  description: "Open the offer to try again.",
                  variant: "destructive",
                });
              }
            }
            break;
          }
          case "declined": {
            if (m.offerId) {
              const res = await apiRequest("POST", `/api/shifts/offers/${m.offerId}/decline`);
              if (res.ok) {
                toast({ title: "Shift declined" });
                queryClient.invalidateQueries({ queryKey: ["/api/shifts/offers"] });
              } else {
                toast({
                  title: "Couldn't decline shift",
                  description: "Open the offer to try again.",
                  variant: "destructive",
                });
              }
            }
            break;
          }
          case "approved": {
            // Approve navigates to the approval detail page where the
            // signed mutation runs; we only invalidate so the list updates
            // as soon as the page mounts.
            queryClient.invalidateQueries({ queryKey: ["/api/workflow-approvals"] });
            queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
            break;
          }
          case "acknowledged": {
            await apiRequest("POST", `/api/notifications/acknowledge/${m.notificationId}`);
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
            break;
          }
          case "dismissed": {
            await apiRequest("POST", `/api/notifications/${m.notificationId}/mark-read`);
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
            break;
          }
        }
      } catch {
        // Mutation errors are surfaced via toast above; swallowing here
        // prevents an unhandled promise rejection from the message handler.
      } finally {
        await refreshBadgeFromUnreadCount();
      }
    };

    navigator.serviceWorker.addEventListener("message", handle);
    refreshBadgeFromUnreadCount();

    return () => {
      navigator.serviceWorker.removeEventListener("message", handle);
    };
  }, [toast]);

  return null;
}
