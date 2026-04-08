import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Check, X, Wrench, CheckCircle2, Bell, Trash2, RefreshCw, CheckCheck, Sparkles, ListChecks, Pencil, Megaphone, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { useNotificationSync } from "@/hooks/use-notification-sync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { triggerHaptic } from "@/hooks/use-touch-swipe";
import { cn } from "@/lib/utils";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { BroadcastComposer } from "@/components/broadcasts/BroadcastComposer";

interface UserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
  actionType?: string;
  actionData?: any;
}

interface PlatformUpdate {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: string;
  createdAt: string;
  read: boolean;
}

interface NotificationsData {
  userNotifications: UserNotification[];
  platformUpdates: PlatformUpdate[];
  unreadCount: number;
}

interface ExpandableNotificationCardProps {
  notification: UserNotification;
  onAction: (action: string, id: string, data?: any) => void;
  onDelete: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  selectionMode?: boolean;
}

/**
 * Unified SwipeableNotificationCard - Single component handling both swipe gestures and card UI
 * Eliminates wrapper nesting issues by integrating swipe directly into the card
 * Follows the platform's unified component pattern
 */
function ExpandableNotificationCard({ 
  notification, 
  onAction,
  onDelete,
  isSelected,
  onSelect,
  selectionMode
}: ExpandableNotificationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { actionType, actionData, id } = notification;
  const isUrgent = notification.priority === 'high' || notification.priority === 'urgent';
  
  // Integrated swipe state - no separate wrapper needed
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentDistance = useRef(0);
  const isSwipingRef = useRef(false);
  const actionTriggered = useRef(false);
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null);
  
  const SWIPE_THRESHOLD = 100;
  const LOCK_THRESHOLD = 15;
  const MIN_SWIPE = 25;
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectionMode) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentDistance.current = 0;
    isSwipingRef.current = true;
    actionTriggered.current = false;
    directionLocked.current = null;
    setIsSwiping(false);
    setSwipeDistance(0);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwipingRef.current || selectionMode) return;
    
    const deltaX = startX.current - e.touches[0].clientX;
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);
    
    // Lock direction after threshold
    if (!directionLocked.current) {
      if (Math.abs(deltaX) > LOCK_THRESHOLD || deltaY > LOCK_THRESHOLD) {
        directionLocked.current = Math.abs(deltaX) > deltaY * 1.2 ? 'horizontal' : 'vertical';
      }
    }
    
    // Only process horizontal swipes
    if (directionLocked.current === 'horizontal' && deltaX > MIN_SWIPE) {
      e.preventDefault();
      const clampedDistance = Math.min(deltaX, SWIPE_THRESHOLD * 1.3);
      currentDistance.current = clampedDistance;
      setSwipeDistance(clampedDistance);
      setIsSwiping(true);
      
      // Haptic feedback at threshold
      if (clampedDistance >= SWIPE_THRESHOLD && clampedDistance < SWIPE_THRESHOLD * 1.1) {
        triggerHaptic('medium');
      }
    }
  };
  
  const handleTouchEnd = () => {
    if (!isSwipingRef.current || selectionMode) return;
    
    const finalDistance = currentDistance.current;
    const wasHorizontal = directionLocked.current === 'horizontal';
    
    if (wasHorizontal && finalDistance >= SWIPE_THRESHOLD && !actionTriggered.current) {
      actionTriggered.current = true;
      triggerHaptic('heavy');
      setTimeout(() => {
        onDelete(id);
        resetSwipe();
      }, 100);
    } else {
      resetSwipe();
    }
  };
  
  const resetSwipe = () => {
    setSwipeDistance(0);
    setTimeout(() => {
      setIsSwiping(false);
      isSwipingRef.current = false;
      currentDistance.current = 0;
      directionLocked.current = null;
    }, 150);
  };
  
  const handleSelect = (e: React.MouseEvent) => {
    if (selectionMode && onSelect) {
      e.stopPropagation();
      onSelect(id, !isSelected);
    }
  };

  // Visual feedback calculations
  const swipeProgress = Math.min((swipeDistance / SWIPE_THRESHOLD) * 100, 100);
  const isNearThreshold = swipeProgress >= 70;
  const hasPassedThreshold = swipeProgress >= 100;

  return (
    <div 
      className="relative rounded-lg touch-manipulation"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetSwipe}
      data-testid={`notification-card-${notification.id}`}
    >
      {/* Delete action background - revealed on swipe */}
      {swipeDistance > 0 && (
        <div 
          className={cn(
            "absolute right-0 top-0 bottom-0 flex items-center justify-end pr-4 rounded-r-lg transition-colors",
            hasPassedThreshold ? "bg-green-500" : isNearThreshold ? "bg-destructive" : "bg-destructive/70"
          )}
          style={{ width: `${Math.max(swipeDistance, 50)}px` }}
        >
          {hasPassedThreshold ? (
            <Check className="h-5 w-5 text-white" />
          ) : (
            <Trash2 className={cn("h-5 w-5 text-white", isNearThreshold && "scale-110")} />
          )}
        </div>
      )}
      
      {/* Card content - slides on swipe */}
      <div 
        className={cn(
          "relative bg-card border rounded-lg transition-all duration-200",
          isUrgent ? 'border-l-2 border-l-[var(--ds-info)]' : 'border-l-2 border-l-transparent',
          isSelected ? 'ring-2 ring-[var(--ds-info)] bg-blue-50/50 dark:bg-blue-900/10' : '',
          notification.read ? 'opacity-60' : '',
          !isSwiping && "transition-transform duration-150"
        )}
        style={{ transform: `translateX(-${swipeDistance}px)` }}
        onClick={handleSelect}
      >
      <div className="flex items-center">
        {selectionMode && (
          <div className="pl-3">
            <div className={cn(
              "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
              isSelected ? "bg-[var(--ds-info)] border-[var(--ds-info)]" : "border-muted-foreground/30"
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        )}
        <button
          className="flex-1 p-2.5 text-left flex items-start gap-2.5 min-h-[44px]"
          onClick={(e) => {
            if (selectionMode) {
              handleSelect(e);
            } else {
              setExpanded(!expanded);
            }
          }}
          data-testid={`button-expand-${notification.id}`}
          aria-label={expanded ? "Collapse notification" : "Expand notification"}
        >
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
            isUrgent ? 'bg-primary/10' : 'bg-muted'
          )}>
            <Bell className={cn("w-4 h-4", isUrgent ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm tracking-tight leading-snug",
              notification.read ? "font-normal text-muted-foreground" : "font-medium text-foreground"
            )}>
              {notification.title}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {isUrgent && (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                  URGENT
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {!selectionMode && (
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform duration-200",
              expanded ? 'rotate-180' : ''
            )} />
          )}
        </button>
      </div>
      
      {expanded && !selectionMode && (
        <div className="px-3 pb-3 pt-2 border-t border-border bg-muted">
          {notification.message && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6 break-words">
              {notification.message}
            </p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-3">
            {(actionType === 'shift_request' || actionType === 'swap_request' || actionType === 'approval') && (
              <>
                <Button 
                  size="sm" 
                  className="bg-[var(--ds-info)] text-white font-bold flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('approve', id, actionData);
                  }}
                  data-testid={`button-approve-${id}`}
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('deny', id, actionData);
                  }}
                  data-testid={`button-deny-${id}`}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Deny
                </Button>
              </>
            )}
            {actionType === 'acknowledge' && (
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1 border-[var(--ds-info)]/30 text-[var(--ds-info)] font-bold"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('acknowledge', id);
                }}
                data-testid={`button-acknowledge-${id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Acknowledge
              </Button>
            )}
            
            <Button 
              size="sm" 
              variant="ghost"
              className="text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              data-testid={`button-delete-${id}`}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

interface MobileNotificationHubProps {
  onClose?: () => void;
}

export function MobileNotificationHub({ onClose }: MobileNotificationHubProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { openModal: openTrinityModal } = useTrinityModal();
  const { syncClearAll, syncNotificationCleared } = useNotificationSync();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'alerts' | 'updates' | 'platform'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { workspaceRole, platformRole: accessPlatformRole } = useWorkspaceAccess();
  const userPlatformRole = (user as any)?.platformRole || (user as any)?.platform_role;
  const effectivePlatformRole = accessPlatformRole || userPlatformRole;
  const BROADCAST_ALLOWED_PLATFORM = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
  const BROADCAST_ALLOWED_WORKSPACE = ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'];
  const canBroadcast = (effectivePlatformRole && BROADCAST_ALLOWED_PLATFORM.includes(effectivePlatformRole)) ||
    (workspaceRole && BROADCAST_ALLOWED_WORKSPACE.includes(workspaceRole));
  const isPlatformBroadcast = !!(effectivePlatformRole && BROADCAST_ALLOWED_PLATFORM.includes(effectivePlatformRole));
  
  const { data: notificationsData, isLoading: notificationsLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    refetchInterval: 30000,
  });

  const selectionMode = selectedIds.size > 0;
  
  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleClearSelection = () => setSelectedIds(new Set());
  
  const handleSelectAll = () => {
    const allIds = filteredNotifications.map(n => n.id);
    setSelectedIds(new Set(allIds));
  };
  
  const deleteBatchMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Delete each notification with individual error handling
      const results = await Promise.allSettled(
        ids.map(async id => {
          // Single retry per item
          try {
            return await apiRequest('DELETE', `/api/notifications/${id}`);
          } catch (error: any) {
            if (error?.status === 404) return; // Already deleted
            // One retry after 100ms
            await new Promise(resolve => setTimeout(resolve, 100));
            return await apiRequest('DELETE', `/api/notifications/${id}`);
          }
        })
      );
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0 && failures.length === ids.length) {
        throw new Error(`Failed to delete ${failures.length} notifications`);
      }
      return { deleted: ids.length - failures.length, failed: failures.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      const message = result?.failed 
        ? `Deleted ${result.deleted}, ${result.failed} failed`
        : `Deleted ${selectedIds.size} notifications`;
      toast({ title: message });
      handleClearSelection();
    },
    onError: () => {
      toast({ title: "Delete failed", description: "Please try again", variant: "destructive" });
    }
  });

  const markReadBatchMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest('POST', '/api/notifications/mark-read-batch', { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "Notifications marked as read" });
      handleClearSelection();
    }
  });

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    deleteBatchMutation.mutate(Array.from(selectedIds));
  };

  const handleBatchMarkRead = () => {
    if (selectedIds.size === 0) return;
    markReadBatchMutation.mutate(Array.from(selectedIds));
  };
  
  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({ title: "Synced", description: "Notifications refreshed" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch, toast]);
  
  const pullStartX = useRef<number | null>(null);
  const directionLocked = useRef<'vertical' | 'horizontal' | null>(null);
  const pullDistanceRef = useRef(0);
  const isPulling = useRef(false);
  const PULL_DEADZONE = 80;
  const PULL_THRESHOLD = 120;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 2) {
      pullStartY.current = e.touches[0].clientY;
      pullStartX.current = e.touches[0].clientX;
      directionLocked.current = null;
      pullDistanceRef.current = 0;
      isPulling.current = true;
    }
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || pullStartY.current === null || pullStartX.current === null) return;
    const diffY = e.touches[0].clientY - pullStartY.current;
    const diffX = Math.abs(e.touches[0].clientX - pullStartX.current);
    if (diffY <= 0 || (containerRef.current && containerRef.current.scrollTop > 2)) {
      isPulling.current = false;
      pullDistanceRef.current = 0;
      directionLocked.current = null;
      return;
    }
    if (!directionLocked.current && (diffY > 15 || diffX > 15)) {
      directionLocked.current = diffY > diffX * 2 ? 'vertical' : 'horizontal';
      if (directionLocked.current === 'horizontal') {
        isPulling.current = false;
        pullDistanceRef.current = 0;
        return;
      }
    }
    if (directionLocked.current !== 'vertical') return;
    if (diffY > PULL_DEADZONE) {
      pullDistanceRef.current = Math.min((diffY - PULL_DEADZONE) * 0.5, 120);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullDistanceRef.current >= PULL_THRESHOLD) {
      handleRefresh();
    }
    pullStartY.current = null;
    pullStartX.current = null;
    isPulling.current = false;
    pullDistanceRef.current = 0;
    directionLocked.current = null;
  }, [handleRefresh]);
  
  const actionMutation = useMutation({
    mutationFn: async ({ action, id, data }: { action: string; id: string; data?: any }) => {
      return apiRequest('POST', `/api/notifications/${id}/action`, { action, data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "Action completed" });
    },
    onError: () => {
      toast({ title: "Action failed", variant: "destructive" });
    },
  });
  
  // Delete single notification with retry logic for reliability
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await apiRequest('DELETE', `/api/notifications/${id}`);
          return result;
        } catch (error: any) {
          lastError = error;
          // Don't retry on 404 (already deleted) or 403 (unauthorized)
          if (error?.status === 404 || error?.status === 403) {
            throw error;
          }
          // Wait a bit before retrying (100ms, 200ms)
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
          }
        }
      }
      throw lastError;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      syncNotificationCleared(id);
      toast({ title: "Notification deleted" });
    },
    onError: (error: any) => {
      // Only show error if it's a real failure (not 404 which means it was already deleted)
      if (error?.status === 404) {
        // Already deleted - just refresh
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        return;
      }
      toast({ 
        title: "Delete failed", 
        description: "Please try again",
        variant: "destructive" 
      });
    },
  });
  
  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/notifications/mark-all-read', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      syncClearAll(); // Broadcast to sync other tabs/desktop
      toast({ title: "All marked as read" });
    },
    onError: () => {
      toast({ title: "Failed to mark as read", variant: "destructive" });
    },
  });
  
  // Clear all notifications
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/notifications/clear-all', {});
    },
    onSuccess: () => {
      // Invalidate every notification-related cache key (both singular and plural variants)
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/mailbox/auto-create"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      syncClearAll(); // Broadcast to sync other tabs/desktop
      toast({ title: "All notifications cleared" });
    },
    onError: () => {
      toast({ title: "Failed to clear notifications", variant: "destructive" });
    },
  });
  
  const handleAction = (action: string, id: string, data?: any) => {
    actionMutation.mutate({ action, id, data });
  };
  
  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };
  
  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };
  
  const handleClearAll = () => {
    clearAllMutation.mutate();
  };
  
  // API returns 'notifications' not 'userNotifications' - fix the mapping
  const userNotifications = (notificationsData as any)?.notifications || (notificationsData as any)?.userNotifications || [];
  const platformUpdates = notificationsData?.platformUpdates || [];
  const allNotifications: UserNotification[] = [
    ...userNotifications.map((n: any) => ({
      id: n.id,
      type: n.type || 'notification',
      title: n.title || 'Notification',
      message: n.message || n.body || '',
      createdAt: n.createdAt || new Date().toISOString(),
      read: n.isRead || n.clearedAt != null,
      priority: n.priority === 'critical' ? 'urgent' as const : 
                n.priority === 'high' ? 'high' as const : 'normal' as const,
      category: n.category,
      actionType: n.actionType,
      actionData: n.actionData,
    })),
    ...platformUpdates.map((p: any) => ({
      id: p.id,
      type: 'platform',
      title: p.title,
      message: p.message || p.description || '',
      createdAt: p.createdAt,
      read: p.isViewed || p.read || false,
      priority: p.severity === 'critical' ? 'urgent' as const : p.severity === 'warning' ? 'high' as const : 'normal' as const,
      category: p.category,
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  // API returns 'totalUnread' not 'unreadCount'
  const unreadCount = (notificationsData as any)?.totalUnread || (notificationsData as any)?.unreadCount || 0;
  
  // Filter notifications based on active filter
  const filteredNotifications = allNotifications.filter(n => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'platform') return n.type === 'platform';
    if (activeFilter === 'alerts') return n.priority === 'urgent' || n.priority === 'high';
    if (activeFilter === 'updates') return n.type !== 'platform' && n.priority !== 'urgent' && n.priority !== 'high';
    return true;
  });
  
  const handleAskTrinity = () => {
    if (onClose) onClose();
    openTrinityModal();
  };
  
  // Enter selection mode with first item
  const handleEnterSelectionMode = () => {
    if (filteredNotifications.length > 0) {
      setSelectedIds(new Set([filteredNotifications[0].id]));
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - polished gradient with high-contrast buttons */}
      <div className="bg-gradient-to-r from-primary to-primary/85 px-3 py-2.5 shadow-md flex-shrink-0">
        {selectionMode ? (
          <div className="flex items-center gap-1 text-primary-foreground">
            <Button size="icon" variant="ghost" className="text-primary-foreground shrink-0" onClick={handleClearSelection} data-testid="button-cancel-selection">
              <X className="w-5 h-5" />
            </Button>
            <span className="font-bold text-sm whitespace-nowrap shrink-0 px-1">{selectedIds.size} Selected</span>
            <div className="flex-1" />
            <Button size="icon" variant="ghost" className="text-primary-foreground shrink-0" onClick={handleSelectAll} title="Select All">
              <CheckCheck className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" className="text-primary-foreground shrink-0" onClick={handleBatchMarkRead} title="Mark Read">
              <CheckCircle2 className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="destructive" className="text-primary-foreground shrink-0" onClick={handleBatchDelete} title="Delete">
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-primary-foreground w-full">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <div className="p-1.5 rounded-lg bg-primary-foreground/15">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-sm tracking-tight leading-tight">Notifications</div>
                {unreadCount > 0 && (
                  <div className="text-[11px] opacity-80">{unreadCount} unread</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {canBroadcast && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-primary-foreground"
                  onClick={() => setBroadcastOpen(true)}
                  data-testid="button-mobile-send-broadcast"
                  title="Send Broadcast"
                >
                  <Megaphone className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground"
                onClick={handleRefresh}
                disabled={isRefreshing}
                data-testid="button-sync-notifications"
                title="Sync"
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing ? 'animate-spin' : '')} />
              </Button>
              {filteredNotifications.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-primary-foreground"
                  onClick={handleEnterSelectionMode}
                  data-testid="button-edit-mode"
                  title="Select to Delete"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
              {allNotifications.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-primary-foreground"
                  onClick={handleClearAll}
                  disabled={clearAllMutation.isPending}
                  data-testid="button-clear-all"
                  title="Delete All"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <div className="w-px h-5 bg-primary-foreground/25 mx-0.5" />
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground bg-primary-foreground/10"
                onClick={() => {
                  if (onClose) onClose();
                  setLocation('/dashboard');
                }}
                data-testid="button-notifications-home"
                title="Go to Home"
              >
                <Home className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground bg-primary-foreground/10"
                onClick={() => onClose?.()}
                data-testid="button-notifications-close"
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Push Notification Opt-In */}
      <PushNotificationPrompt />
      
      {/* Compact Filter Tabs with Trinity button */}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto bg-card border-b flex-shrink-0">
        {(['all', 'alerts', 'updates', 'platform'] as const).map(filter => (
          <Badge
            key={filter}
            variant={activeFilter === filter ? 'default' : 'outline'}
            className={cn(
              "cursor-pointer whitespace-nowrap capitalize transition-all duration-200 px-2 py-0.5 text-xs font-medium flex-shrink-0",
              activeFilter === filter 
                ? "bg-[var(--ds-info)] text-white shadow-sm" 
                : "bg-transparent text-muted-foreground border-border"
            )}
            onClick={() => setActiveFilter(filter)}
            data-testid={`filter-${filter}`}
          >
            {filter}
          </Badge>
        ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1 text-[var(--ds-info)] flex-shrink-0"
          onClick={handleAskTrinity}
          data-testid="button-ask-trinity-notifications"
        >
          <TrinityLogo size={16} />
          <span className="text-xs">Ask Trinity</span>
        </Button>
      </div>
      
      {/* Pull to refresh indicator */}
      {isRefreshing && (
        <div className="flex justify-center py-1.5 bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
          <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
          <span className="ml-1.5 text-xs text-blue-500">Syncing...</span>
        </div>
      )}
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto px-2 py-1 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] space-y-1.5 min-h-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {notificationsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-3">
                <div className="flex gap-2">
                  <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground bg-muted rounded-md border border-dashed">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">
              {activeFilter === 'all' ? 'Your inbox is empty' : `No ${activeFilter} notifications found`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.slice(0, 30).map(notification => (
              <ExpandableNotificationCard 
                key={notification.id} 
                notification={notification}
                onAction={handleAction}
                onDelete={handleDelete}
                isSelected={selectedIds.has(notification.id)}
                onSelect={handleSelect}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        )}
      </div>
      
      {canBroadcast && (
        <BroadcastComposer
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          isPlatformLevel={isPlatformBroadcast}
        />
      )}
    </div>
  );
}
