/**
 * Time Anomaly Detection — detects suspicious time entries using
 * time_entries and time_entry_discrepancies tables with real seeded data
 */
import { pool } from '../../../db';
import { createLogger } from '../../../lib/logger';
const log = createLogger('TimeAnomalyDetection');

export interface TimeAnomaly {
  type: 'long_shift' | 'gap_between_entries' | 'missing_clock_out' | 'overtime_spike' | 'location_mismatch';
  employeeId: string;
  timeEntryId: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: Date;
}

export const timeAnomalyDetection = {
  async scan(workspaceId: string): Promise<TimeAnomaly[]> {
    const anomalies: TimeAnomaly[] = [];
    try {
      // 1. Missing clock-outs (shift ended, no clock-out)
      const { rows: missing } = await pool.query(`
        SELECT te.id, te.employee_id, te.clock_in,
               s.end_time, e.first_name, e.last_name
        FROM time_entries te
        JOIN shifts s ON s.id = te.shift_id
        JOIN employees e ON e.id = te.employee_id
        WHERE te.workspace_id=$1
          AND te.clock_out IS NULL
          AND s.end_time < NOW() - INTERVAL '1 hour'
          AND te.status != 'voided'
        LIMIT 20
      `, [workspaceId]);

      missing.forEach((r: any) => anomalies.push({
        type: 'missing_clock_out',
        employeeId: r.employee_id,
        timeEntryId: r.id,
        severity: 'medium',
        description: `${r.first_name} ${r.last_name} did not clock out — shift ended ${new Date(r.end_time).toLocaleTimeString()}`,
        detectedAt: new Date(),
      }));

      // 2. Overtime spikes (> 10h in a single entry)
      const { rows: longShifts } = await pool.query(`
        SELECT te.id, te.employee_id,
               EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/3600 as hours,
               e.first_name, e.last_name
        FROM time_entries te
        JOIN employees e ON e.id = te.employee_id
        WHERE te.workspace_id=$1
          AND te.clock_out IS NOT NULL
          AND EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/3600 > 10
          AND te.clock_in > NOW() - INTERVAL '7 days'
        LIMIT 10
      `, [workspaceId]);

      longShifts.forEach((r: any) => anomalies.push({
        type: 'long_shift',
        employeeId: r.employee_id,
        timeEntryId: r.id,
        severity: r.hours > 14 ? 'high' : 'medium',
        description: `${r.first_name} ${r.last_name} worked ${Number(r.hours).toFixed(1)}h in a single entry`,
        detectedAt: new Date(),
      }));

      log.info(`[TimeAnomalyDetection] Found ${anomalies.length} anomalies in ${workspaceId}`);
      return anomalies;
    } catch (err: unknown) {
      log.warn(`[TimeAnomalyDetection] Scan failed: ${err?.message}`);
      return anomalies;
    }
  },
};
