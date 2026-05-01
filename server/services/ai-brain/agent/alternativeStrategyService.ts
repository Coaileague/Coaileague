/**
 * Alternative Strategy Service — generates scheduling alternatives when
 * primary strategy fails. Queries real shift and employee data.
 */
import { pool } from '../../../db';
import { createLogger } from '../../../lib/logger';
const log = createLogger('AlternativeStrategyService');

export interface SchedulingStrategy {
  type: 'overtime' | 'agency' | 'split_shift' | 'adjacent_client' | 'emergency_callout';
  description: string;
  employeeId?: string;
  estimatedCost: number;
  feasibility: 'high' | 'medium' | 'low';
}

export const alternativeStrategyService = {
  async generate(workspaceId: string, shiftId: string): Promise<SchedulingStrategy[]> {
    try {
      const strategies: SchedulingStrategy[] = [];

      // 1. Find employees close to overtime who could cover
      const { rows: overtimeCandidates } = await pool.query(`
        SELECT e.id, e.first_name, e.last_name,
               COALESCE(SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/3600),0) as hours_this_week
        FROM employees e
        LEFT JOIN time_entries te ON te.employee_id=e.id
          AND te.clock_in > DATE_TRUNC('week', NOW())
        JOIN shifts s ON s.id=$2
        WHERE e.workspace_id=$1 AND e.status='active'
          AND NOT EXISTS (
            SELECT 1 FROM shifts s2
            WHERE s2.assigned_employee_id=e.id AND s2.workspace_id=$1
              AND s2.start_time < s.end_time AND s2.end_time > s.start_time
              AND s2.id != $2
          )
        GROUP BY e.id, e.first_name, e.last_name
        HAVING SUM(EXTRACT(EPOCH FROM (COALESCE(te.clock_out, NOW()) - te.clock_in))/3600) < 48
        ORDER BY hours_this_week DESC
        LIMIT 3
      `, [workspaceId, shiftId]);

      overtimeCandidates.forEach((c: any) => {
        strategies.push({
          type: 'overtime',
          description: `${c.first_name} ${c.last_name} — ${Number(c.hours_this_week).toFixed(1)}h this week, can absorb OT`,
          employeeId: c.id,
          estimatedCost: 1.5,
          feasibility: c.hours_this_week < 40 ? 'high' : 'medium',
        });
      });

      // 2. Split shift option
      strategies.push({
        type: 'split_shift',
        description: 'Split shift between two part-time employees',
        estimatedCost: 1.0,
        feasibility: 'medium',
      });

      log.debug(`[AlternativeStrategy] Generated ${strategies.length} strategies for shift ${shiftId}`);
      return strategies;
    } catch (err: unknown) {
      log.warn(`[AlternativeStrategy] Failed: ${err?.message}`);
      return [];
    }
  },
};
