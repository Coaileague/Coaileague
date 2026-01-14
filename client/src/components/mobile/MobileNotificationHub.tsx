import { useState, useRef, useCallback, type TouchEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar, ChevronRight, ChevronDown, Check, X, Wrench, CheckCircle2, Bell, Trash2, RefreshCw, CheckCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, startOfDay, endOfDay, parseISO, isToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TrinityMascotIcon } from "@/components/ui/trinity-mascot";
import { cn } from "@/lib/utils";

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

interface ExpandableNotificationCardProps {
  notification: UserNotification;
  onAction: (action: string, id: string, data?: any) => void;
  onDelete: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  selectionMode?: boolean;
}

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
  
  const handleSelect = (e: React.MouseEvent) => {
    if (selectionMode && onSelect) {
      e.stopPropagation();
      onSelect(id, !isSelected);
    }
  };

  const handleLongPress = () => {
    if (!selectionMode && onSelect) {
      onSelect(id, true);
    }
  };

  // Simple long press implementation
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onTouchStart = () => {
    timerRef.current = setTimeout(handleLongPress, 500);
  };
  const onTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all duration-200",
        isUrgent ? 'border-l-2 border-l-[#06b6d4]' : 'border-l-2 border-l-transparent',
        isSelected ? 'ring-2 ring-[#06b6d4] bg-blue-50/50 dark:bg-blue-900/10' : '',
        notification.read ? 'opacity-70' : ''
      )}
      data-testid={`notification-card-${notification.id}`}
      onClick={handleSelect}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center">
        {selectionMode && (
          <div className="pl-3">
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
              isSelected ? "bg-[#06b6d4] border-[#06b6d4]" : "border-muted-foreground/30"
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        )}
        <button
          className="flex-1 p-3 text-left flex items-center gap-2 min-h-[48px]"
          onClick={(e) => {
            if (selectionMode) {
              handleSelect(e);
            } else {
              setExpanded(!expanded);
            }
          }}
          data-testid={`button-expand-${notification.id}`}
        >
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            isUrgent ? 'bg-[#06b6d4]/10' : 'bg-slate-100 dark:bg-slate-800'
          )}>
            <Bell className={cn("w-4 h-4", isUrgent ? 'text-[#06b6d4]' : 'text-slate-500')} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-sm tracking-tight",
              notification.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground"
            )}>
              {notification.title}
            </p>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0 whitespace-nowrap bg-muted/50 px-1.5 py-0.5 rounded">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: false })}
          </span>
          {!selectionMode && (
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200",
              expanded ? 'rotate-180' : ''
            )} />
          )}
        </button>
      </div>
      
      {expanded && !selectionMode && (
        <div className="px-3 pb-3 pt-2 border-t border-border/50 bg-slate-50/30 dark:bg-slate-900/30">
          {notification.message && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {notification.message}
            </p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-4">
            {(actionType === 'shift_request' || actionType === 'swap_request' || actionType === 'approval') && (
              <>
                <Button 
                  size="sm" 
                  className="bg-[#06b6d4] hover:bg-[#0891b2] text-white font-bold flex-1"
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
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 flex-1"
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
                className="flex-1 border-[#06b6d4]/30 text-[#06b6d4] font-bold"
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
              className="text-muted-foreground hover:text-red-500 transition-colors"
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
    </Card>
  );
}

interface MobileNotificationHubProps {
  onClose?: () => void;
}

export function MobileNotificationHub({ onClose }: MobileNotificationHubProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'alerts' | 'updates' | 'platform'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pullStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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
      // Assuming a batch delete endpoint exists or calling multiple times if needed
      // For now, let's call DELETE for each if batch isn't ready
      await Promise.all(ids.map(id => apiRequest('DELETE', `/api/notifications/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: `Deleted ${selectedIds.size} notifications` });
      handleClearSelection();
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
  
  // Delete single notification
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/notifications/${id}`);
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
      return apiRequest('POST', '/api/notifications/mark-all-read');
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
    setLocation('/trinity');
  };
  
  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header with sync and selection actions */}
      <div className="bg-[#06b6d4] px-3 py-3 shadow-lg">
        {selectionMode ? (
          <div className="flex items-center gap-3 text-white">
            <Button size="icon" variant="ghost" className="text-white" onClick={handleClearSelection}>
              <X className="w-5 h-5" />
            </Button>
            <span className="flex-1 font-bold">{selectedIds.size} Selected</span>
            <Button size="icon" variant="ghost" className="text-white" onClick={handleSelectAll}>
              <CheckCheck className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" className="text-white" onClick={handleBatchMarkRead}>
              <CheckCircle2 className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" className="text-white" onClick={handleBatchDelete}>
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white text-sm pr-24">
            <Bell className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 font-bold tracking-tight truncate">
              {unreadCount === 0 
                ? "Inbox Clear"
                : `${unreadCount} Unread`
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
              <RefreshCw className={cn("w-4 h-4", isRefreshing ? 'animate-spin' : '')} />
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
        )}
      </div>
      
      {/* Ask Trinity Button - Blue/Cyan Fortune 500 branding */}
      <button
        onClick={handleAskTrinity}
        className="mx-2 mt-3 flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-[#06b6d4]/20 via-slate-800/60 to-[#22d3ee]/20 border border-[#06b6d4]/30 active:scale-[0.98] transition-transform"
        data-testid="button-ask-trinity-notifications"
      >
        <TrinityMascotIcon size="sm" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium bg-gradient-to-r from-[#06b6d4] via-[#22d3ee] to-[#2dd4bf] bg-clip-text text-transparent">
            Ask Trinity
          </p>
          <p className="text-xs text-muted-foreground">Get help with notifications</p>
        </div>
        <Sparkles className="w-4 h-4 text-[#22d3ee]" />
      </button>
      
      {/* Filter Tabs */}
      <div className="flex gap-1 px-2 py-2 overflow-x-auto bg-white/60 dark:bg-slate-900/60 sticky top-0 z-10 backdrop-blur-md border-b">
        {(['all', 'alerts', 'updates', 'platform'] as const).map(filter => (
          <Badge
            key={filter}
            variant={activeFilter === filter ? 'default' : 'outline'}
            className={cn(
              "cursor-pointer whitespace-nowrap capitalize transition-all duration-200 px-4 py-1.5 font-bold tracking-tight",
              activeFilter === filter 
                ? "bg-[#06b6d4] text-white shadow-lg scale-105" 
                : "bg-transparent text-muted-foreground border-slate-200"
            )}
            onClick={() => setActiveFilter(filter)}
            data-testid={`filter-${filter}`}
          >
            {filter}
          </Badge>
        ))}
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
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-white/40 dark:bg-slate-900/40 rounded-2xl border border-dashed">
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
      
    </div>
  );
}
