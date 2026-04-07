/**
 * Trinity Thought Status Routes
 * ================================
 * T007 FIX — G15: Provides the TrinityThoughtBar with real proactive scanner data
 * instead of purely simulated thread state.
 *
 * GET /api/trinity/thought-status
 * Returns a lightweight domain health snapshot per workspace for the ThoughtBar threads.
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../rbac';
import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityThoughtStatus');
const router = Router();

interface ThreadStatus {
  name: string;
  active: boolean;
  critical: boolean;
  count?: number;
  label?: string;
}

interface ThoughtStatusResponse {
  threads: ThreadStatus[];
  lastScanned: string;
  workspaceId: string;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    // Run all domain checks in parallel — each one is a lightweight COUNT query
    const [
      complianceResult,
      schedulingResult,
      billingResult,
      hrResult,
      opsResult,
    ] = await Promise.allSettled([

      // COMPLIANCE: Open non-compliant records or expiring documents
      pool.query(`
        SELECT COUNT(*)::int as cnt FROM (
          SELECT 1 FROM compliance_records
          WHERE workspace_id = $1 AND status IN ('non_compliant', 'at_risk')
          UNION ALL
          SELECT 1 FROM org_documents
          WHERE workspace_id = $1
            AND requires_signature = true
            AND status NOT IN ('executed', 'void', 'archived')
            AND signatures_completed < total_signatures_required
            AND total_signatures_required > 0
        ) x
      `, [workspaceId]),

      // SCHEDULING: Unassigned open shifts or pending open shift requests
      pool.query(`
        SELECT COUNT(*)::int as cnt FROM shifts
        WHERE workspace_id = $1
          AND status = 'draft'
          AND (employee_id IS NULL OR employee_id = '')
          AND start_time > NOW()
      `, [workspaceId]),

      // BILLING: Overdue invoices (past due date and not paid)
      pool.query(`
        SELECT COUNT(*)::int as cnt FROM invoices
        WHERE workspace_id = $1
          AND status NOT IN ('paid', 'void', 'draft')
          AND due_date < NOW()
      `, [workspaceId]),

      // HR: Pending signature documents (HR/onboarding category)
      pool.query(`
        SELECT COUNT(*)::int as cnt
        FROM org_document_signatures ods
        JOIN org_documents od ON od.id = ods.document_id
        WHERE od.workspace_id = $1
          AND ods.signed_at IS NULL
          AND od.category IN ('hr', 'employee', 'onboarding', 'compliance')
      `, [workspaceId]),

      // OPS: Open helpdesk tickets or support cases
      pool.query(`
        SELECT COUNT(*)::int as cnt FROM (
          SELECT 1 FROM helpdesk_tickets
          WHERE workspace_id = $1 AND status NOT IN ('resolved', 'closed')
          UNION ALL
          SELECT 1 FROM voice_support_cases
          WHERE workspace_id = $1 AND status NOT IN ('resolved', 'closed')
            AND resolved_at IS NULL
        ) x
      `, [workspaceId]),

    ]);

    const getCount = (result: PromiseSettledResult<any>): number => {
      if (result.status === 'fulfilled') {
        return Number(result.value?.rows?.[0]?.cnt || 0);
      }
      return 0;
    };

    const complianceCount = getCount(complianceResult);
    const schedulingCount = getCount(schedulingResult);
    const billingCount = getCount(billingResult);
    const hrCount = getCount(hrResult);
    const opsCount = getCount(opsResult);

    const threads: ThreadStatus[] = [
      {
        name: 'COMPLIANCE',
        active: complianceCount > 0,
        critical: complianceCount >= 3,
        count: complianceCount,
        label: complianceCount > 0 ? `${complianceCount} open` : 'Clear',
      },
      {
        name: 'SCHEDULING',
        active: schedulingCount > 0,
        critical: schedulingCount >= 5,
        count: schedulingCount,
        label: schedulingCount > 0 ? `${schedulingCount} unassigned` : 'Clear',
      },
      {
        name: 'BILLING',
        active: billingCount > 0,
        critical: billingCount >= 2,
        count: billingCount,
        label: billingCount > 0 ? `${billingCount} overdue` : 'Clear',
      },
      {
        name: 'HR',
        active: hrCount > 0,
        critical: false,
        count: hrCount,
        label: hrCount > 0 ? `${hrCount} pending` : 'Clear',
      },
      {
        name: 'OPS',
        active: opsCount > 0,
        critical: opsCount >= 3,
        count: opsCount,
        label: opsCount > 0 ? `${opsCount} open` : 'Clear',
      },
    ];

    const response: ThoughtStatusResponse = {
      threads,
      lastScanned: new Date().toISOString(),
      workspaceId,
    };

    res.json(response);
  } catch (err: any) {
    log.warn('[TrinityThoughtStatus] Failed to get thought status:', err?.message);
    res.status(500).json({ error: 'Failed to fetch thought status' });
  }
});

export { router as trinityThoughtStatusRouter };
