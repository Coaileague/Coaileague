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
  Mail,
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
  CheckCircle,
  Activity,
  Brain,
  UserCog,
  Server,
  ArrowRightLeft,
  type LucideIcon,
} from "lucide-react";
import { isRouteVisibleInMVP } from "@/config/mvpFeatures";

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

export type Capability =
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
  | 'support_dashboard'
  | 'manage_integrations'
  | 'data_migration'
  | 'onboarding_orchestration'
  | 'view_onboarding_status';

export type FamilyId = 'executive' | 'operations' | 'people' | 'intelligence' | 'platform';

export type RouteGroupId = 'core' | 'ai_automation' | 'administration' | 'support_qa' | 'settings';

export const ROUTE_GROUPS: Record<RouteGroupId, { label: string; order: number }> = {
  core: { label: 'Core Operations', order: 0 },
  ai_automation: { label: 'AI & Automation', order: 1 },
  administration: { label: 'Administration', order: 2 },
  support_qa: { label: 'Support & QA', order: 3 },
  settings: { label: 'Settings', order: 4 },
};

export interface ModuleRoute {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  capabilities?: Capability[];
  minimumTier?: SubscriptionTier;
  badge?: string;
  familyId?: FamilyId;
  isPrimary?: boolean;
  order?: number;
  excludeForCapabilities?: Capability[]; // Hide route if user has any of these capabilities
  groupId?: RouteGroupId; // For organizing Platform routes into categories
}

export interface SidebarModule {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  routes: ModuleRoute[];
  capabilities: Capability[];
  minimumTier?: SubscriptionTier;
  familyId?: FamilyId;
}

export interface SidebarFamily {
  id: FamilyId;
  label: string;
  order: number;
  routes: ModuleRoute[];
  locked: ModuleRoute[];
}

/**
 * Role Capability Map
 * Defines which capabilities each role has access to
 */
export const roleCapabilities: Record<WorkspaceRole, Capability[]> = {
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
    'manage_integrations', 'data_migration', 'onboarding_orchestration', 'view_onboarding_status',
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
    'manage_integrations', 'data_migration', 'view_onboarding_status',
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
  capability: Capability
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
  route: ModuleRoute
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
 * CoAIleague OS Modules Registry
 * Consolidated into 4 high-level suites for better organization:
 * 1. Executive Control - Finance, Settings, Platform Admin
 * 2. Operations Hub - Scheduling, Time, Training
 * 3. People & Engagement - Workforce, Communication, Talent
 * 4. Intelligence & Compliance - Analytics, Reports, Audit
 */
export const sidebarModules: SidebarModule[] = [
  {
    id: 'workspace-dashboard',
    name: 'Dashboard',
    description: 'Your workspace overview',
    icon: LayoutDashboard,
    color: 'hsl(var(--primary))',
    capabilities: [], // Available to all workspace users
    familyId: 'platform',
    routes: [
      {
        id: 'dashboard-home',
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Workspace overview and quick actions',
        familyId: 'platform',
        isPrimary: true,
        order: 0,
        // Hide from platform staff who have Control Center instead
        excludeForCapabilities: ['support_dashboard'],
      },
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Field Operations Management',
    icon: CalendarDays,
    color: 'hsl(var(--chart-1))',
    capabilities: ['view_schedules', 'manage_schedules', 'view_timesheets', 'approve_timesheets'],
    familyId: 'operations',
    routes: [
      {
        id: 'schedule',
        label: 'AI Scheduling',
        href: '/schedule',
        icon: CalendarDays,
        description: 'Intelligent shift scheduling',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'time-tracking',
        label: 'Time Platform',
        href: '/time-tracking',
        icon: Clock,
        description: 'GPS-verified time tracking',
        capabilities: ['view_timesheets'],
        familyId: 'operations',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'workflow-approvals',
        label: 'Workflow Approvals',
        href: '/workflow-approvals',
        icon: CheckCircle,
        description: '99% AI, 1% Human Governance - Approve AI workflows',
        capabilities: ['manage_schedules', 'manage_invoices', 'process_payroll'],
        badge: 'Manager',
        familyId: 'operations',
        isPrimary: false,
        order: 3,
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
        order: 4,
      },
    ],
  },
  {
    id: 'billing-platform',
    name: 'Billing Platform',
    description: 'Administrative Billing & Financial Management',
    icon: Wallet,
    color: 'hsl(var(--chart-2))',
    capabilities: ['view_invoices', 'manage_invoices', 'view_payroll', 'process_payroll'],
    familyId: 'executive',
    routes: [
      {
        id: 'ai-payroll',
        label: 'AI Payroll',
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
        id: 'billing-invoices',
        label: 'Billing Platform',
        href: '/invoices',
        icon: FileCheck2,
        description: 'Automated invoice generation',
        capabilities: ['view_invoices'],
        familyId: 'executive',
        isPrimary: true,
        order: 3,
      },
      {
        id: 'billing-integrations',
        label: 'Integrations',
        href: '/integrations',
        icon: Zap,
        description: 'QuickBooks & Gusto integrations',
        capabilities: ['manage_invoices', 'process_payroll'],
        familyId: 'executive',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'quickbooks-migration',
        label: 'QuickBooks Migration',
        href: '/quickbooks-import',
        icon: ArrowRightLeft,
        description: '7-step data migration wizard',
        capabilities: ['data_migration'],
        familyId: 'executive',
        isPrimary: true,
        order: 5,
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
        id: 'training',
        label: 'AI Training',
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
    id: 'intelligence',
    name: 'Intelligence',
    description: 'AI-Powered Automation & Analytics',
    icon: FileBarChart,
    color: 'hsl(var(--chart-4))',
    capabilities: ['view_reports', 'advanced_analytics'],
    familyId: 'intelligence',
    routes: [
      {
        id: 'deal-sales',
        label: 'Sales',
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
        id: 'talent',
        label: 'Talent Management',
        href: '/leaders-hub',
        icon: Award,
        description: 'Leadership development and recognition',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 3,
      },
      {
        id: 'engagement',
        label: 'Engagement',
        href: '/engagement/dashboard',
        icon: TrendingUp,
        description: 'Pulse surveys and employee engagement',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'analytics',
        label: 'Analytics',
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
        id: 'reports',
        label: 'Reports',
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
        id: 'insights',
        label: 'AI Analytics Reports',
        href: '/analytics/reports',
        icon: FileCheck2,
        description: 'Management reports with role-based access',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'intelligence',
        isPrimary: false,
        order: 3,
      },
      {
        id: 'trinity-chat',
        label: 'Trinity Chat',
        href: '/trinity',
        icon: Brain,
        description: 'AI-powered conversational assistant with business insights',
        capabilities: ['manage_workspace'],
        familyId: 'intelligence',
        isPrimary: true,
        order: 0,
        badge: 'AI',
      },
    ],
  },
  {
    id: 'communications',
    name: 'Chatrooms',
    description: 'Unified Communications Platform',
    icon: MessagesSquare,
    color: 'hsl(var(--chart-5))',
    capabilities: ['view_messages'],
    familyId: 'people',
    routes: [
      {
        id: 'org-chatrooms',
        label: 'Chatrooms',
        href: '/chatrooms',
        icon: MessagesSquare,
        description: 'Discover and join team conversations',
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
      {
        id: 'inbox',
        label: 'Inbox',
        href: '/inbox',
        icon: Mail,
        description: 'Internal email system',
        capabilities: ['view_messages'],
        familyId: 'people',
        isPrimary: false,
        order: 8,
      },
    ],
  },
  {
    id: 'audit-os',
    name: 'AI Compliance Auditing',
    description: 'AI-Powered Compliance & Audit Trail Management',
    icon: Shield,
    color: 'hsl(var(--destructive))',
    capabilities: ['view_audit_logs'],
    familyId: 'intelligence',
    routes: [
      {
        id: 'audit-logs',
        label: 'AI Compliance',
        href: '/audit-logs',
        icon: Shield,
        description: 'AI-powered compliance and activity tracking',
        capabilities: ['view_audit_logs'],
        minimumTier: 'professional',
        familyId: 'intelligence',
        isPrimary: false,
        order: 5,
      },
    ],
  },
  {
    id: 'usage-dashboard',
    name: 'Usage & Billing',
    description: 'AI Usage & Cost Transparency',
    icon: TrendingUp,
    color: 'hsl(var(--primary))',
    capabilities: ['manage_workspace'],
    familyId: 'platform',
    routes: [
      {
        id: 'usage-billing',
        label: 'Usage & Costs',
        href: '/usage',
        icon: TrendingUp,
        description: 'Track AI usage and partner API costs',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        isPrimary: false,
        order: 1,
      },
      {
        id: 'owner-analytics',
        label: 'Usage Analytics',
        href: '/owner-analytics',
        icon: BarChart3,
        description: 'Executive usage insights for business owners',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        isPrimary: false,
        order: 2,
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
 * Platform Support Module (for CoAIleague staff - root_admin, deputy_admin, sysop, support)
 * Consolidated admin control center - ONE unified dashboard
 */
export const platformSupportModule: SidebarModule = {
  id: 'support-control-center',
  name: 'Platform Operations',
  description: 'Unified Root Administrator Control Center',
  icon: Shield,
  color: 'hsl(var(--destructive))',
  capabilities: ['support_dashboard'],
  routes: [
    // Core Operations Group
    {
      id: 'root-admin-dashboard',
      label: 'Control Center',
      href: '/dashboard',
      icon: Shield,
      description: 'Unified Control Center & Dashboard',
      familyId: 'platform',
      groupId: 'core',
      badge: 'Root',
      isPrimary: true,
      order: 0,
    },
    {
      id: 'system-health',
      label: 'System Health',
      href: '/system-health',
      icon: Activity,
      description: 'Monitor platform services and performance',
      familyId: 'platform',
      groupId: 'core',
      badge: 'Admin',
      isPrimary: false,
      order: 1,
    },
    {
      id: 'infrastructure-monitoring',
      label: 'Infrastructure',
      href: '/infrastructure',
      icon: Server,
      description: 'Circuit breakers, SLA monitoring, and service telemetry',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'core',
      badge: 'SRE',
      isPrimary: false,
      order: 2,
    },
    // AI & Automation Group
    {
      id: 'support-ai-console',
      label: 'Trinity AI Console',
      href: '/support/ai-console',
      icon: Zap,
      description: 'Trinity AI control interface for platform operations',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'ai_automation',
      badge: 'Root',
      isPrimary: false,
      order: 2,
    },
    {
      id: 'trinity-command-center',
      label: 'Trinity Command Center',
      href: '/trinity/command-center',
      icon: Brain,
      description: 'Full Trinity AI orchestration with quick actions and real-time output',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'ai_automation',
      badge: 'Root',
      isPrimary: false,
      order: 3,
    },
    // Administration Group
    {
      id: 'admin-command-center',
      label: 'Admin Command Center',
      href: '/admin-command-center',
      icon: Settings,
      description: 'Platform administration controls',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'administration',
      badge: 'Admin',
      isPrimary: false,
      order: 4,
    },
    {
      id: 'end-user-controls',
      label: 'End-User Controls',
      href: '/admin/end-user-controls',
      icon: Users,
      description: 'Manage organization access, Trinity, and user permissions',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'administration',
      badge: 'Admin',
      isPrimary: false,
      order: 5,
    },
    {
      id: 'org-management',
      label: 'Org Management',
      href: '/org-management',
      icon: Building2,
      description: 'Manage organizations and their members',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'administration',
      badge: 'Admin',
      isPrimary: false,
      order: 6,
    },
    {
      id: 'platform-users',
      label: 'Platform Users',
      href: '/platform/users',
      icon: UserCog,
      description: 'Manage all platform users and roles',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'administration',
      badge: 'Root',
      isPrimary: false,
      order: 7,
    },
    // Support & QA Group
    {
      id: 'support-console',
      label: 'Support Console',
      href: '/support/console',
      icon: Headphones,
      description: 'Customer support command center',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'support_qa',
      badge: 'Support',
      isPrimary: false,
      order: 8,
    },
    {
      id: 'support-bugs',
      label: 'Bug Dashboard',
      href: '/support/bugs',
      icon: AlertCircle,
      description: 'Track and manage platform bugs',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'support_qa',
      badge: 'QA',
      isPrimary: false,
      order: 9,
    },
  ],
};

/**
 * Curated workspace routes for platform staff (root_admin)
 * Key operational routes needed for QA/support/monitoring
 */
const curatedWorkspaceRoutesForPlatformStaff: string[] = [
  'schedule',            // AI Scheduling - verify schedule automation
  'payroll',             // AI Payroll - verify payroll processing
  'billing-invoices',    // Billing Platform Invoices - verify invoice generation
  'time-tracking',       // Time Platform - verify time tracking
  'employees',           // Employee management
  'clients',             // Client management
  'analytics',           // Analytics - insights and reporting
  'billing-integrations', // Integrations - QuickBooks/Gusto monitoring
  'quickbooks-migration', // QuickBooks Migration - 7-step data import wizard
];

/**
 * Get accessible modules and routes for a given role and tier
 */
export function getAccessibleModules(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): SidebarModule[] {
  const modules = isPlatformStaff 
    ? [platformSupportModule, ...sidebarModules]
    : sidebarModules;

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
): ModuleRoute[] {
  const locked: ModuleRoute[] = [];

  sidebarModules.forEach(module => {
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
  const allRoutes: ModuleRoute[] = [];
  
  // Add platform support module routes for staff ONLY
  if (isPlatformStaff) {
    platformSupportModule.routes.forEach(route => {
      allRoutes.push({
        ...route,
        familyId: 'platform',
        order: 0, // Show at top of platform family
      });
    });
  }

  // Add regular module routes (with exclusion filtering and MVP filtering)
  sidebarModules.forEach(module => {
    module.routes.forEach(route => {
      // MVP Filter: Hide enterprise routes for non-platform staff
      // ENTERPRISE FEATURE - These routes are disabled for MVP, reactivate for enterprise tier
      if (!isPlatformStaff && !isRouteVisibleInMVP(route.id)) {
        return; // Skip enterprise routes for MVP users
      }

      // Check exclusion filter FIRST - before adding to allRoutes
      if (route.excludeForCapabilities && route.excludeForCapabilities.length > 0) {
        const shouldExclude = route.excludeForCapabilities.some(cap => {
          // Platform staff get effective support_dashboard capability
          if (cap === 'support_dashboard' && isPlatformStaff) {
            return true;
          }
          return hasCapability(role, cap);
        });
        if (shouldExclude) {
          return; // Skip this route - user has an excluded capability
        }
      }
      
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
  const familyMap: Record<FamilyId, { accessible: ModuleRoute[]; locked: ModuleRoute[] }> = {
    platform: { accessible: [], locked: [] },
    executive: { accessible: [], locked: [] },
    operations: { accessible: [], locked: [] },
    people: { accessible: [], locked: [] },
    intelligence: { accessible: [], locked: [] },
  };

  // Categorize each route as accessible or locked
  // Note: Exclusion filtering already happened when building allRoutes
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

/**
 * CONDENSED MOBILE MENU
 * Returns only mobile-friendly routes for limited mobile capabilities
 * Forces users to desktop for major operations (Trinity™ automations, bulk data, analytics)
 */
export function selectCondensedMobileFamilies(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): SidebarFamily[] {
  // Mobile-friendly route IDs - Essential features only
  const mobileFriendlyRouteIds = [
    'dashboard-home',          // Dashboard overview
    'time-os',                 // Time tracking (clock in/out)
    'private-messages',        // Private messaging
    'support-chat',            // Support (if applicable)
  ];

  // Get full navigation families
  const fullFamilies = selectSidebarFamilies(role, tier, isPlatformStaff);

  // Filter to only mobile-friendly routes
  const condensedFamilies = fullFamilies
    .map(family => ({
      ...family,
      routes: family.routes.filter(route => mobileFriendlyRouteIds.includes(route.id)),
      locked: [], // Don't show locked routes on mobile
    }))
    .filter(family => family.routes.length > 0);

  return condensedFamilies;
}

/**
 * Get desktop-only routes (hidden from mobile condensed menu)
 * Used to display "Use Desktop" prompts to users
 */
export function getDesktopOnlyRoutes(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): ModuleRoute[] {
  const mobileFriendlyIds = [
    'dashboard-home',
    'time-os',
    'private-messages',
    'support-chat',
  ];

  const fullFamilies = selectSidebarFamilies(role, tier, isPlatformStaff);
  const desktopOnlyRoutes: ModuleRoute[] = [];

  fullFamilies.forEach(family => {
    family.routes.forEach(route => {
      if (!mobileFriendlyIds.includes(route.id)) {
        desktopOnlyRoutes.push(route);
      }
    });
  });

  return desktopOnlyRoutes;
}
