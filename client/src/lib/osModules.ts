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
  MessagesSquare,
  LockKeyhole,
  Headphones,
  CalendarDays,
  Wallet,
  FileCheck2,
  GraduationCap,
  UsersRound,
  BookUser,
  BadgeDollarSign,
  Award,
  TrendingUp,
  PieChart,
  FileBarChart,
  Zap,
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

export type FamilyId = 'communication' | 'operations' | 'growth' | 'platform';

export interface OSModuleRoute {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  capabilities?: OSCapability[];
  minimumTier?: SubscriptionTier;
  badge?: string;
  familyId?: FamilyId;
  isPrimary?: boolean;
  order?: number;
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
  familyId?: FamilyId;
}

export interface SidebarFamily {
  id: FamilyId;
  label: string;
  order: number;
  routes: OSModuleRoute[];
  locked: OSModuleRoute[];
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
    familyId: 'platform',
    routes: [
      {
        id: 'dashboard-home',
        label: 'Admin Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Your personalized overview',
        familyId: 'platform',
        order: 20,
      },
    ],
  },
  {
    id: 'operations-os',
    name: 'OperationsOS™',
    description: 'Field Operations Management',
    icon: CalendarDays,
    color: 'hsl(var(--chart-1))',
    capabilities: ['view_schedules', 'manage_schedules', 'view_timesheets', 'approve_timesheets'],
    familyId: 'operations',
    routes: [
      {
        id: 'schedule-os',
        label: 'ScheduleOS™',
        href: '/schedule',
        icon: CalendarDays,
        description: 'Intelligent shift scheduling',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        order: 10,
      },
      {
        id: 'time-os',
        label: 'TimeOS™',
        href: '/time-tracking',
        icon: Clock,
        description: 'GPS-verified time tracking',
        capabilities: ['view_timesheets'],
        familyId: 'operations',
        order: 11,
      },
      {
        id: 'timesheets-pending',
        label: 'Pending Approvals',
        href: '/timesheets/pending',
        icon: Clock,
        description: 'Review and approve submitted hours',
        capabilities: ['approve_timesheets'],
        badge: 'Supervisor',
        familyId: 'operations',
        order: 12,
      },
    ],
  },
  {
    id: 'bill-os',
    name: 'BillOS™',
    description: 'Administrative Billing & Financial Management',
    icon: Wallet,
    color: 'hsl(var(--chart-2))',
    capabilities: ['view_invoices', 'manage_invoices', 'view_payroll', 'process_payroll'],
    familyId: 'operations',
    routes: [
      {
        id: 'payroll-os',
        label: 'PayrollOS™',
        href: '/payroll',
        icon: Wallet,
        description: 'FLSA-compliant payroll processing',
        capabilities: ['view_payroll'],
        minimumTier: 'professional',
        familyId: 'operations',
        order: 13,
      },
      {
        id: 'bill-os-invoices',
        label: 'BillOS™',
        href: '/invoices',
        icon: FileCheck2,
        description: 'Automated invoice generation',
        capabilities: ['view_invoices'],
        familyId: 'operations',
        order: 14,
      },
    ],
  },
  {
    id: 'management',
    name: 'Management',
    description: 'Workforce & Client Management',
    icon: UsersRound,
    color: 'hsl(var(--chart-3))',
    capabilities: ['manage_employees', 'manage_clients'],
    familyId: 'operations',
    routes: [
      {
        id: 'training-os',
        label: 'TrainingOS™',
        href: '/training',
        icon: GraduationCap,
        description: 'Employee onboarding and compliance training',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        order: 15,
      },
      {
        id: 'employees',
        label: 'Employees',
        href: '/employees',
        icon: UsersRound,
        description: 'Manage workforce',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        order: 16,
      },
      {
        id: 'clients',
        label: 'Clients',
        href: '/clients',
        icon: BookUser,
        description: 'Manage client relationships',
        capabilities: ['manage_clients'],
        familyId: 'operations',
        order: 17,
      },
    ],
  },
  {
    id: 'intelligence-os',
    name: 'IntelligenceOS™',
    description: 'AI-Powered Automation & Analytics',
    icon: FileBarChart,
    color: 'hsl(var(--chart-4))',
    capabilities: ['view_reports', 'advanced_analytics'],
    familyId: 'growth',
    routes: [
      {
        id: 'deal-os',
        label: 'DealOS™ Sales',
        href: '/sales',
        icon: BadgeDollarSign,
        description: 'AI-powered RFP hunting and contract generation',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise',
        familyId: 'growth',
        order: 30,
      },
      {
        id: 'talent-os',
        label: 'TalentOS™',
        href: '/leaders-hub',
        icon: Award,
        description: 'Leadership development and recognition',
        capabilities: ['manage_employees'],
        familyId: 'growth',
        order: 31,
      },
      {
        id: 'engagement-os',
        label: 'EngagementOS™',
        href: '/engagement/dashboard',
        icon: TrendingUp,
        description: 'Pulse surveys and employee engagement',
        capabilities: ['manage_employees'],
        familyId: 'growth',
        order: 32,
      },
      {
        id: 'analytics-os',
        label: 'AnalyticsOS™',
        href: '/analytics',
        icon: PieChart,
        description: 'AI-powered predictive analytics',
        capabilities: ['advanced_analytics'],
        minimumTier: 'enterprise',
        badge: 'Enterprise',
        familyId: 'growth',
        order: 33,
      },
      {
        id: 'report-os',
        label: 'ReportOS™',
        href: '/reports',
        icon: FileBarChart,
        description: 'Comprehensive business intelligence',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'growth',
        order: 34,
      },
    ],
  },
  {
    id: 'comm-os',
    name: 'CommOS™',
    description: 'Unified Communications Platform',
    icon: MessagesSquare,
    color: 'hsl(var(--chart-5))',
    capabilities: ['view_messages'],
    familyId: 'communication',
    routes: [
      {
        id: 'comm-os-dashboard',
        label: 'CommOS™',
        href: '/comm-os',
        icon: MessagesSquare,
        description: 'Communication hub dashboard',
        capabilities: ['view_messages'],
        familyId: 'communication',
        order: 1,
      },
      {
        id: 'private-messages',
        label: 'Private Messages',
        href: '/messages',
        icon: LockKeyhole,
        description: 'Direct messaging',
        capabilities: ['view_messages'],
        familyId: 'communication',
        order: 2,
      },
      {
        id: 'support-helpdesk',
        label: 'SupportOS™ HelpDesk',
        href: '/chat',
        icon: Headphones,
        description: 'AI-powered support chat',
        familyId: 'communication',
        order: 3,
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
    familyId: 'platform',
    routes: [
      {
        id: 'audit-logs',
        label: 'AuditOS™',
        href: '/audit-logs',
        icon: Shield,
        description: 'Compliance and activity tracking',
        capabilities: ['view_audit_logs'],
        minimumTier: 'professional',
        familyId: 'platform',
        order: 22,
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
    familyId: 'platform',
    routes: [
      {
        id: 'integration-os',
        label: 'IntegrationOS™',
        href: '/integrations',
        icon: Zap,
        description: 'External system connections',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        order: 21,
      },
      {
        id: 'settings-workspace',
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        description: 'Configure workspace preferences',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        order: 23,
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

/**
 * Family display configuration
 */
const familyConfig: Record<FamilyId, { label: string; order: number }> = {
  communication: { label: 'Communication', order: 1 },
  operations: { label: 'Operations', order: 2 },
  growth: { label: 'Growth & AI', order: 3 },
  platform: { label: 'Platform', order: 4 },
};

/**
 * Select sidebar families with accessible and locked routes
 * Central selector that groups routes by family and applies RBAC filtering
 */
export function selectSidebarFamilies(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): SidebarFamily[] {
  // Collect all routes from all modules
  const allRoutes: OSModuleRoute[] = [];
  
  // Add platform support module routes for staff
  if (isPlatformStaff) {
    platformSupportModule.routes.forEach(route => {
      allRoutes.push({
        ...route,
        familyId: 'platform',
        order: 0, // Show at top of platform family
      });
    });
  }

  // Add regular module routes
  osModules.forEach(module => {
    module.routes.forEach(route => {
      allRoutes.push(route);
    });
  });

  // Group routes by family
  const familyMap: Record<FamilyId, { accessible: OSModuleRoute[]; locked: OSModuleRoute[] }> = {
    communication: { accessible: [], locked: [] },
    operations: { accessible: [], locked: [] },
    growth: { accessible: [], locked: [] },
    platform: { accessible: [], locked: [] },
  };

  // Categorize each route as accessible or locked
  allRoutes.forEach(route => {
    if (!route.familyId) return;

    const hasRoleAccess = !route.capabilities || 
      route.capabilities.some(cap => hasCapability(role, cap));
    const hasTier = hasTierAccess(tier, route.minimumTier);

    if (isPlatformStaff || (hasRoleAccess && hasTier)) {
      // User can access this route
      familyMap[route.familyId].accessible.push(route);
    } else if (hasRoleAccess && !hasTier && route.minimumTier) {
      // User has role access but not tier (locked)
      familyMap[route.familyId].locked.push({
        ...route,
        badge: route.minimumTier.charAt(0).toUpperCase() + route.minimumTier.slice(1),
      });
    }
  });

  // Build final family array
  const families: SidebarFamily[] = Object.entries(familyConfig).map(([id, config]) => {
    const familyId = id as FamilyId;
    return {
      id: familyId,
      label: config.label,
      order: config.order,
      routes: familyMap[familyId].accessible.sort((a, b) => (a.order || 0) - (b.order || 0)),
      locked: familyMap[familyId].locked.sort((a, b) => (a.order || 0) - (b.order || 0)),
    };
  });

  // Filter out empty families and sort by order
  return families
    .filter(family => family.routes.length > 0 || family.locked.length > 0)
    .sort((a, b) => a.order - b.order);
}
