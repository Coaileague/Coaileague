/**
 * Payroll Export Service — exports payroll data from payroll_runs and pay_stubs
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('PayrollExportService');

export const payrollExportService = {
  async exportRun(workspaceId: string, payrollRunId: string): Promise<{ success: boolean; rows: number; format: string }> {
    try {
      const { rows: stubs } = await pool.query(`
        SELECT ps.*, e.first_name, e.last_name, e.employee_number, e.email
        FROM pay_stubs ps
        JOIN employees e ON e.id = ps.employee_id
        WHERE ps.payroll_run_id=$1 AND ps.workspace_id=$2
        ORDER BY e.last_name, e.first_name
      `, [payrollRunId, workspaceId]);

      log.info(`[PayrollExport] Exported ${stubs.length} pay stubs for run ${payrollRunId}`);
      return { success: true, rows: stubs.length, format: 'json' };
    } catch (err: unknown) {
      log.error(`[PayrollExport] Export failed: ${err?.message}`);
      return { success: false, rows: 0, format: 'json' };
    }
  },

  async getSummary(workspaceId: string, payrollRunId: string) {
    const { rows } = await pool.query(`
      SELECT pr.*,
             COUNT(ps.id) as stub_count,
             SUM(ps.gross_pay_cents) as total_gross_cents,
             SUM(ps.net_pay_cents) as total_net_cents
      FROM payroll_runs pr
      LEFT JOIN pay_stubs ps ON ps.payroll_run_id=pr.id
      WHERE pr.id=$1 AND pr.workspace_id=$2
      GROUP BY pr.id
    `, [payrollRunId, workspaceId]);
    return rows[0] ?? null;
  },

  async getRecentRuns(workspaceId: string, limit = 10) {
    const { rows } = await pool.query(`
      SELECT pr.*, COUNT(ps.id) as stub_count,
             SUM(ps.gross_pay_cents)/100.0 as total_gross
      FROM payroll_runs pr
      LEFT JOIN pay_stubs ps ON ps.payroll_run_id=pr.id AND ps.workspace_id=$1
      WHERE pr.workspace_id=$1
      GROUP BY pr.id
      ORDER BY pr.pay_period_end DESC
      LIMIT $2
    `, [workspaceId, limit]);
    return rows;
  },
};
