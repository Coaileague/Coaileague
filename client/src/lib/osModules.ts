import {
  LayoutDashboard,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Users,
  Building2,
  BarChart3,
  Settings,
  Shield,
  MessageSquare,
  Briefcase,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceRole = 
  | 'org_owner' 
  | 'org_admin' 
  | 'department_manager' 
  | 'supervisor' 
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

export type OSCapability =
  | 'view_schedules'
  | 'manage_schedules'
  | 'view_timesheets'
  | 'approve_timesheets'
  | 'view_invoices'
  | 'manage_invoices'
  | 'view_payroll'
  | 'process_payroll'
  | 'view_reports'
  | 'advanced_analytics'
  | 'manage_employees'
  | 'manage_clients'
  | 'view_audit_logs'
  | 'manage_workspace'
  | 'view_messages'
  | 'support_dashboard';

export interface OSModuleRoute {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  capabilities?: OSCapability[];
  minimumTier?: SubscriptionTier;
  badge?: string;
}

export interface OSModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  routes: OSModuleRoute[];
  capabilities: OSCapability[];
  minimumTier?: SubscriptionTier;
}

/**
 * Role Capability Map
 * Defines which capabilities each role has access to
 */
export const roleCapabilities: Record<WorkspaceRole, OSCapability[]> = {
  org_owner: [
    'view_schedules', 'manage_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_invoices', 'manage_invoices',
    'view_payroll', 'process_payroll',
    'view_reports', 'advanced_analytics',
    'manage_employees', 'manage_clients',
    'view_audit_logs', 'manage_workspace',
    'view_messages',
  ],
  org_admin: [
    'view_schedules', 'manage_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_invoices', 'manage_invoices',
    'view_payroll', 'process_payroll',
    'view_reports', 'advanced_analytics',
    'manage_employees', 'manage_clients',
    'view_audit_logs', 'manage_workspace',
    'view_messages',
  ],
  department_manager: [
    'view_schedules', 'manage_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_invoices', 'manage_invoices',
    'view_reports',
    'manage_employees', 'manage_clients',
    'view_messages',
  ],
  supervisor: [
    'view_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_reports',
    'view_messages',
  ],
  staff: [
    'view_schedules',
    'view_timesheets',
    'view_messages',
  ],
  auditor: [
    'view_schedules',
    'view_timesheets',
    'view_reports',
    'view_audit_logs',
    'view_messages',
  ],
  contractor: [
    'view_schedules',
    'view_timesheets',
    'view_messages',
  ],
};

/**
 * Tier Hierarchy (1 = lowest, 4 = highest)
 */
export const tierHierarchy: Record<SubscriptionTier, number> = {
  enterprise: 4,
  professional: 3,
  starter: 2,
  free: 1,
};

/**
 * Check if user role has required capability
 */
export function hasCapability(
  role: WorkspaceRole,
  capability: OSCapability
): boolean {
  return roleCapabilities[role]?.includes(capability) ?? false;
}

/**
 * Check if tier meets minimum requirement
 */
export function hasTierAccess(
  currentTier: SubscriptionTier,
  minimumTier?: SubscriptionTier
): boolean {
  if (!minimumTier) return true;
  return tierHierarchy[currentTier] >= tierHierarchy[minimumTier];
}

/**
 * Check if user can access a route
 */
export function canAccessRoute(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  route: OSModuleRoute
): boolean {
  // Check tier access
  if (!hasTierAccess(tier, route.minimumTier)) {
    return false;
  }

  // Check capability access
  if (!route.capabilities || route.capabilities.length === 0) {
    return true; // No capability requirement
  }

  // User must have at least one required capability
  return route.capabilities.some(cap => hasCapability(role, cap));
}

/**
 * AutoForce™ OS Modules Registry
 * Central configuration for all 6 major OS systems
 */
export const osModules: OSModule[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Your personalized overview',
    icon: LayoutDashboard,
    color: 'hsl(var(--primary))',
    capabilities: [],
    routes: [
      {
        id: 'dashboard-home',
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Your personalized overview',
      },
    ],
  },
  {
    id: 'operations-os',
    name: 'OperationsOS™',
    description: 'Field Operations Management',
    icon: Calendar,
    color: 'hsl(var(--chart-1))',
    capabilities: ['view_schedules', 'manage_schedules', 'view_timesheets', 'approve_timesheets'],
    routes: [
      {
        id: 'schedules',
        label: 'Schedules',
        href: '/schedules',
        icon: Calendar,
        description: 'View and manage work schedules',
        capabilities: ['view_schedules'],
      },
      {
        id: 'timesheets',
        label: 'Timesheets',
        href: '/timesheets',
        icon: Clock,
        description: 'Track and approve hours',
        capabilities: ['view_timesheets'],
      },
      {
        id: 'timesheets-pending',
        label: 'Pending Approvals',
        href: '/timesheets/pending',
        icon: Clock,
        description: 'Review and approve submitted hours',
        capabilities: ['approve_timesheets'],
        badge: 'Manager',
      },
    ],
  },
  {
    id: 'bill-os',
    name: 'BillOS™',
    description: 'Administrative Billing & Financial Management',
    icon: DollarSign,
    color: 'hsl(var(--chart-2))',
    capabilities: ['view_invoices', 'manage_invoices', 'view_payroll', 'process_payroll'],
    routes: [
      {
        id: 'invoices',
        label: 'Invoices',
        href: '/invoices',
        icon: FileText,
        description: 'Client billing and invoices',
        capabilities: ['view_invoices'],
      },
      {
        id: 'payroll',
        label: 'Payroll',
        href: '/payroll',
        icon: DollarSign,
        description: 'Employee payroll processing',
        capabilities: ['view_payroll'],
        minimumTier: 'professional',
      },
    ],
  },
  {
    id: 'management',
    name: 'Management',
    description: 'Workforce & Client Management',
    icon: Users,
    color: 'hsl(var(--chart-3))',
    capabilities: ['manage_employees', 'manage_clients'],
    routes: [
      {
        id: 'employees',
        label: 'Employees',
        href: '/employees',
        icon: Users,
        description: 'Manage workforce',
        capabilities: ['manage_employees'],
      },
      {
        id: 'clients',
        label: 'Clients',
        href: '/clients',
        icon: Building2,
        description: 'Manage client relationships',
        capabilities: ['manage_clients'],
      },
    ],
  },
  {
    id: 'intelligence-os',
    name: 'IntelligenceOS™',
    description: 'AI-Powered Automation & Analytics',
    icon: BarChart3,
    color: 'hsl(var(--chart-4))',
    capabilities: ['view_reports', 'advanced_analytics'],
    routes: [
      {
        id: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: BarChart3,
        description: 'Analytics and insights',
        capabilities: ['view_reports'],
      },
      {
        id: 'analytics',
        label: 'Advanced Analytics',
        href: '/analytics',
        icon: BarChart3,
        description: 'AI-powered predictive analytics',
        capabilities: ['advanced_analytics'],
        minimumTier: 'enterprise',
        badge: 'Enterprise',
      },
    ],
  },
  {
    id: 'comm-os',
    name: 'CommOS™',
    description: 'Unified Communications Platform',
    icon: MessageSquare,
    color: 'hsl(var(--chart-5))',
    capabilities: ['view_messages'],
    routes: [
      {
        id: 'messages',
        label: 'Messages',
        href: '/messages',
        icon: MessageSquare,
        description: 'Team communications',
        capabilities: ['view_messages'],
      },
    ],
  },
  {
    id: 'audit-os',
    name: 'AuditOS™',
    description: 'Compliance & Audit Trail Management',
    icon: Shield,
    color: 'hsl(var(--destructive))',
    capabilities: ['view_audit_logs'],
    routes: [
      {
        id: 'audit-logs',
        label: 'Audit Logs',
        href: '/audit-logs',
        icon: Shield,
        description: 'Compliance and activity tracking',
        capabilities: ['view_audit_logs'],
      },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Configuration & Preferences',
    icon: Settings,
    color: 'hsl(var(--muted-foreground))',
    capabilities: ['manage_workspace'],
    routes: [
      {
        id: 'settings-workspace',
        label: 'Workspace Settings',
        href: '/settings',
        icon: Settings,
        description: 'Configure workspace preferences',
        capabilities: ['manage_workspace'],
      },
      {
        id: 'settings-profile',
        label: 'My Profile',
        href: '/profile',
        icon: Users,
        description: 'Personal settings and preferences',
      },
    ],
  },
];

/**
 * Platform Support Module (for AutoForce staff)
 */
export const platformSupportModule: OSModule = {
  id: 'support-control-center',
  name: 'Support Control Center',
  description: 'Multi-tenant platform support',
  icon: Shield,
  color: 'hsl(var(--destructive))',
  capabilities: ['support_dashboard'],
  routes: [
    {
      id: 'support-dashboard',
      label: 'Support Dashboard',
      href: '/support',
      icon: Shield,
      description: 'Multi-tenant support view',
    },
    {
      id: 'support-workspaces',
      label: 'All Workspaces',
      href: '/support/workspaces',
      icon: Building2,
      description: 'Browse all organizations',
    },
    {
      id: 'support-monitoring',
      label: 'System Monitoring',
      href: '/support/monitoring',
      icon: BarChart3,
      description: 'Platform health and metrics',
    },
  ],
};

/**
 * Get accessible modules and routes for a given role and tier
 */
export function getAccessibleModules(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): OSModule[] {
  const modules = isPlatformStaff 
    ? [platformSupportModule, ...osModules]
    : osModules;

  return modules
    .map(module => ({
      ...module,
      routes: module.routes.filter(route => 
        canAccessRoute(role, tier, route)
      ),
    }))
    .filter(module => module.routes.length > 0);
}

/**
 * Get locked routes (user has role access but not tier access)
 */
export function getLockedRoutes(
  role: WorkspaceRole,
  tier: SubscriptionTier
): OSModuleRoute[] {
  const locked: OSModuleRoute[] = [];

  osModules.forEach(module => {
    module.routes.forEach(route => {
      // Check if user has capability but not tier
      const hasRoleAccess = !route.capabilities || 
        route.capabilities.some(cap => hasCapability(role, cap));
      const hasTier = hasTierAccess(tier, route.minimumTier);

      if (hasRoleAccess && !hasTier && route.minimumTier) {
        locked.push({
          ...route,
          badge: route.minimumTier.charAt(0).toUpperCase() + route.minimumTier.slice(1),
        });
      }
    });
  });

  return locked;
}
