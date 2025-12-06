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
import { useAuth } from "@/hooks/useAuth";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";

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
  metadata?: {
    endUserSummary?: string;
    technicalSummary?: string;
    brokenDescription?: string;
    impactDescription?: string;
    detailedCategory?: string;
    sourceType?: string;
    sourceName?: string;
    timestamp?: string;
  };
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
  metadata?: {
    endUserSummary?: string;
    technicalSummary?: string;
    brokenDescription?: string;
    impactDescription?: string;
    detailedCategory?: string;
    sourceType?: string;
    sourceName?: string;
    timestamp?: string;
    changeEventId?: string;
  };
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

import { Bot, Code, Zap, Settings, Users, Globe, FileText, Shield, TrendingUp, Server, Layout, Database } from "lucide-react";

const categoryConfig: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  feature: { icon: Sparkles, color: "text-purple-500", label: "New Feature" },
  improvement: { icon: Check, color: "text-green-500", label: "Improvement" },
  fix: { icon: Wrench, color: "text-blue-500", label: "Fix" },
  bugfix: { icon: Wrench, color: "text-blue-500", label: "Bug Fix" },
  security: { icon: Shield, color: "text-red-500", label: "Security" },
  announcement: { icon: MessageSquare, color: "text-amber-500", label: "Announcement" },
  service: { icon: Server, color: "text-cyan-500", label: "Service Update" },
  bot_automation: { icon: Bot, color: "text-violet-500", label: "Bot Automation" },
  deprecation: { icon: AlertTriangle, color: "text-orange-500", label: "Deprecation" },
  hotpatch: { icon: Zap, color: "text-yellow-500", label: "Hotpatch" },
  integration: { icon: Globe, color: "text-teal-500", label: "Integration" },
  ui_update: { icon: Layout, color: "text-pink-500", label: "UI Update" },
  backend_update: { icon: Database, color: "text-slate-500", label: "Backend" },
  performance: { icon: TrendingUp, color: "text-emerald-500", label: "Performance" },
  documentation: { icon: FileText, color: "text-gray-500", label: "Documentation" },
};

const sourceTypeLabels: Record<string, { icon: typeof Bot; label: string }> = {
  system: { icon: Settings, label: "System" },
  ai_brain: { icon: Bot, label: "AI Brain" },
  support_staff: { icon: Users, label: "Support Staff" },
  developer: { icon: Code, label: "Developer" },
  automated_job: { icon: Zap, label: "Automation" },
  user_request: { icon: Users, label: "User Request" },
  external_service: { icon: Globe, label: "External Service" },
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
  
  // Get user context for WebSocket and filtering
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  
  // Connect to WebSocket for real-time notification updates
  // This syncs notifications in real-time and updates the cache directly
  const { isConnected, unreadCount: wsUnreadCount } = useNotificationWebSocket(userId, workspaceId);

  // Get cached data for initial render to prevent showing 0 on cold start
  const cachedData = queryClient.getQueryData<NotificationsData>(["/api/notifications/combined"]);

  // WebSocket delivers live updates now - polling is just a fallback
  // Live updates insert directly into cache via use-notification-websocket hook
  const { data: fetchedData, isLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: !!user, // Only fetch when user is authenticated
    staleTime: 10000, // 10 seconds - trust WebSocket for fresh data
    refetchInterval: isConnected ? 60000 : 15000, // Slower polling when WS is connected
    refetchIntervalInBackground: false, // Only poll when visible
  });
  
  // Use fetched data, falling back to cached data for immediate display
  const data = fetchedData || cachedData;

  // Track if this is the first open to prevent scroll reset on every render
  const hasOpenedRef = useRef(false);
  
  // Live timestamp ticker - forces re-render every 60s for "live" relative timestamps
  const [timestampTick, setTimestampTick] = useState(0);
  useEffect(() => {
    const ticker = setInterval(() => {
      setTimestampTick(t => t + 1);
    }, 60000); // Update every minute for live timestamps
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (open) {
      // Refresh data when popover opens
      refetch();
      // Only scroll to top on first open, not on every re-render or tab change
      if (!hasOpenedRef.current && scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        hasOpenedRef.current = true;
      }
    } else {
      // Reset the flag when popover closes so next open scrolls to top
      hasOpenedRef.current = false;
    }
  }, [open, refetch]);
  
  // REMOVED: No longer scroll to top on tab change to prevent glitchy scroll reset

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest("POST", `/api/notifications/acknowledge/${notificationId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      refetch();
    },
    onError: (error) => {
      console.error('[Notifications] Error marking as read:', error);
    },
  });

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest("POST", `/api/maintenance-alerts/${alertId}/acknowledge`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      refetch();
    },
    onError: (error) => {
      console.error('[Notifications] Error acknowledging alert:', error);
    },
  });

  const acknowledgeSelectedMutation = useMutation({
    mutationFn: async () => {
      const idsToAcknowledge = Array.from(selectedIds);
      if (idsToAcknowledge.length === 0) return { success: true };
      
      const response = await apiRequest("POST", "/api/notifications/acknowledge-all");
      return response.json();
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
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

  const rawPlatformUpdates = data?.platformUpdates || [];
  const rawMaintenanceAlerts = data?.maintenanceAlerts || [];
  const rawNotifications = data?.notifications || [];
  
  const filteredPlatformUpdates = rawPlatformUpdates;
  const filteredMaintenanceAlerts = rawMaintenanceAlerts;
  const filteredNotifications = rawNotifications;
  
  // Use API's pre-computed counts as baseline
  const apiUnreadPlatformUpdates = data?.unreadPlatformUpdates ?? 0;
  const apiUnreadNotifications = data?.unreadNotifications ?? 0;
  const apiUnreadAlerts = data?.unreadAlerts ?? 0;
  const apiTotalUnread = data?.totalUnread ?? 0;
  
  // For display in tabs, use API counts
  const unreadPlatformUpdates = apiUnreadPlatformUpdates;
  const unreadAlerts = filteredMaintenanceAlerts.filter(a => !a.isAcknowledged).length;
  
  // For notifications: WebSocket is real-time source of truth
  // The WebSocket count includes all user notifications, not just what's in the popover
  const calculatedNotificationCount = filteredNotifications.filter(n => !n.isRead).length;
  const unreadNotifications = isConnected && wsUnreadCount > 0 
    ? wsUnreadCount 
    : (apiUnreadNotifications > 0 ? apiUnreadNotifications : calculatedNotificationCount);
  
  // Total unread: WebSocket count is most accurate for notifications
  // Combine WebSocket notification count with API's platform updates and alerts
  // This ensures badge shows real-time count from WebSocket
  const totalUnread = isConnected && wsUnreadCount > 0
    ? wsUnreadCount + unreadPlatformUpdates + unreadAlerts
    : (apiTotalUnread > 0 ? apiTotalUnread : (unreadPlatformUpdates + unreadNotifications + unreadAlerts));

  const unviewedUpdates = filteredPlatformUpdates.filter(u => !u.isViewed);
  const allUnviewedSelected = unviewedUpdates.length > 0 && selectedIds.size === unviewedUpdates.length;

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notifications/clear-all");
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/combined"] });
      
      const previousData = queryClient.getQueryData(["/api/notifications/combined"]);
      
      queryClient.setQueryData(["/api/notifications/combined"], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          notifications: [],
          platformUpdates: oldData.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })) || [],
          maintenanceAlerts: oldData.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })) || [],
          unreadNotifications: 0,
          unreadPlatformUpdates: 0,
          unreadAlerts: 0,
          totalUnread: 0,
        };
      });
      
      setSelectedIds(new Set());
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new/unviewed-count"] });
    },
    onError: (err, _, context) => {
      console.error('[Clear All] Error:', err);
      if (context?.previousData) {
        queryClient.setQueryData(["/api/notifications/combined"], context.previousData);
      }
    },
  });

  const NotificationsContent = () => (
    <div className="flex flex-col h-full max-h-[inherit]">
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-background to-muted/30 shrink-0">
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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
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
          ) : totalUnread > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 px-3"
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              data-testid="button-clear-all-notifications"
            >
              {clearAllMutation.isPending ? (
                <div className="animate-spin rounded-full h-3 w-3 border border-current border-t-transparent mr-1.5" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ 
          maxHeight: isMobile ? 'calc(80vh - 180px)' : '420px',
          WebkitOverflowScrolling: 'touch'
        }}
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
              {unviewedUpdates.length > 0 ? (
                <div className="divide-y">
                  {unviewedUpdates.map((update) => {
                    const detailedCat = update.metadata?.detailedCategory || update.category;
                    const config = categoryConfig[detailedCat] || categoryConfig.announcement;
                    const IconComponent = config.icon;
                    const sourceType = update.metadata?.sourceType;
                    const sourceName = update.metadata?.sourceName;
                    const sourceConfig = sourceType ? sourceTypeLabels[sourceType] : null;
                    const SourceIcon = sourceConfig?.icon;
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
                              {update.metadata?.endUserSummary || update.description}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${config.color} border-current/30`}>
                                {config.label}
                              </Badge>
                              {sourceConfig && SourceIcon && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-1">
                                  <SourceIcon className="h-3 w-3" />
                                  {sourceName || sourceConfig.label}
                                </Badge>
                              )}
                              {update.version && (
                                <span className="text-[10px] text-muted-foreground font-mono">v{update.version}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(update.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            {(update.metadata?.brokenDescription || update.metadata?.impactDescription) && (
                              <div className="mt-2 space-y-1">
                                {update.metadata.brokenDescription && (
                                  <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-900">
                                    <p className="text-[11px] text-red-700 dark:text-red-300">
                                      <span className="font-medium">What was fixed:</span> {update.metadata.brokenDescription}
                                    </p>
                                  </div>
                                )}
                                {update.metadata.impactDescription && (
                                  <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-900">
                                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                                      <span className="font-medium">Impact:</span> {update.metadata.impactDescription}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
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
                  {filteredNotifications.map((notification) => {
                    const detailedCat = notification.metadata?.detailedCategory;
                    const config = detailedCat ? categoryConfig[detailedCat] : null;
                    const IconComponent = config?.icon || Bell;
                    const iconColor = config?.color || "text-primary";
                    const sourceType = notification.metadata?.sourceType;
                    const sourceName = notification.metadata?.sourceName;
                    const sourceConfig = sourceType ? sourceTypeLabels[sourceType] : null;
                    const SourceIcon = sourceConfig?.icon;
                    return (
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
                          <div className={`shrink-0 ${iconColor} mt-0.5`}>
                            <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center">
                              <IconComponent className="h-4 w-4" />
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
                              {notification.metadata?.endUserSummary || notification.message}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              {config && (
                                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${iconColor} border-current/30`}>
                                  {config.label}
                                </Badge>
                              )}
                              {sourceConfig && SourceIcon && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-1">
                                  <SourceIcon className="h-3 w-3" />
                                  {sourceName || sourceConfig.label}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            {(notification.metadata?.brokenDescription || notification.metadata?.impactDescription) && (
                              <div className="mt-2 space-y-1">
                                {notification.metadata.brokenDescription && (
                                  <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-900">
                                    <p className="text-[11px] text-red-700 dark:text-red-300">
                                      <span className="font-medium">Issue resolved:</span> {notification.metadata.brokenDescription}
                                    </p>
                                  </div>
                                )}
                                {notification.metadata.impactDescription && (
                                  <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-900">
                                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                                      <span className="font-medium">Impact:</span> {notification.metadata.impactDescription}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
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
                    );
                  })}
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
            className="w-[calc(100vw-1rem)] max-w-[480px] h-[85vh] max-h-[85vh] p-0 gap-0 flex flex-col"
            showHomeButton={false}
            style={{ overflow: 'hidden' }}
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
