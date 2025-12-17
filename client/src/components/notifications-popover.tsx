import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Bell, AlertTriangle, Info, Wrench, Check, Clock, X, Sparkles, 
  Bot, Zap, ChevronRight, Eye, Filter, ArrowUpDown, Shield, UserCheck,
  MessageCircle
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
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatedNotificationBell } from "./animated-notification-bell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { useTrinityContext } from "@/hooks/use-trinity-context";
import { useNotificationSync } from "@/hooks/use-notification-sync";
import TrinityRedesign from "@/components/trinity-redesign";
import { TrinityBadge } from "@/components/trinity-marketing-hero";
import { humanizeTitle, humanizeText, generateEndUserSummary } from "@shared/utils/humanFriendlyCopy";

// Priority levels for UNS cards
type Priority = 'critical' | 'high' | 'medium' | 'info';
type TabCategory = 'for_you' | 'system_alerts';
type SubFilter = 'all' | 'system_alerts' | 'admin_review' | 'updates';

interface UNSNotification {
  id: string;
  title: string;
  message: string;
  priority: Priority;
  category: TabCategory;
  subCategory?: string;
  serviceSource?: string;
  statusTag?: string;
  isRead: boolean;
  createdAt: string;
  actions?: Array<{
    label: string;
    type: 'navigate' | 'api_call' | 'orchestration';
    target: string;
    variant?: 'primary' | 'secondary' | 'ghost';
  }>;
  metadata?: {
    workflowId?: string;
    riskScore?: number;
    responsibleUserId?: string;
    endUserSummary?: string;
    technicalSummary?: string;
  };
}

interface NotificationsData {
  platformUpdates: any[];
  maintenanceAlerts: any[];
  notifications: any[];
  unreadPlatformUpdates: number;
  unreadNotifications: number;
  unreadAlerts: number;
  totalUnread: number;
}

// Priority styling configuration
const PRIORITY_STYLES: Record<Priority, { border: string; bg: string; text: string; badge: string }> = {
  critical: { 
    border: 'border-l-4 border-l-red-500', 
    bg: 'bg-red-50 dark:bg-red-950/30', 
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-500 text-white'
  },
  high: { 
    border: 'border-l-4 border-l-amber-500', 
    bg: 'bg-amber-50 dark:bg-amber-950/30', 
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500 text-white'
  },
  medium: { 
    border: 'border-l-4 border-l-blue-500', 
    bg: 'bg-blue-50 dark:bg-blue-950/30', 
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-500 text-white'
  },
  info: { 
    border: 'border-l-4 border-l-slate-300 dark:border-l-slate-600', 
    bg: 'bg-muted/30', 
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground'
  },
};

// Roles that can see action buttons on notifications
const ACTION_BUTTON_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];

// Check if user has permission to see action buttons
function canSeeActionButtons(platformRole: string | null | undefined): boolean {
  if (!platformRole) return false;
  return ACTION_BUTTON_ROLES.includes(platformRole);
}

// Generate action buttons based on notification type and content
function generateTypeBasedActions(
  notif: any, 
  platformRole: string | null | undefined
): UNSNotification['actions'] {
  const actions: UNSNotification['actions'] = [];
  if (!canSeeActionButtons(platformRole)) return actions;
  
  const title = (notif.title || '').toLowerCase();
  const message = (notif.message || '').toLowerCase();
  const type = notif.type || notif.category || '';
  const metadata = notif.metadata || {};
  
  // AI Brain Workflow Order Approvals - requires human decision
  if (metadata.workflowOrderId || title.includes('workflow order') || title.includes('work order') || type === 'workflow_order') {
    actions.push({
      label: 'Approve',
      type: 'orchestration',
      target: `workflow.approve:${metadata.workflowOrderId || notif.id}`,
      variant: 'primary',
    });
    actions.push({
      label: 'Reject',
      type: 'orchestration',
      target: `workflow.reject:${metadata.workflowOrderId || notif.id}`,
      variant: 'ghost',
    });
    return actions; // Don't add more actions for workflow orders
  }
  
  // Trinity Hotpatch Fix Approvals - AI identified and suggests fix
  if (metadata.hotpatchId || title.includes('hotpatch') || title.includes('auto-fix') || title.includes('trinity fix') || type === 'hotpatch') {
    actions.push({
      label: 'Apply Fix',
      type: 'orchestration',
      target: `hotpatch.apply:${metadata.hotpatchId || notif.id}`,
      variant: 'primary',
    });
    actions.push({
      label: 'Review First',
      type: 'navigate',
      target: `/diagnostics?hotpatch=${metadata.hotpatchId || notif.id}`,
      variant: 'secondary',
    });
    actions.push({
      label: 'Skip',
      type: 'api_call',
      target: `/api/notifications/dismiss/${notif.id}`,
      variant: 'ghost',
    });
    return actions; // Don't add more actions for hotpatch fixes
  }
  
  // Trinity AI Brain Decisions requiring approval
  if (metadata.aiBrainDecisionId || title.includes('ai decision') || title.includes('trinity suggests') || type === 'ai_decision') {
    actions.push({
      label: 'Approve AI Action',
      type: 'orchestration',
      target: `ai_brain.approve:${metadata.aiBrainDecisionId || notif.id}`,
      variant: 'primary',
    });
    actions.push({
      label: 'Modify',
      type: 'navigate',
      target: `/trinity-command-center?decision=${metadata.aiBrainDecisionId || notif.id}`,
      variant: 'secondary',
    });
    actions.push({
      label: 'Decline',
      type: 'orchestration',
      target: `ai_brain.decline:${metadata.aiBrainDecisionId || notif.id}`,
      variant: 'ghost',
    });
    return actions;
  }
  
  // Payroll-related notifications
  if (title.includes('payroll') || type.includes('payroll')) {
    if (title.includes('block') || title.includes('error') || title.includes('fail')) {
      actions.push({
        label: 'Review & Trinity Analysis',
        type: 'orchestration',
        target: 'trinity.analyze_payroll_issue',
        variant: 'primary',
      });
    } else {
      actions.push({
        label: 'Review Payroll',
        type: 'navigate',
        target: '/payroll',
        variant: 'secondary',
      });
    }
  }
  
  // Schedule-related notifications
  if (title.includes('schedule') || title.includes('shift') || type.includes('schedule')) {
    if (title.includes('conflict')) {
      actions.push({
        label: 'View & Apply Fix',
        type: 'orchestration',
        target: 'scheduling.resolve_conflicts',
        variant: 'primary',
      });
      actions.push({
        label: 'Delay Decision',
        type: 'api_call',
        target: `/api/notifications/snooze/${notif.id}`,
        variant: 'ghost',
      });
    } else {
      actions.push({
        label: 'View Schedule',
        type: 'navigate',
        target: '/scheduling',
        variant: 'secondary',
      });
    }
  }
  
  // Time-off request notifications
  if (title.includes('time-off') || title.includes('time off') || title.includes('pto') || title.includes('leave request')) {
    actions.push({
      label: 'Review All',
      type: 'navigate',
      target: '/time-off',
      variant: 'primary',
    });
  }
  
  // Approval-related notifications
  if (title.includes('approval') || title.includes('pending') || message.includes('requires approval')) {
    actions.push({
      label: 'Review Now',
      type: 'navigate',
      target: '/approvals',
      variant: 'primary',
    });
  }
  
  // Compliance-related notifications
  if (title.includes('compliance') || title.includes('certification') || type.includes('compliance')) {
    actions.push({
      label: 'View Compliance',
      type: 'navigate',
      target: '/compliance',
      variant: 'secondary',
    });
  }
  
  // Invoice-related notifications
  if (title.includes('invoice') || type.includes('invoice')) {
    actions.push({
      label: 'View Invoice',
      type: 'navigate',
      target: '/invoices',
      variant: 'secondary',
    });
  }
  
  // System self-healed notifications (for support roles)
  if (title.includes('self-heal') || title.includes('healed') || title.includes('optimized')) {
    actions.push({
      label: 'View Details',
      type: 'navigate',
      target: '/diagnostics',
      variant: 'ghost',
    });
  }
  
  return actions;
}

// Map existing data to UNS format with human-friendly language
function mapToUNS(data: NotificationsData | undefined, userPlatformRole?: string | null): UNSNotification[] {
  if (!data) return [];
  
  const notifications: UNSNotification[] = [];
  const seenIds = new Set<string>();
  
  // Map platform updates
  data.platformUpdates?.forEach(update => {
    // Skip already viewed updates (cleared)
    if (update.isViewed) return;
    
    // Skip duplicates within the same fetch (by ID only)
    if (seenIds.has(update.id)) return;
    seenIds.add(update.id);
    
    const isSystem = ['maintenance', 'security_patch', 'system'].includes(update.category);
    
    // Apply human-friendly copy transformation
    const friendlyTitle = humanizeTitle(update.title);
    const friendlyMessage = update.metadata?.endUserSummary 
      || generateEndUserSummary(update.description || '', update.category)
      || humanizeText(update.description || '');
    
    notifications.push({
      id: update.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: update.category === 'security_patch' ? 'high' : 'info',
      category: isSystem ? 'system_alerts' : 'for_you',
      subCategory: update.category,
      serviceSource: update.metadata?.sourceName || 'Platform',
      statusTag: update.isViewed ? undefined : 'NEW',
      isRead: update.isViewed,
      createdAt: update.createdAt,
      metadata: update.metadata,
    });
  });
  
  // Map maintenance alerts with orchestration actions
  data.maintenanceAlerts?.forEach(alert => {
    // Skip already acknowledged alerts (cleared)
    if (alert.isAcknowledged) return;
    
    // Skip duplicates
    if (seenIds.has(alert.id)) return;
    seenIds.add(alert.id);
    
    const actions: UNSNotification['actions'] = [];
    if (alert.quickFixCode) {
      actions.push({
        label: alert.quickFixLabel || 'View & Apply Fix',
        type: 'orchestration',
        target: alert.quickFixCode,
        variant: 'primary',
      });
    }
    actions.push({
      label: 'Delay Decision',
      type: 'api_call',
      target: `/api/notifications/snooze/${alert.id}`,
      variant: 'ghost',
    });
    
    // Apply human-friendly copy
    const friendlyTitle = humanizeTitle(alert.title);
    const friendlyMessage = humanizeText(alert.description || '');
    
    notifications.push({
      id: alert.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'high' : 'medium',
      category: 'system_alerts',
      subCategory: 'maintenance',
      serviceSource: humanizeText(alert.serviceSource || 'System Operations'),
      statusTag: alert.isAcknowledged ? undefined : 'ACTION REQUIRED',
      isRead: alert.isAcknowledged || false,
      createdAt: alert.scheduledStartTime,
      actions,
      metadata: { workflowId: alert.id },
    });
  });
  
  // Map notifications
  data.notifications?.forEach(notif => {
    if (notif.isRead || notif.clearedAt) return;
    
    // Skip duplicates
    if (seenIds.has(notif.id)) return;
    seenIds.add(notif.id);
    
    // Start with type-based actions for authorized users
    const actions: UNSNotification['actions'] = [...(generateTypeBasedActions(notif, userPlatformRole) || [])];
    
    // Add actionUrl if present and no type-based actions generated
    if (notif.actionUrl && actions.length === 0) {
      actions.push({
        label: 'View Details',
        type: 'navigate',
        target: notif.actionUrl,
        variant: 'secondary',
      });
    }
    
    // Check for orchestration actions in metadata - with user-friendly labels
    if (notif.metadata?.quickFixCode) {
      actions.unshift({
        label: notif.metadata.quickFixLabel || 'Review & Ask Trinity',
        type: 'orchestration',
        target: notif.metadata.quickFixCode,
        variant: 'primary',
      });
    }
    
    // Apply human-friendly copy
    const friendlyTitle = humanizeTitle(notif.title);
    const friendlyMessage = notif.metadata?.endUserSummary 
      || generateEndUserSummary(notif.message || '', notif.type)
      || humanizeText(notif.message || '');
    
    // Humanize the service source name (e.g., "PayrollOps Lead" -> "Payroll Team")
    const friendlySource = humanizeText(notif.metadata?.sourceName || notif.metadata?.subagent || 'Trinity AI');
    
    notifications.push({
      id: notif.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: notif.type === 'error' ? 'critical' : notif.type === 'warning' ? 'high' : 'info',
      category: 'for_you',
      subCategory: notif.type,
      serviceSource: friendlySource,
      statusTag: 'NEW',
      isRead: notif.isRead,
      createdAt: notif.createdAt,
      actions,
      metadata: notif.metadata,
    });
  });
  
  return notifications.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, info: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

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

// UNS Notification Card Component - Matching Design Spec
function NotificationCard({ 
  notification, 
  onDismiss, 
  onAction,
  isGuruMode,
  canInteract,
  compact = false,
}: { 
  notification: UNSNotification; 
  onDismiss: (id: string) => void;
  onAction: (notification: UNSNotification, action: NonNullable<UNSNotification['actions']>[0]) => void;
  isGuruMode: boolean;
  canInteract: boolean; // True when user is authenticated - controls action buttons visibility
  compact?: boolean; // Mobile compact mode - smaller padding, icons, text
}) {
  const styles = PRIORITY_STYLES[notification.priority];
  const isCritical = notification.priority === 'critical';
  const isHigh = notification.priority === 'high';
  const isMedium = notification.priority === 'medium';
  // Only show actions to authenticated users
  const hasActions = canInteract && notification.actions && notification.actions.length > 0;
  
  // Critical: red background, High: amber/yellow, Medium: blue (schedule conflicts)
  const cardBg = isCritical 
    ? 'bg-red-500 dark:bg-red-700' 
    : isHigh 
    ? 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800' 
    : isMedium
    ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
    : 'hover:bg-muted/40';
  
  const textColor = isCritical 
    ? 'text-white' 
    : isHigh 
    ? 'text-amber-900 dark:text-amber-100' 
    : isMedium 
    ? 'text-blue-900 dark:text-blue-100' 
    : '';
  const mutedText = isCritical 
    ? 'text-white/80' 
    : isHigh 
    ? 'text-amber-700 dark:text-amber-300' 
    : isMedium 
    ? 'text-blue-700 dark:text-blue-300' 
    : 'text-muted-foreground';
  
  return (
    <div 
      className={`relative ${notification.isRead ? 'opacity-60' : ''}`}
      data-testid={`uns-card-${notification.id}`}
    >
      {/* Critical/High/Medium Priority Cards */}
      {(isCritical || isHigh || isMedium) ? (
        <div className={`${cardBg} rounded-lg mx-2 my-1 overflow-hidden shrink-0`}>
          {/* Critical Banner */}
          {isCritical && (
            <div className={`bg-red-600 dark:bg-red-700 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${compact ? 'text-[8px]' : ''}`}>
              CRITICAL
            </div>
          )}
          
          <div className={compact ? "p-2.5" : "p-4"}>
            <div className={compact ? "flex gap-2" : "flex gap-3"}>
              {/* AI Icon - color varies by priority */}
              <div className={`shrink-0 ${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-full flex items-center justify-center ${
                isCritical 
                  ? 'bg-white/20' 
                  : isHigh 
                  ? 'bg-amber-100 dark:bg-amber-900' 
                  : 'bg-blue-100 dark:bg-blue-900'
              }`}>
                <Bot className={`${compact ? 'h-3.5 w-3.5' : 'h-5 w-5'} ${
                  isCritical 
                    ? 'text-white' 
                    : isHigh 
                    ? 'text-amber-600 dark:text-amber-400' 
                    : 'text-blue-600 dark:text-blue-400'
                }`} />
              </div>
              
              {/* Content & Actions in Row Layout */}
              <div className={`flex-1 min-w-0 flex flex-col ${compact ? 'gap-1.5' : 'sm:flex-row gap-3'}`}>
                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <span className={`font-bold ${compact ? 'text-xs' : 'text-sm'} leading-tight block ${textColor}`}>
                    {notification.title}
                  </span>
                  <p className={`${compact ? 'text-[11px] mt-0.5 leading-snug' : 'text-sm leading-relaxed mt-1'} ${mutedText}`}>
                    {notification.message}
                  </p>
                </div>
                
                {/* Action Buttons - Right Side */}
                {hasActions && (
                  <div className={`flex ${compact ? 'flex-row flex-wrap gap-1.5' : 'flex-col gap-2'} shrink-0`}>
                    {notification.actions!.map((action, idx) => (
                      <Button
                        key={idx}
                        variant={isCritical ? 'secondary' : 'outline'}
                        size="sm"
                        className={`${compact ? 'h-6 text-[10px] px-2' : 'h-8 text-xs'} whitespace-nowrap ${
                          isCritical 
                            ? 'bg-white text-red-700 hover:bg-red-50 border-0' 
                            : isHigh
                            ? 'border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-900 hover:bg-amber-100 dark:hover:bg-amber-800'
                            : 'border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(notification, action);
                        }}
                        data-testid={`button-action-${notification.id}-${idx}`}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Service Source & Time - Bottom */}
            <div className={`flex items-center justify-between gap-2 ${compact ? 'text-[10px] mt-2' : 'text-[11px] mt-3'} ${mutedText}`}>
              <div className="flex items-center gap-1">
                <Clock className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                <span className="font-medium">{notification.serviceSource}</span>
              </div>
              <span>{safeFormatTimestamp(notification.createdAt)}</span>
            </div>
          </div>
          
          {/* Status Tag Below Card */}
          {notification.statusTag && notification.statusTag !== 'CRITICAL' && (
            <div className={compact ? "px-2.5 pb-2" : "px-4 pb-3"}>
              <Badge 
                className={`${compact ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'} font-bold ${
                  notification.statusTag === 'ACTION REQUIRED' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-white/20 text-white'
                }`}
              >
                {notification.statusTag}
              </Badge>
            </div>
          )}
        </div>
      ) : (
        /* Regular/Info Cards */
        <div className={`${styles.border} hover:bg-muted/40 transition-colors`}>
          <div className={compact ? "p-2.5" : "p-4"}>
            <div className={compact ? "flex gap-2" : "flex gap-3"}>
              {/* AI Icon */}
              <div className={`shrink-0 ${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full flex items-center justify-center bg-primary/10`}>
                <Bot className={compact ? "h-3 w-3 text-primary" : "h-4 w-4 text-primary"} />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`flex items-start justify-between gap-2 ${compact ? 'mb-0.5' : 'mb-1'}`}>
                  <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} leading-tight`}>
                    {notification.title}
                  </span>
                  <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'} shrink-0`}>
                    {/* INFO Badge for info priority */}
                    {notification.priority === 'info' && (
                      <Badge variant="secondary" className={compact ? "text-[9px] px-1.5 py-0 h-4" : "text-[10px] px-2 py-0 h-5"}>
                        INFO
                      </Badge>
                    )}
                    {/* Time */}
                    <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-muted-foreground`}>
                      {safeFormatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                </div>
                
                <p className={`${compact ? 'text-[11px] leading-snug mb-1' : 'text-sm leading-relaxed mb-2'} text-muted-foreground`}>
                  {notification.message}
                </p>
                
                {/* Service Source */}
                <div className={`flex items-center gap-2 ${compact ? 'text-[10px] mb-1' : 'text-[11px] mb-2'} text-muted-foreground`}>
                  <span className="font-medium">{notification.serviceSource}</span>
                </div>
                
                {/* Action Buttons */}
                {hasActions && (
                  <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-2'}`}>
                    {notification.actions!.map((action, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-7 text-xs'} border-primary/30 text-primary hover:bg-primary/10`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(notification, action);
                        }}
                        data-testid={`button-action-${notification.id}-${idx}`}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Tag */}
            {notification.statusTag && (
              <div className={compact ? "mt-1 ml-8" : "mt-2 ml-11"}>
                <Badge 
                  className={`${compact ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'} font-bold ${
                    notification.statusTag === 'ACTION REQUIRED' 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {notification.statusTag}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabCategory>('for_you');
  const [subFilter, setSubFilter] = useState<SubFilter>('all');
  const [sortNewest, setSortNewest] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const isMobileBreakpoint = useIsMobile();
  
  // Enhanced mobile detection: consider touch + mobile user agent + viewport
  // Samsung S24 Ultra and other large phones may have viewport > 768px
  const isMobile = (() => {
    if (typeof window === 'undefined') return isMobileBreakpoint;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const hasMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    // Mobile if: small viewport OR (touch device with mobile UA)
    return isMobileBreakpoint || (hasTouch && hasMobileUA && hasCoarsePointer);
  })();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  const userPlatformRole = (user as any)?.platformRole as string | null | undefined;
  
  // Trinity context for mode detection
  const { context: trinityContext } = useTrinityContext(workspaceId);
  const isGuruMode = trinityContext?.trinityMode === 'guru';
  
  // WebSocket for real-time updates
  const { isConnected } = useNotificationWebSocket(userId, workspaceId);
  
  // Cross-tab notification sync - syncs read/cleared state across browser tabs
  const { syncNotificationRead, syncClearAll } = useNotificationSync();

  // Fetch notifications - truly live with instant refetch on WebSocket events
  // UNS is UNIVERSAL - works for both authenticated AND unauthenticated users
  // Unauthenticated users see platform updates only (backend handles this)
  const { data: rawData, isLoading, refetch } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: true, // ALWAYS enabled - UNS is universal for all users
    staleTime: 0, // Always fresh - WebSocket triggers immediate refetch
    refetchInterval: user ? (isConnected ? 30000 : 10000) : 60000, // Slower for public
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
  
  // Refetch when popover opens for instant updates
  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);
  
  // Restore scroll position after data updates (prevents scroll reset on refetch)
  useEffect(() => {
    if (scrollRef.current && scrollPositionRef.current > 0) {
      scrollRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [rawData]);
  
  // Map to UNS format with user's platform role for action button visibility
  const allNotifications = mapToUNS(rawData, userPlatformRole);
  
  // Sub-category counts - based on actual data patterns
  const systemAlertsSubCount = allNotifications.filter(n => 
    n.category === 'system_alerts' && !n.isRead
  ).length;
  const adminReviewCount = allNotifications.filter(n => 
    (n.statusTag?.includes('ACTION') || n.priority === 'critical' || n.priority === 'high') && !n.isRead
  ).length;
  const updatesCount = allNotifications.filter(n => 
    (n.subCategory === 'feature_release' || n.subCategory === 'update' || n.priority === 'info') && !n.isRead
  ).length;

  // Filter notifications - 'all' shows everything in the current tab
  // Sub-filters work across ALL notifications (ignore activeTab when sub-filter is active)
  const filteredNotifications = allNotifications.filter(n => {
    if (showUnreadOnly && n.isRead) return false;
    
    // When 'all' sub-filter is selected, respect the main tab filter
    if (subFilter === 'all') {
      return n.category === activeTab;
    }
    
    // Sub-filters apply across all categories (ignores tab when filtering)
    if (subFilter === 'system_alerts') {
      return n.category === 'system_alerts';
    }
    if (subFilter === 'admin_review') {
      return n.statusTag?.includes('ACTION') || n.priority === 'critical' || n.priority === 'high';
    }
    if (subFilter === 'updates') {
      return n.subCategory === 'feature_release' || n.subCategory === 'update' || n.priority === 'info';
    }
    
    return n.category === activeTab;
  });
  
  // Sort
  const sortedNotifications = [...filteredNotifications].sort((a, b) => {
    if (!sortNewest) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  // Counts
  const forYouCount = allNotifications.filter(n => n.category === 'for_you' && !n.isRead).length;
  const systemCount = allNotifications.filter(n => n.category === 'system_alerts' && !n.isRead).length;
  const totalUnread = rawData?.totalUnread ?? (forYouCount + systemCount);

  // Mutations with cross-tab sync
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      // Try multiple endpoints based on notification type
      const response = await apiRequest("POST", `/api/notifications/acknowledge/${id}`);
      return response.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      // Sync across tabs
      syncNotificationRead(id);
    },
  });
  
  // Guarded dismiss handler for UNS - requires auth
  const handleDismiss = (id: string) => {
    if (!user) {
      toast({ title: "Sign In Required", description: "Please sign in to dismiss notifications.", variant: "destructive" });
      return;
    }
    dismissMutation.mutate(id);
  };
  
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notifications/clear-all");
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/combined"] });
      const previousData = queryClient.getQueryData(["/api/notifications/combined"]);
      queryClient.setQueryData(["/api/notifications/combined"], (old: any) => ({
        ...old,
        notifications: [],
        platformUpdates: old?.platformUpdates?.map((u: any) => ({ ...u, isViewed: true })) || [],
        maintenanceAlerts: old?.maintenanceAlerts?.map((a: any) => ({ ...a, isAcknowledged: true })) || [],
        totalUnread: 0,
      }));
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      // Sync across tabs
      syncClearAll();
      toast({ title: "Done", description: "All notifications cleared." });
    },
  });
  
  const orchestrationMutation = useMutation({
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
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        toast({ title: "Action Executed", description: data.message || "Trinity processed your request." });
      } else {
        toast({ title: "Action Failed", description: data.error || "Unable to complete action.", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
  
  const handleAction = (notification: UNSNotification, action: NonNullable<UNSNotification['actions']>[0]) => {
    if (action.type === 'navigate') {
      setOpen(false);
      window.location.href = action.target;
    } else if (action.type === 'orchestration') {
      // Require auth for orchestration actions
      if (!user) {
        toast({ title: "Sign In Required", description: "Please sign in to perform this action.", variant: "destructive" });
        return;
      }
      orchestrationMutation.mutate({
        actionCode: action.target,
        targetId: notification.metadata?.workflowId || notification.id,
        metadata: { notificationId: notification.id, source: 'uns_popover' },
      });
    } else if (action.type === 'api_call') {
      // Require auth for API calls
      if (!user) {
        toast({ title: "Sign In Required", description: "Please sign in to perform this action.", variant: "destructive" });
        return;
      }
      apiRequest("POST", action.target).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        toast({ title: "Done", description: "Action completed." });
      });
    }
  };

  const NotificationsContent = ({ simplified = false, compact = false }: { simplified?: boolean; compact?: boolean }) => (
    <div 
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      data-trinity-surface="notifications"
    >
      {/* UNS Header with Trinity Branding - Violet to Indigo Gradient */}
      <div className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} border-b bg-gradient-to-r from-violet-600 to-indigo-600 flex-shrink-0`}>
        <div className={`flex items-center justify-between ${compact ? 'gap-2' : 'gap-3'}`}>
          <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
            <div className={`relative ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center`}>
              <TrinityRedesign mode="IDLE" size={compact ? 28 : 36} mini={true} className="aspect-square object-contain" />
            </div>
            <div>
              <h2 className={`font-bold ${compact ? 'text-sm' : 'text-base'} leading-tight text-white`}>Universal Notifications</h2>
              <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-white/90 font-medium`}>
                {user ? `${totalUnread} unread` : 'Platform Updates'}
              </span>
            </div>
          </div>
          <Badge variant="outline" className={`${compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-3 py-1.5'} font-medium bg-white/20 text-white border-white/30`}>
            {user ? `${forYouCount + systemCount} new` : `${allNotifications.length}`}
          </Badge>
        </div>
        {/* Public User Banner */}
        {!user && (
          <div className={`${compact ? 'mt-1.5 px-2 py-1.5' : 'mt-2 px-3 py-2'} rounded-lg bg-white/20 backdrop-blur-sm border border-white/30`}>
            <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-white font-medium`}>
              Sign in for personalized notifications.
            </p>
          </div>
        )}
      </div>
      
      {/* Main Tabs: For You | System Alerts | Clear All Read - Matching Design */}
      <div className={`flex items-center border-b bg-muted/30 flex-shrink-0 ${compact ? 'px-1' : 'px-2'}`}>
        <button
          onClick={() => setActiveTab('for_you')}
          className={`relative ${compact ? 'py-2 px-2.5 text-xs' : 'py-3 px-4 text-sm'} font-medium transition-colors ${
            activeTab === 'for_you' 
              ? 'text-foreground' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-for-you"
        >
          <span className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
            For You
            {forYouCount > 0 && (
              <Badge className={`${compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]'} flex items-center justify-center bg-primary text-white rounded-full`}>
                {forYouCount > 9 ? '9+' : forYouCount}
              </Badge>
            )}
          </span>
          {activeTab === 'for_you' && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('system_alerts')}
          className={`relative ${compact ? 'py-2 px-2.5 text-xs' : 'py-3 px-4 text-sm'} font-medium transition-colors ${
            activeTab === 'system_alerts' 
              ? 'text-foreground' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-system-alerts"
        >
          <span className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
            System
            {systemCount > 0 && (
              <Badge className={`${compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]'} flex items-center justify-center bg-amber-500 text-white rounded-full`}>
                {systemCount > 9 ? '9+' : systemCount}
              </Badge>
            )}
          </span>
          {activeTab === 'system_alerts' && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-full" />
          )}
        </button>
        <div className="flex-1" />
        {/* Only show Clear All button for authenticated users */}
        {user && (
          <Button
            variant="outline"
            size="sm"
            className={`${compact ? 'h-6 px-2 text-[10px]' : 'h-8 px-3 text-xs'} font-medium bg-background border-muted-foreground/20`}
            onClick={() => clearAllMutation.mutate()}
            disabled={clearAllMutation.isPending || totalUnread === 0}
            data-testid="button-clear-all-read"
          >
            Clear All
          </Button>
        )}
      </div>
      
      {/* Sub-filters - Horizontally scrollable chips */}
      {!simplified && (
        <div 
          className={`${compact ? 'px-2 py-1.5' : 'px-3 py-2'} border-b bg-muted/10 flex-shrink-0 overflow-x-auto scrollbar-hide`}
          style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'} min-w-max`}>
            {/* All Sub-filter */}
            <Button
              variant={subFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className={`${compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-3'} rounded-full whitespace-nowrap ${
                subFilter === 'all' ? '' : 'border-muted-foreground/30'
              }`}
              onClick={() => setSubFilter('all')}
              data-testid="subfilter-all"
            >
              All
            </Button>
            
            {/* System Alerts Sub-filter */}
            <Button
              variant={subFilter === 'system_alerts' ? 'default' : 'outline'}
              size="sm"
              className={`${compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-3'} rounded-full whitespace-nowrap ${
                subFilter === 'system_alerts' ? '' : 'border-muted-foreground/30'
              }`}
              onClick={() => setSubFilter('system_alerts')}
              data-testid="subfilter-system-alerts"
            >
              <Shield className={compact ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3 mr-1"} />
              Alerts
              {systemAlertsSubCount > 0 && (
                <Badge className={`${compact ? 'ml-1 h-3.5 min-w-3.5 px-0.5 text-[8px]' : 'ml-1.5 h-4 min-w-4 px-1 text-[9px]'} bg-red-500 text-white rounded-full`}>
                  {systemAlertsSubCount}
                </Badge>
              )}
            </Button>
            
            {/* Admin Review Sub-filter */}
            <Button
              variant={subFilter === 'admin_review' ? 'default' : 'outline'}
              size="sm"
              className={`${compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-3'} rounded-full whitespace-nowrap ${
                subFilter === 'admin_review' ? '' : 'border-muted-foreground/30'
              }`}
              onClick={() => setSubFilter('admin_review')}
              data-testid="subfilter-admin-review"
            >
              <UserCheck className={compact ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3 mr-1"} />
              Admin
              {adminReviewCount > 0 && (
                <Badge className={`${compact ? 'ml-1 h-3.5 min-w-3.5 px-0.5 text-[8px]' : 'ml-1.5 h-4 min-w-4 px-1 text-[9px]'} bg-red-500 text-white rounded-full`}>
                  {adminReviewCount}
                </Badge>
              )}
            </Button>
            
            {/* Updates Sub-filter */}
            <Button
              variant={subFilter === 'updates' ? 'default' : 'outline'}
              size="sm"
              className={`${compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-3'} rounded-full whitespace-nowrap ${
                subFilter === 'updates' ? '' : 'border-muted-foreground/30'
              }`}
              onClick={() => setSubFilter('updates')}
              data-testid="subfilter-updates"
            >
              Updates
              {updatesCount > 0 && (
                <Badge className={`${compact ? 'ml-1 h-3.5 min-w-3.5 px-0.5 text-[8px]' : 'ml-1.5 h-4 min-w-4 px-1 text-[9px]'} bg-primary text-white rounded-full`}>
                  {updatesCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      )}
      
      {/* Sort & Filter Row - Simplified on mobile */}
      <div className={`flex items-center justify-between border-b bg-background flex-shrink-0 ${compact ? 'px-2 py-1 gap-1' : simplified ? 'px-3 py-2 gap-1' : 'px-4 py-2 gap-2'}`}>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground truncate`}>
          {sortedNotifications.filter(n => !n.isRead).length} unread
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'}`}
            onClick={() => setSortNewest(!sortNewest)}
            data-testid="button-sort-toggle"
          >
            <ArrowUpDown className={compact ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3 mr-1"} />
            {sortNewest ? 'New' : 'Old'}
          </Button>
          <Button
            variant={showUnreadOnly ? 'secondary' : 'ghost'}
            size="sm"
            className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'}`}
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            data-testid="button-unread-toggle"
          >
            <Eye className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          </Button>
        </div>
      </div>
      
      {/* Notification List - Scrollable container with position preservation */}
      <div 
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{ 
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
        }}
        onScroll={(e) => {
          scrollPositionRef.current = e.currentTarget.scrollTop;
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : sortedNotifications.length > 0 ? (
          <div className="divide-y min-h-0">
            {sortedNotifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onDismiss={handleDismiss}
                onAction={handleAction}
                isGuruMode={isGuruMode}
                canInteract={!!user}
                compact={compact}
              />
            ))}
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center ${compact ? 'py-10' : 'py-16'} text-muted-foreground`}>
            <div className={`${compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'} rounded-full bg-muted/50 flex items-center justify-center`}>
              {activeTab === 'system_alerts' ? (
                <Check className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} text-emerald-500 opacity-70`} />
              ) : (
                <Sparkles className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} opacity-50`} />
              )}
            </div>
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>
              {activeTab === 'system_alerts' ? 'All systems operational' : 'No notifications'}
            </span>
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1`}>
              {activeTab === 'system_alerts' ? 'No system alerts at this time' : "You're all caught up!"}
            </span>
          </div>
        )}
      </div>
      
      {/* Footer: Ask Trinity for Help - Matching Design */}
      <div className="border-t bg-background shrink-0">
        <div className={compact ? "p-2 flex flex-col gap-1.5" : "p-3 flex flex-col gap-2"}>
          <Button
            variant="outline"
            className={`w-full justify-start ${compact ? 'text-xs h-9 gap-2' : 'text-sm h-11 gap-3'} font-medium border-muted-foreground/20 hover:bg-muted/50 group`}
            onClick={() => {
              setOpen(false);
              window.location.href = '/trinity-insights';
            }}
            data-testid="button-ask-trinity"
          >
            <div className={`shrink-0 ${compact ? 'p-0.5' : 'p-1'} rounded-lg bg-gradient-to-br from-cyan-500/10 to-purple-500/10 group-hover:from-cyan-500/20 group-hover:to-purple-500/20 transition-colors`}>
              <TrinityBadge showLabel={false} />
            </div>
            <span className="flex items-center gap-1">
              <span className={`font-semibold bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent ${compact ? 'text-xs' : ''}`}>
                Ask Trinity
              </span>
              <span className={`text-muted-foreground ${compact ? 'text-[10px]' : ''}`}>for Help</span>
            </span>
          </Button>
        </div>
        <div className={compact ? "px-2 pb-2" : "px-3 pb-3"}>
          <Button
            variant="ghost"
            className={`w-full justify-center ${compact ? 'text-[10px] h-6' : 'text-xs h-7'} font-medium text-primary hover:text-primary hover:bg-primary/5`}
            onClick={() => {
              setOpen(false);
              window.location.href = "/updates";
            }}
            data-testid="button-view-all-updates"
          >
            View all updates
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)}>
          <AnimatedNotificationBell
            notificationCount={totalUnread}
            onClick={() => setOpen(true)}
          />
        </div>
        <SheetContent 
          side="bottom" 
          className="p-0 rounded-t-2xl h-[550px] max-h-[80vh]"
          data-testid="notification-sheet-content"
          data-trinity-avoid="true"
        >
          <div className="h-full flex flex-col overflow-hidden">
            {/* Drag Handle for Mobile */}
            <div className="flex justify-center py-1.5 bg-background border-b shrink-0">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            {/* Full Feature Parity with Compact Mode for Mobile */}
            <NotificationsContent simplified={false} compact={true} />
          </div>
        </SheetContent>
      </Sheet>
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
        className="w-[380px] p-0 shadow-xl border-muted" 
        align="end"
        sideOffset={8}
        data-testid="notification-popover-content"
        data-trinity-avoid="true"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          const isMascotInteraction = target.closest('[data-mascot]') || 
                                       target.closest('[data-trinity]') ||
                                       target.closest('.mascot-container');
          if (isMascotInteraction) {
            e.preventDefault();
          }
        }}
      >
        <div className="h-[500px] max-h-[500px] flex flex-col overflow-hidden">
          <NotificationsContent />
        </div>
      </PopoverContent>
    </Popover>
  );
}
