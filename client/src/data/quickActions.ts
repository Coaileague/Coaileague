/**
 * Quick Action Registry
 * Single source of truth for all quick access links throughout CoAIleague
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
  Grid3x3,
  CheckCircle,
  Database,
  RefreshCw,
  Link2,
} from 'lucide-react';

export type PlatformRole = 'root_admin' | 'root' | 'sysop' | 'deputy_admin' | 'deputy_assistant' | 'bot' | 'guest' | 'support_manager' | 'support_agent' | 'none';
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
    color: 'text-primary',
    category: 'support',
    desktopPath: '/dashboard', // Consolidated admin dashboard
    requiresPlatformRoles: ['root_admin', 'sysop', 'deputy_admin', 'deputy_assistant'],
    requiresAuth: true,
    testId: 'quick-tickets',
    description: 'Manage support tickets and customer requests'
  },
  {
    id: 'live-chat',
    label: 'Help Desk',
    icon: MessageSquare,
    color: 'text-blue-400',
    category: 'support',
    desktopPath: '/helpdesk', // SIMPLIFIED: All chat goes to unified HelpDesk
    mobilePath: '/helpdesk', // Mobile: Same unified HelpDesk
    requiresAuth: true,
    testId: 'quick-chat',
    description: 'Live chat support and team communication'
  },
  {
    id: 'support-email',
    label: 'Support Email',
    icon: Mail,
    color: 'text-primary',
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
    color: 'text-primary',
    category: 'platform',
    desktopPath: '/platform-users',
    requiresPlatformRoles: ['root_admin', 'sysop'],
    requiresAuth: true,
    testId: 'quick-users',
    description: 'Manage platform users and permissions'
  },
  {
    id: 'platform-workspaces',
    label: 'Workspaces',
    icon: Building2,
    color: 'text-blue-400',
    category: 'platform',
    desktopPath: '/platform-admin',
    requiresPlatformRoles: ['root_admin', 'sysop'],
    requiresAuth: true,
    testId: 'quick-workspaces',
    description: 'Manage workspaces and organizations'
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    icon: ScrollText,
    color: 'text-blue-400',
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
    color: 'text-blue-500',
    category: 'platform',
    desktopPath: '/settings',
    requiresPlatformRoles: ['root_admin', 'sysop'],
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
    color: 'text-primary',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root_admin', 'sysop'],
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
    requiresPlatformRoles: ['root_admin', 'sysop'],
    requiresAuth: true,
    testId: 'quick-errors',
    description: 'View recent errors and system issues'
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Activity,
    color: 'text-blue-400',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root_admin', 'sysop'],
    requiresAuth: true,
    testId: 'quick-performance',
    description: 'Monitor application performance metrics'
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: Webhook,
    color: 'text-blue-400',
    category: 'operations',
    desktopPath: '/settings',
    requiresPlatformRoles: ['root_admin', 'sysop', 'deputy_admin'],
    requiresAuth: true,
    testId: 'quick-webhooks',
    description: 'Configure webhook integrations'
  },
  {
    id: 'api-status',
    label: 'API Status',
    icon: Code,
    color: 'text-primary',
    category: 'operations',
    desktopPath: '/root-admin-dashboard#system-stats',
    isHashAnchor: true,
    requiresPlatformRoles: ['root_admin', 'sysop'],
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
    color: 'text-primary',
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
    color: 'text-blue-400',
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
    color: 'text-blue-400',
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
    color: 'text-primary',
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
    color: 'text-blue-500',
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
    color: 'text-blue-500',
    category: 'core',
    desktopPath: '/training',
    requiresAuth: true,
    testId: 'quick-training',
    description: 'Employee training and development'
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    color: 'text-primary',
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
    desktopPath: '/category/platform',
    requiresAuth: true,
    testId: 'quick-all',
    description: 'View all CoAIleague features'
  },

  // ========================================
  // Integrations & Onboarding
  // ========================================
  {
    id: 'connect-quickbooks',
    label: 'Connect QuickBooks',
    icon: DollarSign,
    color: 'text-green-500',
    category: 'operations',
    desktopPath: '/integrations',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-connect-quickbooks',
    description: 'Connect your QuickBooks account for automated billing and payroll'
  },
  {
    id: 'run-data-sync',
    label: 'Sync Data',
    icon: Users,
    color: 'text-blue-500',
    category: 'operations',
    desktopPath: '/integrations',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-run-sync',
    description: 'Run initial data sync from connected integrations'
  },
  {
    id: 'onboarding-progress',
    label: 'Setup Progress',
    icon: CheckCircle,
    color: 'text-primary',
    category: 'core',
    desktopPath: '/onboarding',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-onboarding-progress',
    description: 'View your workspace setup checklist and progress'
  },
  {
    id: 'import-employees',
    label: 'Import Team',
    icon: UserPlus,
    color: 'text-primary',
    category: 'core',
    desktopPath: '/employees',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-import-employees',
    description: 'Import employees from QuickBooks or spreadsheet'
  },
  {
    id: 'integration-health',
    label: 'Integration Health',
    icon: Activity,
    color: 'text-green-400',
    category: 'operations',
    desktopPath: '/integrations',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-integration-health',
    description: 'Monitor connected integration status and health'
  },
  {
    id: 'connect-quickbooks',
    label: 'Connect QuickBooks',
    icon: Link2,
    color: 'text-green-500',
    category: 'core',
    desktopPath: '/accounting-integrations',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-connect-quickbooks',
    description: 'Connect QuickBooks for automated billing and payroll sync'
  },
  {
    id: 'run-data-sync',
    label: 'Run Data Sync',
    icon: RefreshCw,
    color: 'text-blue-500',
    category: 'core',
    desktopPath: '/accounting-integrations#sync',
    isHashAnchor: true,
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-run-data-sync',
    description: 'Manually trigger data synchronization with connected integrations'
  },
  {
    id: 'migration-status',
    label: 'Migration Status',
    icon: Database,
    color: 'text-purple-500',
    category: 'core',
    desktopPath: '/workspace-onboarding',
    requiresWorkspaceRoles: ['owner', 'admin'],
    requiresAuth: true,
    testId: 'quick-migration-status',
    description: 'View data migration progress and automation setup status'
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
