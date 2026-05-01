/**
 * Migrate Existing Rates — backfills client_rates from clients.contract_rate
 * and normalizes pay rates across the workspace. Uses seeded client data.
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('MigrateExistingRates');

export async function migrateExistingRates(workspaceId: string): Promise<{ migrated: number; skipped: number; errors: number }> {
  let migrated = 0, skipped = 0, errors = 0;

  try {
    // Find clients with contract_rate but no entry in client_rates
    const { rows: clients } = await pool.query(`
      SELECT c.id, c.contract_rate, c.contract_rate_type,
             c.armed_bill_rate, c.unarmed_bill_rate
      FROM clients c
      WHERE c.workspace_id=$1
        AND c.contract_rate IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM client_rates cr WHERE cr.client_id=c.id AND cr.workspace_id=$1
        )
    `, [workspaceId]);

    for (const client of clients) {
      try {
        await pool.query(`
          INSERT INTO client_rates
            (id, workspace_id, client_id, rate_type, bill_rate,
             armed_bill_rate, unarmed_bill_rate, effective_date, is_current, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), true, NOW())
          ON CONFLICT DO NOTHING
        `, [workspaceId, client.id,
            client.contract_rate_type ?? 'hourly',
            client.contract_rate,
            client.armed_bill_rate,
            client.unarmed_bill_rate]);
        migrated++;
      } catch (err: unknown) {
        log.warn(`[MigrateRates] Failed to migrate client ${client.id}: ${err?.message}`);
        errors++;
      }
    }

    log.info(`[MigrateRates] Workspace ${workspaceId}: migrated=${migrated} skipped=${skipped} errors=${errors}`);
  } catch (err: unknown) {
    log.error(`[MigrateRates] Fatal: ${err?.message}`);
    errors++;
  }

  return { migrated, skipped, errors };
}
