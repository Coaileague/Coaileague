import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { queryKeys } from "@/config/queryKeys";
import { navConfig } from "@/config/navigationConfig";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { useIsMobile } from "@/hooks/use-mobile";
import { SwipeableDismissCard } from "@/components/ui/swipeable-approval-card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Bell, Check, X, Clock, Users, Calendar, AlertCircle, 
  Sparkles, DollarSign, FileText, AlertTriangle, PartyPopper, 
  UserPlus, BrainCircuit, CheckCircle 
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface NotificationCreator {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
}

interface Notification {
  id: string;
  type: 'shift_assigned' | 'pto_approved' | 'pto_denied' | 'schedule_change' | 'mention' | 'system' |
        'welcome_org' | 'welcome_employee' | 'invoice_generated' | 'invoice_paid' | 'payment_received' |
        'ai_schedule_ready' | 'ai_approval_needed' | 'ai_action_completed' | 'deadline_approaching';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  actionUrl?: string;
  createdBy?: NotificationCreator;
  scope?: 'workspace' | 'user' | 'global';
}

export function NotificationsCenter() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  // Get current user info
  const { data: currentUser } = useQuery<{ id: string; email?: string }>({ 
    queryKey: queryKeys.auth.me,
    queryFn: () => apiGet('auth.current'),
  });
  const userId = currentUser?.id;
  
  // Get current workspace
  const { data: workspace } = useQuery<{ id: string; name?: string }>({ 
    queryKey: queryKeys.workspace.current,
    queryFn: () => apiGet('workspace.current'),
  });
  const workspaceId = workspace?.id;

  // Connect to notification WebSocket
  const { unreadCount: wsUnreadCount, isConnected } = useNotificationWebSocket(userId, workspaceId);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: queryKeys.notifications.all,
    queryFn: () => apiGet('notifications.list'),
    enabled: open,
  });

  // Use WebSocket unread count if available, otherwise calculate from notifications
  const unreadCount = isConnected && wsUnreadCount !== undefined 
    ? wsUnreadCount 
    : notifications.filter((n) => !n.isRead).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}/read`, 'PATCH');
    },
    onSuccess: (_, id) => {
      // Immediately update cache with this notification marked as read
      queryClient.setQueryData(queryKeys.notifications.all, (old: Notification[] = []) =>
        old.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      // Then invalidate to sync with backend
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => {
      console.error('Failed to mark notification as read:', error);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/notifications/mark-all-read', 'POST');
    },
    onSuccess: () => {
      // Immediately update cache - mark all notifications as read
      queryClient.setQueryData(queryKeys.notifications.all, (old: Notification[] = []) =>
        old.map(n => ({ ...n, isRead: true }))
      );
      // Close popover after marking all read
      setOpen(false);
      // Then invalidate to sync with backend
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => {
      console.error('Failed to mark all notifications as read:', error);
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    }
  });

  const markAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const markAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'shift_assigned':
        return <Calendar className="h-4 w-4 text-primary" />;
      case 'pto_approved':
        return <Check className="h-4 w-4 text-primary" />;
      case 'pto_denied':
        return <X className="h-4 w-4 text-destructive" />;
      case 'schedule_change':
        return <Clock className="h-4 w-4 text-primary" />;
      case 'mention':
        return <Users className="h-4 w-4 text-primary" />;
      case 'welcome_org':
        return <PartyPopper className="h-4 w-4 text-primary" />;
      case 'welcome_employee':
        return <UserPlus className="h-4 w-4 text-primary" />;
      case 'invoice_generated':
        return <FileText className="h-4 w-4 text-primary" />;
      case 'invoice_paid':
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'payment_received':
        return <DollarSign className="h-4 w-4 text-primary" />;
      case 'ai_schedule_ready':
        return <BrainCircuit className="h-4 w-4 text-primary" />;
      case 'ai_approval_needed':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'ai_action_completed':
        return <Sparkles className="h-4 w-4 text-primary" />;
      case 'deadline_approaching':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-xl hover-elevate active-elevate-2" data-testid="button-notifications">
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'animate-bell-ring-continuous' : ''}`} />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1">
              {/* Splat particles around badge */}
              <span className="absolute h-2 w-2 rounded-full bg-destructive animate-splat-1" style={{ top: '-2px', right: '-2px' }} />
              <span className="absolute h-2 w-2 rounded-full bg-destructive animate-splat-2" style={{ top: '-2px', right: '-2px' }} />
              <span className="absolute h-2 w-2 rounded-full bg-destructive animate-splat-3" style={{ top: '-2px', right: '-2px' }} />
              <span className="absolute h-2 w-2 rounded-full bg-destructive animate-splat-4" style={{ top: '-2px', right: '-2px' }} />
              
              {/* Main badge with ripple */}
              <span className="absolute h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] font-semibold animate-badge-pulse animate-ripple-continuous">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-1.5rem)] sm:w-80 max-w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="h-[60vh] sm:h-[400px] max-h-[calc(100vh-10rem)]">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  isMobile={isMobile}
                  onMarkAsRead={() => markAsRead(notification.id)}
                  getNotificationIcon={getNotificationIcon}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface NotificationItemProps {
  notification: Notification;
  isMobile: boolean;
  onMarkAsRead: () => void;
  getNotificationIcon: (type: string) => React.ReactNode;
}

function NotificationItem({
  notification,
  isMobile,
  onMarkAsRead,
  getNotificationIcon,
}: NotificationItemProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleClick = () => {
    onMarkAsRead();
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  const getTypeLabel = (type: string) => {
    if (type === 'system') return 'System';
    if (['alert', 'maintenance_alert', 'support_escalation', 'deadline_approaching'].includes(type)) return 'Alert';
    return 'Announcement';
  };

  const creatorName = notification.createdBy 
    ? `${notification.createdBy.firstName || ''} ${notification.createdBy.lastName || ''}`.trim() || notification.createdBy.email
    : 'System';

  const content = (
    <div
      className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
        !notification.isRead ? 'bg-accent/50' : ''
      }`}
      onClick={handleClick}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex gap-3">
        <div className="mt-0.5">
          {getNotificationIcon(notification.type)}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium leading-tight">
                {notification.title}
              </p>
            </div>
            {!notification.isRead && (
              <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex gap-2 items-center">
              <Badge variant="secondary" className="text-[10px]">
                {getTypeLabel(notification.type)}
              </Badge>
              <span className="text-muted-foreground">by {creatorName}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-muted-foreground">
              <span>{format(new Date(notification.createdAt), 'MMM dd, yyyy HH:mm')}</span>
              <span className="text-[10px]">
                {formatDistanceToNow(new Date(notification.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <SwipeableDismissCard
        id={notification.id}
        onDismiss={onMarkAsRead}
        dismissDirection="left"
      >
        {content}
      </SwipeableDismissCard>
    );
  }

  return content;
}
