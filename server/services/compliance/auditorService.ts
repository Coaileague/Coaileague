/**
 * Auditor Service — read-only compliance reporting for auditor role
 * Queries security_incidents, document_signatures, policy_acknowledgments
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('AuditorService');

export const auditorService = {
  async getAuditReport(workspaceId: string, startDate?: Date, endDate?: Date) {
    const start = startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ?? new Date();
    try {
      const [incidents, signatures, policies] = await Promise.all([
        pool.query(`
          SELECT si.*, c.name as client_name
          FROM security_incidents si LEFT JOIN clients c ON c.id=si.client_id
          WHERE si.workspace_id=$1 AND si.reported_at BETWEEN $2 AND $3
          ORDER BY si.reported_at DESC LIMIT 100
        `, [workspaceId, start, end]),
        pool.query(`
          SELECT ds.*, e.first_name, e.last_name, e.employee_number
          FROM document_signatures ds JOIN employees e ON e.id=ds.signer_id
          WHERE ds.workspace_id=$1 AND ds.signed_at BETWEEN $2 AND $3
          ORDER BY ds.signed_at DESC LIMIT 100
        `, [workspaceId, start, end]),
        pool.query(`
          SELECT cp.title, COUNT(pa.id) as acknowledgments
          FROM company_policies cp
          LEFT JOIN policy_acknowledgments pa ON pa.policy_id=cp.id AND pa.acknowledged_at BETWEEN $2 AND $3
          WHERE cp.workspace_id=$1 AND cp.is_active=true
          GROUP BY cp.id, cp.title
        `, [workspaceId, start, end]),
      ]);
      return {
        period: { start, end },
        incidents: incidents.rows,
        signatures: signatures.rows,
        policyCompliance: policies.rows,
        summary: {
          totalIncidents: incidents.rows.length,
          openIncidents: incidents.rows.filter((r: any) => r.status === 'open').length,
          documentsSigned: signatures.rows.length,
          activePolicies: policies.rows.length,
        },
      };
    } catch (err: unknown) {
      log.error(`[AuditorService] Report failed: ${err?.message}`);
      return null;
    }
  },

  async getComplianceScore(workspaceId: string): Promise<number> {
    try {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM security_incidents WHERE workspace_id=$1 AND status='open') as open_incidents,
          (SELECT COUNT(*) FROM employees WHERE workspace_id=$1 AND status='active' AND license_expiry < NOW()) as expired_licenses,
          (SELECT COUNT(*) FROM employees WHERE workspace_id=$1 AND status='active') as total_employees
      `, [workspaceId]);
      const s = rows[0];
      let score = 100;
      if (s.open_incidents > 0) score -= Math.min(20, s.open_incidents * 5);
      if (s.total_employees > 0) score -= Math.min(30, (s.expired_licenses / s.total_employees) * 30);
      return Math.max(0, score);
    } catch { return 0; }
  },
};
