import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, createContext, useContext } from "react";
import { useLocation } from "wouter";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
  isCleared?: boolean; // True if user explicitly cleared this item
}

interface NotificationsData {
  platformUpdates: any[];
  maintenanceAlerts: any[];
  notifications: any[];
  gapFindings?: any[];
  unreadPlatformUpdates: number;
  unreadNotifications: number;
  unreadAlerts: number;
  unreadGapFindings?: number;
  totalUnread: number;
}

// Module-level pending sets - survive component unmounts and window focus restores
// This ensures Clear All protection persists until server confirms
const _pendingSingleIds = new Set<string>();
let _pendingBulkIds: Set<string> | null = null;

// Pending-clear hook - reads/writes module-level Sets, triggers component re-renders
function usePendingClears() {
  // Counter to force re-renders when pending sets change
  const [, setRenderTrigger] = useState(0);
  const forceRender = useCallback(() => setRenderTrigger(c => c + 1), []);
  
  // Queue single item for clearing (synchronous)
  const queueSingle = useCallback((id: string) => {
    _pendingSingleIds.add(id);
    forceRender();
  }, [forceRender]);
  
  // Queue bulk clear with all provided IDs (synchronous)
  const queueBulk = useCallback((ids: string[]) => {
    if (ids.length > 0) {
      _pendingBulkIds = new Set(ids);
    }
    forceRender();
  }, [forceRender]);
  
  // Check if ID is pending clear (reads module Sets directly - always current)
  const isPending = useCallback((id: string): boolean => {
    return _pendingSingleIds.has(id) || (_pendingBulkIds?.has(id) ?? false);
  }, []);
  
  // Confirm IDs are cleared (remove from pending) - only called by reconcile
  const confirmCleared = useCallback((ids: string[]) => {
    let changed = false;
    ids.forEach(id => {
      if (_pendingSingleIds.delete(id)) changed = true;
      if (_pendingBulkIds?.delete(id)) changed = true;
    });
    // Clear bulk set if empty
    if (_pendingBulkIds && _pendingBulkIds.size === 0) {
      _pendingBulkIds = null;
    }
    if (changed) forceRender();
  }, [forceRender]);
  
  // Rollback single ID (on error)
  const rollbackSingle = useCallback((id: string) => {
    if (_pendingSingleIds.delete(id)) {
      forceRender();
    }
  }, [forceRender]);
  
  // Reset all pending clears (on error)
  const reset = useCallback(() => {
    _pendingSingleIds.clear();
    _pendingBulkIds = null;
    forceRender();
  }, [forceRender]);
  
  // Reconcile pending clears against server data
  // Items are confirmed cleared if: ACTUAL SERVER FLAGS are set (without wasCleared marker), or item vanished from response
  // IMPORTANT: If item has metadata.wasCleared, it's from optimistic update, NOT server confirmation
  // Only remove from pending when server data (without wasCleared) confirms the clear
  // This is the ONLY place pending IDs should be removed (not onSuccess)
  const reconcile = useCallback((data: NotificationsData) => {
    if (!data) return;
    
    // Build set of all IDs currently in response
    const responseIds = new Set<string>();
    // Build set of confirmed cleared IDs - ONLY using actual server flags WITHOUT wasCleared marker
    const confirmedClearedIds = new Set<string>();
    
    // Check platform updates - isViewed is server flag, but skip if wasCleared exists (optimistic data)
    data.platformUpdates?.forEach(u => {
      responseIds.add(u.id);
      // Only count as confirmed if isViewed is true AND no wasCleared marker (real server data)
      if (u.isViewed && !u.metadata?.wasCleared) confirmedClearedIds.add(u.id);
    });
    // Check notifications - clearedAt is server flag, but skip if wasCleared exists (optimistic data)
    data.notifications?.forEach(n => {
      responseIds.add(n.id);
      if (n.clearedAt && !n.metadata?.wasCleared) confirmedClearedIds.add(n.id);
    });
    // Check maintenance alerts - isAcknowledged is server flag, but skip if wasCleared exists
    data.maintenanceAlerts?.forEach(a => {
      responseIds.add(a.id);
      if (a.isAcknowledged && !a.metadata?.wasCleared) confirmedClearedIds.add(a.id);
    });
    // Check gap findings - clearedAt is server flag, but skip if wasCleared exists
    data.gapFindings?.forEach(f => {
      responseIds.add(f.id);
      if (f.clearedAt && !f.metadata?.wasCleared) confirmedClearedIds.add(f.id);
    });
    
    // Check pending IDs and confirm those that are cleared or vanished
    let changed = false;
    
    // Check single pending IDs
    _pendingSingleIds.forEach(id => {
      if (confirmedClearedIds.has(id) || !responseIds.has(id)) {
        _pendingSingleIds.delete(id);
        changed = true;
      }
    });
    
    // Check bulk pending IDs
    _pendingBulkIds?.forEach(id => {
      if (confirmedClearedIds.has(id) || !responseIds.has(id)) {
        _pendingBulkIds!.delete(id);
        changed = true;
      }
    });
    
    // Clear bulk set if empty
    if (_pendingBulkIds && _pendingBulkIds.size === 0) {
      _pendingBulkIds = null;
    }
    
    if (changed) forceRender();
  }, [forceRender]);
  
  return { isPending, queueSingle, queueBulk, confirmCleared, rollbackSingle, reset, reconcile };
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

// Roles that can see action buttons on notifications - expanded to include common admin roles
const ACTION_BUTTON_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'admin', 'owner', 'manager', 'hr_admin', 'billing_admin', 'workspace_admin'];

// Check if user has permission to see action buttons
// Requires a valid platform role that's in the allowed list
function canSeeActionButtons(platformRole: string | null | undefined): boolean {
  if (!platformRole) return false; // Unauthenticated users cannot see action buttons
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

// Generate a correlation key to detect semantic duplicates from different sources
function generateCorrelationKey(title: string, category: string, createdAt: string): string {
  // Normalize title: lowercase, remove non-alphanumeric, extract key words
  const normalizedTitle = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3) // Only keep significant words
    .slice(0, 5) // Take first 5 significant words
    .sort() // Sort for order-independence
    .join('_');
  
  // Group by 15-minute windows to catch near-simultaneous duplicates
  const timestamp = new Date(createdAt);
  const timeWindow = Math.floor(timestamp.getTime() / (15 * 60 * 1000));
  
  return `${category}_${normalizedTitle}_${timeWindow}`;
}

// Map existing data to UNS format with human-friendly language
// isPending: Optional function to check if item is pending clear (for reactive state)
function mapToUNS(
  data: NotificationsData | undefined, 
  userPlatformRole?: string | null,
  isPending?: (id: string) => boolean
): UNSNotification[] {
  if (!data) return [];
  
  const notifications: UNSNotification[] = [];
  const seenIds = new Set<string>();
  const seenCorrelationKeys = new Set<string>(); // Prevent semantic duplicates
  
  // Map platform updates - show ALL items, use isViewed for visual state
  data.platformUpdates?.forEach(update => {
    // Skip duplicates within the same fetch (by ID only)
    if (seenIds.has(update.id)) return;
    seenIds.add(update.id);
    
    const isSystem = ['maintenance', 'security_patch', 'system'].includes(update.category);
    
    // Check for semantic duplicates using correlation key
    const correlationKey = update.metadata?.correlationId || 
      generateCorrelationKey(update.title, update.category, update.createdAt);
    if (seenCorrelationKeys.has(correlationKey)) return; // Skip duplicate content
    seenCorrelationKeys.add(correlationKey);
    
    // Apply human-friendly copy transformation
    const friendlyTitle = humanizeTitle(update.title);
    const friendlyMessage = update.metadata?.endUserSummary 
      || generateEndUserSummary(update.description || '', update.category)
      || humanizeText(update.description || '');
    
    // Platform updates: isViewed means the user has seen/cleared this update
    // Also check pending clear tracking for lifecycle guard
    const isCleared = update.isViewed || update.metadata?.wasCleared || (isPending?.(update.id) ?? false);
    
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
      isCleared, // Database flag, optimistic metadata, or pending clear
      createdAt: update.createdAt,
      metadata: update.metadata,
    });
  });
  
  // Map maintenance alerts with orchestration actions - show ALL
  data.maintenanceAlerts?.forEach(alert => {
    // Skip duplicates
    if (seenIds.has(alert.id)) return;
    seenIds.add(alert.id);
    
    // Check for semantic duplicates
    const correlationKey = generateCorrelationKey(alert.title, 'maintenance', alert.scheduledStartTime);
    if (seenCorrelationKeys.has(correlationKey)) return;
    seenCorrelationKeys.add(correlationKey);
    
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
    
    // Alerts: isAcknowledged means the user has acknowledged/cleared this alert
    // Also check pending clear tracking for lifecycle guard
    const isCleared = alert.isAcknowledged || alert.metadata?.wasCleared || (isPending?.(alert.id) ?? false);
    
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
      isCleared, // Database flag, optimistic metadata, or pending clear
      createdAt: alert.scheduledStartTime,
      actions,
      metadata: { workflowId: alert.id },
    });
  });
  
  // Map notifications - include ALL items (even cleared ones for history view)
  data.notifications?.forEach(notif => {
    // Skip duplicates
    if (seenIds.has(notif.id)) return;
    seenIds.add(notif.id);
    
    // Check for semantic duplicates using correlation key
    const correlationKey = notif.metadata?.correlationId || 
      generateCorrelationKey(notif.title, notif.type || 'notification', notif.createdAt);
    if (seenCorrelationKeys.has(correlationKey)) return;
    seenCorrelationKeys.add(correlationKey);
    
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
    
    // clearedAt indicates user explicitly cleared this notification
    // Also check pending clear tracking for lifecycle guard
    const isCleared = Boolean(notif.clearedAt) || (isPending?.(notif.id) ?? false);
    // Notifications are read if explicitly marked as read OR if cleared
    const isRead = notif.isRead || isCleared;
    
    notifications.push({
      id: notif.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: notif.type === 'error' ? 'critical' : notif.type === 'warning' ? 'high' : 'info',
      category: 'for_you',
      subCategory: notif.type,
      serviceSource: friendlySource,
      statusTag: isRead ? undefined : 'NEW', // Remove NEW tag when read
      isRead,
      isCleared,
      createdAt: notif.createdAt,
      actions,
      metadata: notif.metadata,
    });
  });
  
  // Map gap intelligence findings (already formatted for UNS from backend)
  data.gapFindings?.forEach(finding => {
    // Skip duplicates
    if (seenIds.has(finding.id)) return;
    seenIds.add(finding.id);
    
    // Check for semantic duplicates
    const correlationKey = finding.metadata?.correlationId || 
      generateCorrelationKey(finding.title, finding.category || 'gap', finding.createdAt);
    if (seenCorrelationKeys.has(correlationKey)) return;
    seenCorrelationKeys.add(correlationKey);
    
    // Gap findings come pre-formatted from the backend
    // Normalize category to 'for_you' so they appear in the For You tab with their count
    // isCleared from explicit clear action (clearedAt) or pending clear tracking
    const isCleared = Boolean(finding.clearedAt) || (isPending?.(finding.id) ?? false);
    notifications.push({
      id: finding.id,
      title: finding.title,
      message: finding.message,
      priority: finding.priority,
      category: 'for_you', // Always show in For You tab (matching the apiForYouUnread calculation)
      subCategory: finding.subCategory || finding.category, // Preserve original category as subCategory
      serviceSource: finding.serviceSource,
      statusTag: finding.isRead ? undefined : finding.statusTag, // Remove NEW tag when read
      isRead: finding.isRead,
      isCleared,
      createdAt: finding.createdAt,
      actions: finding.actions,
      metadata: finding.metadata,
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
        <div className={`${cardBg} rounded-md overflow-hidden`}>
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
              
              {/* Content & Actions - Always stacked in popover to maintain consistent width */}
              <div className={`flex-1 min-w-0 flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
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
  const isMobileBreakpoint = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Scroll position preservation refs to prevent scroll reset during data refetches
  const scrollPositionRef = useRef<number>(0);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  
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
  
  // Reactive pending-clear state - stores IDs in React state for proper re-renders
  const pendingClears = usePendingClears();
  

  // Fetch notifications - truly live with instant refetch on WebSocket events
  // UNS is UNIVERSAL - works for both authenticated AND unauthenticated users
  // Unauthenticated users see platform updates only (backend handles this)
  const { data: rawData, isLoading, refetch, dataUpdatedAt } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: true, // ALWAYS enabled - UNS is universal for all users
    staleTime: 0, // Always fresh - WebSocket triggers immediate refetch
    refetchInterval: user ? (isConnected ? 30000 : 10000) : 60000, // Slower for public
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
  
  // Reconcile pending clears when data changes - removes IDs from pending set when server confirms
  useEffect(() => {
    if (rawData) {
      pendingClears.reconcile(rawData);
    }
  }, [rawData, dataUpdatedAt, pendingClears.reconcile]);
  
  // Refetch when popover opens for instant updates
  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);
  
  // Scroll event handler to track position
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    if (target) {
      scrollPositionRef.current = target.scrollTop;
    }
  }, []);
  
  // Callback ref that immediately attaches scroll listener when viewport is available
  const setViewportRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up old listener if viewport changed
    if (scrollViewportRef.current && scrollViewportRef.current !== node) {
      scrollViewportRef.current.removeEventListener('scroll', handleScroll);
    }
    
    scrollViewportRef.current = node;
    
    if (node) {
      node.addEventListener('scroll', handleScroll, { passive: true });
      // Restore saved scroll position immediately
      if (scrollPositionRef.current > 0) {
        node.scrollTop = scrollPositionRef.current;
      }
    }
  }, [handleScroll]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);
  
  // Preserve scroll position during data refetches using requestAnimationFrame
  // Key off dataUpdatedAt so the effect only fires after data mutations
  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current;
    if (viewport && scrollPositionRef.current > 0 && !isLoading) {
      requestAnimationFrame(() => {
        viewport.scrollTop = scrollPositionRef.current;
      });
    }
  }, [dataUpdatedAt, isLoading]);
  
  // Reset scroll position when switching tabs or filters
  useEffect(() => {
    scrollPositionRef.current = 0;
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = 0;
    }
  }, [activeTab, subFilter]);
  
  // Map to UNS format with user's platform role for action button visibility
  // Pass isPending from reactive hook to ensure cleared items stay hidden
  const allNotifications = mapToUNS(rawData, userPlatformRole, pendingClears.isPending);
  
  // Filter to only non-cleared items for default display 
  // Cleared items are hidden from default view but accessible via history toggle
  // This uses isCleared flag which is set when user explicitly clears items
  const visibleNotifications = allNotifications.filter(n => !n.isCleared);
  
  // Use API-provided counts as the authoritative source for badges
  // This ensures bell badge, tab badges, and "X unread" text are always in sync
  const apiTotalUnread = rawData?.totalUnread ?? 0;
  // Include gap findings in for-you count since they appear in the for_you tab
  const apiForYouUnread = (rawData?.unreadPlatformUpdates ?? 0) + (rawData?.unreadNotifications ?? 0) + (rawData?.unreadGapFindings ?? 0);
  const apiSystemUnread = rawData?.unreadAlerts ?? 0;
  
  // For tab badges - use API counts for consistency with bell badge
  const forYouCount = apiForYouUnread;
  const systemCount = apiSystemUnread;
  const totalUnread = apiTotalUnread;
  
  // Sub-category counts - based on visible (non-cleared) items that are also unread
  const systemAlertsSubCount = visibleNotifications.filter(n => n.category === 'system_alerts' && !n.isRead).length;
  const adminReviewCount = visibleNotifications.filter(n => 
    (n.statusTag?.includes('ACTION') || n.priority === 'critical' || n.priority === 'high') && !n.isRead
  ).length;
  const updatesCount = visibleNotifications.filter(n => 
    (n.subCategory === 'feature_release' || n.subCategory === 'update' || n.priority === 'info') && !n.isRead
  ).length;

  // Filter notifications - default shows non-cleared items, toggle filters to unread only
  // When showUnreadOnly is true, show only unread items from visible (non-cleared) list
  // When showUnreadOnly is false, show all non-cleared items
  const filteredNotifications = visibleNotifications.filter(n => {
    // Apply unread filter first if enabled
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

  // Mutations with cross-tab sync
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      // Try multiple endpoints based on notification type
      const response = await apiRequest("POST", `/api/notifications/acknowledge/${id}`);
      return response.json();
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/combined"] });
      const previousData = queryClient.getQueryData(["/api/notifications/combined"]);
      
      // Add to pending clear tracking for race condition protection (reactive state)
      pendingClears.queueSingle(id);
      
      // Optimistic cache update for immediate UI feedback
      const now = new Date().toISOString();
      queryClient.setQueryData(["/api/notifications/combined"], (old: any) => {
        if (!old) return old;
        
        // Find which type the item belongs to and decrement appropriate counter
        let unreadNotifications = old.unreadNotifications || 0;
        let unreadPlatformUpdates = old.unreadPlatformUpdates || 0;
        let unreadAlerts = old.unreadAlerts || 0;
        let unreadGapFindings = old.unreadGapFindings || 0;
        
        // Check each array and decrement the right counter
        const inNotifications = old.notifications?.some((n: any) => n.id === id && !n.clearedAt);
        const inPlatformUpdates = old.platformUpdates?.some((u: any) => u.id === id && !u.isViewed);
        const inAlerts = old.maintenanceAlerts?.some((a: any) => a.id === id && !a.isAcknowledged);
        const inGapFindings = old.gapFindings?.some((f: any) => f.id === id && !f.clearedAt);
        
        if (inNotifications) unreadNotifications = Math.max(0, unreadNotifications - 1);
        if (inPlatformUpdates) unreadPlatformUpdates = Math.max(0, unreadPlatformUpdates - 1);
        if (inAlerts) unreadAlerts = Math.max(0, unreadAlerts - 1);
        if (inGapFindings) unreadGapFindings = Math.max(0, unreadGapFindings - 1);
        
        return {
          ...old,
          notifications: old.notifications?.map((n: any) => 
            n.id === id ? { ...n, clearedAt: now, isRead: true, metadata: { ...(n.metadata || {}), wasCleared: true } } : n
          ),
          platformUpdates: old.platformUpdates?.map((u: any) => 
            u.id === id ? { ...u, isViewed: true, metadata: { ...(u.metadata || {}), wasCleared: true } } : u
          ),
          maintenanceAlerts: old.maintenanceAlerts?.map((a: any) => 
            a.id === id ? { ...a, isAcknowledged: true, metadata: { ...(a.metadata || {}), wasCleared: true } } : a
          ),
          gapFindings: old.gapFindings?.map((f: any) => 
            f.id === id ? { ...f, clearedAt: now, isRead: true, metadata: { ...(f.metadata || {}), wasCleared: true } } : f
          ),
          totalUnread: unreadNotifications + unreadPlatformUpdates + unreadAlerts,
          unreadNotifications,
          unreadPlatformUpdates,
          unreadAlerts,
          unreadGapFindings: 0,
        };
      });
      
      return { previousData, clearedId: id };
    },
    onSuccess: (_, id) => {
      // Don't remove from pending here - let reconcile confirm when server data shows cleared
      // This prevents race condition where stale refetch arrives before DB commit
      // Invalidate queries to get fresh data from server
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
      // Sync across tabs
      syncNotificationRead(id);
    },
    onError: (_, id, context: any) => {
      // Remove from pending tracking on error (rollback reactive state)
      pendingClears.rollbackSingle(id);
      // Restore previous cache state
      if (context?.previousData) {
        queryClient.setQueryData(["/api/notifications/combined"], context.previousData);
      }
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
      // IMPORTANT: Capture IDs BEFORE canceling queries to ensure we have the data
      const snapshotData = queryClient.getQueryData(["/api/notifications/combined"]) as NotificationsData | undefined;
      
      // Capture all current IDs for race condition protection FIRST
      const allIds: string[] = [];
      snapshotData?.notifications?.forEach(n => allIds.push(n.id));
      snapshotData?.platformUpdates?.forEach(u => allIds.push(u.id));
      snapshotData?.maintenanceAlerts?.forEach(a => allIds.push(a.id));
      snapshotData?.gapFindings?.forEach(f => allIds.push(f.id));
      
      // Queue bulk IDs BEFORE canceling queries to protect against race
      if (allIds.length > 0) {
        pendingClears.queueBulk(allIds);
      }
      
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/combined"] });
      const previousData = snapshotData;
      const now = new Date().toISOString();
      
      // Optimistic cache update for immediate UI feedback + pending set for protection
      queryClient.setQueryData(["/api/notifications/combined"], (old: any) => ({
        ...old,
        notifications: old?.notifications?.map((n: any) => ({ 
          ...n, 
          clearedAt: now, 
          isRead: true,
          metadata: { ...(n.metadata || {}), wasCleared: true }
        })) || [],
        platformUpdates: old?.platformUpdates?.map((u: any) => ({ 
          ...u, 
          isViewed: true,
          metadata: { ...(u.metadata || {}), wasCleared: true }
        })) || [],
        maintenanceAlerts: old?.maintenanceAlerts?.map((a: any) => ({ 
          ...a, 
          isAcknowledged: true,
          metadata: { ...(a.metadata || {}), wasCleared: true }
        })) || [],
        gapFindings: old?.gapFindings?.map((f: any) => ({
          ...f,
          isRead: true,
          clearedAt: now,
          metadata: { ...(f.metadata || {}), wasCleared: true }
        })) || [],
        totalUnread: 0,
        unreadNotifications: 0,
        unreadPlatformUpdates: 0,
        unreadAlerts: 0,
        unreadGapFindings: 0,
      }));
      return { previousData, clearedIds: allIds };
    },
    onSuccess: () => {
      syncClearAll();
      toast({ title: "Done", description: "All notifications cleared." });
      
      // Don't remove from pending here - let reconcile confirm when server data shows cleared
      // This prevents race condition where stale refetch arrives before DB commit
      // Force refetch to get fresh data from server - use refetchType 'all' to ensure active queries update
      queryClient.invalidateQueries({ 
        queryKey: ["/api/notifications/combined"],
        refetchType: 'all'
      });
    },
    onError: (error, _, context: any) => {
      // Reset pending clear tracking on error (reactive state)
      pendingClears.reset();
      if (context?.previousData) {
        queryClient.setQueryData(["/api/notifications/combined"], context.previousData);
      }
      toast({ title: "Error", description: "Failed to clear notifications.", variant: "destructive" });
    },
  });
  
  const orchestrationMutation = useMutation({
    mutationFn: async (params: { actionCode: string; targetId?: string; metadata?: Record<string, any> }) => {
      const response = await apiRequest("POST", "/api/quick-fixes/execute", {
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

  // Memoize content generator to prevent remounting on parent re-renders
  // This preserves scroll position during data refetches
  const renderNotificationsContent = useMemo(() => {
    return ({ simplified = false, compact = false }: { simplified?: boolean; compact?: boolean }) => (
    <div 
      className="flex flex-col h-full min-h-0 overflow-hidden"
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
                {user ? (totalUnread > 0 ? `${totalUnread} unread` : 'All caught up') : 'Platform Updates'}
              </span>
            </div>
          </div>
          <Badge variant="outline" className={`${compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-3 py-1.5'} font-medium bg-white/20 text-white border-white/30`}>
            {sortedNotifications.length} in view
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
          {sortedNotifications.length} in view
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
      
      {/* Notification List - Scrollable container with visible scrollbar */}
      <ScrollArea 
        className="flex-1 min-h-0 max-h-[320px]"
        viewportRef={setViewportRef}
      >
        <div className="min-h-0">
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
        <ScrollBar orientation="vertical" forceMount className="opacity-100 bg-muted/50" />
      </ScrollArea>
      
    </div>
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, subFilter, sortNewest, showUnreadOnly, sortedNotifications, isLoading, totalUnread, forYouCount, systemCount, user, allNotifications, visibleNotifications, systemAlertsSubCount, adminReviewCount, updatesCount, isGuruMode, isMobile, setOpen]);

  // Create stable component references using the memoized generator
  const MobileNotificationsContent = renderNotificationsContent({ simplified: false, compact: true });
  const DesktopNotificationsContent = renderNotificationsContent({ simplified: false, compact: false });

  // Footer with proper navigation access
  const Footer = ({ compact }: { compact: boolean }) => (
    <div className="border-t bg-background shrink-0">
      <div className={compact ? "p-2 flex flex-col gap-1.5" : "p-3 flex flex-col gap-2"}>
        <button
          onClick={() => {
            setOpen(false);
            setLocation('/trinity-insights');
          }}
          className={`inline-flex items-center w-full justify-start font-medium rounded-md border border-muted-foreground/20 hover:bg-muted/50 cursor-pointer ${compact ? 'text-xs h-9 px-3 py-2 gap-2' : 'text-sm h-11 px-4 py-3 gap-3'}`}
          data-testid="button-ask-trinity"
        >
          <Sparkles className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} flex-shrink-0 text-cyan-500`} />
          <span className="flex items-center gap-1">
            <span className={`font-semibold bg-gradient-to-r from-cyan-600 to-purple-600 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent ${compact ? 'text-xs' : ''}`}>
              Ask Trinity
            </span>
            <span className={`text-muted-foreground ${compact ? 'text-[10px]' : ''}`}>for Help</span>
          </span>
        </button>
      </div>
      <div className={compact ? "px-2 pb-2" : "px-3 pb-3"}>
        <button
          onClick={() => {
            setOpen(false);
            setLocation('/updates');
          }}
          className={`w-full justify-center inline-flex font-medium text-primary hover:text-primary hover:bg-primary/5 rounded-md cursor-pointer ${compact ? 'text-[10px] h-6 px-3 py-1' : 'text-xs h-7 px-4 py-2'}`}
          data-testid="button-view-all-updates"
        >
          View all updates
        </button>
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
          className="p-0 rounded-t-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(90vh, 560px)' }}
          data-testid="notification-sheet-content"
          data-trinity-avoid="true"
        >
          {/* Drag Handle for Mobile */}
          <div className="flex justify-center py-1.5 bg-background border-b shrink-0">
            <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          {/* Full Feature Parity with Compact Mode for Mobile */}
          <div className="flex flex-col h-full">
            {MobileNotificationsContent}
            <Footer compact={true} />
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
        className="max-w-[min(calc(100vw-1rem),420px)] w-full p-0 shadow-xl border-muted flex flex-col overflow-hidden" 
        style={{ maxHeight: 'min(75vh, 560px)' }}
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
        <div className="flex flex-col h-full">
          {DesktopNotificationsContent}
          <Footer compact={false} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
