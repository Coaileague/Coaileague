/**
 * Feature Registry — Phase 9B
 * ============================
 * Single source of truth for all permission-matrix-controllable features.
 * Each feature has a key, display label, category, and the set of roles that
 * have access BY DEFAULT (before any workspace_permissions overrides).
 *
 * org_owner and co_owner are ALWAYS granted access regardless of this registry
 * or any workspace_permissions record — enforced in the middleware layer.
 */

export type FeatureCategory = 'page' | 'action' | 'report' | 'data';

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  category: FeatureCategory;
  defaultRoles: string[];
}

// Roles eligible to appear in the Permission Matrix editor (excludes owners — they're immutable)
export const MATRIX_ROLES = [
  'org_admin',
  'org_manager',
  'department_manager',
  'manager',
  'supervisor',
  'staff',
  'employee',
  'auditor',
  'contractor',
] as const;

export type MatrixRole = (typeof MATRIX_ROLES)[number];

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // ── Pages ─────────────────────────────────────────────────────────────────
  {
    key: 'page:payroll',
    label: 'Payroll Page',
    description: 'View and process payroll runs',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },
  {
    key: 'page:financials',
    label: 'Financials Page',
    description: 'Access billing, invoices, and financial dashboards',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'page:clients',
    label: 'Clients & Sites',
    description: 'Manage client accounts and site assignments',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager', 'supervisor'],
  },
  {
    key: 'page:scheduling',
    label: 'Scheduling Page',
    description: 'View and manage shift schedules',
    category: 'page',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'supervisor',
    ],
  },
  {
    key: 'page:compliance',
    label: 'Compliance Page',
    description: 'Access compliance documents, certifications, and audits',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager', 'supervisor'],
  },
  {
    key: 'page:analytics',
    label: 'Analytics & Reports',
    description: 'Access analytics dashboards and performance reports',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },
  {
    key: 'page:training',
    label: 'Training Center',
    description: 'View training modules, certifications, and completion records',
    category: 'page',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'staff', 'staff',
      'staff', 'supervisor', 'contractor',
    ],
  },
  {
    key: 'page:time-tracking',
    label: 'Time & Attendance',
    description: 'View timesheets, clock-in records, and attendance history',
    category: 'page',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'staff', 'staff',
      'staff', 'supervisor', 'contractor',
    ],
  },
  {
    key: 'page:workforce',
    label: 'Workforce Hub',
    description: 'Access employee directory, profiles, and HR records',
    category: 'page',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'supervisor',
    ],
  },
  {
    key: 'page:end-users',
    label: 'End Users',
    description: 'Manage end-user contacts linked to client sites',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },
  {
    key: 'page:armory',
    label: 'Armory',
    description: 'Manage weapons, equipment, and issuance records',
    category: 'page',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager'],
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  {
    key: 'action:run_payroll',
    label: 'Run Payroll',
    description: 'Initiate and approve payroll processing runs',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'action:export_payroll',
    label: 'Export Payroll',
    description: 'Export payroll data to CSV / accounting integrations',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'action:approve_timesheets',
    label: 'Approve Timesheets',
    description: 'Review and approve employee timesheet submissions',
    category: 'action',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'supervisor',
    ],
  },
  {
    key: 'action:manage_schedules',
    label: 'Manage Schedules',
    description: 'Create, edit, and publish shift schedules',
    category: 'action',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'supervisor',
    ],
  },
  {
    key: 'action:invite_employees',
    label: 'Invite Employees',
    description: 'Send workspace invitations to new employees',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },
  {
    key: 'action:terminate_employees',
    label: 'Terminate Employees',
    description: 'Process employee terminations',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'action:view_salaries',
    label: 'View Salaries',
    description: 'View individual employee pay rates and compensation details',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager'],
  },
  {
    key: 'action:export_reports',
    label: 'Export Reports',
    description: 'Download analytics and operational reports',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager'],
  },
  {
    key: 'action:manage_clients',
    label: 'Manage Clients',
    description: 'Add, edit, or archive client accounts',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'action:issue_equipment',
    label: 'Issue Equipment',
    description: 'Record equipment and armory issuances to officers',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  {
    key: 'report:incident',
    label: 'Incident Reports',
    description: 'File and view incident/use-of-force reports',
    category: 'report',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'staff', 'staff',
      'staff', 'supervisor', 'contractor',
    ],
  },
  {
    key: 'report:daily_activity',
    label: 'Daily Activity Reports',
    description: 'Submit and review daily activity / post logs',
    category: 'report',
    defaultRoles: [
      'org_admin', 'org_manager', 'department_manager', 'manager',
      'supervisor', 'supervisor', 'staff', 'staff',
      'staff', 'supervisor', 'contractor',
    ],
  },
  {
    key: 'report:financial_summary',
    label: 'Financial Summary Report',
    description: 'Access aggregated financial summaries and P&L',
    category: 'report',
    defaultRoles: ['org_admin', 'org_manager'],
  },
  {
    key: 'trinity_voice',
    label: 'Trinity Voice Phone System',
    description: 'Twilio-powered AI IVR phone system: call routing, voice clock-in, extension management (Professional plan required)',
    category: 'action',
    defaultRoles: ['org_admin', 'org_manager', 'department_manager', 'manager'],
  },
];

/** Retrieve a feature definition by key (or undefined if unknown) */
export function getFeature(key: string): FeatureDefinition | undefined {
  return FEATURE_REGISTRY.find((f) => f.key === key);
}

/** Check if a role has default access to a feature (without DB overrides) */
export function hasDefaultAccess(featureKey: string, role: string): boolean {
  const feature = getFeature(featureKey);
  if (!feature) return false;
  const normalizedRole = normalizeMatrixRole(role);
  return feature.defaultRoles.includes(normalizedRole);
}

function normalizeMatrixRole(role: string): string {
  const aliasMap: Record<string, string> = {
    shift_leader: 'supervisor',
    site_lead: 'supervisor',
    guard: 'staff',
    security_officer: 'staff',
    armed_officer: 'staff',
    owner: 'org_owner',
    admin: 'org_admin',
  };
  return aliasMap[role] || role;
}

/** Group features by category for display in the editor */
export function getFeaturesByCategory(): Record<FeatureCategory, FeatureDefinition[]> {
  const result: Record<FeatureCategory, FeatureDefinition[]> = {
    page: [],
    action: [],
    report: [],
    data: [],
  };
  for (const feature of FEATURE_REGISTRY) {
    result[feature.category].push(feature);
  }
  return result;
}
