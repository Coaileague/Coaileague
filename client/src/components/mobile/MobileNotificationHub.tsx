/**
 * Mobile Notification Hub - Fortune 500 Command Center Design
 * Matches platform dark theme with teal/cyan accents
 * Features: Alerts, Workflows, System, Trinity AI tabs
 * Status indicators for Trinity, QuickBooks, and Active Guards
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import {
  Bell,
  RefreshCw,
  CheckCheck,
  ChevronRight,
  AlertTriangle,
  ClipboardCheck,
  Settings,
  Sparkles,
  CheckCircle2,
  X,
  ExternalLink,
  Shield,
  Users,
} from "lucide-react";

type NotificationCategory = 'alerts' | 'workflows' | 'system' | 'trinity';
type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
type NotificationType = 'alert' | 'workflow' | 'system' | 'trinity';

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  detailedInfo?: string;
  issue?: string;
  solution?: string;
  fixedByTrinity?: boolean;
  time: string;
  read: boolean;
  actionType?: string;
  actionData?: any;
}

interface NotificationsData {
  userNotifications: any[];
  platformUpdates: any[];
  maintenanceAlerts?: any[];
  notifications?: any[];
  unreadCount: number;
}

interface HealthData {
  overall: string;
  services: Array<{ service: string; status: string; latency?: number }>;
}

interface ActiveGuardsData {
  count: number;
  guards: Array<{ id: string; name: string; status: string }>;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
};

const PRIORITY_GRADIENTS: Record<NotificationPriority, string> = {
  critical: 'from-red-500 to-red-600',
  high: 'from-orange-500 to-amber-500',
  medium: 'from-cyan-500 to-teal-500',
  low: 'from-emerald-500 to-green-500'
};

const normalizePriority = (priority: any): NotificationPriority => {
  if (typeof priority === 'number') {
    if (priority >= 4) return 'critical';
    if (priority >= 3) return 'high';
    if (priority >= 2) return 'medium';
    return 'low';
  }
  if (['critical', 'high', 'medium', 'low'].includes(priority)) {
    return priority;
  }
  return 'medium';
};

const getTypeIcon = (type: NotificationType) => {
  switch (type) {
    case 'alert': return <AlertTriangle className="w-4 h-4" />;
    case 'workflow': return <ClipboardCheck className="w-4 h-4" />;
    case 'system': return <Settings className="w-4 h-4" />;
    case 'trinity': return <Sparkles className="w-4 h-4" />;
    default: return <Bell className="w-4 h-4" />;
  }
};

function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
}: {
  notification: Notification | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!notification) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              PRIORITY_COLORS[notification.priority]
            )}>
              {getTypeIcon(notification.type)}
            </div>
            <span className="truncate">{notification.title}</span>
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {formatDistanceToNow(parseISO(notification.time), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-2">
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-1">Details</h4>
            <p className="text-sm text-slate-400">
              {notification.detailedInfo || notification.message}
            </p>
          </div>
          
          {notification.issue && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <h4 className="text-sm font-medium text-red-400 mb-1 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Issue Detected
              </h4>
              <p className="text-sm text-slate-300">{notification.issue}</p>
            </div>
          )}
          
          {notification.solution && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <h4 className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Solution
              </h4>
              <p className="text-sm text-slate-300">{notification.solution}</p>
            </div>
          )}
          
          {notification.fixedByTrinity && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-400">Fixed by Trinity AI</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                This issue was automatically resolved by Trinity's autonomous systems.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={onClose}
            data-testid="button-close-detail"
          >
            Close
          </Button>
          {notification.actionType && (
            <Button
              className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white"
              data-testid="button-take-action"
            >
              Take Action
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotificationCard({
  notification,
  onReadMore,
}: {
  notification: Notification;
  onReadMore: (notification: Notification) => void;
}) {
  const isUnread = !notification.read;
  
  return (
    <div
      className={cn(
        "relative p-3 transition-all duration-200",
        isUnread ? 'bg-slate-800/50' : 'bg-transparent',
        "border-b border-slate-700/30 last:border-b-0"
      )}
      data-testid={`notification-card-${notification.id}`}
    >
      {isUnread && (
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b",
          PRIORITY_GRADIENTS[notification.priority]
        )} />
      )}
      
      <div className="flex gap-3">
        <div className={cn(
          "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
          PRIORITY_COLORS[notification.priority]
        )}>
          {getTypeIcon(notification.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn(
              "font-medium text-sm truncate",
              isUnread ? 'text-white' : 'text-slate-300'
            )}>
              {notification.title}
            </h3>
            <span className="text-slate-500 text-xs whitespace-nowrap flex-shrink-0">
              {formatDistanceToNow(parseISO(notification.time), { addSuffix: false })}
            </span>
          </div>
          
          <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          
          <button
            onClick={() => onReadMore(notification)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            data-testid={`button-read-more-${notification.id}`}
          >
            Read more
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileNotificationHub() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<NotificationCategory>('alerts');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Trinity modal hook
  const trinityModal = useTrinityModal();
  
  const { data: notificationsData, isLoading, isFetching, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    refetchInterval: 30000,
  });
  
  // Show loading state during initial load or when refetching and data is stale
  const showLoading = isLoading || (isFetching && !notificationsData);
  
  const { data: healthData } = useQuery<HealthData>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 60000,
  });
  
  const { data: activeGuardsData } = useQuery<ActiveGuardsData>({
    queryKey: ['/api/employees/active-guards'],
    refetchInterval: 30000,
  });
  
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "All marked as read" });
    },
  });
  
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/notifications/clear-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      toast({ title: "All notifications cleared" });
    },
  });
  
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
  
  const handleReadMore = (notification: Notification) => {
    setSelectedNotification(notification);
    setDetailModalOpen(true);
  };
  
  const handleAskTrinity = () => {
    trinityModal?.openModal();
  };
  
  // Categorize notification based on type, actionType, and content
  const categorizeNotification = (notif: any): NotificationType => {
    // Explicit type checks first
    if (notif.type === 'workflow' || notif.category === 'workflow') return 'workflow';
    if (notif.type === 'ai' || notif.source === 'trinity') return 'trinity';
    if (notif.type === 'system' || notif.type === 'maintenance') return 'system';
    
    // Check actionType for workflow-related actions
    const actionType = notif.actionType || '';
    if (['approve', 'deny', 'workflow', 'shift_request', 'swap_request', 'timesheet_approval'].includes(actionType)) {
      return 'workflow';
    }
    if (['hotpatch', 'trinity_fix', 'ai_suggestion'].includes(actionType)) {
      return 'trinity';
    }
    
    // Content-based categorization (with null guards)
    const title = (notif.title || '').toLowerCase();
    const message = (notif.message || '').toLowerCase();
    
    // Workflows: approvals, requests
    if (title.includes('approval') || title.includes('timesheet') || 
        title.includes('request') || message.includes('needs approval')) {
      return 'workflow';
    }
    
    // Trinity AI: AI-generated content
    if (title.includes('trinity') || title.includes('insight') || 
        title.includes('ai-generated') || title.includes('ai schedule')) {
      return 'trinity';
    }
    
    // System: platform, maintenance, updates
    if (title.includes('maintenance') || title.includes('upgrade') || 
        title.includes('platform') || title.includes('system')) {
      return 'system';
    }
    
    // Default to alerts (shifts, schedule, settings, messages, etc.)
    return 'alert';
  };
  
  // Process notifications into proper types
  const notifications = useMemo<Notification[]>(() => {
    if (!notificationsData) return [];
    
    const result: Notification[] = [];
    
    // Process platform updates -> System tab
    notificationsData.platformUpdates?.forEach((update: any) => {
      result.push({
        id: update.id || `platform-${Date.now()}-${Math.random()}`,
        type: 'system',
        priority: normalizePriority(update.severity === 'critical' ? 'critical' : 
                  update.severity === 'warning' ? 'high' : 'medium'),
        title: update.title || 'Platform Update',
        message: update.message || update.description || '',
        detailedInfo: update.details || update.description || '',
        time: update.createdAt || new Date().toISOString(),
        read: update.isViewed || false,
      });
    });
    
    // Process maintenance alerts -> System tab with proper severity mapping
    notificationsData.maintenanceAlerts?.forEach((alert: any) => {
      // Map severity properly - severity can be numeric or string
      let priority: NotificationPriority = 'high';
      const sev = alert.severity ?? alert.priority;
      if (typeof sev === 'number') {
        priority = normalizePriority(sev);
      } else if (sev === 'critical') {
        priority = 'critical';
      } else if (sev === 'warning' || sev === 'high') {
        priority = 'high';
      } else {
        priority = 'medium';
      }
      
      result.push({
        id: alert.id || `maintenance-${Date.now()}-${Math.random()}`,
        type: 'system',
        priority,
        title: alert.title || 'Maintenance Alert',
        message: alert.message || alert.description || '',
        detailedInfo: alert.details || alert.description || '',
        time: alert.createdAt || new Date().toISOString(),
        read: alert.isAcknowledged || false,
      });
    });
    
    // Process user notifications - prefer 'notifications' array, fallback to 'userNotifications'
    // Avoid merging both to prevent duplicates
    const userNotifs = notificationsData.notifications?.length 
      ? notificationsData.notifications 
      : (notificationsData.userNotifications || []);
    
    // Dedupe by id using a Set
    const seenIds = new Set<string>(result.map(r => r.id));
    
    userNotifs.forEach((notif: any) => {
      const id = notif.id || `notif-${Date.now()}-${Math.random()}`;
      if (seenIds.has(id)) return; // Skip duplicates
      seenIds.add(id);
      const type = categorizeNotification(notif);
      
      result.push({
        id,
        type,
        priority: normalizePriority(notif.priority),
        title: notif.title || 'Notification',
        message: notif.message || notif.body || '',
        detailedInfo: notif.details || notif.message || '',
        issue: notif.issue,
        solution: notif.solution,
        fixedByTrinity: notif.fixedByTrinity || notif.source === 'trinity',
        time: notif.createdAt || new Date().toISOString(),
        read: notif.isRead || notif.read || false,
        actionType: notif.actionType,
        actionData: notif.actionData,
      });
    });
    
    return result.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [notificationsData]);
  
  // Filter by active tab
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      switch (activeTab) {
        case 'alerts': return n.type === 'alert';
        case 'workflows': return n.type === 'workflow';
        case 'system': return n.type === 'system';
        case 'trinity': return n.type === 'trinity';
        default: return true;
      }
    });
  }, [notifications, activeTab]);
  
  // Tab counts
  const tabCounts = useMemo(() => ({
    alerts: notifications.filter(n => n.type === 'alert').length,
    workflows: notifications.filter(n => n.type === 'workflow').length,
    system: notifications.filter(n => n.type === 'system').length,
    trinity: notifications.filter(n => n.type === 'trinity').length,
  }), [notifications]);
  
  // Status indicators - Trinity status with proper color mapping
  const trinityStatus = useMemo(() => {
    if (!healthData) return 'loading';
    const overall = healthData.overall?.toLowerCase() || '';
    if (overall === 'operational' || overall === 'healthy') return 'online';
    if (overall === 'degraded' || overall === 'slow') return 'busy';
    if (overall === 'down' || overall === 'offline' || overall === 'error') return 'offline';
    // Default to offline for unknown states (safety)
    return 'offline';
  }, [healthData]);
  
  const qbStatus = useMemo(() => {
    const qbService = healthData?.services?.find(s => s.service === 'quickbooks');
    if (!qbService) return 'unknown';
    return qbService.status === 'operational' ? 'synced' : 'error';
  }, [healthData]);
  
  const activeGuards = activeGuardsData?.count ?? 0;
  
  const unreadCount = notifications.filter(n => !n.read).length;
  
  const tabs: { id: NotificationCategory; label: string; count: number }[] = [
    { id: 'alerts', label: 'Alerts', count: tabCounts.alerts },
    { id: 'workflows', label: 'Workflows', count: tabCounts.workflows },
    { id: 'system', label: 'System', count: tabCounts.system },
    { id: 'trinity', label: 'Trinity AI', count: tabCounts.trinity },
  ];
  
  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header - Fortune 500 Dark Theme */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "absolute inset-0 rounded-full blur-md",
                unreadCount > 0 ? 'bg-cyan-500/30 animate-pulse' : 'bg-slate-700/30'
              )} />
              <div className="relative bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full p-2.5">
                <Bell className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight">Command Center</h2>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400 text-xs font-medium">Live &bull; Real-time sync</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={handleRefresh}
              disabled={isRefreshing}
              data-testid="button-sync-notifications"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && 'animate-spin')} />
            </Button>
            {unreadCount > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={() => markAllReadMutation.mutate()}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="w-4 h-4" />
              </Button>
            )}
            <div className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center">
              {unreadCount}
            </div>
          </div>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className={cn(
              "w-2 h-2 rounded-full",
              trinityStatus === 'online' ? 'bg-emerald-400' :
              trinityStatus === 'busy' ? 'bg-orange-400 animate-pulse' :
              trinityStatus === 'loading' ? 'bg-slate-400' : 'bg-red-400'
            )} />
            <span className="text-slate-300 text-xs font-medium">Trinity Online</span>
          </div>
          
          <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1.5">
            <span className={cn(
              "w-2 h-2 rounded-full",
              qbStatus === 'synced' ? 'bg-emerald-400' :
              qbStatus === 'error' ? 'bg-red-400' : 'bg-orange-400'
            )} />
            <span className="text-slate-300 text-xs font-medium">QB Synced</span>
          </div>
          
          <div className="flex items-center gap-1.5 bg-slate-800/80 backdrop-blur-sm rounded-full px-3 py-1.5">
            <Users className="w-3 h-3 text-purple-400" />
            <span className="text-slate-300 text-xs font-medium">{activeGuards} Guards Active</span>
          </div>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className="border-b border-slate-700/50 bg-slate-900/95">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200 min-h-[44px]",
                activeTab === tab.id
                  ? 'text-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}
              data-testid={`tab-${tab.id}`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-slate-700 text-slate-400'
                )}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500" />
              )}
            </button>
          ))}
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30 border-b border-slate-700/30">
        <span className="text-slate-500 text-xs font-medium">
          {filteredNotifications.length} {filteredNotifications.length === 1 ? 'item' : 'items'}
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700/50 min-h-[32px]"
            data-testid="button-mark-read-action"
          >
            Mark all read
          </button>
          <button 
            onClick={() => clearAllMutation.mutate()}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700/50 min-h-[32px]"
            data-testid="button-clear-all"
          >
            Clear all
          </button>
        </div>
      </div>
      
      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {showLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="w-9 h-9 rounded-lg bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-slate-700" />
                  <Skeleton className="h-3 w-1/2 bg-slate-700" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div>
            {filteredNotifications.map(notification => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onReadMore={handleReadMore}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-slate-300 font-medium text-lg">
              No {activeTab === 'alerts' ? 'alerts' : 
                  activeTab === 'workflows' ? 'workflows' : 
                  activeTab === 'system' ? 'system updates' : 'Trinity messages'}
            </h3>
            <p className="text-slate-500 text-sm text-center mt-1">
              {activeTab === 'alerts' ? 'No schedule, shift, or employee alerts at this time' :
               activeTab === 'workflows' ? 'No pending AI automation approvals' :
               activeTab === 'system' ? 'All systems running smoothly' :
               'Trinity AI has no new insights or messages'}
            </p>
          </div>
        )}
      </div>
      
      {/* Ask Trinity AI Footer */}
      <div className="p-4 border-t border-slate-700/50 bg-slate-800/50 safe-area-bottom">
        <button
          onClick={handleAskTrinity}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25 min-h-[48px]"
          data-testid="button-ask-trinity"
        >
          <Sparkles className="w-5 h-5" />
          <span>Ask Trinity AI</span>
        </button>
        <p className="text-center text-slate-500 text-xs mt-2">
          Powered by Trinity &bull; Response time: ~2s
        </p>
      </div>
      
      {/* Notification Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
      />
    </div>
  );
}
