/**
 * Cross-Tenant Applicant Network Check
 *
 * When a new applicant submits to any CoAIleague tenant, Trinity checks
 * whether this person's phone or email appears in ANY other tenant's
 * terminated_employees list.
 *
 * PRIVACY DESIGN (critical):
 * - NEVER reveals which company the record is from
 * - NEVER reveals why they were terminated
 * - NEVER reveals any personal details from the other tenant
 * - Only produces a binary FLAG: "this contact info has a prior record"
 * - Opt-in: workspace must have cross_tenant_screening_enabled = TRUE
 * - Only tenants who share their data benefit from others' data (reciprocal)
 *
 * Legal basis:
 * - Employers can consider prior employment history for security roles
 * - No protected class data is shared or considered
 * - Flag triggers human review, not automatic rejection
 * - FCRA compliant: flag is a referral for investigation, not a consumer report
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('CrossTenantScreen');

export interface CrossTenantCheckResult {
  flagged: boolean;
  reason: string | null;
}

/** Strip all non-digit characters; drop leading US country code. */
function digitsOnly(raw: string): string {
  const d = raw.replace(/[^0-9]/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return d;
}

export async function checkCrossTenantHistory(params: {
  phone: string | null;
  email: string | null;
  workspaceId: string;
  applicantId: string;
}): Promise<CrossTenantCheckResult> {
  const { phone, email, workspaceId, applicantId } = params;

  if (!phone && !email) {
    return { flagged: false, reason: null };
  }

  try {
    // Check if this workspace has opted into cross-tenant screening
    const optInResult = await pool.query(
      `SELECT cross_tenant_screening_enabled
         FROM workspace_hiring_settings
        WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId]
    );

    const isOptedIn = optInResult.rows[0]?.cross_tenant_screening_enabled === true;
    if (!isOptedIn) {
      return { flagged: false, reason: null };
    }

    const checks: string[] = [];
    const queryParams: any[] = [workspaceId]; // $1 = exclude own workspace
    let paramIdx = 2;

    if (phone) {
      const normalized = digitsOnly(phone);
      if (normalized.length >= 7) {
        checks.push(`REGEXP_REPLACE(e.phone, '[^0-9]', '', 'g') = $${paramIdx}`);
        queryParams.push(normalized);
        paramIdx++;
      }
    }

    if (email) {
      checks.push(`LOWER(e.email) = $${paramIdx}`);
      queryParams.push(email.toLowerCase());
      paramIdx++;
    }

    if (checks.length === 0) {
      return { flagged: false, reason: null };
    }

    // Only check workspaces that have opted in to cross-tenant screening
    const result = await pool.query(
      `SELECT COUNT(*) AS match_count
         FROM employees e
         JOIN workspace_hiring_settings whs
           ON whs.workspace_id = e.workspace_id
          AND whs.cross_tenant_screening_enabled = TRUE
        WHERE e.workspace_id != $1
          AND e.is_active = FALSE
          AND e.termination_date IS NOT NULL
          AND (${checks.join(' OR ')})`,
      queryParams
    );

    const matchCount = parseInt(result.rows[0]?.match_count || '0', 10);

    if (matchCount > 0) {
      log.info(`[CrossTenant] Flag triggered for applicant ${applicantId} — ${matchCount} network match(es)`);
      return {
        flagged: true,
        reason: 'Contact information matched a prior employment record in the CoAIleague network. Recommend reference check and employment history verification before proceeding.',
      };
    }

    return { flagged: false, reason: null };
  } catch (err: any) {
    log.warn('[CrossTenant] Check failed (non-fatal):', err?.message);
    return { flagged: false, reason: null };
  }
}
