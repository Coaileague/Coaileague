import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, AlertTriangle, Info, Wrench, Check, Clock, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatedNotificationBell } from "./animated-notification-bell";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MaintenanceAlert {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduledStartTime: string;
  scheduledEndTime: string;
  affectedServices: string[];
  isAcknowledged?: boolean;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

interface NotificationsData {
  maintenanceAlerts: MaintenanceAlert[];
  notifications: Notification[];
  unreadCount: number;
}

const severityConfig = {
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  critical: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
    badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: open,
    staleTime: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("POST", `/api/maintenance-alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
    },
  });

  const maintenanceAlerts = data?.maintenanceAlerts || [];
  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;
  const activeAlerts = maintenanceAlerts.filter(
    (a) => a.status === "scheduled" || a.status === "in_progress"
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <AnimatedNotificationBell
            notificationCount={unreadCount + activeAlerts.length}
            onClick={() => setOpen(!open)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[380px] p-0" 
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {activeAlerts.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <Wrench className="h-3 w-3" />
                    Maintenance Alerts
                  </div>
                  <div className="space-y-1 mt-1">
                    {activeAlerts.map((alert) => {
                      const config = severityConfig[alert.severity];
                      const Icon = config.icon;
                      return (
                        <div
                          key={alert.id}
                          className={`rounded-lg p-3 ${config.bg}`}
                          data-testid={`alert-item-${alert.id}`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{alert.title}</span>
                                <Badge className={`${config.badge} text-[10px] h-4`}>
                                  {statusLabels[alert.status]}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {alert.description}
                              </p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {new Date(alert.scheduledStartTime).toLocaleDateString()}{" "}
                                  {new Date(alert.scheduledStartTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              {!alert.isAcknowledged && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs mt-2"
                                  onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                                  disabled={acknowledgeAlertMutation.isPending}
                                  data-testid={`button-acknowledge-${alert.id}`}
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  Acknowledge
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeAlerts.length > 0 && notifications.length > 0 && (
                <Separator className="my-1" />
              )}

              {notifications.length > 0 ? (
                <div className="p-2">
                  <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <Bell className="h-3 w-3" />
                    Recent
                  </div>
                  <div className="space-y-1 mt-1">
                    {notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        className={`rounded-lg p-3 cursor-pointer transition-colors hover-elevate ${
                          !notification.isRead
                            ? "bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          if (!notification.isRead) {
                            markAsReadMutation.mutate(notification.id);
                          }
                          if (notification.actionUrl) {
                            window.location.href = notification.actionUrl;
                            setOpen(false);
                          }
                        }}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                              notification.isRead ? "bg-transparent" : "bg-primary"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm line-clamp-1">
                              {notification.title}
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <span className="text-[10px] text-muted-foreground mt-1 block">
                              {formatDistanceToNow(new Date(notification.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsReadMutation.mutate(notification.id);
                              }}
                              data-testid={`button-dismiss-${notification.id}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-sm">No notifications</span>
                  <span className="text-xs">You're all caught up!</span>
                </div>
              ) : null}
            </>
          )}
        </ScrollArea>

        {(notifications.length > 10 || maintenanceAlerts.length > 0) && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-xs h-8"
                onClick={() => {
                  setOpen(false);
                  window.location.href = "/dashboard/notifications";
                }}
                data-testid="button-view-all-notifications"
              >
                View all notifications
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
