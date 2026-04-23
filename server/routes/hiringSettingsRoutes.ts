/**
 * Hiring Settings Routes
 *
 * Per-workspace configuration for the Trinity Scoring Engine:
 *  • Auto-score on apply (default ON)
 *  • Auto-advance above threshold / auto-decline below threshold
 *  • License sponsorship availability
 *  • Default state jurisdiction
 *  • Cross-tenant network screening (opt-in, reciprocal)
 *
 * Table: workspace_hiring_settings (bootstrapped in productionSeed.ts)
 * Mounted at: /api/workspace/hiring-settings (see routes/domains/workforce.ts)
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import type { AuthenticatedRequest } from '../rbac';
import { requireManager } from '../rbac';
import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('HiringSettingsRoutes');
const router = Router();

interface HiringSettings {
  workspaceId: string;
  crossTenantScreeningEnabled: boolean;
  autoScoreOnApply: boolean;
  autoDeclineBelowScore: number | null;
  autoAdvanceAboveScore: number | null;
  licenseSponsorshipAvailable: boolean;
  defaultStateJurisdiction: string;
  updatedAt: string | null;
}

function rowToSettings(row: any, workspaceId: string): HiringSettings {
  if (!row) {
    return {
      workspaceId,
      crossTenantScreeningEnabled: false,
      autoScoreOnApply: true,
      autoDeclineBelowScore: null,
      autoAdvanceAboveScore: null,
      licenseSponsorshipAvailable: false,
      defaultStateJurisdiction: 'TX',
      updatedAt: null,
    };
  }
  return {
    workspaceId: row.workspace_id,
    crossTenantScreeningEnabled: !!row.cross_tenant_screening_enabled,
    autoScoreOnApply: !!row.auto_score_on_apply,
    autoDeclineBelowScore: row.auto_decline_below_score ?? null,
    autoAdvanceAboveScore: row.auto_advance_above_score ?? null,
    licenseSponsorshipAvailable: !!row.license_sponsorship_available,
    defaultStateJurisdiction: row.default_state_jurisdiction || 'TX',
    updatedAt: row.updated_at,
  };
}

// GET /api/workspace/hiring-settings
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const result = await pool.query(
      `SELECT * FROM workspace_hiring_settings WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId]
    );
    res.json({ settings: rowToSettings(result.rows[0], workspaceId) });
  } catch (err: unknown) {
    log.error('[HiringSettings] GET failed:', sanitizeError(err));
    res.status(500).json({ error: 'Failed to fetch hiring settings' });
  }
});

// PUT /api/workspace/hiring-settings — upsert
router.put('/', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const {
      crossTenantScreeningEnabled,
      autoScoreOnApply,
      autoDeclineBelowScore,
      autoAdvanceAboveScore,
      licenseSponsorshipAvailable,
      defaultStateJurisdiction,
    } = req.body || {};

    // Clamp score thresholds to 0-100
    const declineThreshold =
      autoDeclineBelowScore === null
        ? null
        : Math.max(0, Math.min(100, Number(autoDeclineBelowScore)));
    const advanceThreshold =
      autoAdvanceAboveScore === null
        ? null
        : Math.max(0, Math.min(100, Number(autoAdvanceAboveScore)));

    const state = (typeof defaultStateJurisdiction === 'string'
      ? defaultStateJurisdiction.trim().toUpperCase().slice(0, 2)
      : 'TX') || 'TX';

    await pool.query(
      `INSERT INTO workspace_hiring_settings (
         workspace_id, cross_tenant_screening_enabled, auto_score_on_apply,
         auto_decline_below_score, auto_advance_above_score,
         license_sponsorship_available, default_state_jurisdiction, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         cross_tenant_screening_enabled = EXCLUDED.cross_tenant_screening_enabled,
         auto_score_on_apply            = EXCLUDED.auto_score_on_apply,
         auto_decline_below_score       = EXCLUDED.auto_decline_below_score,
         auto_advance_above_score       = EXCLUDED.auto_advance_above_score,
         license_sponsorship_available  = EXCLUDED.license_sponsorship_available,
         default_state_jurisdiction     = EXCLUDED.default_state_jurisdiction,
         updated_at                     = NOW()`,
      [
        workspaceId,
        !!crossTenantScreeningEnabled,
        autoScoreOnApply === undefined ? true : !!autoScoreOnApply,
        declineThreshold,
        advanceThreshold,
        !!licenseSponsorshipAvailable,
        state,
      ]
    );

    const result = await pool.query(
      `SELECT * FROM workspace_hiring_settings WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId]
    );
    res.json({ settings: rowToSettings(result.rows[0], workspaceId) });
  } catch (err: unknown) {
    log.error('[HiringSettings] PUT failed:', sanitizeError(err));
    res.status(500).json({ error: 'Failed to save hiring settings' });
  }
});

export default router;
