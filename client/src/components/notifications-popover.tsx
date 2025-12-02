import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, AlertTriangle, Info, Wrench, Check, Clock, X, Sparkles, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedNotificationBell } from "./animated-notification-bell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMobile } from "@/hooks/use-mobile";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useMobile();

  const { data, isLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: true,
    staleTime: 2000,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [open, activeTab]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      try {
        await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
      } catch (error) {
        console.error('[Notifications] Error marking as read:', error);
      }
      const acknowledged = JSON.parse(localStorage.getItem('notifications-acknowledged') || '[]');
      if (!acknowledged.includes(notificationId)) {
        acknowledged.push(notificationId);
        localStorage.setItem('notifications-acknowledged', JSON.stringify(acknowledged));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      refetch();
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      try {
        await apiRequest("POST", `/api/maintenance-alerts/${alertId}/acknowledge`);
      } catch (error) {
        console.error('[Notifications] Error acknowledging alert:', error);
      }
      const acknowledged = JSON.parse(localStorage.getItem('alerts-acknowledged') || '[]');
      if (!acknowledged.includes(alertId)) {
        acknowledged.push(alertId);
        localStorage.setItem('alerts-acknowledged', JSON.stringify(acknowledged));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      refetch();
    },
  });

  const acknowledgeSelectedMutation = useMutation({
    mutationFn: async () => {
      const idsToAcknowledge = Array.from(selectedIds);
      if (idsToAcknowledge.length === 0) return { success: true };
      
      try {
        const response = await apiRequest("POST", "/api/notifications/mark-all-read");
        await response.json();
      } catch (error) {
        console.error('[Notifications] API error:', error);
      }
      
      const acknowledged = JSON.parse(localStorage.getItem('notifications-acknowledged') || '[]');
      idsToAcknowledge.forEach(id => {
        if (!acknowledged.includes(id)) acknowledged.push(id);
      });
      localStorage.setItem('notifications-acknowledged', JSON.stringify(acknowledged));
      
      return { success: true };
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
      setTimeout(() => refetch(), 100);
    },
    onError: (error) => {
      console.error('[Notifications] Error:', error);
      setSelectedIds(new Set());
      setTimeout(() => refetch(), 100);
    }
  });

  const toggleSelectUpdate = (updateId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(updateId)) {
      newSelected.delete(updateId);
    } else {
      newSelected.add(updateId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    const unviewedUpdates = filteredPlatformUpdates.filter(u => !u.isViewed);
    if (selectedIds.size === unviewedUpdates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unviewedUpdates.map(u => u.id)));
    }
  };

  const acknowledgedIds = new Set(JSON.parse(localStorage.getItem('notifications-acknowledged') || '[]'));
  const acknowledgedAlertIds = new Set(JSON.parse(localStorage.getItem('alerts-acknowledged') || '[]'));
  
  const rawPlatformUpdates = data?.platformUpdates || [];
  const rawMaintenanceAlerts = data?.maintenanceAlerts || [];
  const rawNotifications = data?.notifications || [];
  
  const filteredPlatformUpdates = rawPlatformUpdates.filter(u => !acknowledgedIds.has(u.id));
  const filteredMaintenanceAlerts = rawMaintenanceAlerts.filter(a => !acknowledgedAlertIds.has(a.id));
  const filteredNotifications = rawNotifications.filter(n => !acknowledgedIds.has(n.id));
  
  const unreadPlatformUpdates = filteredPlatformUpdates.filter(u => !u.isViewed).length;
  const unreadNotifications = filteredNotifications.filter(n => !n.isRead).length;
  const unreadAlerts = filteredMaintenanceAlerts.filter(a => !a.isAcknowledged).length;
  const totalUnread = unreadPlatformUpdates + unreadNotifications + unreadAlerts;

  const unviewedUpdates = filteredPlatformUpdates.filter(u => !u.isViewed);
  const allUnviewedSelected = unviewedUpdates.length > 0 && selectedIds.size === unviewedUpdates.length;

  const NotificationsContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-background to-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Notifications</h2>
            {totalUnread > 0 && (
              <span className="text-xs text-muted-foreground">{totalUnread} unread</span>
            )}
          </div>
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="default"
            size="sm"
            className="text-xs h-8 px-3"
            onClick={() => acknowledgeSelectedMutation.mutate()}
            disabled={acknowledgeSelectedMutation.isPending}
            data-testid="button-acknowledge-selected"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Acknowledge ({selectedIds.size})
          </Button>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        style={{ maxHeight: isMobile ? 'calc(70vh - 140px)' : '420px' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
              <TabsList className="grid w-full grid-cols-3 h-12 p-1.5 bg-transparent gap-1">
                <TabsTrigger 
                  value="updates" 
                  className="text-xs font-medium relative data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all" 
                  data-testid="tab-updates"
                >
                  What's New
                  {unreadPlatformUpdates > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {unreadPlatformUpdates > 9 ? '9+' : unreadPlatformUpdates}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger 
                  value="notifications" 
                  className="text-xs font-medium relative data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md transition-all" 
                  data-testid="tab-notifications"
                >
                  Alerts
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger 
                  value="maintenance" 
                  className="text-xs font-medium relative data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:shadow-sm rounded-md transition-all" 
                  data-testid="tab-maintenance"
                >
                  System
                  {unreadAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {unreadAlerts > 9 ? '9+' : unreadAlerts}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="updates" className="mt-0 focus-visible:outline-none">
              {unviewedUpdates.length > 0 && (
                <div className="px-4 py-3 flex items-center gap-3 border-b bg-muted/30">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center w-5 h-5 rounded border-2 border-muted-foreground/30 hover:border-primary transition-colors"
                    data-testid="button-select-all-updates"
                  >
                    {allUnviewedSelected && <Check className="h-3 w-3 text-primary" />}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size === 0 ? 'Select to acknowledge' : `${selectedIds.size} of ${unviewedUpdates.length} selected`}
                  </span>
                </div>
              )}
              {filteredPlatformUpdates.length > 0 ? (
                <div className="divide-y">
                  {filteredPlatformUpdates.map((update) => {
                    const config = categoryConfig[update.category] || categoryConfig.announcement;
                    const IconComponent = config.icon;
                    return (
                      <div
                        key={update.id}
                        className={`px-4 py-4 hover:bg-muted/40 transition-colors ${!update.isViewed ? 'bg-primary/5' : 'opacity-70'}`}
                        data-testid={`update-item-${update.id}`}
                      >
                        <div className="flex gap-3">
                          {!update.isViewed && (
                            <button
                              onClick={() => toggleSelectUpdate(update.id)}
                              className="flex items-center justify-center w-5 h-5 rounded border-2 border-muted-foreground/30 hover:border-primary mt-0.5 flex-shrink-0 transition-colors"
                              data-testid={`checkbox-update-${update.id}`}
                            >
                              {selectedIds.has(update.id) && <Check className="h-3 w-3 text-primary" />}
                            </button>
                          )}
                          <div className={`shrink-0 ${config.color} mt-0.5`}>
                            <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center">
                              <IconComponent className="h-4 w-4" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm leading-tight">{update.title}</span>
                                {update.badge && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-medium">
                                    {update.badge}
                                  </Badge>
                                )}
                                {!update.isViewed && (
                                  <span className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                              {update.description}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px] capitalize px-2 py-0.5">
                                {update.category}
                              </Badge>
                              {update.version && (
                                <span className="text-[10px] text-muted-foreground font-mono">v{update.version}</span>
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
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 opacity-50" />
                  </div>
                  <span className="text-sm font-medium">No updates yet</span>
                  <span className="text-xs mt-1">New features will appear here</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="notifications" className="mt-0 focus-visible:outline-none">
              {filteredNotifications.length > 0 ? (
                <div className="divide-y">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-4 hover:bg-muted/40 transition-colors cursor-pointer ${!notification.isRead ? 'bg-primary/5' : 'opacity-70'}`}
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
                        <div className="shrink-0 text-primary mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bell className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-medium text-sm leading-tight">{notification.title}</span>
                            {!notification.isRead && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5 animate-pulse" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                            {notification.message}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                            data-testid={`button-dismiss-${notification.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Bell className="h-8 w-8 opacity-50" />
                  </div>
                  <span className="text-sm font-medium">No notifications</span>
                  <span className="text-xs mt-1">You're all caught up!</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="maintenance" className="mt-0 focus-visible:outline-none">
              {filteredMaintenanceAlerts.length > 0 ? (
                <div className="divide-y">
                  {filteredMaintenanceAlerts.map((alert) => {
                    const config = severityConfig[alert.severity] || severityConfig.info;
                    const SeverityIcon = config.icon;
                    return (
                      <div
                        key={alert.id}
                        className={`px-4 py-4 ${config.bg} ${alert.isAcknowledged ? 'opacity-60' : ''}`}
                        data-testid={`alert-item-${alert.id}`}
                      >
                        <div className="flex gap-3">
                          <div className={`shrink-0 ${config.color} mt-0.5`}>
                            <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center">
                              <SeverityIcon className="h-4 w-4" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-sm leading-tight">{alert.title}</span>
                              <Badge className={`${config.badge} text-[10px] px-2 py-0.5 font-medium shrink-0`}>
                                {statusLabels[alert.status]}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                              {alert.description}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                              <Clock className="h-3.5 w-3.5" />
                              <span>
                                {new Date(alert.scheduledStartTime).toLocaleDateString()} -{" "}
                                {new Date(alert.scheduledEndTime).toLocaleDateString()}
                              </span>
                            </div>
                            {alert.affectedServices?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {alert.affectedServices.slice(0, 3).map((service) => (
                                  <Badge key={service} variant="outline" className="text-[10px] px-2 py-0.5">
                                    {service}
                                  </Badge>
                                ))}
                                {alert.affectedServices.length > 3 && (
                                  <Badge variant="outline" className="text-[10px] px-2 py-0.5">
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
                              className="h-8 w-8 shrink-0 hover:bg-background/50"
                              onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                              disabled={acknowledgeAlertMutation.isPending}
                              data-testid={`button-acknowledge-${alert.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Check className="h-8 w-8 text-emerald-500 opacity-70" />
                  </div>
                  <span className="text-sm font-medium">All systems operational</span>
                  <span className="text-xs mt-1">No system alerts at this time</span>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <div className="border-t bg-muted/20">
        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-center text-xs h-9 font-medium hover:bg-primary/5 hover:text-primary"
            onClick={() => {
              setOpen(false);
              window.location.href = "/updates";
            }}
            data-testid="button-view-all-notifications"
          >
            View all updates
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div onClick={() => setOpen(true)}>
          <AnimatedNotificationBell
            notificationCount={totalUnread}
            onClick={() => setOpen(true)}
          />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent 
            className="w-[calc(100vw-2rem)] max-w-[480px] max-h-[80vh] p-0 gap-0 overflow-hidden"
            showHomeButton={false}
          >
            <NotificationsContent />
          </DialogContent>
        </Dialog>
      </>
    );
  }

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
        className="w-[480px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden shadow-xl border-muted" 
        align="end"
        sideOffset={8}
      >
        <NotificationsContent />
      </PopoverContent>
    </Popover>
  );
}
