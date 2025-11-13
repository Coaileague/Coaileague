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
  // Platform roles (for platform staff)
  | 'root_admin'
  | 'sysop'
  | 'support_agent'
  // Workspace roles (for workspace members)
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

export type FamilyId = 'executive' | 'operations' | 'people' | 'intelligence' | 'platform';

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
  excludeForCapabilities?: OSCapability[]; // Hide route if user has any of these capabilities
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
  // Platform roles (root_admin, sysop, support_agent)
  root_admin: [
    'view_schedules', 'manage_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_invoices', 'manage_invoices',
    'view_payroll', 'process_payroll',
    'view_reports', 'advanced_analytics',
    'manage_employees', 'manage_clients',
    'view_audit_logs', 'manage_workspace',
    'view_messages',
    'support_dashboard', // Platform staff capability
  ],
  sysop: [
    'view_schedules', 'manage_schedules',
    'view_timesheets', 'approve_timesheets',
    'view_invoices', 'manage_invoices',
    'view_payroll', 'process_payroll',
    'view_reports', 'advanced_analytics',
    'manage_employees', 'manage_clients',
    'view_audit_logs', 'manage_workspace',
    'view_messages',
    'support_dashboard', // Platform staff capability
  ],
  support_agent: [
    'view_schedules',
    'view_timesheets',
    'view_invoices',
    'view_reports',
    'view_messages',
    'support_dashboard', // Platform staff capability
  ],
  
  // Workspace roles
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

  // Check if route should be excluded for user's capabilities
  if (route.excludeForCapabilities && route.excludeForCapabilities.length > 0) {
    const shouldExclude = route.excludeForCapabilities.some(cap => hasCapability(role, cap));
    if (shouldExclude) {
      return false; // User has an excluded capability, hide this route
    }
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
 * Consolidated into 4 high-level suites for better organization:
 * 1. Executive Control - Finance, Settings, Platform Admin
 * 2. Operations Hub - Scheduling, Time, Training
 * 3. People & Engagement - Workforce, Communication, Talent
 * 4. Intelligence & Compliance - Analytics, Reports, Audit
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
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Your personalized overview',
        familyId: 'platform',
        isPrimary: true,
        order: 1,
        // Hide from platform staff who have Control Center
        excludeForCapabilities: ['support_dashboard'],
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
        isPrimary: true,
        order: 1,
      },
      {
        id: 'time-os',
        label: 'TimeOS™',
        href: '/time-tracking',
        icon: Clock,
        description: 'GPS-verified time tracking',
        capabilities: ['view_timesheets'],
        familyId: 'operations',
        isPrimary: true,
        order: 2,
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
        isPrimary: false,
        order: 3,
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
    familyId: 'executive',
    routes: [
      {
        id: 'payroll-os',
        label: 'PayrollOS™',
        href: '/payroll',
        icon: Wallet,
        description: 'FLSA-compliant payroll processing',
        capabilities: ['view_payroll'],
        minimumTier: 'professional',
        familyId: 'executive',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'bill-os-invoices',
        label: 'BillOS™',
        href: '/invoices',
        icon: FileCheck2,
        description: 'Automated invoice generation',
        capabilities: ['view_invoices'],
        familyId: 'executive',
        isPrimary: true,
        order: 3,
      },
      {
        id: 'bill-os-integrations',
        label: 'Integrations',
        href: '/integrations',
        icon: Zap,
        description: 'QuickBooks & Gusto integrations',
        capabilities: ['manage_invoices', 'process_payroll'],
        familyId: 'executive',
        isPrimary: false,
        order: 4,
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
    familyId: 'people',
    routes: [
      {
        id: 'training-os',
        label: 'TrainingOS™',
        href: '/training',
        icon: GraduationCap,
        description: 'Employee onboarding and compliance training',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'employees',
        label: 'Employees',
        href: '/employees',
        icon: UsersRound,
        description: 'Manage workforce',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'clients',
        label: 'Clients',
        href: '/clients',
        icon: BookUser,
        description: 'Manage client relationships',
        capabilities: ['manage_clients'],
        familyId: 'people',
        isPrimary: true,
        order: 2,
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
    familyId: 'intelligence',
    routes: [
      {
        id: 'deal-os',
        label: 'DealOS™ Sales',
        href: '/sales',
        icon: BadgeDollarSign,
        description: 'AI-powered RFP hunting and contract generation',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise',
        familyId: 'intelligence',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'talent-os',
        label: 'TalentOS™',
        href: '/leaders-hub',
        icon: Award,
        description: 'Leadership development and recognition',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 3,
      },
      {
        id: 'engagement-os',
        label: 'EngagementOS™',
        href: '/engagement/dashboard',
        icon: TrendingUp,
        description: 'Pulse surveys and employee engagement',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 4,
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
        familyId: 'intelligence',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'report-os',
        label: 'ReportOS™',
        href: '/reports',
        icon: FileBarChart,
        description: 'Comprehensive business intelligence',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'intelligence',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'insight-os',
        label: 'InsightOS™ Reports',
        href: '/analytics/reports',
        icon: FileCheck2,
        description: 'Management reports with role-based access',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'intelligence',
        isPrimary: false,
        order: 3,
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
    familyId: 'people',
    routes: [
      {
        id: 'comm-os-dashboard',
        label: 'CommOS™',
        href: '/comm-os',
        icon: MessagesSquare,
        description: 'Communication hub dashboard',
        capabilities: ['view_messages'],
        familyId: 'people',
        isPrimary: true,
        order: 5,
      },
      {
        id: 'private-messages',
        label: 'Messages',
        href: '/messages',
        icon: LockKeyhole,
        description: 'Direct messaging',
        capabilities: ['view_messages'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'support-helpdesk',
        label: 'HelpDesk',
        href: '/chat',
        icon: Headphones,
        description: 'AI-powered support chat',
        familyId: 'people',
        isPrimary: false,
        order: 7,
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
    familyId: 'intelligence',
    routes: [
      {
        id: 'audit-logs',
        label: 'AuditOS™',
        href: '/audit-logs',
        icon: Shield,
        description: 'Compliance and activity tracking',
        capabilities: ['view_audit_logs'],
        minimumTier: 'professional',
        familyId: 'intelligence',
        isPrimary: false,
        order: 5,
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
        id: 'settings-workspace',
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        description: 'Configure workspace preferences',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        isPrimary: true,
        order: 2,
      },
    ],
  },
];

/**
 * Platform Support Module (for AutoForce staff - root_admin, deputy_admin, sysop, support)
 * Consolidated admin control center - ONE unified dashboard
 */
export const platformSupportModule: OSModule = {
  id: 'support-control-center',
  name: 'Platform Operations',
  description: 'Unified Root Administrator Control Center',
  icon: Shield,
  color: 'hsl(var(--destructive))',
  capabilities: ['support_dashboard'],
  routes: [
    {
      id: 'root-admin-dashboard',
      label: 'Control Center',
      href: '/dashboard', // Universal dashboard for all roles
      icon: Shield,
      description: 'Unified Control Center & Dashboard',
      familyId: 'platform',
      badge: 'Root',
      isPrimary: true,
      order: 0,
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
  'bill-os-integrations', // Integrations - QuickBooks/Gusto monitoring
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
 * Family display configuration (4 High-Level Suites)
 */
const familyConfig: Record<FamilyId, { label: string; order: number }> = {
  platform: { label: 'Platform', order: 0 },
  executive: { label: 'Executive Control', order: 1 },
  operations: { label: 'Operations Hub', order: 2 },
  people: { label: 'People & Engagement', order: 3 },
  intelligence: { label: 'Intelligence & Compliance', order: 4 },
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

  // Group routes by family (4 High-Level Suites)
  const familyMap: Record<FamilyId, { accessible: OSModuleRoute[]; locked: OSModuleRoute[] }> = {
    platform: { accessible: [], locked: [] },
    executive: { accessible: [], locked: [] },
    operations: { accessible: [], locked: [] },
    people: { accessible: [], locked: [] },
    intelligence: { accessible: [], locked: [] },
  };

  // Categorize each route as accessible or locked
  allRoutes.forEach(route => {
    if (!route.familyId) return;

    // Check if route should be excluded for user's capabilities
    if (route.excludeForCapabilities && route.excludeForCapabilities.length > 0) {
      const shouldExclude = route.excludeForCapabilities.some(cap => hasCapability(role, cap));
      if (shouldExclude) {
        return; // Skip this route entirely for this user
      }
    }

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
