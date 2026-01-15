import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, ExternalLink, Check, X, Trash2, GripHorizontal } from "lucide-react";

type NotificationCategory = 'all' | 'alerts' | 'workflows' | 'system' | 'ai';
type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
type NotificationType = 'alert' | 'workflow' | 'system' | 'ai';

interface UNSNotification {
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

// Compact Notification Detail Modal with Acknowledge/Clear Actions
function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onNavigate,
  onAcknowledge,
  onClear,
}: {
  notification: UNSNotification | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onAcknowledge: (id: string) => void;
  onClear: (id: string) => void;
}) {
  if (!notification) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-foreground max-w-md w-[85vw] sm:w-[400px] max-h-[80vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-start gap-3">
            <div className={cn(
              "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
              notification.priority === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
              notification.priority === 'high' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
              notification.priority === 'medium' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' : 
              'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400'
            )}>
              {getTypeIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-foreground text-base font-bold leading-tight">{notification.title}</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs mt-1 flex items-center gap-2">
                {formatDistanceToNow(parseISO(notification.time), { addSuffix: true })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="p-4 space-y-4">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn(
              "capitalize text-xs font-semibold",
              notification.priority === 'critical' ? 'bg-red-600 text-white' :
              notification.priority === 'high' ? 'bg-orange-500 text-white' :
              notification.priority === 'medium' ? 'bg-[#06b6d4] text-white' :
              'bg-[#2dd4bf] text-white'
            )}>
              {notification.priority}
            </Badge>
            <Badge variant="outline" className="capitalize text-xs">
              {notification.type}
            </Badge>
            {notification.read && (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-600">
                Archived
              </Badge>
            )}
          </div>
          
          {/* Message */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <p className="text-foreground text-sm leading-relaxed">{notification.message}</p>
          </div>
          
          {/* Detailed Info (compact) */}
          {notification.detailedInfo && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-1">Details</h4>
              <p className="text-foreground text-sm">{notification.detailedInfo}</p>
            </div>
          )}
          
          {/* Trinity Resolution */}
          {notification.fixedByTrinity && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 border border-cyan-200 dark:border-cyan-700">
              <Sparkles className="w-5 h-5 text-[#06b6d4]" />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">Resolved by Trinity AI</span>
              </div>
              <CheckCircle2 className="w-5 h-5 text-[#2dd4bf]" />
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            {notification.action && (
              <Button 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (notification.action?.target) {
                    onClose();
                    onNavigate(notification.action.target);
                  }
                }}
                data-testid="button-notification-action"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                {notification.action.label}
              </Button>
            )}
            <Button 
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge(notification.id);
                onClose();
              }}
              data-testid="button-acknowledge-notification"
            >
              <Check className="w-4 h-4 mr-1" />
              Acknowledge
            </Button>
            <Button 
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onClear(notification.id);
                onClose();
              }}
              data-testid="button-clear-notification"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Platform roles from schema - these are global platform-level roles
type PlatformRole = 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'none';
// Workspace roles - tenant-level roles within an organization
type WorkspaceRole = 'org_owner' | 'co_owner' | 'org_admin' | 'manager' | 'department_manager' | 'supervisor' | 'staff';

interface UNSCommandCenterProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  onAskTrinity?: () => void;
  platformRole?: PlatformRole | string;
  workspaceRole?: WorkspaceRole | string;
}

const normalizePriority = (priority: any): NotificationPriority => {
  if (typeof priority === 'number') {
    if (priority >= 4) return 'critical';
    if (priority >= 3) return 'high';
    if (priority >= 2) return 'medium';
    return 'low';
  }
  if (priority === 'critical' || priority === 'high' || priority === 'medium' || priority === 'low') {
    return priority;
  }
  return 'medium';
};

const PRIORITY_BG: Record<NotificationPriority, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30',
  high: 'bg-orange-100 dark:bg-orange-900/30',
  medium: 'bg-cyan-100 dark:bg-cyan-900/30',
  low: 'bg-teal-100 dark:bg-teal-900/30'
};

const PRIORITY_TEXT: Record<NotificationPriority, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-[#06b6d4]',
  low: 'text-[#2dd4bf]'
};

const PRIORITY_BORDER: Record<NotificationPriority, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-[#06b6d4]',
  low: 'border-l-[#2dd4bf]'
};

const AlertIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const WorkflowIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const SystemIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const getTypeIcon = (type: NotificationType) => {
  switch (type) {
    case 'alert': return <AlertIcon />;
    case 'workflow': return <WorkflowIcon />;
    case 'system': return <SystemIcon />;
    case 'ai': return <AIIcon />;
    default: return <SystemIcon />;
  }
};

// Platform support roles that see all notifications
const PLATFORM_SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
// Workspace management roles that see business notifications
const WORKSPACE_MANAGEMENT_ROLES = ['org_owner', 'co_owner', 'org_admin', 'manager', 'department_manager', 'supervisor'];

// Role-based notification filtering
const getRoleBasedNotificationFilter = (
  platformRole: string | undefined,
  workspaceRole: string | undefined
): ((notification: UNSNotification) => boolean) => {
  if (platformRole && PLATFORM_SUPPORT_ROLES.includes(platformRole)) {
    return () => true;
  }
  if (workspaceRole && WORKSPACE_MANAGEMENT_ROLES.includes(workspaceRole)) {
    return () => true;
  }
  return (n) => {
    const title = n.title?.toLowerCase() || '';
    const message = n.message?.toLowerCase() || '';
    if (title.includes('shift') || message.includes('shift')) return true;
    if (title.includes('schedule') || message.includes('schedule')) return true;
    if (title.includes('time') || title.includes('clock')) return true;
    if (n.metadata?.employeeName) return true;
    if (title.includes('document') || title.includes('handbook')) return true;
    if (n.priority === 'critical') return true;
    if (n.type === 'workflow' && (title.includes('approval') || title.includes('payroll'))) return false;
    if (n.type === 'system' && title.includes('maintenance')) return false;
    if (n.type !== 'workflow' && n.type !== 'system') return true;
    return false;
  };
};

export function UNSCommandCenter({ isOpen = true, onClose, className, onAskTrinity, platformRole, workspaceRole }: UNSCommandCenterProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all');
  const [pulseActive, setPulseActive] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<UNSNotification | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);
  
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  }, [isDragging]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const { data: notificationsData, isLoading } = useQuery<{
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
    services: Array<{ service: string; status: string }>;
  }>({
    queryKey: ['/api/health/summary'],
    refetchInterval: 60000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/notifications/clear-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  // Single notification acknowledge
  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('POST', `/api/notifications/${id}/mark-read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    }
  });

  // Single notification clear/delete
  const clearMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/notifications/${id}`);
    },
    onSuccess: () => {
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
        priority: normalizePriority(update.severity === 'critical' ? 'critical' : 
                  update.severity === 'warning' ? 'high' : 'medium'),
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
        priority: normalizePriority(alert.priority),
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
        priority: normalizePriority(notif.priority),
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

  const roleFilter = getRoleBasedNotificationFilter(platformRole, workspaceRole);
  const roleFilteredNotifications = notifications.filter(roleFilter);
  
  const unreadCount = roleFilteredNotifications.filter(n => !n.read).length;
  const criticalCount = roleFilteredNotifications.filter(n => n.priority === 'critical').length;

  const filteredNotifications = roleFilteredNotifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'alerts') return n.type === 'alert' || n.priority === 'critical';
    if (activeTab === 'workflows') return n.type === 'workflow';
    if (activeTab === 'system') return n.type === 'system';
    if (activeTab === 'ai') return n.type === 'ai';
    return true;
  });

  const tabs = [
    { id: 'all' as const, label: 'All', count: roleFilteredNotifications.length },
    { id: 'alerts' as const, label: 'Alerts', count: roleFilteredNotifications.filter(n => n.type === 'alert' || n.priority === 'critical').length, pulse: criticalCount > 0 },
    { id: 'workflows' as const, label: 'Tasks', count: roleFilteredNotifications.filter(n => n.type === 'workflow').length },
    { id: 'system' as const, label: 'System', count: roleFilteredNotifications.filter(n => n.type === 'system').length },
    { id: 'ai' as const, label: 'AI', count: roleFilteredNotifications.filter(n => n.type === 'ai').length }
  ];

  const formatTime = (time: string) => {
    try {
      const date = parseISO(time);
      if (isValid(date)) {
        return formatDistanceToNow(date, { addSuffix: false }) + ' ago';
      }
    } catch {}
    return time;
  };

  const { data: employeesData } = useQuery<any[]>({
    queryKey: ['/api/employees'],
  });
  const activeGuards = useMemo(() => {
    if (!employeesData) return 0;
    return employeesData.filter((e: any) => e.isActive && e.status === 'active').length;
  }, [employeesData]);

  const isQuickBooksOnline = healthData?.services?.find(s => s.service === 'quickbooks')?.status === 'operational';
  const isTrinityOnline = healthData?.overall === 'operational';

  if (!isOpen) return null;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden w-full flex flex-col",
        isDragging ? 'cursor-grabbing' : '',
        className
      )} 
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      data-testid="uns-command-center"
    >
      
      {/* Draggable Header */}
      <div 
        className="relative bg-gradient-to-r from-[#06b6d4] via-[#0891b2] to-[#22d3ee] p-4 cursor-grab select-none"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {/* Drag Handle */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-50">
          <GripHorizontal className="w-4 h-4 text-white" />
        </div>
        
        <div className="relative flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                "absolute inset-0 bg-white/30 rounded-full blur-md",
                pulseActive && unreadCount > 0 ? 'animate-ping' : ''
              )} />
              <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-2">
                <BellIcon />
              </div>
            </div>
            
            <div>
              <h2 className="text-white font-bold text-base tracking-tight">Command Center</h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse",
                  pulseActive ? 'bg-white' : 'bg-white/70'
                )} />
                <span className="text-white/90 text-xs font-medium">Live &bull; Real-time sync</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                {criticalCount} Critical
              </div>
            )}
            <div className="flex flex-col items-center">
              <div className="bg-white/20 backdrop-blur-sm text-white text-lg font-bold w-9 h-9 rounded-full flex items-center justify-center border border-white/30">
                {unreadCount}
              </div>
              <span className="text-white/70 text-[10px] mt-0.5">Unread</span>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="relative mt-3 flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", isTrinityOnline ? 'bg-white' : 'bg-red-400')} />
            <span className="text-white/90 font-medium">Trinity Online</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", isQuickBooksOnline ? 'bg-white' : 'bg-yellow-400')} />
            <span className="text-white/90 font-medium">QB Synced</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white/90 font-medium">{activeGuards} Guards Active</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? 'text-[#06b6d4] bg-white dark:bg-slate-900'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
              data-testid={`tab-${tab.id}`}
            >
              {tab.pulse && pulseActive && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              )}
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id
                    ? 'bg-[#06b6d4]/20 text-[#06b6d4]'
                    : 'bg-slate-200 dark:bg-slate-700 text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#06b6d4]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <span className="text-muted-foreground text-xs font-medium">
          {filteredNotifications.length} {filteredNotifications.length === 1 ? 'item' : 'items'}
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-[#06b6d4] transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            data-testid="button-mark-all-read"
          >
            Mark all read
          </button>
          <button 
            onClick={() => clearAllMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            data-testid="button-clear-all"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Notifications List - Fixed height, scrollable */}
      <div className="flex-1 max-h-72 overflow-y-auto bg-white dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => {
                  setSelectedNotification(notification);
                  setIsDetailModalOpen(true);
                }}
                className={cn(
                  "relative p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer group border-l-2",
                  !notification.read ? PRIORITY_BORDER[notification.priority] : 'border-l-transparent',
                  !notification.read ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                )}
                data-testid={`notification-${notification.id}`}
              >
                <div className="flex gap-3">
                  <div className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                    PRIORITY_BG[notification.priority],
                    PRIORITY_TEXT[notification.priority]
                  )}>
                    {getTypeIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={cn(
                        "font-medium text-sm truncate",
                        !notification.read ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {notification.title}
                      </h3>
                      <span className="text-muted-foreground text-xs whitespace-nowrap flex-shrink-0">
                        {formatTime(notification.time)}
                      </span>
                    </div>
                    
                    <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">
                      {notification.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-[#2dd4bf]" />
            </div>
            <h3 className="text-foreground font-medium text-sm">No {activeTab === 'all' ? 'notifications' : activeTab}</h3>
            <p className="text-muted-foreground text-xs text-center mt-1">
              {activeTab === 'alerts' ? 'No alerts at this time' :
               activeTab === 'workflows' ? 'No pending tasks' :
               activeTab === 'system' ? 'All systems running smoothly' :
               activeTab === 'ai' ? 'Trinity AI has no new insights' :
               'You\'re all caught up!'}
            </p>
          </div>
        )}
      </div>

      {/* Ask Trinity AI Footer - Fixed position, never pushed down */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <button
          onClick={onAskTrinity}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-lg hover:shadow-purple-500/25"
          data-testid="button-ask-trinity"
        >
          <Sparkles className="w-4 h-4" />
          <span>Ask Trinity AI</span>
        </button>
        <p className="text-center text-muted-foreground text-[10px] mt-1.5">
          Powered by Trinity &bull; Response time: ~2s
        </p>
      </div>

      {/* Notification Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onNavigate={setLocation}
        onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
        onClear={(id) => clearMutation.mutate(id)}
      />
    </div>
  );
}

export default UNSCommandCenter;
