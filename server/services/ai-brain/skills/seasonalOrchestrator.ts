/**
 * Seasonal Orchestrator — manages holiday visual effects using
 * holiday_mascot_decor and holiday_mascot_history tables
 */
import { pool } from '../../../db';
import { createLogger } from '../../../lib/logger';
const log = createLogger('SeasonalOrchestrator');

type SeasonId = 'christmas' | 'halloween' | 'valentines' | 'easter' | 'independence_day' | 'thanksgiving' | 'new_year';

function getCurrentSeason(): SeasonId | null {
  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  if (m === 12 && d >= 1)  return 'christmas';
  if (m === 10 && d >= 25) return 'halloween';
  if (m === 2  && d <= 14) return 'valentines';
  if (m === 1  && d <= 3)  return 'new_year';
  if (m === 11 && d >= 20) return 'thanksgiving';
  if (m === 7  && d <= 7)  return 'independence_day';
  return null;
}

export const seasonalOrchestrator = {
  async getCurrentState() {
    const season = getCurrentSeason();
    try {
      const { rows } = await pool.query(`
        SELECT * FROM holiday_mascot_decor
        WHERE is_active=true AND (season_id=$1 OR season_id IS NULL)
        ORDER BY created_at DESC LIMIT 1
      `, [season]);
      return { season, active: !!rows[0], config: rows[0] ?? null };
    } catch { return { season, active: false, config: null }; }
  },

  async run(workspaceId?: string) {
    const state = await this.getCurrentState();
    if (!state.season) return { activated: false, reason: 'No active season' };

    try {
      await pool.query(`
        INSERT INTO holiday_mascot_history (id, season_id, event_type, workspace_id, created_at)
        VALUES (gen_random_uuid(), $1, 'season_detected', $2, NOW())
        ON CONFLICT DO NOTHING
      `, [state.season, workspaceId ?? 'platform']);
      log.info(`[SeasonalOrchestrator] Season: ${state.season} | Active: ${state.active}`);
      return { activated: state.active, season: state.season };
    } catch (err: unknown) {
      log.debug(`[SeasonalOrchestrator] Run error: ${err?.message}`);
      return { activated: false, season: state.season };
    }
  },
};
