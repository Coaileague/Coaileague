import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Bell, AlertTriangle, Info, Wrench, Check, Clock, X, Sparkles, MessageSquare,
  Bot, Code, Zap, Settings, Users, Globe, FileText, Shield, TrendingUp, 
  Server, Layout, Database, CreditCard, Calendar, RefreshCw, XCircle, 
  CheckCircle, DollarSign, type LucideIcon
} from "lucide-react";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedNotificationBell } from "./animated-notification-bell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { useTrinityContext } from "@/hooks/use-trinity-context";
import { 
  SEVERITY_CONFIG, 
  CATEGORY_CONFIG, 
  getSeverityConfig, 
  getCategoryConfig,
  getNotificationTab,
  getCategoriesForTab
} from "@shared/config/notificationConfig";

const ICON_MAP: Record<string, LucideIcon> = {
  Info, AlertTriangle, Wrench, Check, Sparkles, MessageSquare,
  Bot, Code, Zap, Settings, Users, Globe, FileText, Shield, 
  TrendingUp, Server, Layout, Database, CreditCard, Calendar, 
  RefreshCw, XCircle, CheckCircle, DollarSign, Clock, Bell, X
};

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
  // Guru mode quick fix action
  quickFixCode?: string;
  quickFixLabel?: string;
  quickFixTargetId?: string;
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
    // Guru mode quick fix action
    quickFixCode?: string;
    quickFixLabel?: string;
    quickFixTargetId?: string;
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

function getIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Info;
}

function getSeverityStyles(severity: string) {
  const config = getSeverityConfig(severity);
  return {
    icon: getIconComponent(config.iconName),
    color: config.color,
    bg: config.bg,
    badge: config.badge,
  };
}

function getCategoryStyles(category: string) {
  const config = getCategoryConfig(category);
  return {
    icon: getIconComponent(config.iconName),
    color: config.color,
    label: config.label,
  };
}

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

function safeFormatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return "";
  
  try {
    let date: Date;
    
    if (timestamp.includes('T') || timestamp.includes('Z') || timestamp.includes('+')) {
      date = parseISO(timestamp);
    } else {
      date = new Date(timestamp + 'Z');
    }
    
    if (!isValid(date) || date.getTime() > Date.now() + 86400000) {
      return "recently";
    }
    
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "recently";
  }
}

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
  
  // Trinity context for Guru mode detection - enables push action buttons
  const { context: trinityContext } = useTrinityContext(workspaceId);
  const isGuruMode = trinityContext?.trinityMode === 'guru';
  
  // Connect to WebSocket for real-time notification updates
  // This syncs notifications in real-time and updates the cache directly
  const { isConnected } = useNotificationWebSocket(userId, workspaceId);

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

  // Fetch onboarding digest with Trinity welcome for new users
  const { data: onboardingDigest } = useQuery<{
    success: boolean;
    trinityWelcome: { greeting: string; message: string; tip: string };
    recentWhatsNew: Array<{ id: string; title: string; description: string; category: string; createdAt: string }>;
    recentSystemUpdates: Array<{ id: string; title: string; description: string; category: string; createdAt: string }>;
    isFirstLogin: boolean;
  }>({
    queryKey: ["/api/notifications/onboarding-digest"],
    enabled: !!user,
    staleTime: 300000, // 5 minutes - welcome message doesn't change often
  });

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
      // Refresh data when popover opens - but don't reset scroll position
      refetch();
      hasOpenedRef.current = true;
    } else {
      // Reset the flag when popover closes
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

  const markUpdateAsViewedMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const response = await apiRequest("POST", `/api/platform-updates/${updateId}/mark-viewed`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      refetch();
    },
    onError: (error) => {
      console.error('[Notifications] Error marking update as viewed:', error);
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

  // Data extraction and filtering - must be defined before toggle functions
  const rawPlatformUpdates = data?.platformUpdates || [];
  const rawMaintenanceAlerts = data?.maintenanceAlerts || [];
  const rawNotifications = data?.notifications || [];
  
  // Keep all platform updates for display (viewed ones are dimmed, not hidden)
  // Only filter out viewed updates for the "unviewed" count/selection
  const filteredPlatformUpdates = rawPlatformUpdates;
  const filteredMaintenanceAlerts = rawMaintenanceAlerts;
  
  // Use configuration-driven tab routing for categorization
  // Filter platform updates for System tab (system categories via config)
  const systemPlatformUpdates = rawPlatformUpdates.filter((u: PlatformUpdate) => 
    getNotificationTab(u.category) === 'system'
  );
  
  // Filter platform updates for What's New tab (whats_new categories via config)
  const whatsNewPlatformUpdates = rawPlatformUpdates.filter((u: PlatformUpdate) => 
    getNotificationTab(u.category) === 'whats_new'
  );
  
  // Filter to only show unread/uncleared notifications
  const filteredNotifications = rawNotifications.filter((n: any) => !n.isRead && !n.clearedAt);
  
  // unviewedUpdates for selection/acknowledge - only unviewed What's New items
  const unviewedUpdates = whatsNewPlatformUpdates.filter(u => !u.isViewed);
  
  // SIMPLIFIED: Server is the single source of truth for all counts
  // This eliminates race conditions between WebSocket state and server state
  const unreadPlatformUpdates = data?.unreadPlatformUpdates ?? 0;
  const unreadNotifications = data?.unreadNotifications ?? 0;
  const unreadAlerts = data?.unreadAlerts ?? 0;
  const totalUnread = data?.totalUnread ?? 0;

  const allUnviewedSelected = unviewedUpdates.length > 0 && selectedIds.size === unviewedUpdates.length;

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
    if (selectedIds.size === unviewedUpdates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unviewedUpdates.map(u => u.id)));
    }
  };

  // Tab-specific clear mutation
  const clearTabMutation = useMutation({
    mutationFn: async (tab: 'updates' | 'notifications' | 'maintenance') => {
      const response = await apiRequest("POST", `/api/notifications/clear-tab/${tab}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whats-new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/onboarding-digest"] });
      // Invalidate Trinity context so mascot gets fresh notification counts
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
    },
    onError: (err) => {
      console.error('[Clear Tab] Error:', err);
    },
  });

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
      
      // Immediately signal WebSocket hook to reset its count for instant UI feedback
      window.dispatchEvent(new CustomEvent('notifications_clear_optimistic', { 
        detail: { source: 'clear_all_mutation' } 
      }));
      
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
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/onboarding-digest"] });
      // Invalidate Trinity context so mascot gets fresh notification counts instantly
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
    },
    onError: (err, _, context) => {
      console.error('[Clear All] Error:', err);
      if (context?.previousData) {
        queryClient.setQueryData(["/api/notifications/combined"], context.previousData);
      }
    },
  });

  // Guru mode: Execute quick fix action for platform issues
  const quickFixMutation = useMutation({
    mutationFn: async (params: { actionCode: string; targetId?: string; metadata?: Record<string, any> }) => {
      const response = await apiRequest("POST", "/api/quick-fix/execute", {
        actionCode: params.actionCode,
        targetId: params.targetId,
        metadata: params.metadata,
        deviceType: isMobile ? 'mobile' : 'desktop',
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Refresh all notification data after fix
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
      }
    },
    onError: (err) => {
      console.error('[QuickFix] Error executing action:', err);
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <div className="shrink-0 bg-background border-b">
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
                  {(unreadAlerts + systemPlatformUpdates.filter(u => !u.isViewed).length) > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {(unreadAlerts + systemPlatformUpdates.filter(u => !u.isViewed).length) > 9 ? '9+' : (unreadAlerts + systemPlatformUpdates.filter(u => !u.isViewed).length)}
                    </span>
                  )}
                </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea 
            className="flex-1 min-h-0"
            style={{ 
              height: isMobile ? 'calc(85vh - 200px)' : '400px',
            }}
          >
            <div ref={scrollRef}>
            <TabsContent value="updates" className="mt-0 focus-visible:outline-none" forceMount={activeTab === 'updates' ? true : undefined}>
              {unviewedUpdates.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between border-b bg-muted/30">
                  <div className="flex items-center gap-3">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => clearTabMutation.mutate('updates')}
                    disabled={clearTabMutation.isPending}
                    data-testid="button-clear-updates-tab"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              )}
              {unviewedUpdates.length > 0 ? (
                <div className="divide-y">
                  {unviewedUpdates.map((update) => {
                    const detailedCat = update.metadata?.detailedCategory || update.category;
                    const config = getCategoryStyles(detailedCat);
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
                              {update.metadata?.endUserSummary || update.description || 'A platform update was made to improve your experience.'}
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
                                {safeFormatTimestamp(update.createdAt)}
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
              {filteredNotifications.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between border-b bg-muted/30">
                  <span className="text-xs text-muted-foreground">
                    {filteredNotifications.filter(n => !n.isRead).length} unread alerts
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => clearTabMutation.mutate('notifications')}
                    disabled={clearTabMutation.isPending}
                    data-testid="button-clear-notifications-tab"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              )}
              {filteredNotifications.length > 0 ? (
                <div className="divide-y">
                  {filteredNotifications.map((notification) => {
                    const detailedCat = notification.metadata?.detailedCategory;
                    const config = detailedCat ? getCategoryStyles(detailedCat) : null;
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
                            <div 
                              className="text-sm text-muted-foreground leading-relaxed mb-2"
                              data-testid={`text-notification-message-${notification.id}`}
                            >
                              {notification.metadata?.endUserSummary || notification.message || 'You have a new notification.'}
                            </div>
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
                                {safeFormatTimestamp(notification.createdAt)}
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
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  {onboardingDigest?.trinityWelcome ? (
                    <div className="w-full max-w-sm">
                      <div className="relative bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 rounded-2xl p-5 border border-primary/20 shadow-sm">
                        <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg">
                          <Bot className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-primary">Trinity AI</span>
                        </div>
                        <h3 className="text-base font-bold mb-2">{onboardingDigest.trinityWelcome.greeting}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                          {onboardingDigest.trinityWelcome.message}
                        </p>
                        <div className="flex items-start gap-2 p-3 bg-background/60 rounded-lg border border-border/50">
                          <Zap className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">
                            {onboardingDigest.trinityWelcome.tip}
                          </p>
                        </div>
                      </div>
                      <p className="text-center text-xs text-muted-foreground mt-4">
                        Alerts about your account will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 mx-auto">
                        <Bell className="h-8 w-8 opacity-50" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">No notifications</span>
                      <p className="text-xs text-muted-foreground mt-1">You're all caught up!</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="maintenance" className="mt-0 focus-visible:outline-none">
              {(filteredMaintenanceAlerts.length > 0 || systemPlatformUpdates.length > 0) && (
                <div className="px-4 py-3 flex items-center justify-between border-b bg-amber-500/10">
                  <span className="text-xs text-muted-foreground">
                    {filteredMaintenanceAlerts.filter(a => !a.isAcknowledged).length + systemPlatformUpdates.filter(u => !u.isViewed).length} unread system alerts
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => clearTabMutation.mutate('maintenance')}
                    disabled={clearTabMutation.isPending}
                    data-testid="button-clear-maintenance-tab"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                </div>
              )}
              {(filteredMaintenanceAlerts.length > 0 || systemPlatformUpdates.length > 0) ? (
                <div className="divide-y">
                  {systemPlatformUpdates.map((update) => {
                    const catStyles = getCategoryStyles(update.category);
                    const CategoryIcon = catStyles.icon;
                    return (
                      <div
                        key={update.id}
                        className={`px-4 py-4 ${update.isViewed ? 'opacity-60' : 'bg-primary/5'}`}
                        data-testid={`system-update-${update.id}`}
                      >
                        <div className="flex gap-3">
                          <div className={`shrink-0 ${catStyles.color} mt-0.5`}>
                            <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center">
                              <CategoryIcon className="h-4 w-4" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-medium text-sm leading-tight">{update.title}</span>
                              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-medium shrink-0">
                                {catStyles.label}
                              </Badge>
                            </div>
                            <div 
                              className="text-sm text-muted-foreground leading-relaxed mb-2 max-h-20 overflow-y-auto overscroll-contain"
                              data-testid={`text-system-update-message-${update.id}`}
                            >
                              {update.metadata?.endUserSummary || update.description || 'A system update was made.'}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{safeFormatTimestamp(update.createdAt)}</span>
                            </div>
                          </div>
                          {!update.isViewed ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                markUpdateAsViewedMutation.mutate(update.id);
                              }}
                              disabled={markUpdateAsViewedMutation.isPending}
                              data-testid={`button-dismiss-system-${update.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {filteredMaintenanceAlerts.map((alert) => {
                    const config = getSeverityStyles(alert.severity);
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
                            <div 
                              className="text-sm text-muted-foreground leading-relaxed mb-2 max-h-20 overflow-y-auto overscroll-contain"
                              data-testid={`text-alert-message-${alert.id}`}
                            >
                              {alert.description || 'A maintenance alert has been scheduled.'}
                            </div>
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
                          <div className="flex flex-col gap-1 shrink-0">
                            {/* Guru mode: Quick fix button for actionable alerts */}
                            {isGuruMode && alert.quickFixCode && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 px-2 text-xs bg-primary hover:bg-primary/90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickFixMutation.mutate({
                                    actionCode: alert.quickFixCode!,
                                    targetId: alert.quickFixTargetId || alert.id,
                                    metadata: { alertId: alert.id, source: 'notification_popover' }
                                  });
                                }}
                                disabled={quickFixMutation.isPending}
                                data-testid={`button-quickfix-${alert.id}`}
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                {alert.quickFixLabel || 'Fix Now'}
                              </Button>
                            )}
                            {!alert.isAcknowledged && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-background/50"
                                onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                                disabled={acknowledgeAlertMutation.isPending}
                                data-testid={`button-acknowledge-${alert.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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
            </div>
          </ScrollArea>
        </Tabs>
      )}

      <div className="border-t bg-muted/20 shrink-0">
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
            className="w-[calc(100vw-1rem)] max-w-[480px] h-[90vh] max-h-[90vh] p-0 gap-0 flex flex-col rounded-xl"
            showHomeButton={false}
            style={{ 
              overflow: 'hidden',
              maxWidth: 'calc(100vw - 1rem)',
            }}
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
        className="w-[480px] max-w-[calc(100vw-2rem)] max-h-[80vh] p-0 overflow-hidden shadow-xl border-muted flex flex-col" 
        align="end"
        sideOffset={8}
      >
        <NotificationsContent />
      </PopoverContent>
    </Popover>
  );
}
