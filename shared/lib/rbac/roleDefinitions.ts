// ============================================================================
// CANONICAL ROLE DEFINITIONS — Single Source of Truth
// ============================================================================
// All role types, hierarchy values, platform-access constants, and guard role
// arrays live here. Both server and client code import from this file or
// from re-export shims that point at it.
//
// TRINITY.md §8: "Single sources of truth: roleDefinitions.ts — Only place
// roles are defined. If role logic exists anywhere else — inline checks,
// hardcoded strings, duplicate arrays — that is tech debt. Consolidate it."
//
// History:
//   F-2:  org_admin added to LEADER_ROLES (was incorrectly excluded)
//   F-3:  canAssignRole now uses WORKSPACE_ROLE_HIERARCHY (no stale 4-role map)
//   F-10: this file created as the canonical source (server/lib/rbac/)
//   J-1:  moved to shared/lib/rbac/ so client and shared/types.ts also see it
//         (resolves duplicate WorkspaceRole previously declared in shared/types.ts)
// ============================================================================

// ── Role Types ───────────────────────────────────────────────────────────────

export type WorkspaceRole =
  | 'org_owner'
  | 'co_owner'
  | 'org_admin'
  | 'org_manager'
  | 'manager'
  | 'department_manager'
  | 'supervisor'
  | 'staff'
  | 'employee'
  | 'auditor'
  | 'contractor';

export type PlatformRole =
  | 'root_admin'
  | 'deputy_admin'
  | 'sysop'
  | 'support_manager'
  | 'support_agent'
  | 'compliance_officer'
  | 'Bot'
  | 'none';

// ── Workspace Role Hierarchy ──────────────────────────────────────────────────
// Higher number = higher authority.
// org_owner(7) > co_owner(6) > org_admin(5) > org_manager/manager/dept_manager(4)
//   > supervisor(3) > employee/staff(2) > contractor/auditor(1)

export const WORKSPACE_ROLE_HIERARCHY: Record<string, number> = {
  'contractor':         1,
  'auditor':            1,
  'employee':           2,
  'staff':              2,
  'supervisor':         3,
  'manager':            4,
  'department_manager': 4,
  'dept_manager':       4,
  'org_manager':        4,
  'org_admin':          5,  // Office Administrator — above org_manager, below co_owner
  'co_owner':           6,  // Deputy chief / co-owner
  'org_owner':          7,  // Primary owner
};

// ── Platform Role Hierarchy ───────────────────────────────────────────────────

export const PLATFORM_ROLE_HIERARCHY: Record<string, number> = {
  'none':               0,
  'Bot':                1,
  'compliance_officer': 2,
  'support_agent':      3,
  'support_manager':    4,
  'sysop':              5,
  'deputy_admin':       6,
  'root_admin':         7,
};

// ── Org Management Action Minimum Platform-Role Levels ───────────────────────
// Destructive (suspend / deactivate / maintenance): sysop+ (5)
// Protective  (freeze / lock):                      support_manager+ (4)
// Restorative (unsuspend / unfreeze / unlock / activate): support_agent+ (3)

export const ORG_ACTION_MIN_LEVELS: Record<string, number> = {
  'suspend':     5,
  'deactivate':  5,
  'maintenance': 5,
  'freeze':      4,
  'lock':        4,
  'unsuspend':   3,
  'unfreeze':    3,
  'unlock':      3,
  'activate':    3,
};

// ── Platform-Wide Access Roles ────────────────────────────────────────────────
// These platform roles bypass workspace-level role requirements.
// Note: Bot is included — Trinity autonomous pipelines need workspace-agnostic
// access. The Bot token is validated via timingSafeEqual against TRINITY_BOT_TOKEN
// (env secret) — it cannot be spoofed from user-level requests.

export const PLATFORM_WIDE_ROLES: PlatformRole[] = [
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
  'compliance_officer',
  'Bot',
];

// ── Guard Role Lists ──────────────────────────────────────────────────────────
// Use these named arrays in requireWorkspaceRole() calls.
// Never hardcode role arrays inline in route files.

/** Tier 0: Ownership only (org_owner, co_owner) */
export const OWNER_ROLES: WorkspaceRole[] = ['org_owner', 'co_owner'];

/** Tier 0.5: Admin+ (owners + org_admin / office administrator) */
export const ADMIN_ROLES: WorkspaceRole[] = ['org_owner', 'co_owner', 'org_admin'];

/**
 * Tier 1: Manager+ (all management tiers including supervisor).
 * supervisor is included: district managers carry supervisor role and need full
 * management-level feature access.
 */
export const MANAGER_ROLES: WorkspaceRole[] = [
  'org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'department_manager', 'supervisor',
];

/**
 * Tier 1 (alias): Supervisor+ — intentionally identical to MANAGER_ROLES.
 * Both requireManager and requireSupervisor resolve to this list because
 * "supervisor" is the lowest privileged management tier that still requires
 * full management-level feature access across all guarded routes.
 *
 * If you need to restrict a route to supervisors ONLY (excluding managers and
 * above), use requireWorkspaceRole(['supervisor']) directly — do not use
 * requireSupervisor for that purpose.
 */
export const SUPERVISOR_ROLES: WorkspaceRole[] = MANAGER_ROLES;

/**
 * Leaders Hub access: org_admin included (level 5 — above org_manager).
 * Phase 9 F-2 fix: org_admin was previously excluded from this list, meaning
 * Office Administrators (higher authority than managers) were denied Leader Hub
 * access. Corrected.
 */
export const LEADER_ROLES: WorkspaceRole[] = [
  'org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'department_manager', 'supervisor',
];

/** Tier 3: All active workspace members (excludes auditor and contractor) */
export const EMPLOYEE_ROLES: WorkspaceRole[] = [
  'org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'department_manager', 'supervisor', 'staff', 'employee',
];

/** Auditor access: read-only compliance/audit access for auditor role + management */
export const AUDITOR_ROLES: WorkspaceRole[] = [
  'org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'auditor',
];

/** Contractor access: all active workspace members including contractors */
export const CONTRACTOR_ROLES: WorkspaceRole[] = [
  'org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor', 'staff', 'employee', 'contractor',
];
