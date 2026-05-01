import {
  LayoutDashboard,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Users,
  Building2,
  GitBranch,
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
  HeartPulse,
  PieChart,
  FileBarChart,
  Zap,
  CheckCircle,
  Trophy,
  Activity,
  Brain,
  UserCog,
  Server,
  ArrowRightLeft,
  Bell,
  FileSignature,
  ShoppingBag,
  ClipboardList,
  Inbox,
  Scale,
  Globe,
  Receipt,
  CreditCard,
  Star,
  Paintbrush,
  Car,
  Crosshair,
  Key,
  UserCheck,
  ScanSearch,
  ClipboardCheck,
  Code2,
  Megaphone,
  Radio,
  MapPin,
  ShieldAlert,
  FolderOpen,
  Eye,
  FileBox,
  Send,
  DoorOpen,
  PhoneCall,
  PhoneIncoming,
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
  | 'co_owner' 
  | 'department_manager' 
  | 'supervisor' 
  | 'employee'
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

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
  mobileOnly?: boolean; // Only show this route on mobile devices
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
  co_owner: [
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
  employee: [
    'view_schedules',
    'view_timesheets',
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
 * positionCapabilities: additional capabilities derived from employee's position in the registry
 */
export function canAccessRoute(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  route: ModuleRoute,
  positionCapabilities?: Capability[]
): boolean {
  if (!hasTierAccess(tier, route.minimumTier)) {
    return false;
  }

  if (route.excludeForCapabilities && route.excludeForCapabilities.length > 0) {
    const shouldExclude = route.excludeForCapabilities.some(cap => hasCapability(role, cap));
    if (shouldExclude) {
      return false;
    }
  }

  if (!route.capabilities || route.capabilities.length === 0) {
    return true;
  }

  const hasRoleCap = route.capabilities.some(cap => hasCapability(role, cap));
  if (hasRoleCap) return true;

  if (positionCapabilities && positionCapabilities.length > 0) {
    return route.capabilities.some(cap => positionCapabilities.includes(cap));
  }

  return false;
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
        label: 'My Schedule',
        href: '/schedule',
        icon: CalendarDays,
        description: 'View your assigned shifts',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'time-tracking',
        label: 'Time Tracking',
        href: '/time-tracking',
        icon: Clock,
        description: 'Clock in/out and track hours',
        capabilities: ['view_timesheets'],
        familyId: 'operations',
        isPrimary: true,
        order: 3,
      },
      {
        id: 'workflow-approvals',
        label: 'Approvals',
        href: '/workflow-approvals',
        icon: CheckCircle,
        description: 'Review and approve pending workflows',
        capabilities: ['manage_schedules', 'manage_invoices', 'process_payroll'],
        badge: 'Manager',
        familyId: 'operations',
        isPrimary: false,
        order: 3,
      },
      {
        id: 'timesheets-pending',
        label: 'Timesheet Review',
        href: '/timesheets/pending',
        icon: Clock,
        description: 'Review and approve submitted hours',
        capabilities: ['approve_timesheets'],
        badge: 'Supervisor',
        familyId: 'operations',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'shift-marketplace',
        label: 'Shift Marketplace',
        href: '/shift-marketplace',
        icon: ShoppingBag,
        description: 'Browse and claim open shifts',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        isPrimary: false,
        order: 5,
      },
      {
        id: 'disputes',
        label: 'Disputes',
        href: '/disputes',
        icon: Scale,
        description: 'Time entry and schedule disputes',
        capabilities: ['view_timesheets'],
        familyId: 'operations',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'labor-law-config',
        label: 'Labor Laws',
        href: '/labor-law-config',
        icon: Shield,
        description: '50-state labor law rules and compliance',
        capabilities: ['manage_workspace'],
        familyId: 'operations',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'gate-duty',
        label: 'Gate Duty',
        href: '/gate-duty',
        icon: DoorOpen,
        description: 'Gate access control and vehicle/personnel entry logs',
        capabilities: ['manage_compliance'],
        familyId: 'operations',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'rms-hub',
        label: 'Records (RMS)',
        href: '/records',
        icon: FolderOpen,
        description: 'Incident reports, DARs, visitor log, key control, cases',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        isPrimary: true,
        order: 8,
      },
      {
        id: 'cad-console',
        label: 'CAD Dispatch',
        href: '/cad',
        icon: Radio,
        description: 'Real-time dispatch console and unit management',
        capabilities: ['manage_schedules'],
        familyId: 'operations',
        isPrimary: true,
        order: 9,
      },
      {
        id: 'visitor-management',
        label: 'Visitor Management',
        href: '/visitor-management',
        icon: UserCheck,
        description: 'Check-in/out visitors, pre-registrations, active visitor board, overstay alerts',
        capabilities: ['view_schedules'],
        familyId: 'operations',
        isPrimary: false,
        order: 9.5,
      },
      {
        id: 'site-survey',
        label: 'Site Surveys',
        href: '/site-survey',
        icon: ClipboardCheck,
        description: 'Facility assessment and site survey workflow',
        capabilities: ['manage_workspace'],
        familyId: 'operations',
        isPrimary: false,
        order: 8
      },
      {
        id: 'safety-hub',
        label: 'Safety & SLA',
        href: '/safety-check',
        icon: ShieldAlert,
        description: 'Panic alerts, geofencing, SLA contracts and breaches',
        capabilities: ['manage_schedules'],
        familyId: 'operations',
        isPrimary: true,
        order: 10,
      },
      {
        id: 'rfp-manager',
        label: 'RFP Manager',
        href: '/rfp',
        icon: FileBox,
        description: 'AI-powered proposal generation and RFP tracking',
        capabilities: ['manage_clients'],
        familyId: 'operations',
        isPrimary: false,
        order: 12,
      },
      {
        id: 'tx-service-agreement',
        label: 'TX Service Agreement',
        href: '/tx-service-agreement',
        icon: Scale,
        description: 'Generate Texas Security Services Agreements for clients — fillable, signed, auditable',
        capabilities: ['manage_clients'],
        familyId: 'operations',
        isPrimary: false,
        order: 13,
      },
      {
        id: 'ethics-hotline',
        label: 'Ethics Hotline',
        href: '/ethics',
        icon: Eye,
        description: 'Anonymous reports and ethics review dashboard',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        isPrimary: false,
        order: 13,
      },
    ],
  },
  {
    id: 'org-network',
    name: 'Organization Network',
    description: 'Multi-branch management, consolidated billing, batch operations',
    icon: GitBranch,
    color: 'hsl(var(--chart-1))',
    capabilities: ['manage_workspace'],
    familyId: 'executive',
    routes: [
      {
        id: 'multi-company',
        label: 'Multi-Company',
        href: '/multi-company',
        icon: Building2,
        description: 'Manage subsidiaries and franchises',
        capabilities: ['manage_workspace'],
        familyId: 'executive',
        isPrimary: false,
        order: 99,
      },
    ],
  },
  {
    id: 'billing-platform',
    name: 'Billing & Payroll',
    description: 'Billing, payroll, and financial management',
    icon: Wallet,
    color: 'hsl(var(--chart-2))',
    capabilities: ['view_invoices', 'manage_invoices', 'view_payroll', 'process_payroll'],
    familyId: 'executive',
    routes: [
      {
        id: 'ai-payroll',
        label: 'Payroll',
        href: '/payroll',
        icon: Wallet,
        description: 'Payroll processing and compliance',
        capabilities: ['view_payroll'],
        minimumTier: 'professional',
        familyId: 'executive',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'billing-invoices',
        label: 'Invoices',
        href: '/invoices',
        icon: FileCheck2,
        description: 'Invoice generation and tracking',
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
        description: 'Connect accounting and payroll tools',
        capabilities: ['manage_invoices', 'process_payroll'],
        familyId: 'executive',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'billing',
        label: 'Billing',
        href: '/billing',
        icon: CreditCard,
        description: 'Subscription plans and payment management',
        capabilities: ['manage_workspace'],
        familyId: 'executive',
        isPrimary: true,
        order: 5,
      },
      {
        id: 'expenses',
        label: 'Expenses',
        href: '/expenses',
        icon: Receipt,
        description: 'Submit and track expense reimbursements',
        capabilities: ['view_timesheets'],
        familyId: 'executive',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'mileage',
        label: 'Mileage',
        href: '/mileage',
        icon: Car,
        description: 'Log and track mileage reimbursements',
        capabilities: ['view_timesheets'],
        familyId: 'executive',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'quickbooks-migration',
        label: 'QuickBooks Setup',
        href: '/quickbooks-import',
        icon: ArrowRightLeft,
        description: 'Import and sync with QuickBooks',
        capabilities: ['data_migration'],
        familyId: 'executive',
        isPrimary: true,
        order: 7,
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
        label: 'Training',
        href: '/training',
        icon: GraduationCap,
        description: 'Employee onboarding and compliance training',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'training-certification',
        label: 'Training & Certification',
        href: '/training-certification',
        icon: CheckCircle,
        description: 'TCOLE hours, continuing education, and officer certification tracking',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        isPrimary: false,
        order: 4.5,
      },
      {
        id: 'compliance-evidence',
        label: 'Compliance Evidence',
        href: '/compliance-evidence',
        icon: FileCheck2,
        description: 'Officer license vault and evidence verification',
        capabilities: ['manage_employees'],
        familyId: 'platform',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'insurance',
        label: 'Insurance',
        href: '/insurance',
        icon: Shield,
        description: 'Insurance policies, bonding and coverage management',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        isPrimary: false,
        order: 6,
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
      {
        id: 'service-requests',
        label: 'Service Requests',
        href: '/service-requests',
        icon: ClipboardList,
        description: 'Client service requests and inquiries',
        capabilities: ['manage_clients'],
        familyId: 'people',
        isPrimary: true,
        order: 3,
      },
      {
        id: 'surveys',
        label: 'Client Surveys',
        href: '/surveys',
        icon: ClipboardList,
        description: 'Client satisfaction surveys and NPS tracking',
        capabilities: ['manage_clients'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'security-compliance',
        label: 'Security Compliance',
        href: '/security-compliance',
        icon: Shield,
        description: 'Licenses, certifications, and required documents',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        badge: 'Vault',
        order: 3,
      },
      {
        id: 'document-library',
        label: 'Document Library',
        href: '/document-library',
        icon: FileSignature,
        description: 'Send documents for signature and manage templates',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        order: 4,
      },
      {
        id: 'document-vault',
        label: 'Document Vault',
        href: '/document-vault',
        icon: FolderOpen,
        description: 'Browse and search signed documents',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'employee-packets',
        label: 'Onboarding Packets',
        href: '/employee-packets',
        icon: FileText,
        description: 'Digital onboarding packets for new hires — fillable, signable, auditable. Templates for reference only.',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        badge: 'TX',
        order: 5,
      },
      {
        id: 'hr-document-requests',
        label: 'Document Requests',
        href: '/hr-document-requests',
        icon: Send,
        description: 'Mass-send or select employees for I-9, W-4, W-9, drug testing, guard card, and onboarding requests',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        badge: 'HR',
        order: 5,
      },
      {
        id: 'sps-document-safe',
        label: 'Document Safe',
        href: '/sps-document-safe',
        icon: LockKeyhole,
        description: 'Sealed documents — employee packets and client contracts',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        order: 6,
      },
      {
        id: 'sps-client-pipeline',
        label: 'Client Pipeline',
        href: '/sps-client-pipeline',
        icon: FileSignature,
        description: 'Proposals, negotiations, and contracts for security service clients',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: true,
        order: 7,
      },
      {
        id: 'recognition',
        label: 'Recognition',
        href: '/recognition',
        icon: Trophy,
        description: 'Officer awards, recognition wall and culture building',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'wellness',
        label: 'Lone Worker Safety',
        href: '/wellness',
        icon: HeartPulse,
        description: 'Lone worker safety and wellness check system',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'recruitment',
        label: 'Interview Pipeline',
        href: '/recruitment',
        icon: Inbox,
        description: 'Trinity-powered three-channel candidate recruitment pipeline',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 8,
        badge: 'AI',
      },
    ],
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    description: 'Automation and analytics',
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
        description: 'Proposals, bids, and contract management',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise',
        familyId: 'intelligence',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'talent',
        label: 'Leadership',
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
        id: 'behavior-scoring',
        label: 'Behavior Scoring',
        href: '/behavior-scoring',
        icon: Activity,
        description: 'Employee reliability, engagement and performance metrics',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 5,
        badge: 'AI',
      },
      {
        id: 'performance',
        label: 'Performance',
        href: '/performance',
        icon: Star,
        description: 'Officer performance reviews, disciplinary records and risk roster',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 5.5,
      },
      {
        id: 'hris-management',
        label: 'HRIS Integrations',
        href: '/hris-management',
        icon: ArrowRightLeft,
        description: 'Connect and sync with external HR systems',
        capabilities: ['manage_employees'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'analytics',
        label: 'Analytics',
        href: '/analytics',
        icon: PieChart,
        description: 'Trends, forecasts, and business insights',
        capabilities: ['advanced_analytics'],
        minimumTier: 'enterprise',
        badge: 'Enterprise',
        familyId: 'intelligence',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'bi-analytics',
        label: 'Business Intelligence',
        href: '/bi-analytics',
        icon: BarChart3,
        description: 'Financial, workforce, and operational BI dashboard',
        capabilities: ['advanced_analytics'],
        minimumTier: 'enterprise',
        badge: 'Enterprise',
        familyId: 'intelligence',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        description: 'Customizable reports and summaries',
        capabilities: ['view_reports'],
        minimumTier: 'starter',
        familyId: 'intelligence',
        isPrimary: true,
        order: 2,
      },
      {
        id: 'trinity-chat',
        label: 'Trinity Chat',
        href: '/trinity',
        icon: Brain,
        description: 'Conversational assistant with business insights',
        capabilities: ['manage_workspace'],
        familyId: 'intelligence',
        isPrimary: true,
        order: 0,
        badge: 'AI',
      },
      {
        id: 'resolution-inbox',
        label: 'Resolution Inbox',
        href: '/resolution-inbox',
        icon: Inbox,
        description: 'AI-resolved issues and action items',
        capabilities: ['manage_workspace'],
        familyId: 'intelligence',
        isPrimary: false,
        order: 6,
        badge: 'AI',
      },
      {
        id: 'outreach',
        label: 'Outreach',
        href: '/outreach',
        icon: Globe,
        description: 'AI-powered prospect discovery and automated outreach',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise',
        familyId: 'intelligence',
        isPrimary: false,
        order: 7,
        badge: 'AI',
      },
      {
        id: 'trinity-memory',
        label: 'Trinity Memory',
        href: '/trinity-memory',
        icon: Brain,
        description: 'AI memory optimization and knowledge management',
        capabilities: ['support_dashboard'],
        familyId: 'intelligence',
        isPrimary: false,
        order: 8,
        badge: 'AI',
      },
      {
        id: 'inbound-opportunities',
        label: 'Inbound Opportunities',
        href: '/inbound-opportunities',
        icon: Inbox,
        description: 'AI-powered staffing opportunity processing',
        capabilities: ['manage_workspace'],
        familyId: 'intelligence',
        isPrimary: false,
        order: 9,
        badge: 'AI',
      },
    ],
  },
  {
    id: 'communications',
    name: 'Chatrooms',
    description: 'Team messaging and conversations',
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
        id: 'broadcasts',
        label: 'Broadcasts',
        href: '/broadcasts',
        icon: Megaphone,
        description: 'Company announcements and alerts',
        capabilities: ['view_messages'],
        familyId: 'people',
        isPrimary: false,
        order: 5.5,
      },
      {
        id: 'briefing-channel',
        label: 'Ops Briefing',
        href: '/briefing-channel',
        icon: Radio,
        description: 'Org Operations Briefing Channel — Trinity intelligence for leadership',
        capabilities: ['manage_employees'],
        familyId: 'operations',
        isPrimary: false,
        order: 5.7,
      },
      {
        id: 'private-messages',
        label: 'Messages',
        href: '/private-messages',
        icon: LockKeyhole,
        description: 'Direct messaging',
        capabilities: ['view_messages'],
        familyId: 'people',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'get-support',
        label: 'HelpDesk',
        href: '/helpdesk',
        icon: Headphones,
        description: 'Chat with HelpAI for instant support',
        familyId: 'people',
        isPrimary: false,
        order: 7,
      },
      {
        id: 'bridge-channels',
        label: 'Bridge Channels',
        href: '/bridge-channels',
        icon: ArrowRightLeft,
        description: 'Manage SMS, WhatsApp, Email, and Messenger bridges',
        capabilities: ['manage_workspace'],
        familyId: 'people',
        isPrimary: false,
        order: 8,
        badge: 'Bridges',
      },
      {
        id: 'voice-calls',
        label: 'Voice Calls',
        href: '/voice-calls',
        icon: PhoneIncoming,
        description: 'Call history, recordings, and transcripts',
        capabilities: ['manage_workspace'],
        minimumTier: 'professional',
        familyId: 'people',
        isPrimary: false,
        order: 9,
        badge: 'Voice',
      },
      {
        id: 'voice-settings',
        label: 'Phone System',
        href: '/voice-settings',
        icon: PhoneCall,
        description: 'Configure phone numbers, IVR, and Trinity Voice',
        capabilities: ['manage_workspace'],
        minimumTier: 'professional',
        familyId: 'people',
        isPrimary: false,
        order: 9.5,
      },
    ],
  },
  {
    id: 'audit-os',
    name: 'Compliance',
    description: 'Compliance and audit trail management',
    icon: Shield,
    color: 'hsl(var(--destructive))',
    capabilities: ['view_audit_logs'],
    familyId: 'intelligence',
    routes: [
      {
        id: 'audit-logs',
        label: 'Audit Trail',
        href: '/audit-logs',
        icon: Shield,
        description: 'Activity log and compliance history',
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
    description: 'Usage and cost tracking',
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
        description: 'Track usage and costs',
        capabilities: ['manage_workspace'],
        familyId: 'platform',
        isPrimary: false,
        order: 1,
      },
    ],
  },
  {
    id: 'enterprise-features',
    name: 'Enterprise',
    description: 'Enterprise-grade features and integrations',
    icon: Building2,
    color: 'hsl(var(--chart-5))',
    capabilities: ['manage_workspace'],
    familyId: 'platform',
    routes: [
      {
        id: 'white-label-branding',
        label: 'White-Label Branding',
        href: '/enterprise/branding',
        icon: Paintbrush,
        description: 'Upload your logo and customize branding',
        capabilities: ['manage_workspace'],
        minimumTier: 'free' as SubscriptionTier,
        familyId: 'platform',
        isPrimary: true,
        order: 1,
      },
      {
        id: 'fleet-management',
        label: 'Fleet Management',
        href: '/enterprise/fleet',
        icon: Car,
        description: 'Vehicle tracking and fleet operations',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 2,
      },
      {
        id: 'armory-management',
        label: 'Armory Management',
        href: '/enterprise/armory',
        icon: Crosshair,
        description: 'Weapon tracking, checkout, and compliance',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 3,
      },
      {
        id: 'sso-configuration',
        label: 'Single Sign-On',
        href: '/enterprise/sso',
        icon: Key,
        description: 'SAML, OAuth2, and OpenID Connect configuration',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 4,
      },
      {
        id: 'account-manager',
        label: 'Account Manager',
        href: '/enterprise/account-manager',
        icon: UserCheck,
        description: 'Dedicated account manager contact and support',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 5,
      },
      {
        id: 'background-checks',
        label: 'Background Checks',
        href: '/enterprise/background-checks',
        icon: ScanSearch,
        description: 'Employee screening and verification',
        capabilities: ['manage_workspace'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 6,
      },
      {
        id: 'api-access',
        label: 'API Access',
        href: '/enterprise/api-access',
        icon: Code2,
        description: 'Public API keys and developer access',
        capabilities: ['support_dashboard'],
        minimumTier: 'enterprise' as SubscriptionTier,
        badge: 'Enterprise',
        familyId: 'platform',
        isPrimary: false,
        order: 7,
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
    // Administration Group
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
      order: 5,
    },
    // Support & QA Group
    {
      id: 'support-console',
      label: 'Support Console',
      href: '/admin/support-console',
      icon: Headphones,
      description: 'Ticket management, workspace deep-dive, and Trinity action panel',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'support_qa',
      badge: 'Support',
      isPrimary: true,
      order: 7,
    },
    {
      id: 'admin-helpai-console',
      label: 'HelpAI Console',
      href: '/admin/helpai',
      icon: Brain,
      description: 'HelpAI session management, action log, and proactive alerts',
      capabilities: ['support_dashboard'],
      familyId: 'platform',
      groupId: 'support_qa',
      badge: 'HelpAI',
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
 * positionCapabilities: additional capabilities derived from the employee's canonical position
 */
export function getAccessibleModules(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false,
  positionCapabilities?: Capability[]
): SidebarModule[] {
  const modules = isPlatformStaff 
    ? [platformSupportModule, ...sidebarModules]
    : sidebarModules;

  return modules
    .map(module => ({
      ...module,
      routes: module.routes.filter(route => 
        canAccessRoute(role, tier, route, positionCapabilities)
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
  isPlatformStaff: boolean = false,
  positionCapabilities?: Capability[]
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

  allRoutes.forEach(route => {
    if (!route.familyId) return;

    const hasRoleAccess = !route.capabilities || 
      route.capabilities.some(cap => hasCapability(role, cap));
    const hasPositionAccess = !hasRoleAccess && positionCapabilities && positionCapabilities.length > 0 &&
      route.capabilities?.some(cap => positionCapabilities.includes(cap));
    const hasTier = hasTierAccess(tier, route.minimumTier);

    if (isPlatformStaff || ((hasRoleAccess || hasPositionAccess) && hasTier)) {
      familyMap[route.familyId].accessible.push(route);
    } else if ((hasRoleAccess || hasPositionAccess) && !hasTier && route.minimumTier) {
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
 * Mobile = workforce employees (clock in/out, schedule, chat, timesheets)
 * Desktop = full platform (analytics, billing, admin, automation)
 * 
 * Route IDs must match those defined in SIDEBAR_MODULES above
 */
export function selectCondensedMobileFamilies(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): SidebarFamily[] {
  // EMPLOYEE features - Core workforce tools only
  // IDs must match actual SIDEBAR_MODULES route IDs
  const employeeRouteIds = [
    'dashboard-home',          // Dashboard overview
    'time-tracking',           // Clock in/out, timesheets
    'schedule',                // View schedule
    'org-chatrooms',           // Team chat
    'broadcasts',              // Company broadcasts
    'private-messages',        // Private messaging
    'inbox',                   // Personal inbox
    'get-support',             // Help/support
  ];
  
  // MANAGER features - Everything above + team management
  const managerRouteIds = [
    ...employeeRouteIds,
    'workflow-approvals',      // Time/shift approvals
    'timesheets-pending',      // Pending time entries
    'employees',               // Team directory
    'training',                // Training tracking
  ];
  
  // SUPPORT STAFF features - IRC-style tools for helping users
  const supportRouteIds = [
    ...managerRouteIds,
    'support-ai-console',      // AI support console
    'support-bugs',            // Bug reports
    'system-health',           // System status
  ];
  
  // Determine which routes to show based on role
  const isManager = ['org_owner', 'co_owner', 'admin', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(role);
  const mobileFriendlyRouteIds = isPlatformStaff 
    ? supportRouteIds 
    : (isManager ? managerRouteIds : employeeRouteIds);

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
  // Must match the IDs used in selectCondensedMobileFamilies
  const isManager = ['org_owner', 'co_owner', 'admin', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(role);
  
  const baseMobileIds = [
    'dashboard-home', 'time-tracking', 'schedule',
    'org-chatrooms', 'broadcasts', 'private-messages', 'inbox', 'get-support',
  ];
  
  const managerMobileIds = [
    ...baseMobileIds,
    'workflow-approvals', 'timesheets-pending', 'employees', 'training',
  ];
  
  const supportMobileIds = [
    ...managerMobileIds,
    'support-ai-console', 'support-bugs', 'system-health',
  ];
  
  const mobileFriendlyIds = isPlatformStaff
    ? supportMobileIds
    : (isManager ? managerMobileIds : baseMobileIds);

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
