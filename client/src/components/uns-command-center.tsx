import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle2, ExternalLink } from "lucide-react";

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

// Notification Detail Modal Component
function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onNavigate,
}: {
  notification: UNSNotification | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  if (!notification) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F172A] border-slate-700/50 text-white max-w-2xl w-[95vw] sm:w-[85vw] md:w-[70vw] lg:w-[60vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-slate-700/30">
          <div className="flex items-start gap-4">
            <div className={cn(
              "shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl",
              notification.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
              notification.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
              notification.priority === 'medium' ? 'bg-[#06b6d4]/20 text-[#22d3ee]' : 
              'bg-[#2dd4bf]/20 text-[#2dd4bf]'
            )}>
              <div className="scale-125">{getTypeIcon(notification.type)}</div>
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-white text-2xl font-black tracking-tight leading-tight">{notification.title}</DialogTitle>
              <DialogDescription className="text-slate-400 text-sm font-semibold mt-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                {formatDistanceToNow(parseISO(notification.time), { addSuffix: true })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-8 mt-6">
          {/* Status Section */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn(
              "capitalize px-4 py-1.5 text-xs font-black tracking-widest shadow-lg border-0",
              notification.priority === 'critical' ? 'bg-red-600 text-white' :
              notification.priority === 'high' ? 'bg-orange-500 text-white' :
              notification.priority === 'medium' ? 'bg-[#06b6d4] text-white' :
              'bg-[#2dd4bf] text-white'
            )}>
              {notification.priority}
            </Badge>
            <Badge variant="outline" className="capitalize px-4 py-1.5 text-xs font-black tracking-widest text-slate-300 border-slate-700 bg-slate-800/50">
              {notification.type}
            </Badge>
            {notification.read && (
              <Badge variant="outline" className="px-3 py-1 text-[10px] font-bold text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                Archived
              </Badge>
            )}
          </div>
          
          {/* Main Content Card */}
          <div className="bg-[#1E293B] rounded-2xl p-6 border border-slate-700/50 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#06b6d4] to-[#2dd4bf] opacity-50" />
            <p className="text-slate-100 text-lg leading-relaxed font-medium">{notification.message}</p>
          </div>
          
          {/* Contextual Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Detailed Info */}
            {notification.detailedInfo && (
              <div className="bg-slate-800/40 rounded-2xl p-5 border border-slate-700/30">
                <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Diagnostic Context</h4>
                <p className="text-slate-300 text-sm leading-relaxed font-medium">{notification.detailedInfo}</p>
              </div>
            )}
            
            {/* Resolution/Issue Pair */}
            <div className="space-y-4">
              {notification.issue && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
                  <h4 className="text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Issue Vector</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">{notification.issue}</p>
                </div>
              )}
              
              {notification.solution && (
                <div className="bg-[#2dd4bf]/5 border border-[#2dd4bf]/20 rounded-2xl p-5">
                  <h4 className="text-[#2dd4bf] text-[10px] font-black uppercase tracking-[0.2em] mb-2">Recommended Fix</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">{notification.solution}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Trinity Intelligence Block */}
          {notification.fixedByTrinity && (
            <div className="relative group p-6 rounded-2xl bg-gradient-to-br from-[#06b6d4]/10 to-[#2dd4bf]/10 border border-white/5 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#06b6d4]/5 via-transparent to-[#2dd4bf]/5 animate-gradient-x" />
              <div className="relative flex items-center gap-5">
                <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/10">
                  <Sparkles className="w-8 h-8 text-[#22d3ee] animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-black text-lg tracking-tight">Autonomous Resolution</h3>
                  <p className="text-slate-400 text-sm font-medium mt-1">This event was intercepted and resolved by Trinity AI Engine.</p>
                </div>
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-[#2dd4bf]/20 border border-[#2dd4bf]/30">
                  <CheckCircle2 className="w-7 h-7 text-[#2dd4bf]" />
                </div>
              </div>
            </div>
          )}
          
          {/* Footer Actions */}
          {notification.action && (
            <div className="pt-4">
              <Button 
                className="group relative w-full h-14 bg-gradient-to-r from-[#06b6d4] via-[#0891b2] to-[#3b82f6] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_20px_40px_-15px_rgba(6,182,212,0.3)] text-white font-black text-base rounded-2xl border-0 overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  if (notification.action?.target) {
                    onClose();
                    onNavigate(notification.action.target);
                  }
                }}
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity" />
                <span className="flex items-center justify-center gap-3">
                  {notification.action.label}
                  <ExternalLink className="w-5 h-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                </span>
              </Button>
            </div>
          )}
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

const PRIORITY_GRADIENTS: Record<NotificationPriority, string> = {
  critical: 'from-red-500 to-red-600',
  high: 'from-orange-500 to-amber-500',
  medium: 'from-[#06b6d4] to-[#3b82f6]', // Blue/Cyan Gradient
  low: 'from-[#2dd4bf] to-[#06b6d4]' // Teal/Cyan Gradient
};

const PRIORITY_BG: Record<NotificationPriority, string> = {
  critical: 'bg-red-500/20',
  high: 'bg-orange-500/20',
  medium: 'bg-[#06b6d4]/20',
  low: 'bg-[#2dd4bf]/20'
};

const PRIORITY_TEXT: Record<NotificationPriority, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-[#22d3ee]', // cyan-400
  low: 'text-[#2dd4bf]' // teal-400
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
  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

// Role-based notification filtering - determines which notification types each role sees
const getRoleBasedNotificationFilter = (
  platformRole: string | undefined,
  workspaceRole: string | undefined
): ((notification: UNSNotification) => boolean) => {
  // Platform support staff and admins see ALL notifications
  if (platformRole && PLATFORM_SUPPORT_ROLES.includes(platformRole)) {
    return () => true;
  }
  
  // Org owners, managers, and supervisors see all business notifications
  if (workspaceRole && WORKSPACE_MANAGEMENT_ROLES.includes(workspaceRole)) {
    return () => true; // Owners/managers see everything in their workspace
  }
  
  // End users (staff) primarily see shift-related and personal notifications
  return (n) => {
    const title = n.title?.toLowerCase() || '';
    const message = n.message?.toLowerCase() || '';
    
    // Show shift-related notifications (accept/deny/swap)
    if (title.includes('shift') || message.includes('shift')) return true;
    // Show schedule notifications
    if (title.includes('schedule') || message.includes('schedule')) return true;
    // Show time tracking notifications
    if (title.includes('time') || title.includes('clock')) return true;
    // Show personal notifications (addressed to the user)
    if (n.metadata?.employeeName) return true;
    // Show document notifications
    if (title.includes('document') || title.includes('handbook')) return true;
    // Show critical alerts
    if (n.priority === 'critical') return true;
    // Hide workflow approvals (management only)
    if (n.type === 'workflow' && (title.includes('approval') || title.includes('payroll'))) return false;
    // Hide system maintenance alerts from staff
    if (n.type === 'system' && title.includes('maintenance')) return false;
    // Show general updates
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

  // Apply role-based filtering first
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
    return true; // fallback to showing all
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

  // Dynamic guards count from employees data
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
    <div className={cn(
      "relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden w-full",
      className
    )} data-testid="uns-command-center">
      
      {/* Animated Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-cyan-600/10 animate-pulse pointer-events-none" />
      
      {/* Header */}
      <div className="relative bg-gradient-to-r from-[#06b6d4] via-[#0891b2] to-[#3b82f6] p-4">
        {/* Animated mesh background */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />
        </div>
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Animated Bell Icon */}
            <div className="relative">
              <div className={cn(
                "absolute inset-0 bg-white/30 rounded-full blur-md",
                pulseActive && unreadCount > 0 ? 'animate-ping' : ''
              )} />
              <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-2.5">
                <BellIcon />
              </div>
            </div>
            
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight">Command Center</h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  pulseActive ? 'bg-[#2dd4bf]' : 'bg-[#06b6d4]'
                )} />
                <span className="text-white/90 text-xs font-medium">Live &bull; Real-time sync</span>
              </div>
            </div>
          </div>
          
          {/* Notification Badge with Unread label */}
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse shadow-lg">
                {criticalCount} Critical
              </div>
            )}
            <div className="flex flex-col items-center">
              <div className="bg-white/20 backdrop-blur-sm text-white text-lg font-bold w-10 h-10 rounded-full flex items-center justify-center border border-white/30 shadow-inner">
                {unreadCount}
              </div>
              <span className="text-white/60 text-[10px] mt-0.5 font-medium">Unread</span>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="relative mt-4 flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/5">
            <span className={cn("w-1.5 h-1.5 rounded-full", isTrinityOnline ? 'bg-[#2dd4bf]' : 'bg-red-400')} />
            <span className="text-white/90 font-medium">Trinity Online</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/5">
            <span className={cn("w-1.5 h-1.5 rounded-full", isQuickBooksOnline ? 'bg-[#3b82f6]' : 'bg-[#eab308]')} />
            <span className="text-white/90 font-medium">QB Synced</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffd700] animate-pulse" />
            <span className="text-white/90 font-medium">{activeGuards} Guards Active</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative border-b border-slate-700/50 bg-slate-900/40">
        <div className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200",
                activeTab === tab.id
                  ? 'text-[#22d3ee] bg-[#06b6d4]/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
              )}
              data-testid={`tab-${tab.id}`}
            >
              {tab.pulse && pulseActive && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              )}
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id
                    ? 'bg-[#06b6d4]/20 text-[#22d3ee]'
                    : 'bg-slate-700 text-slate-400'
                )}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#06b6d4] to-[#2dd4bf]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions Bar */}
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

      {/* Notifications List */}
      <div className="relative max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div className="divide-y divide-slate-700/30">
            {filteredNotifications.map((notification, index) => (
              <div
                key={notification.id}
                onClick={() => {
                  setSelectedNotification(notification);
                  setIsDetailModalOpen(true);
                }}
                className={cn(
                  "relative p-4 hover:bg-slate-700/30 transition-all duration-200 cursor-pointer group",
                  !notification.read ? 'bg-slate-700/20' : ''
                )}
                style={{ animationDelay: `${index * 50}ms` }}
                data-testid={`notification-${notification.id}`}
              >
                {/* Unread Indicator - Priority colored left border */}
                {!notification.read && (
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b",
                    PRIORITY_GRADIENTS[notification.priority]
                  )} />
                )}
                
                <div className="flex gap-3">
                  {/* Priority Icon */}
                  <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                    PRIORITY_BG[notification.priority],
                    PRIORITY_TEXT[notification.priority]
                  )}>
                    {getTypeIcon(notification.type)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={cn(
                        "font-semibold text-sm truncate",
                        !notification.read ? 'text-white' : 'text-slate-300'
                      )}>
                        {notification.title}
                      </h3>
                      <span className="text-slate-500 text-xs whitespace-nowrap flex-shrink-0">
                        {formatTime(notification.time)}
                      </span>
                    </div>
                    
                    <p className="text-slate-400 text-sm mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    
                    {/* Action Button */}
                    {notification.action && (
                      <button className={cn(
                        "mt-2 inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-all",
                        "bg-gradient-to-r hover:brightness-110",
                        PRIORITY_GRADIENTS[notification.priority],
                        "text-white"
                      )}>
                        {notification.action.label}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-slate-300 font-medium text-lg">No {activeTab === 'all' ? 'notifications' : activeTab}</h3>
            <p className="text-slate-500 text-sm text-center mt-1">
              {activeTab === 'alerts' ? 'No payroll, schedule, or employee alerts at this time' :
               activeTab === 'workflows' ? 'No pending workflow approvals' :
               activeTab === 'system' ? 'All systems running smoothly' :
               activeTab === 'ai' ? 'Trinity AI has no new insights' :
               'You\'re all caught up!'}
            </p>
          </div>
        )}
      </div>

      {/* Ask Trinity AI Footer */}
      <div className="relative p-4 border-t border-slate-700/50 bg-slate-800/50">
        <button
          onClick={onAskTrinity}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
          data-testid="button-ask-trinity"
        >
          <AIIcon />
          <span>Ask Trinity AI</span>
        </button>
        <p className="text-center text-slate-500 text-xs mt-2">
          Powered by Trinity &bull; Response time: ~2s
        </p>
      </div>

      {/* Notification Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onNavigate={setLocation}
      />
    </div>
  );
}

export default UNSCommandCenter;
