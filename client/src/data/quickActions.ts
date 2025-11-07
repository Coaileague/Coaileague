/**
 * Quick Action Registry
 * Single source of truth for all quick access links throughout AutoForce™
 * Provides role-based access, platform-aware routing, and deduplication
 */

import { 
  LucideIcon,
  Ticket,
  MessageSquare,
  HelpCircle,
  Mail,
  Users,
  Building2,
  ScrollText,
  Flag,
  Gauge,
  AlertCircle,
  Activity,
  Webhook,
  Code,
  Calendar,
  Clock,
  Receipt,
  DollarSign,
  UserPlus,
  GraduationCap,
  BarChart3,
  Grid3x3
} from 'lucide-react';

export type PlatformRole = 'root' | 'sysop' | 'deputy_admin' | 'deputy_assistant' | 'bot' | 'guest';
export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'employee';
export type DevicePlatform = 'mobile' | 'tablet' | 'desktop';

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  category: 'support' | 'platform' | 'operations' | 'core';
  
  // Routing
  desktopPath: string;
  mobilePath?: string; // If different from desktop
  isExternal?: boolean;
  isHashAnchor?: boolean;
  
  // Access Control
  requiresPlatformRoles?: PlatformRole[];
  requiresWorkspaceRoles?: WorkspaceRole[];
  requiresAuth?: boolean;
  
  // Metadata
  testId: string;
  description?: string;
}

/**
 * Resolve the correct path based on device platform
 */
export function resolvePlatformRoute(
  action: QuickAction,
  platform: DevicePlatform
): string {
  // Mobile gets special mobile-optimized routes if available
  if (platform === 'mobile' && action.mobilePath) {
    return action.mobilePath;
  }
  
  // Tablet and desktop use desktop paths
  return action.desktopPath;
}

/**
 * Check if user has access to an action
 */
export function canAccessAction(
  action: QuickAction,
  platformRole?: PlatformRole,
  workspaceRole?: WorkspaceRole,
  isAuthenticated: boolean = false
): boolean {
  // Auth check
  if (action.requiresAuth && !isAuthenticated) {
    return false;
  }
  
  // Platform role check
  if (action.requiresPlatformRoles && action.requiresPlatformRoles.length > 0) {
    if (!platformRole || !action.requiresPlatformRoles.includes(platformRole)) {
      return false;
    }
  }
  
  // Workspace role check
  if (action.requiresWorkspaceRoles && action.requiresWorkspaceRoles.length > 0) {
    if (!workspaceRole || !action.requiresWorkspaceRoles.includes(workspaceRole)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get actions by category with access control and platform routing
 */
export function getActionsByCategory(
  category: QuickAction['category'],
  platformRole?: PlatformRole,
  workspaceRole?: WorkspaceRole,
  isAuthenticated: boolean = false,
  platform: DevicePlatform = 'desktop'
): Array<QuickAction & { resolvedPath: string }> {
  return quickActionsRegistry
    .filter(action => action.category === category)
    .filter(action => canAccessAction(action, platformRole, workspaceRole, isAuthenticated))
    .map(action => ({
      ...action,
      resolvedPath: resolvePlatformRoute(action, platform)
    }));
}

/**
 * Quick Actions Registry
 * IMPORTANT: Each action must have a unique ID for deduplication
 */
export const quickActionsRegistry: QuickAction[] = [
  // ========================================
  // Support & Helpdesk Tools
  // ========================================
  {
    id: 'support-tickets',
    label: 'Support Tickets',
    icon: Ticket,
    color: 'text-emerald-400',
    category: 'support',
    desktopPath: '/dashboard', // Consolidated admin dashboard
    requiresPlatformRoles: ['root', 'sysop', 'deputy_admin', 'deputy_assistant'],
    requiresAuth: true,
    testId: 'quick-tickets',
    description: 'Manage support tickets and customer requests'
  },
  {
    id: 'live-chat',
    label: 'Live Chat',
    icon: MessageSquare,
    color: 'text-teal-400',
    category: 'support',
    desktopPath: '/comm-os', // Desktop: Full CommOS
    mobilePath: '/private-messages', // Mobile: Mobile-optimized chat
    requiresAuth: true,
    testId: 'quick-chat',
    description: 'Real-time team communication and messaging'
  },
  {
    id: 'helpdesk',
    label: 'Help Desk',
    icon: HelpCircle,
    color: 'text-green-400',
    category: 'support',
    desktopPath: '/helpdesk5',
    mobilePath: '/helpdesk5', // HelpDesk5 is already responsive
    requiresAuth: true,
    testId: 'quick-helpdesk',
    description: 'Customer support and ticket management'
  },
  {
    id: 'support-email',
    label: 'Support Email',
    icon: Mail,
    color: 'text-emerald-500',
    category: 'support',
    desktopPath: '/contact',
    isExternal: false,
    testId: 'quick-email',
    description: 'Contact support via email'
  },

  // ========================================
  // Platform Management Tools
  // ========================================
  {
    id: 'platform-users',
    label: 'Users',
    icon: Users,
    color: 'text-emerald-400',
    category: 'platform',
    desktopPath: '/platform-users',
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-users',
    description: 'Manage platform users and permissions'
  },
  {
    id: 'platform-workspaces',
    label: 'Workspaces',
    icon: Building2,
    color: 'text-teal-400',
    category: 'platform',
    desktopPath: '/platform-admin',
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-workspaces',
    description: 'Manage workspaces and organizations'
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    icon: ScrollText,
    color: 'text-green-400',
    category: 'platform',
    desktopPath: '/my-audit-record',
    requiresAuth: true,
    testId: 'quick-audit',
    description: 'View audit trail and compliance logs'
  },
  {
    id: 'feature-flags',
    label: 'Feature Flags',
    icon: Flag,
    color: 'text-green-500',
    category: 'platform',
    desktopPath: '/settings',
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-flags',
    description: 'Manage feature flags and rollouts'
  },

  // ========================================
  // Operations & Monitoring
  // ========================================
  {
    id: 'system-health',
    label: 'System Health',
    icon: Gauge,
    color: 'text-emerald-400',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-health',
    description: 'Monitor system performance and health'
  },
  {
    id: 'error-logs',
    label: 'Error Logs',
    icon: AlertCircle,
    color: 'text-amber-400',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#recent-activity',
    isHashAnchor: true,
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-errors',
    description: 'View recent errors and system issues'
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Activity,
    color: 'text-teal-400',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-performance',
    description: 'Monitor application performance metrics'
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: Webhook,
    color: 'text-green-400',
    category: 'operations',
    desktopPath: '/settings',
    requiresPlatformRoles: ['root', 'sysop', 'deputy_admin'],
    requiresAuth: true,
    testId: 'quick-webhooks',
    description: 'Configure webhook integrations'
  },
  {
    id: 'api-status',
    label: 'API Status',
    icon: Code,
    color: 'text-emerald-500',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root', 'sysop'],
    requiresAuth: true,
    testId: 'quick-api',
    description: 'Check API status and health'
  },

  // ========================================
  // Core Features
  // ========================================
  {
    id: 'schedule',
    label: 'Schedule',
    icon: Calendar,
    color: 'text-emerald-400',
    category: 'core',
    desktopPath: '/schedule',
    requiresAuth: true,
    testId: 'quick-schedule',
    description: 'Manage employee schedules and shifts'
  },
  {
    id: 'time-tracking',
    label: 'Time Clock',
    icon: Clock,
    color: 'text-teal-400',
    category: 'core',
    desktopPath: '/time-tracking',
    requiresAuth: true,
    testId: 'quick-timeclock',
    description: 'Track employee time and attendance'
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: Receipt,
    color: 'text-green-400',
    category: 'core',
    desktopPath: '/invoices',
    requiresAuth: true,
    testId: 'quick-invoices',
    description: 'Manage invoices and billing'
  },
  {
    id: 'payroll',
    label: 'Payroll',
    icon: DollarSign,
    color: 'text-emerald-500',
    category: 'core',
    desktopPath: '/payroll-dashboard',
    requiresAuth: true,
    testId: 'quick-payroll',
    description: 'Process payroll and payments'
  },
  {
    id: 'hiring',
    label: 'Hiring',
    icon: UserPlus,
    color: 'text-teal-500',
    category: 'core',
    desktopPath: '/employees',
    requiresAuth: true,
    testId: 'quick-hiring',
    description: 'Recruit and onboard new employees'
  },
  {
    id: 'training',
    label: 'Training',
    icon: GraduationCap,
    color: 'text-green-500',
    category: 'core',
    desktopPath: '/training-os',
    requiresAuth: true,
    testId: 'quick-training',
    description: 'Employee training and development'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    color: 'text-emerald-600',
    category: 'core',
    desktopPath: '/analytics',
    requiresAuth: true,
    testId: 'quick-analytics',
    description: 'Business analytics and insights'
  },
  {
    id: 'all-features',
    label: 'All Features',
    icon: Grid3x3,
    color: 'text-slate-400',
    category: 'core',
    desktopPath: '/os-family-platform',
    requiresAuth: true,
    testId: 'quick-all',
    description: 'View all AutoForce™ features'
  },
];

/**
 * Get all unique quick actions (deduplicated by ID)
 */
export function getAllQuickActions(): QuickAction[] {
  const seen = new Set<string>();
  return quickActionsRegistry.filter(action => {
    if (seen.has(action.id)) {
      console.warn(`Duplicate quick action ID detected: ${action.id}`);
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

/**
 * Health check for broken routes
 * Returns actions that may have routing issues
 */
export function validateQuickActions(): {
  valid: QuickAction[];
  suspicious: Array<{ action: QuickAction; reason: string }>;
} {
  const valid: QuickAction[] = [];
  const suspicious: Array<{ action: QuickAction; reason: string }> = [];
  
  getAllQuickActions().forEach(action => {
    // Check for empty paths
    if (!action.desktopPath || action.desktopPath.trim() === '') {
      suspicious.push({ action, reason: 'Empty desktop path' });
      return;
    }
    
    // Check for suspicious hash-only links that aren't marked as anchors
    if (action.desktopPath.startsWith('#') && !action.isHashAnchor) {
      suspicious.push({ action, reason: 'Hash link without isHashAnchor flag' });
      return;
    }
    
    valid.push(action);
  });
  
  return { valid, suspicious };
}
