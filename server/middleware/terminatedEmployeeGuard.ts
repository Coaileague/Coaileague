/**
 * Terminated Employee Access Guard
 *
 * Enforces the 14-day grace period for terminated employees:
 *   - Within 14 days of termination: read-only access to own payroll, schedule,
 *     and document endpoints only. All writes are blocked (405).
 *   - Past 14 days: all access is blocked (403).
 *   - Active employees: unaffected (next() immediately).
 *
 * Wire AFTER requireAuth so req.user is populated.
 * Wire BEFORE domain routes.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { employees, workspaceMembers } from '@shared/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('terminatedEmployeeGuard');

// Paths that terminated employees in the grace window may GET
const GRACE_PERIOD_ALLOWED_PREFIXES = [
  '/api/auth/me',
  '/api/auth/logout',
  '/api/payroll',
  '/api/pay-stubs',
  '/api/employees',
  '/api/shifts',
  '/api/documents',
  '/api/employee-documents',
  '/api/notifications',
  '/api/time-entries',
  '/api/schedules',
];

// POST-only logout endpoint is always allowed
const ALWAYS_ALLOWED_EXACT = [
  '/api/auth/logout',
];

function isGraceAllowed(path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return GRACE_PERIOD_ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));
  }
  // Allow POST to logout
  if (ALWAYS_ALLOWED_EXACT.some(p => path === p)) return true;
  return false;
}

export const terminatedEmployeeGuard = async (
  req: Request & { user?: any; workspaceId?: string; terminatedGracePeriod?: boolean },
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).workspaceId || (req as any).user?.currentWorkspaceId;

    // Not authenticated or test mode: skip
    if (!userId || (req as any).isTestMode || (req as any).isTrinityBot) {
      return next();
    }

    // Public paths: skip
    const path = req.path;
    if (!path.startsWith('/api/')) {
      return next();
    }

    // Find employee record for this user in the current workspace
    // (employees.documentAccessExpiresAt tracks grace period end date)
    const [emp] = await (db as any)
      .select({
        id: employees.id,
        isActive: employees.isActive,
        documentAccessExpiresAt: sql<string | null>`"employees"."document_access_expires_at"`,
      })
      .from(employees)
      .where(
        and(
          eq(employees.userId, userId),
          workspaceId ? eq(employees.workspaceId, workspaceId) : sql`TRUE`,
        ),
      )
      .limit(1);

    // No employee record in this workspace — let the domain middleware handle it
    if (!emp) return next();

    // Active employee: no restriction
    if (emp.isActive !== false) return next();

    const now = new Date();
    const expiresAt = emp.documentAccessExpiresAt ? new Date(emp.documentAccessExpiresAt) : null;

    if (!expiresAt) {
      // Legacy record: terminated before grace-period feature shipped.
      // Block unless they still have an active workspace-member row.
      const [activeRole] = await db
        .select({ status: workspaceMembers.status })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.userId, emp.userId ?? userId),
          workspaceId ? eq(workspaceMembers.workspaceId, workspaceId) : sql`TRUE`,
        ))
        .limit(1);

      if (!activeRole || activeRole.status === 'inactive') {
        res.status(403).json({
          error: 'access_suspended',
          message: 'Your account access has been suspended. Please contact HR.',
          code: 'INACTIVE_NO_GRACE_PERIOD',
        });
        return;
      }
      return next();
    }

    if (now > expiresAt) {
      // Grace period has expired — full block
      res.status(403).json({
        error: 'document_access_expired',
        message:
          'Your document access period has expired. Please contact HR if you need records from your employment.',
        code: 'TERMINATED_ACCESS_EXPIRED',
      });
      return;
    }

    // Within grace period — read-only, restricted path access
    if (!isGraceAllowed(path, req.method)) {
      res.status(403).json({
        error: 'terminated_restricted',
        message:
          'Your account is in terminated status. You may view your payroll, schedule, and documents until ' +
          expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '.',
        code: 'TERMINATED_GRACE_PERIOD',
        accessExpiresAt: expiresAt.toISOString(),
      });
      return;
    }

    // Flag for downstream use (e.g. to filter to own records only)
    (req as any).terminatedGracePeriod = true;
    (req as any).terminatedEmployeeId = emp.id;
    (req as any).documentAccessExpiresAt = expiresAt.toISOString();
    return next();
  } catch (err: unknown) {
    // Fail open: do not block access if the DB check itself errors
    log.error('[terminatedEmployeeGuard] Check failed (fail-open):', (err instanceof Error ? err.message : String(err)));
    return next();
  }
};
