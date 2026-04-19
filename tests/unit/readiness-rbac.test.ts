/**
 * Readiness Section 21 — RBAC ladder invariants
 *
 * Pure-function tests against shared/lib/rbac/roleDefinitions. These
 * guard CLAUDE.md §E — the SSOT for all role hierarchy. If someone
 * reorders the ladder or renames a role, these fail loudly.
 */

import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_ROLE_HIERARCHY,
  PLATFORM_ROLE_HIERARCHY,
  OWNER_ROLES,
  ADMIN_ROLES,
  MANAGER_ROLES,
  SUPERVISOR_ROLES,
  EMPLOYEE_ROLES,
  AUDITOR_ROLES,
  CONTRACTOR_ROLES,
} from '@shared/lib/rbac/roleDefinitions';

describe('Workspace role hierarchy', () => {
  it('org_owner outranks co_owner outranks org_admin', () => {
    expect(WORKSPACE_ROLE_HIERARCHY['org_owner']).toBeGreaterThan(WORKSPACE_ROLE_HIERARCHY['co_owner']);
    expect(WORKSPACE_ROLE_HIERARCHY['co_owner']).toBeGreaterThan(WORKSPACE_ROLE_HIERARCHY['org_admin']);
  });

  it('manager outranks supervisor outranks employee/staff (which tie)', () => {
    expect(WORKSPACE_ROLE_HIERARCHY['manager']).toBeGreaterThan(WORKSPACE_ROLE_HIERARCHY['supervisor']);
    expect(WORKSPACE_ROLE_HIERARCHY['supervisor']).toBeGreaterThan(WORKSPACE_ROLE_HIERARCHY['employee']);
    // staff and employee intentionally tie at rank 2 in the canonical file.
    expect(WORKSPACE_ROLE_HIERARCHY['staff']).toBe(WORKSPACE_ROLE_HIERARCHY['employee']);
  });

  it('auditor + contractor have their own non-managerial ranks', () => {
    expect(WORKSPACE_ROLE_HIERARCHY['auditor']).toBeDefined();
    expect(WORKSPACE_ROLE_HIERARCHY['contractor']).toBeDefined();
    // Auditor is NOT a manager — must not reach supervisor rank.
    expect(WORKSPACE_ROLE_HIERARCHY['auditor']).toBeLessThan(WORKSPACE_ROLE_HIERARCHY['supervisor']);
  });
});

describe('Role guard arrays', () => {
  it('OWNER_ROLES contains org_owner and co_owner', () => {
    expect(OWNER_ROLES).toContain('org_owner');
    expect(OWNER_ROLES).toContain('co_owner');
  });

  it('MANAGER_ROLES includes manager + dept_manager + org_admin', () => {
    expect(MANAGER_ROLES).toContain('manager');
    expect(MANAGER_ROLES).toContain('department_manager');
    expect(MANAGER_ROLES).toContain('org_admin');
  });

  it('EMPLOYEE_ROLES includes employee + everyone above (inclusive ladder)', () => {
    // Semantic: "roles that can act as an employee" — owners can,
    // managers can, staff can. The guard is employee-OR-above.
    expect(EMPLOYEE_ROLES).toContain('employee');
    expect(EMPLOYEE_ROLES).toContain('staff');
    // Never includes contractor/auditor — those are parallel tracks.
    expect(EMPLOYEE_ROLES).not.toContain('contractor');
    expect(EMPLOYEE_ROLES).not.toContain('auditor');
  });

  it('AUDITOR_ROLES includes auditor + leadership who can authorize an auditor', () => {
    // This array answers "which roles can take auditor actions" — so it
    // includes owners + managers + the auditor role itself.
    expect(AUDITOR_ROLES).toContain('auditor');
    expect(AUDITOR_ROLES).toContain('org_owner');
  });

  it('CONTRACTOR_ROLES includes contractor + leadership who can manage contractors', () => {
    expect(CONTRACTOR_ROLES).toContain('contractor');
    expect(CONTRACTOR_ROLES).toContain('org_owner');
  });

  it('SUPERVISOR_ROLES + ADMIN_ROLES are non-empty and subsets of WORKSPACE_ROLE_HIERARCHY', () => {
    expect(SUPERVISOR_ROLES.length).toBeGreaterThan(0);
    expect(ADMIN_ROLES.length).toBeGreaterThan(0);
    for (const role of SUPERVISOR_ROLES) {
      expect(WORKSPACE_ROLE_HIERARCHY[role]).toBeDefined();
    }
    for (const role of ADMIN_ROLES) {
      expect(WORKSPACE_ROLE_HIERARCHY[role]).toBeDefined();
    }
  });
});

describe('Platform role hierarchy', () => {
  it('has a defined rank for every support role', () => {
    expect(PLATFORM_ROLE_HIERARCHY['support_agent']).toBeDefined();
    expect(PLATFORM_ROLE_HIERARCHY['support_manager']).toBeDefined();
  });

  it('support_manager outranks support_agent', () => {
    expect(PLATFORM_ROLE_HIERARCHY['support_manager']).toBeGreaterThan(
      PLATFORM_ROLE_HIERARCHY['support_agent'],
    );
  });
});
