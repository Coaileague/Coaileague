import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, createContext, useContext } from "react";
import { TrinityArrowMark } from "@/components/trinity-logo";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, AlertTriangle, Info, Wrench, Check, Clock, X, Sparkles, Zap, ChevronRight, Eye, Filter, ArrowUpDown, Shield, UserCheck, MessageCircle, Trash2, CheckCircle2 } from "lucide-react";
import { TrinityLogo } from "@/components/ui/coaileague-logo-mark";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger,  } from "@/components/ui/popover";
import { UniversalModal, UniversalModalContent } from '@/components/ui/universal-modal'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,  } from "@/components/ui/alert-dialog";
;
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useNotificationWebSocket } from "@/hooks/use-notification-websocket";
import { deriveTrinityModeFromUser } from "@/hooks/use-business-buddy-tier";
import { useNotificationSync } from "@/hooks/use-notification-sync";
import { useChatDock } from "@/contexts/ChatDockContext";
import { useTrinityModal } from "@/components/trinity-chat-modal";
import { humanizeTitle, humanizeText, generateEndUserSummary, generateStructuredBreakdown, type StructuredBreakdown } from "@shared/utils/humanFriendlyCopy";
import { Suspense, lazy } from "react";
import { SwipeToDelete } from "./swipe-to-delete";
import { PushNotificationPrompt } from "./push-notification-prompt";

// Generic template phrases to detect - these should be replaced with actual content
const GENERIC_TEMPLATE_PHRASES = [
  "we've unlocked new capabilities",
  "unlocked new capabilities under the hood",
  "we made some behind-the-scenes improvements",
  "we made some updates to improve your experience",
  "a new feature is now available",
  "everything works the same, just better",
  "your work won't be affected",
  "continuous improvements keep your tools",
  "we improved how fast things load",
  "we fixed an issue",
  "we made improvements to the platform",
];

/**
 * Get the best display message for a notification
 * Priority: actual message (humanized) > title-based summary
 * All content routes through universal humanization - no raw metadata access
 */
function getNotificationDisplayMessage(notification: { 
  title: string; 
  message: string; 
}): string {
  // Check if message looks like a generic template
  const lowerMessage = (notification.message || '').toLowerCase();
  const isGenericTemplate = GENERIC_TEMPLATE_PHRASES.some(phrase => 
    lowerMessage.includes(phrase)
  );
  
  // Priority 1: Actual message if not a generic template (always humanized)
  if (notification.message && !isGenericTemplate) {
    return humanizeText(notification.message);
  }
  
  // Priority 3: Generate contextual message from title
  const title = notification.title || '';
  if (title.toLowerCase().includes('watchdog')) {
    return 'System monitoring is now active to ensure smooth operations.';
  }
  if (title.toLowerCase().includes('config') || title.toLowerCase().includes('priority')) {
    return 'Configuration settings were adjusted to optimize performance.';
  }
  if (title.toLowerCase().includes('api') || title.toLowerCase().includes('route')) {
    return 'Backend connections were updated for faster data loading.';
  }
  if (title.toLowerCase().includes('platform core')) {
    return 'Core platform capabilities were enhanced.';
  }
  
  // Fallback: humanize the title as the message
  return humanizeText(title);
}

// Priority levels for UNS cards
type Priority = 'critical' | 'high' | 'medium' | 'info';

/**
 * normalizePriority — Single source of truth for priority mapping.
 * The backend sends a wide variety of priority strings ('normal', 'low', 'urgent',
 * 'emergency', 'P2', 'routine', etc). This function maps ALL of them to a valid
 * frontend Priority so PRIORITY_STYLES[priority] is NEVER undefined.
 */
function normalizePriority(raw: string | undefined | null): Priority {
  switch ((raw || '').toLowerCase().trim()) {
    case 'critical':
    case 'emergency':
      return 'critical';
    case 'urgent':
      return 'critical';    // urgent = red/critical severity
    case 'high':
      return 'high';
    case 'medium':
    case 'p1':
    case 'p2':
      return 'medium';
    case 'low':
    case 'normal':
    case 'routine':
    case 'info':
    case 'informational':
    default:
      return 'info';
  }
}
// Three distinct notification tabs:
// - alerts: Operational alerts requiring attention (payroll, schedule, client, employee issues)
// - updates: Informational updates (schedule changes, settings changes, general info)
// - system: Admin-only (workflow approvals, forced changes by support roles)
type TabCategory = 'alerts' | 'updates' | 'system';
type SubFilter = 'all'; // Simplified - no sub-filters needed with clear tab separation

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
    fixApplied?: boolean;
    actionRequired?: boolean;
    broadcastId?: string;
    wasCleared?: boolean;
    requiresAction?: boolean;
    correlationId?: string;
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
    border: 'border-l-4 border-l-border', 
    bg: 'bg-muted', 
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground'
  },
};

// Roles that can see full admin action buttons on notifications
const ACTION_BUTTON_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'];

// End-user workspace roles that can see simplified inline actions
const END_USER_WORKSPACE_ROLES = ['employee', 'officer', 'guard', 'staff', 'user'];

// Check if user has permission to see full admin action buttons
function canSeeActionButtons(platformRole: string | null | undefined): boolean {
  if (!platformRole) return false;
  return ACTION_BUTTON_ROLES.includes(platformRole);
}

// Check if an authenticated end user (employee/officer) should see simplified inline actions
function canSeeEndUserActions(workspaceRole: string | null | undefined, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return false;
  if (!workspaceRole) return true; // Authenticated users with no explicit role still get basic actions
  return END_USER_WORKSPACE_ROLES.includes(workspaceRole) || ACTION_BUTTON_ROLES.includes(workspaceRole);
}

// Generate simplified inline actions for end users (employees, officers)
function generateEndUserActions(notif: any): UNSNotification['actions'] {
  const actions: UNSNotification['actions'] = [];
  const title = (notif.title || '').toLowerCase();
  const type = notif.type || notif.category || '';
  const metadata = notif.metadata || {};

  // Shift offers — employees can accept or decline inline
  if (type === 'coverage_offer' || title.includes('shift offer') || metadata.offerId) {
    actions.push({
      label: 'Accept',
      type: 'navigate',
      target: metadata.offerId ? `/shifts/offers/${metadata.offerId}` : (notif.actionUrl || '/shifts/offers'),
      variant: 'primary',
    });
    actions.push({
      label: 'Decline',
      type: 'api_call',
      target: `/api/shifts/offers/${metadata.offerId || notif.id}/decline`,
      variant: 'ghost',
    });
    return actions;
  }

  // Time entry / timesheet — employee approval of own entries
  if (title.includes('time entry') || title.includes('timesheet') || type.includes('timesheet')) {
    actions.push({
      label: 'Review',
      type: 'navigate',
      target: '/timesheets',
      variant: 'primary',
    });
    return actions;
  }

  // Schedule updates
  if (title.includes('schedule') || title.includes('shift') || type.includes('schedule')) {
    actions.push({
      label: 'View Schedule',
      type: 'navigate',
      target: '/scheduling',
      variant: 'primary',
    });
    return actions;
  }

  // Payroll / pay stub
  if (title.includes('payroll') || title.includes('pay') || type.includes('payroll')) {
    actions.push({
      label: 'View Payroll',
      type: 'navigate',
      target: '/payroll',
      variant: 'primary',
    });
    return actions;
  }

  // Compliance / documents
  if (title.includes('compliance') || title.includes('document') || title.includes('certification')) {
    actions.push({
      label: 'View Documents',
      type: 'navigate',
      target: '/compliance',
      variant: 'primary',
    });
    return actions;
  }

  // Generic action required — show "Review" as fallback
  if (notif.metadata?.requiresAction || title.includes('action required') || title.includes('review')) {
    actions.push({
      label: 'Review',
      type: 'navigate',
      target: notif.actionUrl || '/',
      variant: 'primary',
    });
  }

  return actions;
}

// Generate action buttons based on notification type and content
function generateTypeBasedActions(
  notif: any,
  platformRole: string | null | undefined,
  workspaceRole?: string | null,
  isAuthenticated?: boolean
): UNSNotification['actions'] {
  const actions: UNSNotification['actions'] = [];
  const isAdmin = canSeeActionButtons(platformRole);
  const isEndUser = !isAdmin && canSeeEndUserActions(workspaceRole, !!isAuthenticated);

  // End users get simplified actions
  if (isEndUser) return generateEndUserActions(notif);

  // Admin/manager check — no actions for unauthenticated
  if (!isAdmin) return actions;
  
  const title = (notif.title || '').toLowerCase();
  const message = (notif.message || '').toLowerCase();
  const type = notif.type || notif.category || '';
  const metadata = notif.metadata || {};
  
  // Trinity™ Workflow Order Approvals - requires human decision
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
  
  // Trinity™ Decisions requiring approval
  if (metadata.aiBrainDecisionId || title.includes('ai decision') || title.includes('trinity suggests') || type === 'ai_decision') {
    actions.push({
      label: 'Verify & Approve',
      type: 'orchestration',
      target: `ai_brain.approve:${metadata.aiBrainDecisionId || notif.id}`,
      variant: 'primary',
    });
    actions.push({
      label: 'Modify',
      type: 'navigate',
      target: `/support/ai-console?decision=${metadata.aiBrainDecisionId || notif.id}`,
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
  
  // Shift Offer — coverage_offer type: officers can accept/decline inline
  if (type === 'coverage_offer' || title.includes('shift offer') || metadata.offerId) {
    actions.push({
      label: 'View & Accept',
      type: 'navigate',
      target: metadata.offerId
        ? `/shifts/offers/${metadata.offerId}`
        : (notif.actionUrl || '/shifts/offers'),
      variant: 'primary',
    });
    actions.push({
      label: 'Decline',
      type: 'api_call',
      target: `/api/shifts/offers/${metadata.offerId || notif.id}/decline`,
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
function generateCorrelationKey(title: string | null | undefined, category: string, createdAt: string): string {
  // Safely normalize title: handle null/undefined
  const safeTitle = (title || 'notification').toString();
  const normalizedTitle = safeTitle.toLowerCase()
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
  isPending?: (id: string) => boolean,
  workspaceRole?: string | null,
  isAuthenticated?: boolean
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
    const friendlyMessage = generateEndUserSummary(update.description || '', update.category)
      || humanizeText(update.description || '');
    
    // Platform updates: isViewed means the user has seen/cleared this update
    // Also check pending clear tracking for lifecycle guard
    const isCleared = update.isViewed || update.metadata?.wasCleared || (isPending?.(update.id) ?? false);
    
    // Categorize: system for admin/support items, updates for informational, alerts for action-required
    let category: TabCategory = 'updates'; // Default: informational updates
    if (isSystem) {
      category = 'system'; // Platform maintenance, security patches go to System tab
    } else if (update.category === 'security_patch' || update.metadata?.requiresAction) {
      category = 'alerts'; // Action-required items go to Alerts
    }
    
    notifications.push({
      id: update.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: update.category === 'security_patch' ? 'high' : 'info',
      category,
      subCategory: update.category,
      serviceSource: 'Trinity',
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
      category: 'system', // Maintenance alerts go to System tab (admin-only)
      subCategory: 'maintenance',
      serviceSource: 'Trinity',
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
    
    // Start with type-based actions for authorized users (admin) or simplified actions (end users)
    const actions: UNSNotification['actions'] = [...(generateTypeBasedActions(notif, userPlatformRole, workspaceRole, isAuthenticated) || [])];
    
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
    const friendlyMessage = generateEndUserSummary(notif.message || '', notif.type)
      || humanizeText(notif.message || '');
    
    // Always use Trinity as the source for end users
    const friendlySource = 'Trinity';
    
    // clearedAt indicates user explicitly cleared this notification
    // Also check pending clear tracking for lifecycle guard
    const isCleared = Boolean(notif.clearedAt) || (isPending?.(notif.id) ?? false);
    // Notifications are read if explicitly marked as read OR if cleared
    const isRead = notif.isRead || isCleared;
    
    // Determine category based on notification content:
    // - ALERTS: Operational items requiring attention (payroll issues, schedule conflicts, employee alerts, client issues)
    // - UPDATES: Informational changes (schedule published, settings changed, status updates)
    // - SYSTEM: Admin-only (workflow approvals, support actions, forced changes by support roles)
    
    const alertTypes = [
      'payroll_block', 'payroll_error', 'payroll_warning', 'payroll_issue',
      'schedule_conflict', 'schedule_alert', 'shift_conflict',
      'employee_issue', 'employee_warning', 'employee_alert',
      'client_issue', 'client_alert', 'client_warning',
      'compliance_alert', 'compliance_warning', 'hr_alert',
      'time_entry_issue', 'overtime_alert', 'break_violation',
      'error', 'warning', 'critical'
    ];
    
    // SYSTEM tab: Admin-only items (workflow approvals, support actions, forced changes)
    // Note: platform_update and feature_release go to UPDATES, not SYSTEM
    const systemTypes = [
      'platform_maintenance', 'known_issue', 'service_down', 'service_restored',
      'support_escalation', 'workflow_approval', 'admin_action', 'forced_change', 
      'support_override', 'approval_required', 'admin_review'
    ];
    
    const updateTypes = [
      'platform_update', 'feature_release', 'schedule_published', 'schedule_updated',
      'schedule_change', 'settings_changed', 'shift_assigned', 'shift_changed', 'shift_reminder',
      'shift_cancelled', 'employee_added', 'client_added', 'info', 'announcement', 'update',
      'payroll_processed', 'invoice_created', 'timesheet_approved', 'timesheet_rejected', 'pto_approved', 'pto_denied',
      'document_uploaded', 'document_expiring', 'profile_updated', 'form_assigned', 'mention',
    ];
    
    const systemCategories = ['system', 'admin', 'support'];
    
    const titleLower = notif.title?.toLowerCase() || '';
    const typeLower = notif.type?.toLowerCase() || '';
    
    // Check if it's an alert (action-required operational item)
    const isAlert = alertTypes.includes(typeLower) || 
                    titleLower.includes('alert') || 
                    titleLower.includes('issue') ||
                    titleLower.includes('error') ||
                    titleLower.includes('warning') ||
                    titleLower.includes('conflict') ||
                    notif.metadata?.requiresAction === true;
    
    // Check if it's an update (informational item)
    const isUpdate = updateTypes.includes(typeLower) ||
                     titleLower.includes('update') ||
                     titleLower.includes('published') ||
                     titleLower.includes('changed') ||
                     titleLower.includes('added') ||
                     titleLower.includes('release');
    
    // Check if it's a system/admin item (workflow approvals, forced changes by support)
    const isSystemNotification = systemCategories.includes(notif.category) || 
                                  systemTypes.includes(typeLower) ||
                                  titleLower.includes('approval') ||
                                  titleLower.includes('forced change') ||
                                  notif.metadata?.forcedBySupport === true ||
                                  notif.metadata?.isAdminAction === true;
    
    // Categorize: system > alerts > updates (with explicit update detection)
    let notifCategory: TabCategory = 'updates'; // Default: informational
    if (isSystemNotification) {
      notifCategory = 'system';
    } else if (isAlert && !isUpdate) {
      // Only categorize as alert if it's not an informational update
      notifCategory = 'alerts';
    }
    
    notifications.push({
      id: notif.id,
      title: friendlyTitle,
      message: friendlyMessage,
      priority: notif.type === 'error' ? 'critical' : notif.type === 'warning' ? 'high' : 'info',
      category: notifCategory,
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
    // Categorize based on priority: high priority = alerts, low priority = updates
    const isCleared = Boolean(finding.clearedAt) || (isPending?.(finding.id) ?? false);
    
    // Normalize FIRST so category determination uses the same mapped value
    const normalizedPriority = normalizePriority(finding.priority);
    
    // Gap findings are typically system issues needing attention - go to alerts
    const findingCategory: TabCategory = normalizedPriority === 'critical' || normalizedPriority === 'high' 
      ? 'alerts' 
      : 'updates';
    
    notifications.push({
      id: finding.id,
      title: finding.title,
      message: finding.message,
      priority: normalizedPriority,
      category: findingCategory,
      subCategory: finding.subCategory || finding.category,
      serviceSource: 'Trinity',
      statusTag: finding.isRead ? undefined : finding.statusTag,
      isRead: finding.isRead,
      isCleared,
      createdAt: finding.createdAt,
      actions: finding.actions,
      metadata: finding.metadata,
    });
  });
  
  return notifications.sort((a, b) => {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    const pa = priorityOrder[a.priority] ?? 4;
    const pb = priorityOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
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

// Notification Detail Modal - Shows structured breakdown instead of repeating message
function NotificationDetailModal({
  notification,
  isOpen,
  onClose,
  onDismiss,
  onAction,
  canInteract,
}: {
  notification: UNSNotification | null;
  isOpen: boolean;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onAction: (notification: UNSNotification, action: NonNullable<UNSNotification['actions']>[0]) => void;
  canInteract: boolean;
}) {
  if (!notification) return null;
  
  const breakdown = generateStructuredBreakdown(
    notification.title,
    notification.message,
    notification.subCategory,
    notification.metadata as any
  );
  
  const isCritical = notification.priority === 'critical';
  const isHigh = notification.priority === 'high';
  const hasActions = canInteract && notification.actions && notification.actions.length > 0;
  
  return (
    <UniversalModal open={isOpen} onOpenChange={onClose}>
      <UniversalModalContent size="md" className="overflow-y-auto p-0 gap-0" data-testid="notification-detail-modal">
        {/* Header with priority indicator - compact on mobile */}
        <div className={`p-3 sm:p-4 pr-24 sm:pr-28 border-b ${
          isCritical 
            ? 'bg-red-500 dark:bg-red-700' 
            : isHigh 
            ? 'bg-amber-50 dark:bg-amber-950' 
            : 'bg-muted'
        }`}>
          <div className="flex items-start gap-2 sm:gap-3">
            <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${
              isCritical 
                ? 'bg-red-600 dark:bg-red-800' 
                : isHigh 
                ? 'bg-amber-100 dark:bg-amber-900' 
                : 'bg-primary/10'
            }`}>
              <TrinityLogo size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`font-bold text-sm sm:text-base leading-tight break-words ${
                isCritical ? 'text-white' : isHigh ? 'text-amber-900 dark:text-amber-100' : 'text-foreground'
              }`}>
                {humanizeTitle(notification.title)}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={`text-[10px] px-1.5 sm:px-2 py-0.5 ${
                  isCritical 
                    ? 'bg-red-400 text-white border-red-400' 
                    : isHigh 
                    ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200' 
                    : 'bg-primary/10 text-primary'
                }`}>
                  {(notification.priority ?? 'info').toUpperCase()}
                </Badge>
                <span className={`text-[10px] sm:text-xs ${
                  isCritical ? 'text-white/70' : isHigh ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                }`}>
                  {safeFormatTimestamp(notification.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Structured Breakdown Sections - compact spacing on mobile */}
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Problem Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">What Happened</span>
            </div>
            <p className="text-xs sm:text-sm text-foreground pl-5 sm:pl-7">{breakdown.problem}</p>
          </div>
          
          {/* Issue Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Info className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Why It Matters</span>
            </div>
            <p className="text-xs sm:text-sm text-foreground pl-5 sm:pl-7">{breakdown.issue}</p>
          </div>
          
          {/* Solution Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Wrench className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">What Trinity Did</span>
            </div>
            <p className="text-xs sm:text-sm text-foreground pl-5 sm:pl-7">{breakdown.solution}</p>
          </div>
          
          {/* Outcome Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wide">What to Expect</span>
            </div>
            <p className="text-xs sm:text-sm text-foreground pl-5 sm:pl-7">{breakdown.outcome}</p>
          </div>
        </div>
        
        {/* Action Buttons - compact on mobile */}
        <div className="p-3 sm:p-4 pt-0 flex flex-wrap gap-2 border-t mt-2">
          {hasActions && notification.actions!.map((action, idx) => (
            <Button
              key={idx}
              variant={idx === 0 ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                onAction(notification, action);
                onClose();
              }}
              data-testid={`button-detail-action-${idx}`}
            >
              {action.label}
            </Button>
          ))}
          {/* Inline Approve / Deny / Review for all authenticated users when no other actions */}
          {canInteract && !hasActions && (() => {
            const t = notification.subCategory || '';
            const title = (notification.title || '').toLowerCase();
            const showApprove = t.includes('approval') || t.includes('timesheet') || title.includes('approval') || title.includes('approve');
            const showDeny = showApprove;
            const showReview = !showApprove && (notification.metadata?.requiresAction || title.includes('action required') || title.includes('review'));
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const navTarget = notification.metadata?.actionUrl || '/';
            return (
              <>
                {showApprove && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      onAction(notification, { label: 'Approve', type: 'navigate', target: navTarget, variant: 'primary' });
                      onClose();
                    }}
                    data-testid="button-detail-approve"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Approve
                  </Button>
                )}
                {showDeny && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onAction(notification, { label: 'Deny', type: 'navigate', target: navTarget, variant: 'ghost' });
                      onClose();
                    }}
                    data-testid="button-detail-deny"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Deny
                  </Button>
                )}
                {showReview && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      onAction(notification, { label: 'Review', type: 'navigate', target: navTarget, variant: 'primary' });
                      onClose();
                    }}
                    data-testid="button-detail-review"
                  >
                    Review
                  </Button>
                )}
              </>
            );
          })()}
          {canInteract && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDismiss(notification.id);
                onClose();
              }}
              data-testid="button-detail-dismiss"
            >
              <X className="w-4 h-4 mr-1" />
              Dismiss
            </Button>
          )}
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// Clear All Button with confirmation dialog - simple tap to open, confirm to clear
function ClearAllButton({
  compact,
  disabled,
  isPending,
  onClearAll,
}: {
  compact: boolean;
  disabled: boolean;
  isPending: boolean;
  onClearAll: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`${compact ? 'h-7 px-2 text-[10px]' : 'h-8 px-3 text-xs'} font-medium text-muted-foreground hover:text-foreground flex-shrink-0`}
        disabled={disabled || isPending}
        onClick={() => setShowConfirm(true)}
        data-testid="button-clear-all-read"
      >
        {isPending ? 'Clearing...' : 'Clear All'}
      </Button>
      
      {/* Confirmation AlertDialog - uses proper accessible alert dialog pattern */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-xs mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Clear All Notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This will dismiss all notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={onClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-clear"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// UNS Notification Card Component - Matching Design Spec
// ============================================================
// 6-TYPE NOTIFICATION BADGE SYSTEM
// Types: INFO | NAVIGATE | ACTION REQUIRED | DOCUMENT | BILLING | TRINITY ADVISORY
// ============================================================
type NotificationBadgeType = 'INFO' | 'NAVIGATE' | 'ACTION REQUIRED' | 'DOCUMENT' | 'BILLING' | 'TRINITY ADVISORY';

function getNotificationBadgeInfo(notification: UNSNotification): {
  type: NotificationBadgeType;
  className: string;
} {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const t = (notification.type || '').toLowerCase();
  const title = (notification.title || '').toLowerCase();
  const meta = notification.metadata || {};

  // TRINITY ADVISORY — AI decisions requiring human verification
  if (
    // @ts-expect-error — TS migration: fix in refactoring sprint
    meta.aiBrainDecisionId ||
    t === 'ai_decision' ||
    t === 'trinity_autonomous_alert' ||
    t === 'trinity_advisory' ||
    title.includes('trinity advisory') ||
    title.includes('trinity executive brief') ||
    title.includes('trinity daily')
  ) {
    return { type: 'TRINITY ADVISORY', className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-0' };
  }

  // BILLING — invoices, payments, credits
  if (
    t.includes('invoice') || t.includes('payment') || t.includes('billing') ||
    t.includes('credit') || t.includes('payroll') ||
    title.includes('invoice') || title.includes('payroll') || title.includes('billing')
  ) {
    return { type: 'BILLING', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0' };
  }

  // DOCUMENT — uploads, signatures, expiring certs
  if (
    t.includes('document') || t.includes('signature') || t.includes('certification') ||
    t.includes('certificate') || t.includes('form_assigned') ||
    title.includes('document') || title.includes('certificate') || title.includes('certification')
  ) {
    return { type: 'DOCUMENT', className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-0' };
  }

  // ACTION REQUIRED — shift offers, approvals, verifications, compliance
  if (
    meta.requiresAction || meta.actionRequired ||
    t === 'coverage_offer' || t === 'shift_offer' ||
    t.includes('approval') || t.includes('approve') || t.includes('verify') ||
    title.includes('action required') || title.includes('approve') || title.includes('review required')
  ) {
    return { type: 'ACTION REQUIRED', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0' };
  }

  // NAVIGATE — links to specific pages (schedule, profile, site, etc.)
  if (
    t.includes('shift') || t.includes('schedule') || t.includes('assignment') ||
    t.includes('navigate') || t.includes('redirect') ||
    title.includes('shift') || title.includes('schedule')
  ) {
    return { type: 'NAVIGATE', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-0' };
  }

  // INFO — everything else
  return { type: 'INFO', className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-0' };
}

function NotificationCard({ 
  notification, 
  onDismiss, 
  onAction,
  onCardClick,
  onClose,
  isGuruMode,
  canInteract,
  compact = false,
}: { 
  notification: UNSNotification; 
  onDismiss: (id: string) => void;
  onAction: (notification: UNSNotification, action: NonNullable<UNSNotification['actions']>[0]) => void;
  onCardClick: (notification: UNSNotification) => void;
  onClose: () => void; // Closes the notification panel before opening Trinity
  isGuruMode: boolean;
  canInteract: boolean;
  compact?: boolean;
}) {
  const styles = PRIORITY_STYLES[notification.priority] ?? PRIORITY_STYLES['info'];
  const isCritical = notification.priority === 'critical';
  const isHigh = notification.priority === 'high';
  const isMedium = notification.priority === 'medium';
  // Only show actions to authenticated users
  const hasActions = canInteract && notification.actions && notification.actions.length > 0;

  // Context handoff — open Trinity modal pre-loaded with this notification's context
  const { openWithContext } = useTrinityModal();
  const notifBadge = getNotificationBadgeInfo(notification);
  const isTrinityAdvisory = notifBadge.type === 'TRINITY ADVISORY';
  const confidenceScore = notification.metadata?.riskScore !== undefined
    ? Math.round(100 - notification.metadata.riskScore * 100)
    : undefined;

  const handleAskTrinity = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Build an actionable directive prompt so Trinity immediately processes and executes
    const actionHint = notification.actions?.length
      ? `\nAvailable actions: ${notification.actions.map(a => a.label).join(', ')}.`
      : '';
    const contextPrompt = `[Notification Context]\nTitle: ${notification.title}\n${notification.message ? `Details: ${notification.message}` : ''}${actionHint}\n\nBased on this notification, what is the recommended action and can you help me execute it?`;
    // Close the notification panel first, then open Trinity with the context
    onClose();
    setTimeout(() => {
      openWithContext(contextPrompt, { autoSubmit: true });
    }, 150);
  };
  
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
      className={cn(
        "relative group cursor-pointer hover-elevate active-elevate-2",
        notification.isRead ? "opacity-60" : ""
      )}
      onClick={() => onCardClick(notification)}
      data-testid={`uns-card-${notification.id}`}
    >
      {/* Individual Dismiss Button - appears on hover, inset from edge for better UX */}
      {canInteract && (
        <Button
          variant="ghost"
          size="icon"
          className={`absolute ${compact ? 'top-2 right-3 h-5 w-5' : 'top-3 right-4 h-6 w-6'} opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/80 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          data-testid={`button-dismiss-${notification.id}`}
        >
          <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </Button>
      )}
      
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
                  ? 'bg-red-600 dark:bg-red-800' 
                  : isHigh 
                  ? 'bg-amber-100 dark:bg-amber-900' 
                  : 'bg-blue-100 dark:bg-blue-900'
              }`}>
                <TrinityLogo size={compact ? 20 : 24} />
              </div>
              
              {/* Content & Actions - Always stacked in popover to maintain consistent width */}
              <div className={`flex-1 min-w-0 flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {/* Message Content */}
                <div className="flex-1 min-w-0 w-full">
                  <span className={`font-bold ${compact ? 'text-xs' : 'text-sm'} leading-tight block truncate ${textColor}`} title={humanizeTitle(notification.title)}>
                    {humanizeTitle(notification.title)}
                  </span>
                  <p className={`${compact ? 'text-[11px] mt-0.5 leading-snug' : 'text-sm leading-relaxed mt-1'} line-clamp-2 ${mutedText}`} title={getNotificationDisplayMessage(notification)}>
                    {getNotificationDisplayMessage(notification)}
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
                <span className="font-medium">Trinity</span>
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
                    : 'bg-red-600 text-white'
                }`}
              >
                {notification.statusTag}
              </Badge>
            </div>
          )}
        </div>
      ) : (
        /* Regular/Info Cards - Refined high-tech style */
        <div className={`${styles.border} hover-elevate transition-colors bg-gradient-to-r from-transparent via-primary/[0.02] to-transparent dark:via-primary/[0.04]`}>
          <div className={compact ? "p-2.5" : "p-4"}>
            <div className={compact ? "flex gap-2" : "flex gap-3"}>
              {/* Trinity AI Icon - Enhanced with glow ring */}
              <div className={`shrink-0 ${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-500/15 to-blue-500/15 dark:from-cyan-400/20 dark:to-blue-400/20 ring-1 ring-cyan-500/20 dark:ring-cyan-400/25`}>
                <TrinityLogo size={compact ? 20 : 24} />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0 w-full">
                <div className={compact ? 'mb-0.5' : 'mb-1'}>
                  <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} leading-tight block`}>
                    {humanizeTitle(notification.title)}
                  </span>
                  <div className={`flex items-center flex-wrap ${compact ? 'gap-1.5 mt-0.5' : 'gap-2 mt-1'}`}>
                    {/* 6-type notification badge */}
                    <Badge variant="secondary" className={`${compact ? "text-[9px] px-1.5 py-0 h-4" : "text-[10px] px-2 py-0 h-5"} font-semibold ${notifBadge.className}`}>
                      {notifBadge.type}
                    </Badge>
                    {/* Confidence score for Trinity Advisory */}
                    {isTrinityAdvisory && confidenceScore !== undefined && (
                      <Badge variant="secondary" className={`${compact ? "text-[9px] px-1.5 py-0 h-4" : "text-[10px] px-2 py-0 h-5"} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0`}>
                        {confidenceScore}% confidence
                      </Badge>
                    )}
                    <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-muted-foreground`}>
                      {safeFormatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                </div>
                
                <p className={`${compact ? 'text-[11px] leading-snug mb-1.5' : 'text-sm leading-relaxed mb-2'} text-muted-foreground`}>
                  {getNotificationDisplayMessage(notification)}
                </p>
                
                {/* Service Source */}
                <div className={`flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'} text-muted-foreground`}>
                  <span className="font-medium bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Trinity</span>
                </div>
                
                {/* Action Buttons */}
                {hasActions && (
                  <div className={`flex flex-wrap ${compact ? 'gap-1 mt-1.5' : 'gap-2 mt-2'}`}>
                    {notification.actions!.map((action, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-7 text-xs'} border-cyan-500/30 text-cyan-600 dark:text-cyan-400`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(notification, action);
                        }}
                        data-testid={`button-action-${notification.id}-${idx}`}
                      >
                        {action.label}
                      </Button>
                    ))}
                    {/* Ask Trinity — context handoff button for all card types */}
                    {canInteract && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-7 text-xs'} text-muted-foreground`}
                        onClick={handleAskTrinity}
                        data-testid={`button-ask-trinity-${notification.id}`}
                      >
                        <MessageCircle className={compact ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1"} />
                        Ask Trinity
                      </Button>
                    )}
                  </div>
                )}
                {/* Ask Trinity — show even when no other actions */}
                {!hasActions && canInteract && (
                  <div className={`flex flex-wrap ${compact ? 'gap-1 mt-1.5' : 'gap-2 mt-2'}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-7 text-xs'} text-muted-foreground`}
                      onClick={handleAskTrinity}
                      data-testid={`button-ask-trinity-${notification.id}`}
                    >
                      <MessageCircle className={compact ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1"} />
                      Ask Trinity
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Tag */}
            {notification.statusTag && (
              <div className={compact ? "mt-1 ml-9" : "mt-2 ml-12"}>
                <Badge 
                  className={`${compact ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'} font-bold ${
                    notification.statusTag === 'ACTION REQUIRED' 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
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


// ── UNS Command Center — Universal Notification System ────────────────────────
// Renders the notification command panel inside the bell popover.
// Full UNS redesign is planned; this renders the existing notification UI.
interface UNSCommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onAskTrinity?: (message: string) => void;
  platformRole?: string;
  workspaceRole?: string;
}

// Notification type → icon + color mapping
function getNotificationIcon(type: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('alert') || t.includes('warn') || t.includes('labor') || t.includes('compliance'))
    return { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' };
  if (t.includes('coverage') || t.includes('shift') || t.includes('scheduling'))
    return { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' };
  if (t.includes('payroll') || t.includes('invoice') || t.includes('billing') || t.includes('pay'))
    return { icon: Check, color: 'text-green-500', bg: 'bg-green-500/10' };
  if (t.includes('message') || t.includes('chat') || t.includes('comm'))
    return { icon: MessageCircle, color: 'text-purple-500', bg: 'bg-purple-500/10' };
  if (t.includes('security') || t.includes('auth') || t.includes('access'))
    return { icon: Shield, color: 'text-red-500', bg: 'bg-red-500/10' };
  if (t.includes('success') || t.includes('approv') || t.includes('complet'))
    return { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' };
  if (t.includes('trinity') || t.includes('ai') || t.includes('spark'))
    return { icon: Sparkles, color: 'text-violet-500', bg: 'bg-violet-500/10' };
  return { icon: Bell, color: 'text-muted-foreground', bg: 'bg-muted' };
}

function UNSCommandCenter({ isOpen, onClose, onAskTrinity, platformRole, workspaceRole }: UNSCommandCenterProps) {
  const queryClient = useQueryClient();
  const { data: rawData, isLoading } = useQuery<NotificationsData>({
    queryKey: ["/api/notifications/combined"],
    enabled: isOpen,
    staleTime: 0,
  });

  if (!isOpen) return null;

  const notifications = Array.isArray(rawData?.notifications) 
    ? rawData.notifications 
    : [];

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const pendingCount = notifications.filter(n => n.actionRequired).length;
  const shown = notifications.slice(0, 12);

  const handleMarkAllRead = () => {
    fetch('/api/notifications/mark-all-read', { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['/api/notifications/combined'] }))
      .catch(() => null);
  };

  return (
    <div className="flex flex-col h-[460px] max-h-[65vh] w-[400px] max-w-[calc(100vw-1.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground px-2">
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Notification List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 p-2 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-full" />
                  <div className="h-2 bg-muted rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground gap-3">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
              <Bell className="h-6 w-6 opacity-40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs mt-0.5 opacity-70">No notifications yet</p>
            </div>
          </div>
        ) : (
          <div>
            {shown.map((notification, idx) => {
              const { icon: Icon, color, bg } = getNotificationIcon(notification.type || notification.category || '');
              const isUnread = !notification.isRead;
              return (
                <div
                  key={notification.id}
                  className={`group flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer relative ${idx > 0 ? 'border-t border-border/30' : ''}`}
                >
                  {/* Unread dot */}
                  {isUnread && (
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}

                  {/* Icon */}
                  <div className={`h-8 w-8 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${isUnread ? 'font-semibold' : 'font-medium'} truncate`}>
                      {notification.title}
                    </p>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {notification.message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {notification.createdAt ? formatDistanceToNow(parseISO(notification.createdAt), { addSuffix: true }) : ''}
                      </span>
                      {notification.actionRequired && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Action needed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow on hover */}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-all mt-2 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
        <ScrollBar orientation="vertical" />
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border/40 p-2.5 flex gap-2 shrink-0">
        {pendingCount > 0 && (
          <Button onClick={onAskTrinity} size="sm" variant="outline" className="flex-1 gap-1 text-xs h-8">
            <Zap className="h-3 w-3 text-violet-500" />
            Ask Trinity ({pendingCount} pending)
          </Button>
        )}
        {notifications.length > 12 && (
          <Button size="sm" variant="ghost" className="flex-1 text-xs h-8 text-muted-foreground">
            View all {notifications.length}
          </Button>
        )}
      </div>
    </div>
  );
}


export function NotificationsPopover() {
  const { user } = useAuth();
  
  // Early return for unauthenticated users - prevents rendering entirely
  if (!user) {
    return null;
  }
  
  return <NotificationsPopoverInner user={user} />;
}

function NotificationsPopoverInner({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabCategory>('alerts');
  const [subFilter, setSubFilter] = useState<SubFilter>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [sortNewest, setSortNewest] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<UNSNotification | null>(null);
  const isMobileBreakpoint = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Trinity modal for "Ask Trinity" button - moved to top to be available for mobile view
  const { openModal: openTrinityModal } = useTrinityModal();
  
  // Scroll position preservation refs to prevent scroll reset during data refetches
  const scrollPositionRef = useRef<number>(0);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  
  // Enhanced mobile detection: consider touch + mobile user agent + viewport
  // Samsung S24 Ultra and other large phones may have viewport > 768px
  // STABLE: Use useMemo to prevent re-computation on every render causing layout flicker
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return isMobileBreakpoint;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const hasMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    // Mobile if: small viewport OR (touch device with mobile UA)
    return isMobileBreakpoint || (hasTouch && hasMobileUA && hasCoarsePointer);
  }, [isMobileBreakpoint]);
  const chatDock = useChatDock();
  
  useEffect(() => {
    const handleChatOpened = () => setOpen(false);
    window.addEventListener('chatdock-opened', handleChatOpened);
    return () => window.removeEventListener('chatdock-opened', handleChatOpened);
  }, []);
  
  const { toast } = useToast();
  // user is now passed as a prop from NotificationsPopover wrapper
  const userId = (user as any)?.id;
  const workspaceId = (user as any)?.activeWorkspaceId || (user as any)?.workspaceId;
  const userPlatformRole = (user as any)?.platformRole as string | null | undefined;
  
  // Get workspace role for proper notification filtering in UNS Command Center
  const { workspaceRole, platformRole: accessPlatformRole } = useWorkspaceAccess();
  
  // Derive Trinity mode locally from user — avoids /api/trinity/context fetch on every nav.
  const isGuruMode = deriveTrinityModeFromUser(user) === 'guru';
  
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
  const allNotifications = mapToUNS(rawData, userPlatformRole, pendingClears.isPending, workspaceRole, !!user);
  
  // Filter to only non-cleared items for default display 
  // Cleared items are hidden from default view but accessible via history toggle
  // This uses isCleared flag which is set when user explicitly clears items
  const visibleNotifications = allNotifications.filter(n => !n.isCleared);
  
  // Calculate counts for each tab from visible notifications
  // ALERTS: Operational alerts (payroll, schedule, client, employee issues)
  const alertsCount = visibleNotifications.filter(n => n.category === 'alerts' && !n.isRead).length;
  // UPDATES: Informational updates (schedule changes, settings, info)
  const updatesCount = visibleNotifications.filter(n => n.category === 'updates' && !n.isRead).length;
  // SYSTEM: Admin-only (workflow approvals, forced changes by support)
  const systemCount = visibleNotifications.filter(n => n.category === 'system' && !n.isRead).length;
  
  // Total unread across all tabs
  const totalUnread = alertsCount + updatesCount + systemCount;

  // Auto-switch to tab with notifications when popover opens
  // This fixes the issue where count shows 2 but user sees empty (because default tab is alerts)
  useEffect(() => {
    if (open && totalUnread > 0) {
      // Priority: alerts > updates > system (switch to first tab with unread)
      if (alertsCount > 0) {
        setActiveTab('alerts');
      } else if (updatesCount > 0) {
        setActiveTab('updates');
      } else if (systemCount > 0) {
        setActiveTab('system');
      }
    }
  }, [open]); // Only run when popover opens, not on count changes

  // Reset topic filter when the active tab changes
  useEffect(() => { setTopicFilter('all'); }, [activeTab]);

  // Notification types grouped by topic for role-aware filtering
  const TOPIC_TYPE_MAP: Record<string, string[]> = {
    scheduling:  ['shift_assigned', 'shift_changed', 'shift_cancelled', 'shift_unassigned', 'shift_reminder', 'shift_offer', 'coverage_offer', 'coverage_requested', 'coverage_filled', 'coverage_expired', 'schedule_change', 'ai_schedule_ready', 'schedule_notification', 'clock_in_reminder'],
    payroll:     ['payroll_processed', 'payroll_pending', 'pay_stub_available', 'timesheet_approved', 'timesheet_rejected'],
    invoices:    ['invoice_generated', 'invoice_paid', 'invoice_overdue', 'payment_received', 'payment_overdue'],
    credits:     ['credit_warning'],
    documents:   ['document_uploaded', 'document_expiring', 'document_signature_request', 'document_signed', 'document_fully_executed', 'document_signature_reminder', 'form_assigned'],
    compliance:  ['compliance_alert', 'deadline_approaching', 'dispute_filed', 'staffing_escalation', 'staffing_critical_escalation'],
  };

  const TOPIC_LABELS: Record<string, string> = {
    scheduling:  'Scheduling',
    payroll:     'Payroll',
    invoices:    'Invoices',
    credits:     'Credits',
    documents:   'Documents',
    compliance:  'Compliance',
  };

  // Which topics to show based on workspace role
  const ROLE_TOPICS: Record<string, string[]> = {
    employee:   ['scheduling', 'payroll', 'documents'],
    supervisor: ['scheduling', 'payroll', 'documents', 'compliance'],
    manager:    ['scheduling', 'payroll', 'invoices', 'documents', 'compliance'],
    org_owner:  ['scheduling', 'payroll', 'invoices', 'credits', 'documents', 'compliance'],
    co_owner:   ['scheduling', 'payroll', 'invoices', 'credits', 'documents', 'compliance'],
  };
  const allowedTopics = ROLE_TOPICS[workspaceRole ?? ''] ?? Object.keys(TOPIC_LABELS);

  // Filter notifications by active tab
  // Each tab has its own distinct category - no sub-filters needed
  const filteredNotifications = visibleNotifications.filter(n => {
    // Apply unread filter first if enabled
    if (showUnreadOnly && n.isRead) return false;
    // Filter by active tab category
    if (n.category !== activeTab) return false;
    // Apply topic filter if one is active
    if (topicFilter !== 'all') {
      const types = TOPIC_TYPE_MAP[topicFilter] ?? [];
      return types.includes(n.subCategory ?? '');
    }
    return true;
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
      // Determine which source the notification came from by checking cache
      const cachedData = queryClient.getQueryData(["/api/notifications/combined"]) as NotificationsData | undefined;
      
      // Check each source array to determine which API endpoint to call
      const isPlatformUpdate = cachedData?.platformUpdates?.some((u: any) => u.id === id);
      const isMaintenanceAlert = cachedData?.maintenanceAlerts?.some((a: any) => a.id === id);
      
      let response: Response;
      if (isMaintenanceAlert) {
        // Maintenance alerts use their own acknowledge endpoint
        response = await apiRequest("POST", `/api/maintenance-alerts/${id}/acknowledge`, {});
      } else if (isPlatformUpdate) {
        // Platform updates use mark-viewed endpoint
        response = await apiRequest("POST", `/api/platform-updates/${id}/mark-viewed`, {});
      } else {
        // Regular notifications: DELETE actually removes the row so clearedAt filtering works
        response = await apiRequest("DELETE", `/api/notifications/${id}`);
      }
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
      const response = await apiRequest("POST", "/api/notifications/clear-all", {});
      return response.json();
    },
    onMutate: async () => {
      // IMPORTANT: Capture IDs BEFORE canceling queries to ensure we have the data
      const snapshotData = queryClient.getQueryData(["/api/notifications/combined"]) as NotificationsData | undefined;
      
      // PROTECTED_CATEGORIES: These notifications are never cleared by "Clear All"
      // They require explicit user action (apply fix, approve, etc.) to resolve
      // MUST be defined BEFORE building allIds so we can filter them out
      const PROTECTED_CATEGORIES = ['system_fix', 'hotpatch', 'admin_action'];
      
      // Capture only NON-PROTECTED IDs for race condition protection
      // Protected notifications (hotpatch, system_fix, admin_action) should NOT be in pending set
      // because the server won't clear them, and they'd stay in pending forever
      const allIds: string[] = [];
      snapshotData?.notifications?.forEach(n => {
        // Only add non-protected notifications to pending set
        if (!PROTECTED_CATEGORIES.includes(n.category)) {
          allIds.push(n.id);
        }
      });
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
      // NOTE: Protected categories (hotpatch, system_fix, admin_action) are NOT cleared
      queryClient.setQueryData(["/api/notifications/combined"], (old: any) => {
        // Count how many protected notifications remain unread (not yet cleared)
        const protectedUnreadCount = old?.notifications?.filter((n: any) => 
          PROTECTED_CATEGORIES.includes(n.category) && !n.clearedAt && !n.isRead
        )?.length || 0;
        
        // Map notifications - mark all as cleared EXCEPT protected categories
        const updatedNotifications = old?.notifications?.map((n: any) => {
          // Preserve protected notifications (hotpatch, system_fix, admin_action)
          if (PROTECTED_CATEGORIES.includes(n.category)) {
            return n; // Don't modify - these require explicit action
          }
          return { 
            ...n, 
            clearedAt: now, 
            isRead: true,
            metadata: { ...(n.metadata || {}), wasCleared: true }
          };
        }) || [];
        
        return {
          ...old,
          notifications: updatedNotifications,
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
          // Only protected unread notifications remain in count after clear-all
          totalUnread: protectedUnreadCount,
          unreadNotifications: protectedUnreadCount,
          unreadPlatformUpdates: 0,
          unreadAlerts: 0,
          unreadGapFindings: 0,
        };
      });
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
      // Invalidate count badges and related query keys (both singular and plural variants)
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/context"] });
      // Invalidate chat room unread counts (ChatDock / Chatrock)
      queryClient.invalidateQueries({ queryKey: ["/api/chat/rooms"] });
      // Invalidate internal email unread badge
      queryClient.invalidateQueries({ queryKey: ["/api/internal-email/mailbox/auto-create"] });
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
    onMutate: () => {
      // Show immediate feedback that action is being processed
      toast({ 
        title: "Processing...", 
        description: "Trinity is executing your request.",
      });
    },
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate to refresh the notification list (item will be marked as read)
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        
        // Show success with steps if available
        const steps = data.steps as string[] | undefined;
        const stepsText = steps?.length 
          ? steps.map((s, i) => `${i === steps.length - 1 ? '✓' : '✓'} ${s}`).join(' → ')
          : data.message;
        
        toast({ 
          title: "Complete", 
          description: stepsText || "Action executed successfully.",
          variant: "success" as any,
        });
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
      if (action.target.startsWith('/')) {
        setLocation(action.target);
      } else {
        window.location.href = action.target;
      }
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
      apiRequest("POST", action.target, {}).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/combined"] });
        toast({ title: "Done", description: "Action completed." });
      }).catch((err) => {
        console.error('Notification action failed:', err);
        toast({ title: "Action failed", variant: "destructive" });
      });
    }
  };

  // Memoize content generator to prevent remounting on parent re-renders
  // This preserves scroll position during data refetches
  const renderNotificationsContent = useMemo(() => {
    return ({ simplified = false, compact = false, enableSwipeDelete = false, skipHeader = false }: { simplified?: boolean; compact?: boolean; enableSwipeDelete?: boolean; skipHeader?: boolean }) => (
    <div 
      className="flex flex-col h-full min-h-0"
    >
      {/* UNS Header with Trinity Branding - Polished Gradient */}
      {!skipHeader && (
      <div className={`${compact ? 'px-3 py-2.5' : 'px-4 py-3'} border-b bg-gradient-to-r from-primary to-primary/85 flex-shrink-0`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`relative ${compact ? 'p-1.5' : 'w-10 h-10'} rounded-lg bg-primary-foreground/15 flex items-center justify-center flex-shrink-0`}>
              <Bell className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} text-primary-foreground`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className={`font-bold ${compact ? 'text-sm' : 'text-base'} leading-tight text-primary-foreground truncate`}>
                Notifications
              </h2>
              <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-primary-foreground/80 font-medium truncate block max-w-full`}>
                {user ? (totalUnread > 0 ? `${totalUnread} unread` : 'All caught up') : 'Platform Updates'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className={`${compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-3 py-1.5'} font-medium bg-primary-foreground/15 text-primary-foreground border-primary-foreground/30 whitespace-nowrap shrink-0`}>
              {sortedNotifications.length}
            </Badge>
            {compact && (
              <>
                <div className="w-px h-5 bg-primary-foreground/25 mx-0.5" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-primary-foreground bg-primary-foreground/10"
                  onClick={() => setOpen(false)}
                  data-testid="button-notifications-close"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        {/* Public User Banner */}
        {!user && (
          <div className={`${compact ? 'mt-1.5 px-2 py-1.5' : 'mt-2 px-3 py-2'} rounded-lg bg-primary-foreground/10 border border-primary-foreground/20`}>
            <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-primary-foreground font-medium`}>
              Sign in for personalized notifications.
            </p>
          </div>
        )}
      </div>
      )}
      
      {/* Push Notification Opt-In Prompt */}
      <PushNotificationPrompt />
      
      {/* Main Tabs: ALERTS | UPDATES | SYSTEM (Admin) */}
      {/* Added pr-2 on compact to give Clear All button breathing room from sheet edges */}
      <div className={`border-b bg-card flex-shrink-0 ${compact ? 'px-2 pr-2' : 'px-2'}`}>
        {/* Tabs row - full width on mobile */}
        <div className="flex items-center justify-between w-full gap-1">
          {/* All tabs in a row */}
          <div className="flex items-center">
            {/* ALERTS Tab - Operational alerts requiring attention */}
            <button
              onClick={() => setActiveTab('alerts')}
              className={`relative ${compact ? 'py-2.5 px-2 text-xs' : 'py-3 px-4 text-sm'} font-medium transition-colors whitespace-nowrap ${
                activeTab === 'alerts' 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="tab-alerts"
            >
              <span className="flex items-center gap-1">
                <AlertTriangle className={`${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {!compact && 'Alerts'}
                {alertsCount > 0 && (
                  <Badge className={`${compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]'} flex items-center justify-center bg-red-500 text-white rounded-full`}>
                    {alertsCount}
                  </Badge>
                )}
              </span>
              {activeTab === 'alerts' && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-red-500 rounded-full" />
              )}
            </button>
            
            {/* UPDATES Tab - Informational updates */}
            <button
              onClick={() => setActiveTab('updates')}
              className={`relative ${compact ? 'py-2.5 px-2 text-xs' : 'py-3 px-4 text-sm'} font-medium transition-colors whitespace-nowrap ${
                activeTab === 'updates' 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="tab-updates"
            >
              <span className="flex items-center gap-1">
                <Info className={`${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {!compact && 'Updates'}
                {updatesCount > 0 && (
                  <Badge className={`${compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]'} flex items-center justify-center bg-primary text-primary-foreground rounded-full`}>
                    {updatesCount}
                  </Badge>
                )}
              </span>
              {activeTab === 'updates' && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            
            {/* SYSTEM Tab - Admin workflow approvals & forced changes */}
            <button
              onClick={() => setActiveTab('system')}
              className={`relative ${compact ? 'py-2.5 px-2 text-xs' : 'py-3 px-4 text-sm'} font-medium transition-colors whitespace-nowrap ${
                activeTab === 'system' 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="tab-system"
            >
              <span className="flex items-center gap-1">
                <Shield className={`${compact ? 'h-3 w-3' : 'h-4 w-4'}`} />
                {!compact && 'System'}
                {systemCount > 0 && (
                  <Badge className={`${compact ? 'h-4 min-w-4 px-1 text-[9px]' : 'h-5 min-w-5 px-1.5 text-[10px]'} flex items-center justify-center bg-amber-500 text-white rounded-full`}>
                    {systemCount}
                  </Badge>
                )}
              </span>
              {activeTab === 'system' && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          </div>
          
          {/* Clear All button with confirmation dialog */}
          {user && (
            <ClearAllButton
              compact={compact}
              disabled={clearAllMutation.isPending || totalUnread === 0}
              isPending={clearAllMutation.isPending}
              onClearAll={() => clearAllMutation.mutate()}
            />
          )}
        </div>
      </div>
      
      {/* Tab description - single line on mobile for space efficiency */}
      <div className={`${compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} border-b bg-muted/10 flex-shrink-0`}>
        <span className={`${compact ? 'text-[8px] leading-tight' : 'text-[10px]'} text-muted-foreground line-clamp-1`}>
          {activeTab === 'alerts' && 'Action required alerts'}
          {activeTab === 'updates' && 'Updates & info'}
          {activeTab === 'system' && 'Admin actions'}
        </span>
      </div>

      {/* Role-aware topic filter chips — shown only when there are relevant notifications */}
      {(() => {
        const tabPool = visibleNotifications.filter(n => n.category === activeTab);
        const topicsWithNotifs = allowedTopics.filter(t =>
          tabPool.some(n => (TOPIC_TYPE_MAP[t] ?? []).includes(n.subCategory ?? ''))
        );
        if (topicsWithNotifs.length < 2) return null;
        const allCount = tabPool.length;
        return (
          <div
            className="flex-shrink-0 border-b bg-muted/10 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            data-testid="topic-filter-row"
          >
            <div className={`flex items-center gap-1.5 min-w-max ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}>
              <button
                onClick={() => setTopicFilter('all')}
                className={`inline-flex items-center gap-1 rounded-full border text-[10px] font-medium transition-colors px-2.5 py-0.5 whitespace-nowrap ${
                  topicFilter === 'all'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-muted-foreground/30 hover:text-foreground hover:border-muted-foreground/60'
                }`}
                data-testid="topic-chip-all"
              >
                All
                <span className={`${topicFilter === 'all' ? 'bg-background/20' : 'bg-muted-foreground/15'} rounded-full px-1 text-[9px]`}>{allCount}</span>
              </button>
              {topicsWithNotifs.map(topic => {
                const count = tabPool.filter(n => (TOPIC_TYPE_MAP[topic] ?? []).includes(n.subCategory ?? '')).length;
                const isActive = topicFilter === topic;
                return (
                  <button
                    key={topic}
                    onClick={() => setTopicFilter(isActive ? 'all' : topic)}
                    className={`inline-flex items-center gap-1 rounded-full border text-[10px] font-medium transition-colors px-2.5 py-0.5 whitespace-nowrap ${
                      isActive
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-transparent text-muted-foreground border-muted-foreground/30 hover:text-foreground hover:border-muted-foreground/60'
                    }`}
                    data-testid={`topic-chip-${topic}`}
                  >
                    {TOPIC_LABELS[topic]}
                    <span className={`${isActive ? 'bg-background/20' : 'bg-muted-foreground/15'} rounded-full px-1 text-[9px]`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Removed sub-filters - clear tab separation eliminates need for sub-filters */}
      {false && !simplified && !compact && (
        <div 
          className="px-3 py-2 border-b bg-muted/10 flex-shrink-0 overflow-x-auto scrollbar-hide"
          style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="flex items-center gap-2 min-w-max">
            <Button
              variant={subFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs px-3 rounded-full whitespace-nowrap ${
                subFilter === 'all' ? '' : 'border-muted-foreground/30'
              }`}
              onClick={() => setSubFilter('all')}
              data-testid="subfilter-all"
            >
              All
            </Button>
          </div>
        </div>
      )}
      
      
      {/* Sort & Filter Row - Simplified on mobile */}
      <div className={`flex items-center justify-between border-b bg-background flex-shrink-0 ${compact ? 'px-2 py-1.5 gap-1' : simplified ? 'px-3 py-2 gap-1' : 'px-4 py-2 gap-2'}`}>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground min-w-0 truncate`}>
          {sortedNotifications.length} items{!compact && enableSwipeDelete && ' • Swipe left to delete'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={`${compact ? 'h-6 text-[10px] px-2' : 'h-6 text-xs px-2'}`}
            onClick={() => setSortNewest(!sortNewest)}
            data-testid="button-sort-toggle"
          >
            <ArrowUpDown className={compact ? "h-3 w-3 mr-1" : "h-3 w-3 mr-1"} />
            {sortNewest ? 'Newest' : 'Oldest'}
          </Button>
          <Button
            variant={showUnreadOnly ? 'secondary' : 'ghost'}
            size="sm"
            className={`${compact ? 'h-6 text-[10px] px-2' : 'h-6 text-xs px-2'}`}
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            data-testid="button-unread-toggle"
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      {/* Notification List - Always overflow-y-auto so cards never push the footer out of view */}
      {/* compact (mobile): natural content height up to max-height, scrolls internally */}
      {/* desktop: flex-1 fill with overflow-y-auto and capped maxHeight for popover context */}
      <div 
        className={`overflow-y-auto overscroll-contain flex-1 min-h-0`}
        style={{ 
          minHeight: compact ? undefined : '30vh',
          maxHeight: compact ? undefined : 'calc(75vh - 220px)',
          WebkitOverflowScrolling: 'touch',
        }}
        ref={(el) => setViewportRef(el)}
      >
        <div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Suspense fallback={<div className="w-12 h-12" />}>
              <TrinityArrowMark size={48} />
            </Suspense>
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : sortedNotifications.length > 0 ? (
          <div className="divide-y min-h-0">
            {sortedNotifications.map((notification) => {
              return enableSwipeDelete ? (
                <SwipeToDelete
                  key={notification.id}
                  onDelete={() => handleDismiss(notification.id)}
                >
                  <NotificationCard
                    notification={notification}
                    onDismiss={handleDismiss}
                    onAction={handleAction}
                    onCardClick={setSelectedNotification}
                    onClose={() => setOpen(false)}
                    isGuruMode={isGuruMode}
                    canInteract={!!user}
                    compact={compact}
                  />
                </SwipeToDelete>
              ) : (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onDismiss={handleDismiss}
                  onAction={handleAction}
                  onCardClick={setSelectedNotification}
                  onClose={() => setOpen(false)}
                  isGuruMode={isGuruMode}
                  canInteract={!!user}
                  compact={compact}
                />
              );
            })}
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center ${compact ? 'py-10' : 'py-16'} text-muted-foreground`}>
            <div className={`${compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'} rounded-full bg-muted/50 flex items-center justify-center`}>
              {activeTab === 'alerts' && <Check className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} text-emerald-500 opacity-70`} />}
              {activeTab === 'updates' && <Sparkles className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} opacity-50`} />}
              {activeTab === 'system' && <Shield className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} text-emerald-500 opacity-70`} />}
            </div>
            <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}>
              {activeTab === 'alerts' && 'No alerts'}
              {activeTab === 'updates' && 'No updates'}
              {activeTab === 'system' && 'All systems operational'}
            </span>
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} mt-1`}>
              {activeTab === 'alerts' && 'No payroll, schedule, or employee alerts at this time'}
              {activeTab === 'updates' && "You're all caught up with updates!"}
              {activeTab === 'system' && 'No workflow approvals or admin actions pending'}
            </span>
          </div>
        )}
        </div>
      </div>
      
    </div>
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, subFilter, sortNewest, showUnreadOnly, sortedNotifications, isLoading, totalUnread, alertsCount, updatesCount, systemCount, user, allNotifications, visibleNotifications, isGuruMode, isMobile, setOpen]);

  // Create stable component references using the memoized generator
  // Mobile: enable swipe-to-delete for iOS-style notification dismissal
  const MobileNotificationsContent = renderNotificationsContent({ simplified: false, compact: true, enableSwipeDelete: true });
  const DesktopNotificationsContent = renderNotificationsContent({ simplified: false, compact: false, enableSwipeDelete: false });

  // Footer with navigation links - close sheet and navigate
  // Fortune 500 style: Clean gradient background with professional aesthetic
  // Uses Button components per design system guidelines (no custom hover states)
  const Footer = ({ compact, onAskTrinity }: { compact: boolean; onAskTrinity?: () => void }) => {
    const handleAskTrinity = () => {
      setOpen(false);
      // Use provided handler (opens modal) or fallback to trinity chat page
      if (onAskTrinity) {
        onAskTrinity();
      } else {
        setTimeout(() => {
          setLocation("/trinity");
        }, 100);
      }
    };
    
    const handleViewAll = () => {
      setOpen(false);
      setTimeout(() => {
        setLocation("/updates");
      }, 100);
    };
    
    return (
      <div className="border-t bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 shrink-0">
        <div className={compact ? "p-2 pb-1" : "p-3 pb-1.5"}>
          <Button
            onClick={handleAskTrinity}
            variant="outline"
            size={compact ? "sm" : "default"}
            className="w-full gap-2 bg-gradient-to-r from-cyan-600/25 to-blue-600/25 border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
            data-testid="button-ask-trinity"
          >
            <Sparkles className="w-4 h-4 flex-shrink-0 text-cyan-400" />
            <span className="font-semibold text-white">
              Ask Trinity
            </span>
          </Button>
        </div>
        <div className={compact ? "px-2 pb-2" : "px-3 pb-3"}>
          <Button
            onClick={handleViewAll}
            variant="ghost"
            size={compact ? "sm" : "default"}
            className="w-full text-cyan-400/80 hover:text-cyan-300"
            data-testid="button-view-all-updates"
          >
            View all updates
          </Button>
          <Button
            onClick={() => { window.location.href = '/notifications/log'; }}
            variant="ghost"
            size={compact ? "sm" : "default"}
            className="w-full text-muted-foreground hover:text-foreground text-xs"
            data-testid="button-delivery-log"
          >
            Delivery log
          </Button>
        </div>
      </div>
    );
  };

  if (isMobile) {
    return (
      <>
        {/* Notification Bell Trigger */}
        <div onClick={() => { chatDock?.closeBubble(); setOpen(true); }}>
          <Bell className="h-5 w-5 text-foreground" />
        </div>
        
        {/* No title so we control our own header; showCloseButton=false hides the built-in sheet buttons */}
        
        {/* Notification Detail Modal - Shows structured breakdown */}
        <NotificationDetailModal
          notification={selectedNotification}
          isOpen={!!selectedNotification}
          onClose={() => setSelectedNotification(null)}
          onDismiss={handleDismiss}
          onAction={handleAction}
          canInteract={!!user}
        />
      </>
    );
  }

  const handleAskTrinityFromUNS = () => {
    setOpen(false);
    openTrinityModal();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-label={totalUnread > 0 ? `Notifications — ${totalUnread} unread` : 'Notifications'}
            aria-haspopup="true"
            aria-expanded={open}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
            className="relative cursor-pointer"
          >
            <Bell className="h-5 w-5 text-foreground" />
            {totalUnread > 0 && (
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full shadow-lg">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 border border-border bg-popover shadow-lg overflow-visible z-50" 
          style={{ overflow: 'visible' }}
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
          <UNSCommandCenter 
            isOpen={true}
            onClose={() => setOpen(false)}
            onAskTrinity={handleAskTrinityFromUNS}
            platformRole={accessPlatformRole || userPlatformRole || undefined}
            workspaceRole={workspaceRole || undefined}
          />
        </PopoverContent>
      </Popover>
      
      {/* Notification Detail Modal - Shows structured breakdown */}
      <NotificationDetailModal
        notification={selectedNotification}
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
        onDismiss={handleDismiss}
        onAction={handleAction}
        canInteract={!!user}
      />
    </>
  );
}
