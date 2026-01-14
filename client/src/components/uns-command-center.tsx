import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Bell, AlertTriangle, Workflow, Settings2, Sparkles, 
  Check, X, ChevronRight, MapPin, Clock, FileText,
  Users, Shield, Zap, RefreshCw
} from "lucide-react";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { useTrinityContext } from "@/hooks/use-trinity-context";
import { cn } from "@/lib/utils";

type NotificationCategory = 'all' | 'alerts' | 'workflows' | 'system' | 'ai';
type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
type NotificationType = 'alert' | 'workflow' | 'system' | 'ai';

interface UNSNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  time: string;
  read: boolean;
  action?: {
    label: string;
    type: string;
    target?: string;
  };
  metadata?: {
    employeeName?: string;
    distance?: string;
    count?: number;
    warnings?: number;
    endUserSummary?: string;
  };
}

interface UNSCommandCenterProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: 'from-red-500 to-red-600',
  high: 'from-orange-500 to-amber-500',
  medium: 'from-blue-500 to-cyan-500',
  low: 'from-emerald-500 to-green-500'
};

const PRIORITY_BADGE_COLORS: Record<NotificationPriority, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
};

const TYPE_ICONS: Record<NotificationType, typeof AlertTriangle> = {
  alert: AlertTriangle,
  workflow: FileText,
  system: Settings2,
  ai: Sparkles
};

export function UNSCommandCenter({ isOpen = true, onClose, className }: UNSCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all');
  const [pulseActive, setPulseActive] = useState(true);
  const trinityContext = useTrinityContext();
  
  const { data: notificationsData, isLoading, refetch } = useQuery<{
    platformUpdates: any[];
    maintenanceAlerts: any[];
    notifications: any[];
    totalUnread: number;
  }>({
    queryKey: ['/api/notifications/combined'],
    refetchInterval: 30000,
  });

  const { data: healthData } = useQuery<{
    overall: string;
    services: Array<{ name: string; status: string }>;
  }>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 60000,
  });

  const { data: trinityStatus } = useQuery<{ status: string; activeAgents?: number }>({
    queryKey: ['/api/trinity/status'],
  });

  useNotificationWebSocket({
    onNotification: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseActive(prev => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const notifications = useMemo<UNSNotification[]>(() => {
    if (!notificationsData) return [];
    
    const result: UNSNotification[] = [];
    
    notificationsData.platformUpdates?.forEach((update: any) => {
      result.push({
        id: update.id || `platform-${Date.now()}-${Math.random()}`,
        type: 'system',
        priority: update.severity === 'critical' ? 'critical' : 
                  update.severity === 'warning' ? 'high' : 'medium',
        title: update.title || 'Platform Update',
        message: update.message || update.description || '',
        time: update.createdAt || new Date().toISOString(),
        read: update.isViewed || false,
        action: update.actionUrl ? { label: 'View', type: 'navigate', target: update.actionUrl } : undefined
      });
    });

    notificationsData.maintenanceAlerts?.forEach((alert: any) => {
      result.push({
        id: alert.id || `maintenance-${Date.now()}-${Math.random()}`,
        type: 'alert',
        priority: alert.priority === 'critical' ? 'critical' : 
                  alert.priority === 'high' ? 'high' : 'medium',
        title: alert.title || 'Maintenance Alert',
        message: alert.message || alert.description || '',
        time: alert.createdAt || new Date().toISOString(),
        read: alert.isAcknowledged || false,
      });
    });

    notificationsData.notifications?.forEach((notif: any) => {
      const isWorkflow = notif.type === 'workflow' || notif.category === 'workflow' || 
                         notif.title?.toLowerCase().includes('approval') ||
                         notif.title?.toLowerCase().includes('timesheet');
      const isAI = notif.type === 'ai' || notif.source === 'trinity' || 
                   notif.title?.toLowerCase().includes('trinity') ||
                   notif.title?.toLowerCase().includes('insight');
      const isAlert = notif.type === 'alert' || notif.priority === 'critical' ||
                      notif.title?.toLowerCase().includes('gps') ||
                      notif.title?.toLowerCase().includes('failed');
      
      result.push({
        id: notif.id || `notif-${Date.now()}-${Math.random()}`,
        type: isAI ? 'ai' : isWorkflow ? 'workflow' : isAlert ? 'alert' : 'system',
        priority: notif.priority || 'medium',
        title: notif.title || 'Notification',
        message: notif.message || notif.body || '',
        time: notif.createdAt || new Date().toISOString(),
        read: notif.isRead || notif.clearedAt != null,
        action: notif.actionUrl ? { label: 'View', type: 'navigate', target: notif.actionUrl } : undefined,
        metadata: notif.metadata
      });
    });

    return result.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });
  }, [notificationsData]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'alerts') return notifications.filter(n => n.type === 'alert' || n.priority === 'critical');
    if (activeTab === 'workflows') return notifications.filter(n => n.type === 'workflow');
    if (activeTab === 'system') return notifications.filter(n => n.type === 'system');
    if (activeTab === 'ai') return notifications.filter(n => n.type === 'ai');
    return notifications;
  }, [notifications, activeTab]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const criticalCount = notifications.filter(n => n.priority === 'critical').length;
  const alertsCount = notifications.filter(n => n.type === 'alert').length;
  const workflowsCount = notifications.filter(n => n.type === 'workflow').length;
  const systemCount = notifications.filter(n => n.type === 'system').length;
  const aiCount = notifications.filter(n => n.type === 'ai').length;

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest('/api/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest('/api/notifications/clear-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  const formatTime = (timeStr: string) => {
    try {
      const date = parseISO(timeStr);
      if (!isValid(date)) return 'Just now';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  const trinityOnline = trinityStatus?.status === 'operational' || healthData?.overall === 'operational';
  const qbSynced = healthData?.services?.some(s => s.name === 'quickbooks' && s.status === 'operational');
  const activeGuards = trinityStatus?.activeAgents || 0;

  const tabs = [
    { id: 'all' as const, label: 'All', count: notifications.length },
    { id: 'alerts' as const, label: 'Alerts', count: alertsCount, pulse: criticalCount > 0 },
    { id: 'workflows' as const, label: 'Workflows', count: workflowsCount },
    { id: 'system' as const, label: 'System', count: systemCount },
    { id: 'ai' as const, label: 'Trinity AI', count: aiCount }
  ];

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden",
        className
      )}
      data-testid="uns-command-center"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-cyan-600/10" />
      
      <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-4">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />
        </div>
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "absolute inset-0 bg-white/30 rounded-full blur-md",
                pulseActive && unreadCount > 0 && "animate-ping"
              )} />
              <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-2.5">
                <Bell className="w-6 h-6 text-white" />
              </div>
            </div>
            
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight">Command Center</h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  pulseActive ? "bg-emerald-400" : "bg-emerald-500",
                  "animate-pulse"
                )} />
                <span className="text-blue-100 text-xs font-medium">Live • Real-time sync</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                {criticalCount} Critical
              </div>
            )}
            <div className="bg-white/20 backdrop-blur-sm text-white text-lg font-bold w-10 h-10 rounded-full flex items-center justify-center border border-white/30">
              {unreadCount}
            </div>
            {onClose && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onClose}
                className="text-white/70 hover:text-white hover:bg-white/10"
                data-testid="button-close-command-center"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        <div className="relative mt-4 flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              trinityOnline ? "bg-emerald-400" : "bg-red-400"
            )} />
            <span className="text-white/90">Trinity {trinityOnline ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              qbSynced ? "bg-blue-400" : "bg-yellow-400"
            )} />
            <span className="text-white/90">QB {qbSynced ? 'Synced' : 'Pending'}</span>
          </div>
          {activeGuards > 0 && (
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-white/90">{activeGuards} Active</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="ml-auto text-white/70 hover:text-white hover:bg-white/10 h-7 px-2"
            data-testid="button-refresh-notifications"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="relative border-b border-slate-700/50">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200",
                activeTab === tab.id
                  ? "text-blue-400"
                  : "text-slate-400 hover:text-slate-200"
              )}
              data-testid={`tab-${tab.id}`}
            >
              {tab.pulse && pulseActive && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping" />
              )}
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-slate-700 text-slate-400"
                )}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex items-center justify-between px-4 py-2 bg-slate-800/30 border-b border-slate-700/30">
        <span className="text-slate-500 text-xs font-medium">
          {filteredNotifications.length} {filteredNotifications.length === 1 ? 'item' : 'items'}
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700/50"
            data-testid="button-mark-all-read"
          >
            Mark all read
          </button>
          <button 
            onClick={() => clearAllMutation.mutate()}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700/50"
            data-testid="button-clear-all"
          >
            Clear all
          </button>
        </div>
      </div>

      <ScrollArea className="relative h-96">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="text-slate-400 text-sm">Loading notifications...</span>
            </div>
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-700/30">
            {filteredNotifications.map((notification, index) => {
              const Icon = TYPE_ICONS[notification.type];
              return (
                <div
                  key={notification.id}
                  className={cn(
                    "relative p-4 hover:bg-slate-700/30 transition-all duration-200 cursor-pointer group",
                    !notification.read && "bg-slate-700/20"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                  data-testid={`notification-item-${notification.id}`}
                >
                  {!notification.read && (
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b",
                      PRIORITY_COLORS[notification.priority]
                    )} />
                  )}
                  
                  <div className="flex gap-3">
                    <div className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                      PRIORITY_COLORS[notification.priority]
                    )}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-white font-semibold text-sm truncate">
                              {notification.title}
                            </h4>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] px-1.5 py-0 h-4 border",
                                PRIORITY_BADGE_COLORS[notification.priority]
                              )}
                            >
                              {notification.priority}
                            </Badge>
                          </div>
                          <p className="text-slate-400 text-xs line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        <span className="text-slate-500 text-[10px] whitespace-nowrap flex-shrink-0">
                          {formatTime(notification.time)}
                        </span>
                      </div>
                      
                      {notification.action && (
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={notification.priority === 'critical' ? 'default' : 'secondary'}
                            className="h-7 text-xs"
                            data-testid={`button-action-${notification.id}`}
                          >
                            {notification.action.label}
                            <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Bell className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No notifications</p>
            <p className="text-xs mt-1">You're all caught up!</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default UNSCommandCenter;
