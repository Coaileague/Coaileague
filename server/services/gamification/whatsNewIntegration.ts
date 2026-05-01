/**
 * What's New integration for gamification milestones
 */
import { db } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('GamificationWhatsNew');

export async function notifyWhatsNew(workspaceId: string, headline: string, detail: string): Promise<void> {
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `INSERT INTO platform_updates (id, workspace_id, title, content, category, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'gamification', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [workspaceId, headline, detail]
    );
  } catch (err: unknown) {
    log.debug(`[GamificationWhatsNew] Could not write update: ${err?.message?.slice(0, 80)}`);
  }
}
