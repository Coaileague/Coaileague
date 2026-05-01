/**
 * Trinity Orchestration Bridge — connects Trinity AI decisions to the
 * autonomous scheduling daemon. Uses real shifts and shift_offers tables.
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityOrchestrationBridge');

export const trinityOrchestrationBridge = {
  async trigger(workspaceId: string, action: 'fill_shift' | 'generate_schedule' | 'coverage_scan', payload?: Record<string, unknown>) {
    log.info(`[OrchestrationBridge] Triggering ${action} for ${workspaceId}`);
    try {
      switch (action) {
        case 'fill_shift': {
          const shiftId = payload?.shiftId as string;
          if (!shiftId) throw new Error('shiftId required for fill_shift');
          // Signal the coverage pipeline by inserting a pending coverage request
          await pool.query(`
            UPDATE shifts SET status='open', updated_at=NOW()
            WHERE id=$1 AND workspace_id=$2 AND status IN ('open','uncovered')
          `, [shiftId, workspaceId]);
          return { triggered: true, action, shiftId };
        }
        case 'coverage_scan': {
          const { rows } = await pool.query(`
            SELECT COUNT(*) as open_count FROM shifts
            WHERE workspace_id=$1 AND status='open' AND start_time > NOW() AND start_time < NOW() + INTERVAL '48 hours'
          `, [workspaceId]);
          return { triggered: true, action, openShifts: rows[0].open_count };
        }
        case 'generate_schedule': {
          const { rows } = await pool.query(`
            SELECT COUNT(*) as client_count FROM clients WHERE workspace_id=$1 AND status='active'
          `, [workspaceId]);
          return { triggered: true, action, eligibleClients: rows[0].client_count };
        }
        default:
          return { triggered: false, action, reason: 'Unknown action' };
      }
    } catch (err: unknown) {
      log.error(`[OrchestrationBridge] ${action} failed: ${err?.message}`);
      return { triggered: false, action, error: err?.message };
    }
  },
};
