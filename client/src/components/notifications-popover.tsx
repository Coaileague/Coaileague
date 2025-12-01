import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, AlertTriangle, Info, Wrench, Check, Clock, X, Sparkles, MessageSquare } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedNotificationBell } from "./animated-notification-bell";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  category: string;
  version?: string;
  badge?: string;
  isNew: boolean;
  isViewed: boolean;
  createdAt: string;
}

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
  platformUpdates: PlatformUpdate[];
  maintenanceAlerts: MaintenanceAlert[];
  notifications: Notification[];
  unreadPlatformUpdates: number;
  unreadNotifications: number;
  unreadAlerts: number;
  totalUnread: number;
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

const categoryConfig: Record<string, { icon: typeof Sparkles; color: string }> = {
  feature: { icon: Sparkles, color: "text-purple-500" },
  improvement: { icon: Check, color: "text-green-500" },
  fix: { icon: Wrench, color: "text-blue-500" },
  security: { icon: AlertTriangle, color: "text-red-500" },
  announcement: { icon: MessageSquare, color: "text-amber-500" },
};

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("updates");

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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
    },
  });

  const platformUpdates = data?.platformUpdates || [];
  const maintenanceAlerts = data?.maintenanceAlerts || [];
  const notifications = data?.notifications || [];
  const totalUnread = data?.totalUnread || 0;
  const unreadPlatformUpdates = data?.unreadPlatformUpdates || 0;
  const unreadNotifications = data?.unreadNotifications || 0;
  const unreadAlerts = data?.unreadAlerts || 0;
  
  const activeAlerts = maintenanceAlerts.filter(
    (a) => a.status === "scheduled" || a.status === "in_progress"
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <AnimatedNotificationBell
            notificationCount={totalUnread}
            onClick={() => setOpen(!open)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[400px] p-0" 
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {totalUnread > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {totalUnread}
              </Badge>
            )}
          </div>
          {totalUnread > 0 && (
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

        <ScrollArea className="max-h-[450px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-9 px-2 py-1 bg-muted/50">
                <TabsTrigger value="updates" className="text-xs relative" data-testid="tab-updates">
                  What's New
                  {unreadPlatformUpdates > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {unreadPlatformUpdates}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="notifications" className="text-xs relative" data-testid="tab-notifications">
                  Alerts
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                      {unreadNotifications}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="text-xs relative" data-testid="tab-maintenance">
                  System
                  {unreadAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">
                      {unreadAlerts}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="updates" className="mt-0">
                {platformUpdates.length > 0 ? (
                  <div className="divide-y">
                    {platformUpdates.map((update) => {
                      const config = categoryConfig[update.category] || categoryConfig.announcement;
                      const IconComponent = config.icon;
                      return (
                        <div
                          key={update.id}
                          className={`p-3 hover:bg-muted/50 transition-colors ${!update.isViewed ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                          data-testid={`update-item-${update.id}`}
                        >
                          <div className="flex gap-3">
                            <div className={`shrink-0 ${config.color}`}>
                              <IconComponent className="h-4 w-4 mt-0.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-sm truncate">{update.title}</span>
                                  {update.badge && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                      {update.badge}
                                    </Badge>
                                  )}
                                  {!update.isViewed && (
                                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {update.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {update.category}
                                </Badge>
                                {update.version && (
                                  <span className="text-[10px] text-muted-foreground">v{update.version}</span>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(update.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Sparkles className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm">No updates yet</span>
                    <span className="text-xs">New features will appear here</span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notifications" className="mt-0">
                {notifications.length > 0 ? (
                  <div className="divide-y">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 hover:bg-muted/50 transition-colors cursor-pointer ${!notification.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                        onClick={() => {
                          if (!notification.isRead) {
                            markAsReadMutation.mutate(notification.id);
                          }
                          if (notification.actionUrl) {
                            window.location.href = notification.actionUrl;
                          }
                        }}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className="flex gap-3">
                          <div className="shrink-0 text-primary">
                            <Bell className="h-4 w-4 mt-0.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-sm">{notification.title}</span>
                              {!notification.isRead && (
                                <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {notification.message}
                            </p>
                            <span className="text-[10px] text-muted-foreground mt-1 block">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
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
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm">No notifications</span>
                    <span className="text-xs">You're all caught up!</span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="mt-0">
                {maintenanceAlerts.length > 0 ? (
                  <div className="divide-y">
                    {maintenanceAlerts.map((alert) => {
                      const config = severityConfig[alert.severity] || severityConfig.info;
                      const SeverityIcon = config.icon;
                      return (
                        <div
                          key={alert.id}
                          className={`p-3 ${config.bg} ${alert.isAcknowledged ? 'opacity-60' : ''}`}
                          data-testid={`alert-item-${alert.id}`}
                        >
                          <div className="flex gap-3">
                            <div className={`shrink-0 ${config.color}`}>
                              <SeverityIcon className="h-4 w-4 mt-0.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-sm">{alert.title}</span>
                                <Badge className={`${config.badge} text-[10px]`}>
                                  {statusLabels[alert.status]}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {alert.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {new Date(alert.scheduledStartTime).toLocaleDateString()} -{" "}
                                  {new Date(alert.scheduledEndTime).toLocaleDateString()}
                                </span>
                              </div>
                              {alert.affectedServices?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {alert.affectedServices.slice(0, 3).map((service) => (
                                    <Badge key={service} variant="outline" className="text-[10px]">
                                      {service}
                                    </Badge>
                                  ))}
                                  {alert.affectedServices.length > 3 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      +{alert.affectedServices.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            {!alert.isAcknowledged && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                                disabled={acknowledgeAlertMutation.isPending}
                                data-testid={`button-acknowledge-${alert.id}`}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Wrench className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-sm">No system alerts</span>
                    <span className="text-xs">All systems operational</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </ScrollArea>

        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-center text-xs h-8"
            onClick={() => {
              setOpen(false);
              window.location.href = "/updates";
            }}
            data-testid="button-view-all-notifications"
          >
            View all updates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
