/**
 * isDeliverableEmployee
 * ─────────────────────
 * Single-source-of-truth guard for "can we act on / notify this employee?"
 *
 * An employee is NOT deliverable if:
 *  - isActive is false  (platform-level deactivation)
 *  - status is one of the BLOCKED lifecycle values
 *
 * Use this everywhere an employee record must be active before the platform
 * sends them a notification, executes a Trinity action, or includes them in
 * a supervisor chain.
 */

const BLOCKED_STATUSES = new Set(['terminated', 'inactive', 'deactivated', 'suspended']);

export function isDeliverableEmployee(emp: { isActive?: boolean | null; status?: string | null }): boolean {
  const status = typeof emp.status === 'string' ? emp.status.trim().toLowerCase() : '';
  return emp.isActive === true && !BLOCKED_STATUSES.has(status);
}
