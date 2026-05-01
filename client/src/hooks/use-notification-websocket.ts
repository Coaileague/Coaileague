import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useWebSocketBus, useWsConnected } from "@/providers/WebSocketProvider";

interface EnhancedNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
  detailedCategory?: string;
  sourceType?: string;
  sourceName?: string;
  brokenDescription?: string;
  impactDescription?: string;
  badge?: string;
  category?: string;
}

interface PlatformUpdate {
  type: string;
  category: string;
  title: string;
  description: string;
  version?: string;
  isNew?: boolean;
  detailedCategory?: string;
  sourceType?: string;
  sourceName?: string;
  brokenDescription?: string;
  impactDescription?: string;
  badge?: string;
}

interface AutomationEvent {
  id: string;
  type: string;
  status: 'started' | 'completed' | 'failed';
  jobType: string;
  duration?: number;
  result?: { message?: string; itemsProcessed?: number };
  error?: string;
}

interface FastModeResult {
  tier: 'fast' | 'turbo' | 'instant';
  duration: number;
  slaTarget: number;
  success: boolean;
  agentCount: number;
  creditsCost: number;
  qualityScore?: number;
}

interface GraduationMilestone {
  from: 'hand_held' | 'graduated' | 'full_automation';
  to: 'hand_held' | 'graduated' | 'full_automation';
  confidenceScore: number;
  unlockedFeatures: string[];
}

interface NotificationWebSocketMessage {
  type: 'notification_new' | 'notification_read' | 'notification_read_bulk' | 'notification_count_updated' | 'notifications_subscribed' | 'platform_update' | 'notification_cleared_all' | 'all_notifications_cleared' | 'notification_cleared' | 'whats_new_cleared' | 'whats_new_viewed' | 'automation_event' | 'fast_mode_result' | 'graduation_milestone' | 'error';
  notification?: EnhancedNotification & { counts?: { notifications: number; platformUpdates: number; total: number; lastUpdated: string } };
  update?: PlatformUpdate;
  updateId?: string;
  notificationId?: string;
  clearedAt?: string;
  unreadCount?: number;
  timestamp?: string;
  workspaceId?: string;
  message?: string;
  cleared?: { platformUpdates: number; notifications: number; alerts: number };
  markedRead?: { platformUpdates: number; notifications: number; alerts: number };
  counts?: { notifications: number; platformUpdates: number; total: number; lastUpdated: string };
  count?: number;
  source?: string;
  automationEvent?: AutomationEvent;
  fastModeResult?: FastModeResult;
  graduationMilestone?: GraduationMilestone;
}

// ── Toast deduplication + burst rate limiter ─────────────────────────────────
// Notification types that are operational/background alerts — they appear in
// the notification bell but should NOT produce a popup toast. Showing a toast
// for every unassigned-shift escalation alert creates an overwhelming flood
// when the scheduler fires and sends 10+ alerts at once.
const SILENT_NOTIFICATION_TYPES = new Set([
  // Scheduler batch alerts — update the bell only, never toast
  'shift_escalation_warning_72h',
  'shift_escalation_urgent_24h',
  'shift_escalation_critical_4h',
  'shift_reminder',
  // Coverage/shift offers — employees are notified via the Shift Marketplace and
  // mobile hub; toasting these creates a flood when multiple open shifts fire at once
  'coverage_offer',
  'shift_offer',
  // Internal Trinity compliance blocks — managers review these in the notification
  // bell; the raw technical reason string is not suitable for a popup toast
  'trinity_action_blocked',
  // HelpAI proactive alerts — go to bell; showing as toast while agreements modal
  // is loading causes layering confusion on first login
  'helpai_alert',
  'helpai_proactive',
]);

const recentToastKeys = new Set<string>();
const TOAST_DEDUP_WINDOW_MS = 30000;   // 30s dedup window (up from 10s)

// Burst limiter: max 3 notification toasts per 8-second window.
// Prevents a flood of WS events from stacking the screen with toasts.
let _burstCount = 0;
let _burstResetTimer: ReturnType<typeof setTimeout> | null = null;
const BURST_MAX = 3;
const BURST_WINDOW_MS = 8000;

function shouldShowToast(key: string): boolean {
  if (recentToastKeys.has(key)) return false;
  if (_burstCount >= BURST_MAX) return false;   // burst rate limit exceeded

  recentToastKeys.add(key);
  setTimeout(() => recentToastKeys.delete(key), TOAST_DEDUP_WINDOW_MS);

  _burstCount++;
  if (!_burstResetTimer) {
    _burstResetTimer = setTimeout(() => {
      _burstCount = 0;
      _burstResetTimer = null;
    }, BURST_WINDOW_MS);
  }
  
  // Cleanup for global burst timer if it was created in this scope
  // Actually this is global so we don't return cleanup for it here
  // but let's make sure recentToastKeys timeout is also safe.
  
  return true;
}

// ── Debounced refetches: collapse rapid bursts into one refetch call ──────────
// When 30+ events arrive in 1s, we don't need 30 concurrent API calls.
let _notifRefetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNotificationRefetch() {
  if (_notifRefetchTimer) return;
  _notifRefetchTimer = setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ["/api/notifications/combined"] });
    queryClient.refetchQueries({ queryKey: ["/api/notifications"] });
    _notifRefetchTimer = null;
  }, 400);
}

let _whatsNewRefetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWhatsNewRefetch() {
  if (_whatsNewRefetchTimer) return;
  _whatsNewRefetchTimer = setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ["/api/whats-new"] });
    queryClient.refetchQueries({ queryKey: ["/api/whats-new/latest"] });
    queryClient.refetchQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
    _whatsNewRefetchTimer = null;
  }, 400);
}

export function useNotificationWebSocket(userId: string | undefined, workspaceId: string | undefined) {
  const { toast } = useToast();
  const bus = useWebSocketBus();
  const isConnected = useWsConnected();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  // Guard against double join_notifications in React strict mode double-mount
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userId || !workspaceId) return;

    const sendJoin = () => {
      if (subscribedRef.current) return;
      subscribedRef.current = true;
      bus.send({
        type: 'join_notifications',
        userId,
        workspaceId,
      });
    };

    if (bus.isConnected()) sendJoin();

    const unsubConnect = bus.subscribe('__ws_connected', () => {
      // Reset on reconnect so we re-join the new session
      subscribedRef.current = false;
      sendJoin();
    });

    return () => {
      subscribedRef.current = false;
      unsubConnect();
    };
  }, [bus, userId, workspaceId]);

  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const handleMessage = (data: NotificationWebSocketMessage) => {
      switch (data.type) {
        case 'notifications_subscribed':
          if (data.unreadCount !== undefined) {
            setUnreadCount(data.unreadCount);
          }
          setError(null);
          break;

        case 'notification_new':
          // Debounced: collapses a burst of arrivals into one refetch call
          scheduleNotificationRefetch();
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          
          if (data.unreadCount !== undefined) {
            setUnreadCount(data.unreadCount);
          }
          
          if (data.notification) {
            // Operational background alerts (escalations, reminders) update the
            // notification bell count but never produce a popup toast — that would
            // flood the screen when the scheduler fires a batch of shift alerts.
            const notifType = data.notification.type;
            if (!SILENT_NOTIFICATION_TYPES.has(notifType)) {
              const toastKey = `notif:${data.notification.id || data.notification.title}`;
              if (shouldShowToast(toastKey)) {
                toastRef.current({
                  title: data.notification.title,
                  description: data.notification.message,
                  variant: "info" as any,
                });
              }
            }
          }
          break;

        case 'platform_update':
          if (data.update) {
            scheduleNotificationRefetch();
            scheduleWhatsNewRefetch();
            
            window.dispatchEvent(new CustomEvent('platform_update', { detail: data.update }));
            
            const updateKey = `update:${data.update.title || data.update.category}`;
            if (shouldShowToast(updateKey)) {
              toastRef.current({
                title: "New Update Available",
                description: data.update.title,
                variant: "info" as any,
              });
            }
          }
          break;

        case 'whats_new_viewed':
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
          window.dispatchEvent(new CustomEvent('whats_new_viewed', { detail: data }));
          break;

        case 'notification_read':
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          if (data.unreadCount !== undefined) {
            setUnreadCount(data.unreadCount);
          }
          break;

        case 'notification_read_bulk':
          queryClient.setQueryData(["/api/notifications/combined"], (oldData) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              notifications: oldData.notifications?.map((n) => ({ ...n, isRead: true })) || [],
              platformUpdates: oldData.platformUpdates?.map((u) => ({ ...u, isViewed: true })) || [],
              maintenanceAlerts: oldData.maintenanceAlerts?.map((a) => ({ ...a, isAcknowledged: true })) || [],
              unreadNotifications: 0,
              unreadPlatformUpdates: 0,
              unreadAlerts: 0,
              totalUnread: 0,
            };
          });
          setUnreadCount(0);
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          break;

        case 'notification_count_updated':
          if (data.unreadCount !== undefined) {
            setUnreadCount(data.unreadCount);
          }
          if (data.source === 'clear_all' || (data.counts && data.counts.total === 0)) {
            queryClient.setQueryData(["/api/notifications/combined"], (oldData) => {
              if (!oldData) return oldData;
              const now = new Date().toISOString();
              return {
                ...oldData,
                notifications: oldData.notifications?.map((n) => ({ ...n, isRead: true, clearedAt: n.clearedAt || now })) || [],
                platformUpdates: oldData.platformUpdates?.map((u) => ({ ...u, isViewed: true })) || [],
                maintenanceAlerts: oldData.maintenanceAlerts?.map((a) => ({ ...a, isAcknowledged: true })) || [],
                unreadNotifications: 0,
                unreadPlatformUpdates: 0,
                unreadAlerts: 0,
                totalUnread: 0,
              };
            });
            setUnreadCount(0);
          }
          const countUpdateEvent = new CustomEvent('notification_count_updated', {
            detail: {
              counts: data.counts || (data as any).notification?.counts || {
                notifications: (data as any).notification?.notifications || 0,
                platformUpdates: (data as any).notification?.platformUpdates || 0,
                total: data.unreadCount || 0,
                lastUpdated: new Date().toISOString(),
              },
            },
          });
          window.dispatchEvent(countUpdateEvent);
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          break;

        case 'notification_cleared_all':
        case 'all_notifications_cleared':
          queryClient.setQueryData(["/api/notifications/combined"], (oldData) => {
            if (!oldData) return oldData;
            const now = new Date().toISOString();
            return {
              ...oldData,
              notifications: oldData.notifications?.map((n) => ({ ...n, isRead: true, clearedAt: n.clearedAt || now })) || [],
              platformUpdates: oldData.platformUpdates?.map((u) => ({ ...u, isViewed: true })) || [],
              maintenanceAlerts: oldData.maintenanceAlerts?.map((a) => ({ ...a, isAcknowledged: true })) || [],
              unreadNotifications: 0,
              unreadPlatformUpdates: 0,
              unreadAlerts: 0,
              totalUnread: 0,
            };
          });
          setUnreadCount(0);
          localStorage.removeItem('notifications-acknowledged');
          localStorage.removeItem('alerts-acknowledged');
          localStorage.removeItem('whats-new-acknowledged');
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          window.dispatchEvent(new CustomEvent('whats_new_cleared', { detail: data }));
          break;

        case 'notification_cleared':
          if (data.notificationId) {
            queryClient.setQueryData(["/api/notifications/combined"], (oldData) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                notifications: oldData.notifications?.filter((n) => n.id !== data.notificationId) || [],
                unreadNotifications: Math.max(0, (oldData.unreadNotifications || 0) - 1),
                totalUnread: Math.max(0, (oldData.totalUnread || 0) - 1),
              };
            });
            queryClient.setQueryData(["/api/notifications"], (oldData) => {
              if (!oldData) return oldData;
              if (Array.isArray(oldData)) {
                return oldData.filter((n) => n.id !== data.notificationId);
              }
              return oldData;
            });
            window.dispatchEvent(new CustomEvent('notification_cleared', { 
              detail: { notificationId: data.notificationId, clearedAt: data.clearedAt } 
            }));
          }
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
          break;

        case 'whats_new_cleared':
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
          queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
          localStorage.removeItem('whats-new-acknowledged');
          window.dispatchEvent(new CustomEvent('whats_new_cleared', { detail: data }));
          break;

        case 'automation_event':
          if (data.automationEvent) {
            window.dispatchEvent(new CustomEvent('automation_event', { detail: data.automationEvent }));
          }
          break;

        case 'fast_mode_result':
          if (data.fastModeResult) {
            window.dispatchEvent(new CustomEvent('fast_mode_result', { detail: data.fastModeResult }));
          }
          break;

        case 'graduation_milestone':
          if (data.graduationMilestone) {
            window.dispatchEvent(new CustomEvent('graduation_milestone', { detail: data.graduationMilestone }));
          }
          break;

        case 'officer_clocked_in':
        case 'officer_clocked_out':
          queryClient.invalidateQueries({ queryKey: ['/api/time-entries/status'] });
          break;

        case 'error': {
          const errorMessage = data.message || 'An error occurred';
          // Auth errors are transient — the re-auth flow resolves them silently.
          // Don't surface them to the UI to avoid confusing the user.
          const isTransientAuthError =
            typeof errorMessage === 'string' &&
            (errorMessage.toLowerCase().includes('authentication required') ||
              errorMessage.toLowerCase().includes('please log in'));
          if (!isTransientAuthError) {
            console.error('Notification WebSocket error:', errorMessage);
            setError(errorMessage);
          }
          break;
        }

        default:
          break;
      }
    };

    const messageTypes: string[] = [
      'notifications_subscribed', 'notification_new', 'notification_read',
      'notification_read_bulk', 'notification_count_updated', 'platform_update',
      'notification_cleared_all', 'all_notifications_cleared', 'notification_cleared',
      'whats_new_cleared', 'whats_new_viewed', 'automation_event',
      'fast_mode_result', 'graduation_milestone', 'error',
      'officer_clocked_in', 'officer_clocked_out',
    ];

    const unsubs = messageTypes.map(type => bus.subscribe(type, (data) => handleMessage(data as NotificationWebSocketMessage)));
    return () => unsubs.forEach(u => u());
  }, [bus]);

  useEffect(() => {
    const handleOptimisticClear = () => {
      setUnreadCount(0);
    };

    window.addEventListener('notifications_clear_optimistic' as any, handleOptimisticClear);
    
    return () => {
      window.removeEventListener('notifications_clear_optimistic' as any, handleOptimisticClear);
    };
  }, []);

  const reconnect = useCallback(() => {
    // No-op: reconnection is handled by the WebSocketProvider
  }, []);

  return {
    isConnected,
    unreadCount,
    error,
    reconnect,
  };
}
