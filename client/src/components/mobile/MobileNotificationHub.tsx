import { useState, useRef, useCallback, type TouchEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, ChevronRight, ChevronDown, Check, X, Wrench, CheckCircle2, Bell, Trash2, RefreshCw, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, startOfDay, endOfDay, parseISO, isToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  employeeId?: string;
  clientId?: string;
  client?: { name: string };
  location?: string;
}

function ExpandableNotificationCard({ 
  notification, 
  onAction,
  onDelete
}: { 
  notification: UserNotification; 
  onAction: (action: string, id: string, data?: any) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { actionType, actionData, id } = notification;
  const hasAction = actionType && actionType !== '';
  const isUrgent = notification.priority === 'high' || notification.priority === 'urgent';
  
  return (
    <Card 
      className={`overflow-hidden ${isUrgent ? 'border-l-2 border-l-amber-500' : ''}`}
      data-testid={`notification-card-${notification.id}`}
    >
      <button
        className="w-full p-3 text-left flex items-center gap-2 min-h-[48px]"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-${notification.id}`}
      >
        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isUrgent ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
          <Bell className={`w-3.5 h-3.5 ${isUrgent ? 'text-amber-600' : 'text-blue-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {notification.title}
          </p>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: false })}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50">
          {notification.message && (
            <p className="text-xs text-muted-foreground mt-2 break-words whitespace-normal">
              {notification.message}
            </p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-3">
            {(actionType === 'shift_request' || actionType === 'swap_request') && (
              <>
                <Button 
                  size="default" 
                  className="bg-emerald-600 hover:bg-emerald-700 flex-1 min-w-[80px]"
                  onClick={() => onAction('approve', id, actionData)}
                  data-testid={`button-approve-${id}`}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button 
                  size="default" 
                  variant="outline"
                  className="border-red-500/50 text-red-500 flex-1 min-w-[80px]"
                  onClick={() => onAction('deny', id, actionData)}
                  data-testid={`button-deny-${id}`}
                >
                  <X className="w-4 h-4 mr-1" />
                  Deny
                </Button>
              </>
            )}
            {actionType === 'acknowledge' && (
              <Button 
                size="default" 
                variant="outline"
                className="flex-1"
                onClick={() => onAction('acknowledge', id)}
                data-testid={`button-acknowledge-${id}`}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Acknowledge
              </Button>
            )}
            {(actionType === 'hotpatch' || actionType === 'trinity_fix') && (
              <>
                <Button 
                  size="default" 
                  className="bg-purple-600 hover:bg-purple-700 flex-1 min-w-[80px]"
                  onClick={() => onAction('run_hotpatch', id, actionData)}
                  data-testid={`button-hotpatch-${id}`}
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  Run Fix
                </Button>
                <Button 
                  size="default" 
                  variant="ghost"
                  onClick={() => onAction('dismiss', id)}
                  data-testid={`button-dismiss-${id}`}
                >
                  Dismiss
                </Button>
              </>
            )}
            
            {/* Delete button - always shown when expanded */}
            <Button 
              size="default" 
              variant="ghost"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              data-testid={`button-delete-${id}`}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function MobileNotificationHub() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { data: notificationsData, isLoading: notificationsLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    refetchInterval: 30000,
  });
  
  const today = new Date();
  const dayStart = startOfDay(today).toISOString();
  const dayEnd = endOfDay(today).toISOString();
  
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", dayStart, dayEnd],
  });
  
  const { data: employeeData } = useQuery<any>({
    queryKey: ["/api/employees/me"],
  });
  
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
  
  // Touch handlers for pull-to-refresh
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  }, []);
  
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (pullStartY.current !== null) {
      const pullDistance = e.changedTouches[0].clientY - pullStartY.current;
      if (pullDistance > 80) {
        handleRefresh();
      }
      pullStartY.current = null;
    }
  }, [handleRefresh]);
  
  const actionMutation = useMutation({
    mutationFn: async ({ action, id, data }: { action: string; id: string; data?: any }) => {
      return apiRequest(`/api/notifications/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, data }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "Action completed" });
    },
    onError: () => {
      toast({ title: "Action failed", variant: "destructive" });
    },
  });
  
  // Delete single notification
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "Notification deleted" });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });
  
  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/notifications/mark-all-read', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "All marked as read" });
    },
    onError: () => {
      toast({ title: "Failed to mark as read", variant: "destructive" });
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
  
  const userNotifications = notificationsData?.userNotifications || [];
  const platformUpdates = notificationsData?.platformUpdates || [];
  const allNotifications: UserNotification[] = [
    ...userNotifications,
    ...platformUpdates.map(p => ({
      id: p.id,
      type: 'platform',
      title: p.title,
      message: p.message,
      createdAt: p.createdAt,
      read: p.read,
      priority: p.severity === 'critical' ? 'urgent' as const : p.severity === 'warning' ? 'high' as const : 'normal' as const,
      category: p.category,
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  const unreadCount = notificationsData?.unreadCount || 0;
  
  const myEmployeeId = employeeData?.id;
  const todayShifts = (shiftsData || []).filter(s => 
    s.employeeId === myEmployeeId && isToday(parseISO(s.date))
  );
  const nextShift = todayShifts[0];
  
  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header with sync and clear actions */}
      <div className="bg-[#0095FF] px-3 py-3">
        <div className="flex items-center gap-2 text-white text-sm">
          <Bell className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 truncate">
            {unreadCount === 0 
              ? "You have no unread notifications"
              : `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            }
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-sync-notifications"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {unreadCount > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Pull to refresh indicator */}
      {isRefreshing && (
        <div className="flex justify-center py-2 bg-blue-50 dark:bg-blue-900/20">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
          <span className="ml-2 text-xs text-blue-500">Syncing...</span>
        </div>
      )}
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto px-2 py-3 pb-24 space-y-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Card 
          className="p-3 flex items-center gap-2 cursor-pointer min-h-[48px]"
          onClick={() => setLocation('/schedule')}
          data-testid="card-shift-status"
        >
          <div className="w-7 h-7 rounded flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 flex-shrink-0">
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            {shiftsLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : nextShift ? (
              <p className="text-sm text-foreground truncate">
                {nextShift.client?.name || 'Shift'} at {nextShift.startTime}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground break-words">
                You don't have any shifts scheduled today
              </p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </Card>
        
        <button
          onClick={() => setLocation('/schedule')}
          className="w-full py-2 text-center text-[#0095FF] text-sm font-medium min-h-[44px]"
          data-testid="link-roster"
        >
          Today's roster <ChevronRight className="inline w-4 h-4" />
        </button>
        
        {notificationsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-3">
                <div className="flex gap-2">
                  <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : allNotifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allNotifications.slice(0, 30).map(notification => (
              <ExpandableNotificationCard 
                key={notification.id} 
                notification={notification}
                onAction={handleAction}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
      
    </div>
  );
}
