import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface PushSubscription {
  id: string;
  endpoint: string;
  platform?: string;
  createdAt: string;
}

const PUSH_REG_KEY = "push_registered_v2";

interface PushNotificationOptions {
  autoRegister?: boolean;
}

export function usePushNotifications(options: PushNotificationOptions = {}) {
  const { autoRegister = false } = options;
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    setIsSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const { data: vapidKey } = useQuery<{ publicKey: string | null }>({
    queryKey: ["/api/push/vapid-public-key"],
    enabled: isSupported && isAuthenticated,
  });

  const { data: subscriptionsData } = useQuery<{ subscriptions: PushSubscription[] }>({
    queryKey: ["/api/push/subscriptions"],
    enabled: isSupported && isAuthenticated && permission === "granted",
  });

  const subscribeMutation = useMutation({
    mutationFn: async (subscription: PushSubscriptionJSON) => {
      return apiRequest("POST", "/api/push/subscribe", {
        subscription,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
      toast({
        title: "Push Notifications Enabled",
        description: "You will now receive push notifications for important alerts.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription Failed",
        description: error.message || "Could not enable push notifications.",
        variant: "destructive",
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (endpoint: string | undefined = undefined) => {
      return apiRequest("DELETE", "/api/push/unsubscribe", { endpoint });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/subscriptions"] });
      toast({
        title: "Push Notifications Disabled",
        description: "You will no longer receive push notifications.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unsubscribe Failed",
        description: error.message || "Could not disable push notifications.",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/push/test", {});
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: data.success ? "Test Sent" : "No Subscriptions",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Test Failed",
        description: error.message || "Could not send test notification.",
        variant: "destructive",
      });
    },
  });

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in your browser.",
        variant: "destructive",
      });
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result !== "granted") {
      toast({
        title: "Permission Denied",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  }, [isSupported, toast]);

  const subscribe = useCallback(async () => {
    if (!vapidKey?.publicKey) {
      toast({
        title: "Not Configured",
        description: "Push notifications are not configured on the server.",
        variant: "destructive",
      });
      return;
    }

    const hasPermission = permission === "granted" || (await requestPermission());
    if (!hasPermission) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey) as BufferSource,
      });

      subscribeMutation.mutate(subscription.toJSON());
    } catch (error: any) {
      console.error("Push subscription error:", error);
      toast({
        title: "Subscription Failed",
        description: error.message || "Could not subscribe to push notifications.",
        variant: "destructive",
      });
    }
  }, [vapidKey, permission, requestPermission, subscribeMutation, toast]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        unsubscribeMutation.mutate(subscription.endpoint);
      } else {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        unsubscribeMutation.mutate();
      }
    } catch (error: any) {
      console.error("Unsubscribe error:", error);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      unsubscribeMutation.mutate();
    }
  }, [unsubscribeMutation]);

  const sendTest = useCallback(() => {
    testMutation.mutate();
  }, [testMutation]);

  useEffect(() => {
    if (!autoRegister) return;
    if (!isAuthenticated || !user?.id) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    const idValue = user.id;
    if (typeof idValue !== "string" && typeof idValue !== "number") return;
    const userId = String(idValue);
    if (sessionStorage.getItem(PUSH_REG_KEY) === userId) return;

    (async () => {
      try {
        const keyRes = await apiRequest("GET", "/api/push/vapid-public-key");
        const keyPayload = await keyRes.json();
        const publicKey = keyPayload?.publicKey;
        if (!publicKey) return;

        const registration = await navigator.serviceWorker.ready;
        let nextPermission = Notification.permission;
        if (nextPermission !== "granted") {
          nextPermission = await Notification.requestPermission();
          setPermission(nextPermission);
        }
        if (nextPermission !== "granted") return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        }

        await apiRequest("POST", "/api/push/subscribe", {
          subscription: subscription.toJSON(),
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
          },
        });

        sessionStorage.setItem(PUSH_REG_KEY, userId);
      } catch (error) {
        console.warn("[Push] Registration failed:", error);
      }
    })();
  }, [autoRegister, isAuthenticated, user?.id]);

  return {
    isSupported,
    permission,
    isSubscribed: (subscriptionsData?.subscriptions?.length ?? 0) > 0,
    subscriptions: subscriptionsData?.subscriptions ?? [],
    isLoading: subscribeMutation.isPending || unsubscribeMutation.isPending,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTest,
  };
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
