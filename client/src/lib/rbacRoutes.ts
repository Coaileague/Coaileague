/**
 * RBAC Route Map — Wave 11 Auth Lock-In
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for "where does each role land after login?"
 *
 * Priority: platformRole > workspaceRole > default
 * All routes must exist in App.tsx. Audited against route table 2026-05-04.
 */

export interface RoleUser {
  platformRole?: string | null;
  workspaceRole?: string | null;
  currentWorkspaceId?: string | null;
  role?: string | null;
}

/**
 * Returns the canonical post-login landing route for a user based on their
 * platform role and workspace role. Used by login page, dev bypass, and
 * any future SSO callbacks.
 */
export function getRoleHomeRoute(user: RoleUser | null | undefined): string {
  if (!user) return '/login';

  const p = user.platformRole || '';
  const w = user.workspaceRole || '';

  // ── Platform-level roles (root / sysop / support) ─────────────────────────
  if (p === 'root_admin' || p === 'sysop' || p === 'deputy_admin') {
    return '/root-admin-dashboard';
  }
  if (p === 'support_manager' || p === 'support_agent') {
    return '/admin/support-console';
  }
  if (p === 'compliance_officer') {
    return '/security-compliance/auditor-portal';
  }

  // ── Workspace-level roles ─────────────────────────────────────────────────
  if (w === 'org_owner' || w === 'co_owner') {
    return '/dashboard';
  }
  if (w === 'department_manager' || w === 'supervisor') {
    return '/manager-dashboard';
  }
  if (w === 'auditor') {
    return '/co-auditor/dashboard';
  }
  if (w === 'staff' || w === 'contractor') {
    // Mobile command — guard/officer landing page
    return '/worker';
  }

  // ── No workspace yet → onboarding ─────────────────────────────────────────
  if (!user.currentWorkspaceId) {
    return '/onboarding/start';
  }

  // Default: full dashboard for any authenticated user with a workspace
  return '/dashboard';
}

/**
 * Human-readable role label for welcome messages.
 */
export function getRoleLabel(user: RoleUser | null | undefined): string {
  if (!user) return 'User';
  const p = user.platformRole || '';
  const w = user.workspaceRole || '';
  if (p === 'root_admin' || p === 'sysop') return 'Root Administrator';
  if (p === 'support_manager') return 'Support Manager';
  if (p === 'support_agent') return 'Support Agent';
  if (p === 'compliance_officer') return 'Compliance Officer';
  if (w === 'org_owner') return 'Organization Owner';
  if (w === 'co_owner') return 'Co-Owner';
  if (w === 'department_manager') return 'Department Manager';
  if (w === 'supervisor') return 'Field Supervisor';
  if (w === 'auditor') return 'Auditor';
  if (w === 'staff') return 'Security Officer';
  if (w === 'contractor') return 'Contractor';
  return 'Team Member';
}
