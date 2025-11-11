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

export type FamilyId = 'commos' | 'operationsos' | 'billos' | 'intelligenceos' | 'auditos' | 'marketingos' | 'platform';

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
    familyId: 'operationsos',
    routes: [
      {
        id: 'schedule-os',
        label: 'ScheduleOS™',
        href: '/schedule',
        icon: CalendarDays,
        description: 'Intelligent shift scheduling',
        capabilities: ['view_schedules'],
        familyId: 'operationsos',
        order: 10,
      },
      {
        id: 'time-os',
        label: 'TimeOS™',
        href: '/time-tracking',
        icon: Clock,
        description: 'GPS-verified time tracking',
        capabilities: ['view_timesheets'],
        familyId: 'operationsos',
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
        familyId: 'operationsos',
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
    familyId: 'billos',
    routes: [
      {
        id: 'payroll-os',
        label: 'PayrollOS™',
        href: '/payroll',
        icon: Wallet,
        description: 'FLSA-compliant payroll processing',
        capabilities: ['view_payroll'],
        minimumTier: 'professional',
        familyId: 'billos',
        order: 13,
      },
      {
        id: 'bill-os-invoices',
        label: 'BillOS™',
        href: '/invoices',
        icon: FileCheck2,
        description: 'Automated invoice generation',
        capabilities: ['view_invoices'],
        familyId: 'billos',
        order: 14,
      },
      {
        id: 'bill-os-integrations',
        label: 'Integrations',
        href: '/integrations',
        icon: Zap,
        description: 'QuickBooks & Gusto integrations',
        capabilities: ['manage_invoices', 'process_payroll'],
        familyId: 'billos',
        order: 15,
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
    familyId: 'platform',
    routes: [
      {
        id: 'training-os',
        label: 'TrainingOS™',
        href: '/training',
        icon: GraduationCap,
        description: 'Employee onboarding and compliance training',
        capabilities: ['manage_employees'],
        familyId: 'operationsos',
        order: 13,
      },
      {
        id: 'employees',
        label: 'Employees',
        href: '/employees',
        icon: UsersRound,
        description: 'Manage workforce',
        capabilities: ['manage_employees'],
        familyId: 'platform',
        order: 16,
      },
      {
        id: 'clients',
        label: 'Clients',
        href: '/clients',
        icon: BookUser,
        description: 'Manage client relationships',
        capabilities: ['manage_clients'],
        familyId: 'platform',
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
    familyId: 'intelligenceos',
    routes: [
      {
        id: 'deal-os',
        label: 'DealOS™ Sales',
        href: '/sales',
        icon: BadgeDollarSign,
        description: 'AI-powered RFP hunting and contract generation',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise',
        familyId: 'marketingos',
        order: 30,
      },
      {
        id: 'talent-os',
        label: 'TalentOS™',
        href: '/leaders-hub',
        icon: Award,
        description: 'Leadership development and recognition',
        capabilities: ['manage_employees'],
        familyId: 'marketingos',
        order: 31,
      },
      {
        id: 'engagement-os',
        label: 'EngagementOS™',
        href: '/engagement/dashboard',
        icon: TrendingUp,
        description: 'Pulse surveys and employee engagement',
        capabilities: ['manage_employees'],
        familyId: 'marketingos',
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
        familyId: 'intelligenceos',
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
        familyId: 'intelligenceos',
        order: 34,
      },
      {
        id: 'insight-os',
        label: 'InsightOS™ Reports',
        href: '/analytics/reports',
        icon: FileCheck2,
        description: 'Management reports with role-based access',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'intelligenceos',
        order: 35,
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
        familyId: 'commos',
        order: 1,
      },
      {
        id: 'private-messages',
        label: 'Private Messages',
        href: '/messages',
        icon: LockKeyhole,
        description: 'Direct messaging',
        capabilities: ['view_messages'],
        familyId: 'commos',
        order: 2,
      },
      {
        id: 'support-helpdesk',
        label: 'SupportOS™ HelpDesk',
        href: '/chat',
        icon: Headphones,
        description: 'AI-powered support chat',
        familyId: 'commos',
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
    familyId: 'auditos',
    routes: [
      {
        id: 'audit-logs',
        label: 'AuditOS™',
        href: '/audit-logs',
        icon: Shield,
        description: 'Compliance and activity tracking',
        capabilities: ['view_audit_logs'],
        minimumTier: 'professional',
        familyId: 'auditos',
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
 * Platform Support Module (for AutoForce staff - root_admin, deputy_admin, sysop, support)
 * ALL platform administration tools consolidated in one place
 */
export const platformSupportModule: OSModule = {
  id: 'support-control-center',
  name: 'Platform Operations',
  description: 'Complete platform administration toolkit',
  icon: Shield,
  color: 'hsl(var(--destructive))',
  capabilities: ['support_dashboard'],
  routes: [
    {
      id: 'platform-admin',
      label: 'Platform Admin',
      href: '/platform-admin',
      icon: Shield,
      description: 'Root platform administration dashboard',
      familyId: 'platform',
      badge: 'Root',
      order: 0,
    },
    {
      id: 'admin-command-center',
      label: 'Command Center',
      href: '/admin-command-center',
      icon: Settings,
      description: 'Unified admin control panel',
      familyId: 'platform',
      order: 1,
    },
    {
      id: 'platform-users',
      label: 'Platform Users',
      href: '/platform/users',
      icon: Users,
      description: 'Cross-workspace user management',
      familyId: 'platform',
      order: 2,
    },
    {
      id: 'admin-usage',
      label: 'Usage & Billing',
      href: '/admin/usage',
      icon: BarChart3,
      description: 'Platform-wide usage metrics and billing',
      familyId: 'platform',
      order: 3,
    },
    {
      id: 'admin-support',
      label: 'Support Dashboard',
      href: '/admin/support',
      icon: Headphones,
      description: 'Customer support and ticket management',
      familyId: 'platform',
      order: 4,
    },
    {
      id: 'company-reports',
      label: 'Company Reports',
      href: '/company-reports',
      icon: FileBarChart,
      description: 'Cross-workspace analytics and reports',
      familyId: 'platform',
      order: 5,
    },
    {
      id: 'platform-sales',
      label: 'Sales Pipeline',
      href: '/platform/sales',
      icon: TrendingUp,
      description: 'Platform sales and revenue tracking',
      familyId: 'platform',
      order: 6,
    },
    {
      id: 'admin-custom-forms',
      label: 'Custom Forms',
      href: '/admin/custom-forms',
      icon: FileCheck2,
      description: 'Dynamic form builder for workspaces',
      familyId: 'platform',
      order: 7,
    },
  ],
};

/**
 * Curated workspace routes for platform staff (root_admin)
 * Key operational routes needed for QA/support/monitoring
 */
const curatedWorkspaceRoutesForPlatformStaff: string[] = [
  'schedule-os',         // ScheduleOS™ - verify schedule automation
  'payroll-os',          // PayrollOS™ - verify payroll processing
  'bill-os-invoices',    // BillOS™ Invoices - verify invoice generation
  'time-os',             // TimeOS™ - verify time tracking
  'employees',           // Employee management
  'clients',             // Client management
  'analytics-os',        // AnalyticsOS™ - insights and reporting
  'integration-os',      // IntegrationOS™ - integration monitoring
];

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
  commos: { label: 'CommOS™', order: 1 },
  operationsos: { label: 'OperationsOS™', order: 2 },
  billos: { label: 'BillOS™', order: 3 },
  intelligenceos: { label: 'IntelligenceOS™', order: 4 },
  auditos: { label: 'AuditOS™', order: 5 },
  marketingos: { label: 'MarketingOS™', order: 6 },
  platform: { label: 'Platform', order: 7 },
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
      // For platform staff, highlight curated routes with QA badge
      if (isPlatformStaff && curatedWorkspaceRoutesForPlatformStaff.includes(route.id)) {
        allRoutes.push({
          ...route,
          badge: route.badge || 'QA', // Add QA badge for monitoring routes
        });
      } else {
        // All other routes pass through unchanged
        allRoutes.push(route);
      }
    });
  });

  // Group routes by family
  const familyMap: Record<FamilyId, { accessible: OSModuleRoute[]; locked: OSModuleRoute[] }> = {
    commos: { accessible: [], locked: [] },
    operationsos: { accessible: [], locked: [] },
    billos: { accessible: [], locked: [] },
    intelligenceos: { accessible: [], locked: [] },
    auditos: { accessible: [], locked: [] },
    marketingos: { accessible: [], locked: [] },
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
