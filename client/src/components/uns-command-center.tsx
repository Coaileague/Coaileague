import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useNotificationSync } from "@/hooks/use-notification-sync";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, ExternalLink, Check, X, Trash2, GripHorizontal, AlertTriangle, Info, Wrench, Clock, Megaphone } from "lucide-react";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { humanizeTitle, humanizeText, generateStructuredBreakdown, type StructuredBreakdown } from "@shared/utils/humanFriendlyCopy";
import { BroadcastComposer } from "./broadcasts/BroadcastComposer";
import { PLATFORM_SUPPORT_ROLES } from '@shared/platformConfig';

type NotificationCategory = 'all' | 'alerts' | 'workflows' | 'system' | 'ai';
type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
type NotificationType = 'alert' | 'workflow' | 'system' | 'ai';

type NotificationSource = 'platformUpdate' | 'maintenanceAlert' | 'notification';

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
  sourceType: NotificationSource;
  subCategory?: string;
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
    fixApplied?: boolean;
    actionRequired?: boolean;
  };
}

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

  const isCritical = notification.priority === 'critical';
  const isHigh = notification.priority === 'high';

  const breakdown = generateStructuredBreakdown(
    notification.title,
    notification.message,
    notification.subCategory,
    notification.metadata as any
  );

  const safeTime = (() => {
    try {
      const date = parseISO(notification.time);
      if (isValid(date)) return formatDistanceToNow(date, { addSuffix: true });
    } catch {}
    return 'recently';
  })();

  return (
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent size="md" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-foreground overflow-y-auto p-0 gap-0" data-testid="uns-notification-detail-modal">
        <UniversalModalHeader className={cn(
          "p-4 border-b",
          isCritical 
            ? 'bg-red-500 dark:bg-red-700 border-red-600' 
            : isHigh 
            ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800' 
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
              isCritical 
                ? 'bg-red-600 dark:bg-red-800' 
                : isHigh 
                ? 'bg-amber-100 dark:bg-amber-900' 
                : 'bg-primary/10'
            )}>
              <TrinityLogo size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <UniversalModalTitle className={cn(
                "text-base font-bold leading-tight",
                isCritical ? 'text-white' : isHigh ? 'text-amber-900 dark:text-amber-100' : 'text-foreground'
              )}>
                {humanizeTitle(notification.title)}
              </UniversalModalTitle>
              <UniversalModalDescription className="sr-only">Notification details</UniversalModalDescription>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className={cn(
                  "text-[10px] px-2 py-0.5 font-semibold uppercase",
                  isCritical 
                    ? 'bg-red-400 text-white border-red-400' 
                    : isHigh 
                    ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200' 
                    : notification.priority === 'medium'
                    ? 'bg-[#06b6d4]/20 text-[#06b6d4]'
                    : 'bg-primary/10 text-primary'
                )}>
                  {notification.priority === 'low' ? 'INFO' : notification.priority.toUpperCase()}
                </Badge>
                <span className={cn(
                  "text-xs",
                  isCritical ? 'text-white/70' : isHigh ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                )}>
                  {safeTime}
                </span>
              </div>
            </div>
          </div>
        </UniversalModalHeader>
        
        <div className="p-4 space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">What Happened</span>
            </div>
            <p className="text-sm text-foreground pl-7 leading-relaxed" data-testid="text-breakdown-problem">{breakdown.problem}</p>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Info className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Why It Matters</span>
            </div>
            <p className="text-sm text-foreground pl-7 leading-relaxed" data-testid="text-breakdown-issue">{breakdown.issue}</p>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Wrench className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">What Trinity Did</span>
            </div>
            <p className="text-sm text-foreground pl-7 leading-relaxed" data-testid="text-breakdown-solution">{breakdown.solution}</p>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">What to Expect</span>
            </div>
            <p className="text-sm text-foreground pl-7 leading-relaxed" data-testid="text-breakdown-outcome">{breakdown.outcome}</p>
          </div>
          
          {notification.detailedInfo && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-3 border border-slate-200 dark:border-slate-700 mt-1">
              <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide mb-1">Additional Details</h4>
              <p className="text-foreground text-sm leading-relaxed">{humanizeText(notification.detailedInfo)}</p>
            </div>
          )}
        </div>
        
        <div className="px-4 pb-4 pt-2 flex flex-wrap items-center gap-2 border-t border-slate-200 dark:border-slate-700">
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
              <ExternalLink className="w-4 h-4 mr-1.5" />
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
            <Check className="w-4 h-4 mr-1.5" />
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
            <X className="w-4 h-4 mr-1.5" />
            Dismiss
          </Button>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// Platform roles from schema - these are global platform-level roles
type PlatformRole = 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'none';
// Workspace roles - tenant-level roles within an organization
type WorkspaceRole = 'org_owner' | 'co_owner' | 'manager' | 'department_manager' | 'supervisor' | 'staff';

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

// Workspace management roles that see business notifications
const WORKSPACE_MANAGEMENT_ROLES = ['org_owner', 'co_owner', 'manager', 'department_manager', 'supervisor'];

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
  const { syncClearAll, syncNotificationCleared } = useNotificationSync();
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all');
  const [pulseActive, setPulseActive] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<UNSNotification | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const BROADCAST_ALLOWED_PLATFORM = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
  const BROADCAST_ALLOWED_WORKSPACE = ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'];
  const canBroadcast = (platformRole && BROADCAST_ALLOWED_PLATFORM.includes(platformRole)) ||
    (workspaceRole && BROADCAST_ALLOWED_WORKSPACE.includes(workspaceRole));
  const isPlatformBroadcast = !!(platformRole && BROADCAST_ALLOWED_PLATFORM.includes(platformRole));
  
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

  const optimisticMarkRead = (old: any, id: string, sourceType: NotificationSource) => {
    if (!old) return old;
    return {
      ...old,
      notifications: sourceType === 'notification'
        ? old.notifications?.map((n: any) => n.id === id ? { ...n, isRead: true } : n)
        : old.notifications,
      platformUpdates: sourceType === 'platformUpdate'
        ? old.platformUpdates?.map((u: any) => u.id === id ? { ...u, isViewed: true } : u)
        : old.platformUpdates,
      maintenanceAlerts: sourceType === 'maintenanceAlert'
        ? old.maintenanceAlerts?.map((a: any) => a.id === id ? { ...a, isAcknowledged: true } : a)
        : old.maintenanceAlerts,
      totalUnread: Math.max(0, (old.totalUnread || 0) - 1),
    };
  };

  const optimisticClear = (old: any, id: string, sourceType: NotificationSource) => {
    if (!old) return old;
    const now = new Date().toISOString();
    return {
      ...old,
      notifications: sourceType === 'notification'
        ? old.notifications?.map((n: any) => n.id === id ? { ...n, clearedAt: now, isRead: true } : n)
        : old.notifications,
      platformUpdates: sourceType === 'platformUpdate'
        ? old.platformUpdates?.filter((u: any) => u.id !== id)
        : old.platformUpdates,
      maintenanceAlerts: sourceType === 'maintenanceAlert'
        ? old.maintenanceAlerts?.filter((a: any) => a.id !== id)
        : old.maintenanceAlerts,
      totalUnread: Math.max(0, (old.totalUnread || 0) - 1),
    };
  };

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/notifications/mark-all-read', {});
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications/combined'] });
      const previousData = queryClient.getQueryData(['/api/notifications/combined']);
      queryClient.setQueryData(['/api/notifications/combined'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          notifications: old.notifications?.map((n: any) => ({ ...n, isRead: true })),
          platformUpdates: old.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })),
          maintenanceAlerts: old.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })),
          totalUnread: 0,
        };
      });
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      syncClearAll();
    },
    onError: (_, __, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/notifications/combined'], context.previousData);
      }
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/notifications/clear-all', {});
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications/combined'] });
      const previousData = queryClient.getQueryData(['/api/notifications/combined']);
      const now = new Date().toISOString();
      queryClient.setQueryData(['/api/notifications/combined'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          notifications: old.notifications?.map((n: any) => ({ ...n, clearedAt: now, isRead: true })),
          platformUpdates: old.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })),
          maintenanceAlerts: old.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })),
          totalUnread: 0,
        };
      });
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      syncClearAll();
    },
    onError: (_, __, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/notifications/combined'], context.previousData);
      }
    }
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, sourceType }: { id: string; sourceType: NotificationSource }) => {
      if (sourceType === 'platformUpdate') {
        await apiRequest('POST', `/api/platform-updates/${id}/mark-viewed`);
      } else if (sourceType === 'maintenanceAlert') {
        await apiRequest('POST', `/api/maintenance-alerts/${id}/acknowledge`);
      } else {
        // DELETE actually removes the row — acknowledge only sets isRead which doesn't hide the item
        await apiRequest('DELETE', `/api/notifications/${id}`);
      }
    },
    onMutate: async ({ id, sourceType }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications/combined'] });
      const previousData = queryClient.getQueryData(['/api/notifications/combined']);
      // Regular notifications are deleted so use optimisticClear; others just mark-read
      const updater = sourceType === 'notification'
        ? (old: any) => optimisticClear(old, id, sourceType)
        : (old: any) => optimisticMarkRead(old, id, sourceType);
      queryClient.setQueryData(['/api/notifications/combined'], updater);
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
    },
    onError: (_, __, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/notifications/combined'], context.previousData);
      }
    }
  });

  const clearMutation = useMutation({
    mutationFn: async ({ id, sourceType }: { id: string; sourceType: NotificationSource }) => {
      if (sourceType === 'platformUpdate') {
        await apiRequest('POST', `/api/platform-updates/${id}/mark-viewed`);
      } else if (sourceType === 'maintenanceAlert') {
        await apiRequest('POST', `/api/maintenance-alerts/${id}/acknowledge`);
      } else {
        await apiRequest('DELETE', `/api/notifications/${id}`);
      }
    },
    onMutate: async ({ id, sourceType }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications/combined'] });
      const previousData = queryClient.getQueryData(['/api/notifications/combined']);
      queryClient.setQueryData(['/api/notifications/combined'], (old: any) => optimisticClear(old, id, sourceType));
      return { previousData };
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] });
      syncNotificationCleared(id);
    },
    onError: (_, __, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['/api/notifications/combined'], context.previousData);
      }
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
        sourceType: 'platformUpdate',
        priority: normalizePriority(update.severity === 'critical' ? 'critical' : 
                  update.severity === 'warning' ? 'high' : 'medium'),
        title: update.title || 'Platform Update',
        message: update.message || update.description || '',
        time: update.createdAt || new Date().toISOString(),
        read: update.isViewed || false,
        subCategory: update.category,
        action: update.actionUrl ? { label: 'View', type: 'navigate', target: update.actionUrl } : undefined,
        metadata: update.metadata,
      });
    });

    notificationsData.maintenanceAlerts?.forEach((alert: any) => {
      if (alert.isAcknowledged) return;
      result.push({
        id: alert.id || `maintenance-${Date.now()}-${Math.random()}`,
        type: 'alert',
        sourceType: 'maintenanceAlert',
        priority: normalizePriority(alert.priority),
        title: alert.title || 'Maintenance Alert',
        message: alert.message || alert.description || '',
        time: alert.createdAt || new Date().toISOString(),
        read: false,
        subCategory: 'maintenance',
        metadata: alert.metadata,
      });
    });

    notificationsData.notifications?.forEach((notif: any) => {
      if (notif.clearedAt) return;
      
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
        sourceType: 'notification',
        priority: normalizePriority(notif.priority),
        title: notif.title || 'Notification',
        message: notif.message || notif.body || '',
        time: notif.createdAt || new Date().toISOString(),
        read: notif.isRead || false,
        subCategory: notif.type || notif.category,
        action: notif.actionUrl ? { label: 'View', type: 'navigate', target: notif.actionUrl } : undefined,
        metadata: notif.metadata,
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

  const { data: employeesData = [] } = useQuery<{ data: any[] }, Error, any[]>({
    queryKey: ['/api/employees'],
    select: (res) => res?.data ?? [],
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
        "relative bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col",
        "w-[min(420px,calc(100vw-2rem))]",
        isDragging ? 'cursor-grabbing' : '',
        className
      )} 
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, maxHeight: 'min(85vh, 650px)' }}
      data-testid="uns-command-center"
    >
      
      {/* Draggable Header */}
      <div 
        className="relative bg-gradient-to-r from-[#06b6d4] to-[#0891b2] p-4 cursor-grab select-none"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {/* Drag Handle */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-50">
          <GripHorizontal className="w-4 h-4 text-white" />
        </div>
        
        <div className="relative flex items-center justify-between gap-2 mt-2">
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
      <div className="relative border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-hide pb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? 'text-[#06b6d4] bg-white dark:bg-slate-900'
                  : 'text-muted-foreground hover:text-foreground hover-elevate'
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
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            {filteredNotifications.length} {filteredNotifications.length === 1 ? 'item' : 'items'}
          </span>
          {canBroadcast && (
            <button
              onClick={() => setBroadcastOpen(true)}
              className="flex items-center gap-1 text-xs font-medium text-[#06b6d4] hover:text-[#0891b2] transition-colors px-2 py-1 rounded hover-elevate"
              data-testid="button-send-broadcast"
            >
              <Megaphone className="h-3 w-3" />
              Broadcast
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => markAllReadMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-[#06b6d4] transition-colors px-2 py-1 rounded hover-elevate"
            data-testid="button-mark-all-read"
          >
            Mark all read
          </button>
          <button 
            onClick={() => clearAllMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-red-500 transition-colors px-2 py-1 rounded hover-elevate"
            data-testid="button-clear-all"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Notifications List - Flexible height, scrollable */}
      <div className="relative flex-1 overflow-y-auto scrollbar-hide bg-white dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
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
                  "relative p-3 hover-elevate transition-all cursor-pointer group border-l-2",
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
                        "font-semibold text-sm truncate",
                        !notification.read ? 'text-foreground' : 'text-muted-foreground'
                      )} data-testid={`text-notification-title-${notification.id}`}>
                        {humanizeTitle(notification.title)}
                      </h3>
                      <span className="text-muted-foreground text-[11px] whitespace-nowrap flex-shrink-0">
                        {formatTime(notification.time)}
                      </span>
                    </div>
                    
                    <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2 leading-relaxed" data-testid={`text-notification-preview-${notification.id}`}>
                      {humanizeText(notification.message)}
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
      <div className="relative z-10 p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <button
          onClick={onAskTrinity}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-sm hover:shadow-cyan-500/25"
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
        onAcknowledge={(id) => {
          const n = selectedNotification;
          acknowledgeMutation.mutate({ id, sourceType: n?.sourceType || 'notification' });
        }}
        onClear={(id) => {
          const n = selectedNotification;
          clearMutation.mutate({ id, sourceType: n?.sourceType || 'notification' });
        }}
      />

      {canBroadcast && (
        <BroadcastComposer
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
          isPlatformLevel={isPlatformBroadcast}
        />
      )}
    </div>
  );
}

export default UNSCommandCenter;
