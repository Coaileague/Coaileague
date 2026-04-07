/**
 * Mobile & Responsive Configuration
 * Centralized settings for mobile experience, breakpoints, and accessibility
 * 
 * NO HARDCODED VALUES - Everything configurable here
 * @version 3.0.0 - PWA Enhanced
 */

export const MOBILE_CONFIG = {
  // Screen breakpoints (px)
  breakpoints: {
    mobile: 320,
    small: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
    ultrawide: 1536,
  },

  // Touch targets (minimum tap area - WCAG recommended 44x44px)
  touchTargets: {
    minHeight: 44,
    minWidth: 44,
    padding: 8,
  },

  // Font scaling for accessibility
  fontScaling: {
    minZoom: 0.8,  // Minimum allowed zoom level
    maxZoom: 2.0,  // Maximum allowed zoom level
    defaultZoom: 1.0,
    scalingFactor: 0.1, // Increment per zoom step
  },

  // Responsive container sizing
  containers: {
    // Mobile safe areas (accounting for notches, home indicators)
    safeAreaTop: "var(--safe-area-inset-top, 0px)",
    safeAreaBottom: "var(--safe-area-inset-bottom, 0px)",
    safeAreaLeft: "var(--safe-area-inset-left, 0px)",
    safeAreaRight: "var(--safe-area-inset-right, 0px)",

    // Padding by breakpoint
    paddingMobile: 12,
    paddingTablet: 16,
    paddingDesktop: 24,

    // Maximum content width
    maxWidth: {
      mobile: "100%",
      tablet: "728px",
      desktop: "1024px",
      wide: "1280px",
    },
  },

  // Header sizing
  header: {
    heightMobile: 44,  // 2.75rem — compact mobile page headers
    heightTablet: 56,  // 3.5rem
    heightDesktop: 80, // 5rem
  },

  // Bottom navigation (for mobile-first apps)
  bottomNav: {
    heightMobile: 48,  // Compact bottom nav
    heightTablet: 0,   // Hidden on tablet+
  },

  // Grid configuration
  grid: {
    columnsMobile: 1,
    columnsSmall: 2,
    columnsTablet: 2,
    columnsDesktop: 3,
    columnsWide: 4,
  },

  // Spacing scale
  spacing: {
    xs: 4,      // 0.25rem
    sm: 8,      // 0.5rem
    md: 12,     // 0.75rem
    lg: 16,     // 1rem
    xl: 20,     // 1.25rem
    xxl: 24,    // 1.5rem
    xxxl: 32,   // 2rem
  },

  // Typography scaling
  typography: {
    // Mobile-first sizing
    h1Mobile: 24,
    h2Mobile: 20,
    h3Mobile: 18,
    bodyMobile: 14,

    // Tablet sizing
    h1Tablet: 32,
    h2Tablet: 24,
    h3Tablet: 20,
    bodyTablet: 16,

    // Desktop sizing
    h1Desktop: 40,
    h2Desktop: 28,
    h3Desktop: 24,
    bodyDesktop: 16,
  },

  // Animation & transition settings
  animations: {
    transitionDuration: 300, // ms
    reduceMotion: true, // Respect prefers-reduced-motion
  },

  // Layout configuration - Universal Canvas Hub pattern
  // Uses h-full (inherits from parent) to avoid hardcoded heights
  layout: {
    // Container classes for different contexts
    containerBase: "flex flex-col h-full w-full overflow-hidden",
    // When used as a standalone page (top-level route)
    containerStandalone: "flex flex-col h-screen w-full overflow-hidden",
    // Scroll area classes
    scrollContainer: "flex-1 overflow-auto",
    // Header/footer flex settings
    headerFlex: "flex-shrink-0",
    footerFlex: "flex-shrink-0",
    contentFlex: "flex-1 overflow-hidden",
  },

  // Public pages (no logout button visible)
  publicPages: [
    "/",
    "/landing",
    "/pricing",
    "/contact",
    "/help",
    "/terms-of-service",
    "/privacy-policy",
    "/login",
    "/register",
    "/custom-login",
    "/custom-register",
  ],
} as const;

export type MobileConfig = typeof MOBILE_CONFIG;

/**
 * Mobile Feature Visibility Configuration
 * Defines which features are available on mobile for different workspace roles
 * 
 * Roles:
 * - employee: Basic field worker with limited access
 * - manager: Team lead with approval and team management capabilities
 * - admin: Full access (but admin features stay desktop-only)
 */

export type MobileRole = 'employee' | 'manager' | 'admin';

export interface MobileFeature {
  id: string;
  label: string;
  href: string;
  icon: string;
  description?: string;
  roles: MobileRole[];
  category: 'core' | 'time' | 'communication' | 'reports' | 'team' | 'hr';
}

// Core features available on mobile (employee + manager)
export const MOBILE_FEATURES: MobileFeature[] = [
  // Core Time Management (ALL mobile users)
  { id: 'clock', label: 'Clock In/Out', href: '/time-tracking', icon: 'Clock', roles: ['employee', 'manager', 'admin'], category: 'time', description: 'Punch in/out, breaks' },
  { id: 'schedule', label: 'My Schedule', href: '/schedule', icon: 'Calendar', roles: ['employee', 'manager', 'admin'], category: 'core', description: 'View shifts & availability' },
  { id: 'timesheet', label: 'Timesheets', href: '/time-tracking', icon: 'FileText', roles: ['employee', 'manager', 'admin'], category: 'time', description: 'Submit & review hours' },
  
  // Communication (ALL mobile users)
  { id: 'chatrooms', label: 'Team Chat', href: '/chatrooms', icon: 'MessageSquare', roles: ['employee', 'manager', 'admin'], category: 'communication' },
  
  // Field Reports (ALL mobile users)
  { id: 'daily-report', label: 'Daily Report', href: '/field-reports?type=daily', icon: 'FileText', roles: ['employee', 'manager', 'admin'], category: 'reports', description: 'Activity log' },
  { id: 'incident', label: 'Incidents', href: '/field-reports?type=incident', icon: 'AlertTriangle', roles: ['employee', 'manager', 'admin'], category: 'reports', description: 'Report issues' },
  
  // Manager-only features
  { id: 'team-schedule', label: 'Team Schedule', href: '/schedule/team', icon: 'Users', roles: ['manager', 'admin'], category: 'team', description: 'Manage shifts' },
  { id: 'approvals', label: 'Approvals', href: '/approvals', icon: 'CheckCircle', roles: ['manager', 'admin'], category: 'team', description: 'Time & shift approvals' },
  { id: 'team-directory', label: 'Team', href: '/employees', icon: 'Users', roles: ['manager', 'admin'], category: 'team', description: 'Employee directory' },
  { id: 'shift-swaps', label: 'Shift Swaps', href: '/schedule/swaps', icon: 'ArrowLeftRight', roles: ['manager', 'admin'], category: 'team', description: 'Approve/deny swaps' },
  
  // HR Quick Actions (Manager only)
  { id: 'hr-notes', label: 'HR Notes', href: '/hr/notes', icon: 'Clipboard', roles: ['manager', 'admin'], category: 'hr', description: 'Coaching & disciplinary' },
  { id: 'training', label: 'Training', href: '/training', icon: 'GraduationCap', roles: ['manager', 'admin'], category: 'hr', description: 'OJT tracking' },
  
  // Support (ALL mobile users)
  { id: 'help', label: 'HelpDesk', href: '/helpdesk', icon: 'HelpCircle', roles: ['employee', 'manager', 'admin'], category: 'core' },
  { id: 'profile', label: 'My Profile', href: '/profile', icon: 'User', roles: ['employee', 'manager', 'admin'], category: 'core' },
];

// Features explicitly HIDDEN on mobile (admin/desktop only)
// Mobile is for FIELD WORKERS — all back-office, financial, compliance, and admin features stay on desktop
export const DESKTOP_ONLY_FEATURES = [
  // Admin & Platform
  '/admin',
  '/platform-settings',
  '/platform-admin',
  '/root-admin-dashboard',
  '/end-user-controls',
  '/safety-check',
  '/support/ai-console',

  // Billing & Finance (desktop back-office)
  // NOTE: /invoices, /expenses kept OFF this list — managers need them on mobile for approvals
  '/billing',
  '/settings/billing',
  '/financial-intelligence',
  '/budgeting',
  '/accounting-integrations',
  '/client-profitability',
  '/quickbooks-import',

  // Payroll Admin (employees see /my-paychecks on mobile, not full payroll admin)
  '/payroll/deductions',
  '/payroll/garnishments',
  '/payroll/tax-forms',
  '/payroll/history',

  // Reports & Analytics (desktop data views)
  '/reports',
  '/analytics',
  '/audit-logs',
  '/ai/audit-log-viewer',
  '/turnover-analytics',
  '/trinity-insights',
  '/analytics/reports',

  // Compliance & Legal (desktop admin)
  '/compliance-matrix',
  '/compliance-reports',
  '/i9-compliance',
  '/security-compliance/regulator-access',
  '/labor-law-config',

  // Enterprise & Configuration
  '/enterprise',
  '/white-label-branding',
  '/sso-configuration',
  '/hris-management',
  '/role-management',
  '/automation',
  '/automation-control',
  '/integrations',
  '/contracts',

  // RFP & Resolution (complex desktop workflows)
  '/rfp',
  '/resolution-inbox',
];

// Bottom nav configuration
export const MOBILE_BOTTOM_NAV = {
  employee: [
    { id: 'dashboard', label: 'Home', href: '/dashboard', icon: 'Home' },
    { id: 'clock', label: 'Clock', href: '/time-tracking', icon: 'Clock' },
    { id: 'schedule', label: 'Schedule', href: '/schedule', icon: 'Calendar' },
    { id: 'chatrooms', label: 'Chat', href: '/chatrooms', icon: 'MessageSquare' },
  ],
  manager: [
    { id: 'dashboard', label: 'Home', href: '/dashboard', icon: 'Home' },
    { id: 'clock', label: 'Clock', href: '/time-tracking', icon: 'Clock' },
    { id: 'schedule', label: 'Schedule', href: '/schedule', icon: 'Calendar' },
    { id: 'approvals', label: 'Approve', href: '/approvals', icon: 'CheckCircle' },
  ],
};

// More menu items by role (mirrors mobile-more.tsx page)
export const MOBILE_MORE_MENU = {
  employee: [
    { id: 'chatrooms', label: 'Team Chat', href: '/chatrooms', icon: 'MessageSquare' },
    { id: 'email', label: 'Email / Inbox', href: '/email-intelligence', icon: 'Mail' },
    { id: 'broadcasts', label: 'Broadcasts', href: '/broadcasts', icon: 'Megaphone' },
    { id: 'timesheet', label: 'Timesheets', href: '/timesheets/pending', icon: 'FileText' },
    { id: 'daily-report', label: 'Daily Report', href: '/field-reports?type=daily', icon: 'ClipboardList' },
    { id: 'incident', label: 'Incidents', href: '/field-reports?type=incident', icon: 'AlertTriangle' },
    { id: 'my-paychecks', label: 'My Paychecks', href: '/my-paychecks', icon: 'Briefcase' },
    { id: 'my-score', label: 'My Score', href: '/behavior-scoring', icon: 'Activity' },
    { id: 'profile', label: 'Profile', href: '/profile', icon: 'User' },
    { id: 'help', label: 'HelpDesk', href: '/helpdesk', icon: 'HelpCircle' },
  ],
  manager: [
    { id: 'chatrooms', label: 'Team Chat', href: '/chatrooms', icon: 'MessageSquare' },
    { id: 'email', label: 'Email / Inbox', href: '/email-intelligence', icon: 'Mail' },
    { id: 'approvals', label: 'Approvals', href: '/workflow-approvals', icon: 'CheckCircle' },
    { id: 'payroll-approval', label: 'Payroll Approval', href: '/payroll', icon: 'Wallet' },
    { id: 'invoice-approval', label: 'Invoice Approval', href: '/invoices', icon: 'FileCheck2' },
    { id: 'employees', label: 'Employees', href: '/employees', icon: 'Users' },
    { id: 'training', label: 'Training', href: '/training', icon: 'GraduationCap' },
    { id: 'compliance', label: 'Compliance', href: '/security-compliance', icon: 'Shield' },
    { id: 'guard-tour', label: 'Guard Tour', href: '/guard-tour', icon: 'MapPin' },
    { id: 'profile', label: 'Profile', href: '/profile', icon: 'User' },
    { id: 'help', label: 'HelpDesk', href: '/helpdesk', icon: 'HelpCircle' },
  ],
};

/**
 * Get the mobile role based on workspace role
 */
export function getMobileRole(workspaceRole: string | null | undefined): MobileRole {
  if (!workspaceRole) return 'employee';
  
  const managerRoles = ['org_owner', 'co_owner', 'department_manager', 'supervisor'];
  const adminRoles = ['org_owner', 'co_owner'];
  
  if (adminRoles.includes(workspaceRole)) return 'admin';
  if (managerRoles.includes(workspaceRole)) return 'manager';
  return 'employee';
}

/**
 * Check if a route should be blocked on mobile
 * Blocks desktop-only features for mobile users
 */
export function isDesktopOnlyRoute(path: string): boolean {
  return DESKTOP_ONLY_FEATURES.some(route => path.startsWith(route));
}

/**
 * Get features available for a role
 */
export function getFeaturesForRole(role: MobileRole): MobileFeature[] {
  return MOBILE_FEATURES.filter(feature => feature.roles.includes(role));
}

/**
 * Check if user has manager-level access on mobile
 */
export function hasManagerAccess(workspaceRole: string | null | undefined): boolean {
  const role = getMobileRole(workspaceRole);
  return role === 'manager' || role === 'admin';
}
