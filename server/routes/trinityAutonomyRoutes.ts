/**
 * Trinity Autonomy Mode Routes
 *
 * GET  /api/trinity/autonomy        → current mode + descriptions
 * POST /api/trinity/autonomy        → set mode { mode: 'off'|'advisory'|... }
 *
 * Mounted by domains/billing.ts (trinity is colocated with finance routes).
 * Setting the mode is owner/manager only.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../rbac';
import { hasManagerAccess } from '../rbac';
import { createLogger } from '../lib/logger';
import {
  getAutonomyMode, setAutonomyMode, isValidAutonomyMode,
} from '../services/trinity/autonomyModeStore';
import {
  TRINITY_AUTONOMY_DESCRIPTIONS, type TrinityAutonomyMode,
} from '../trinity/personality';

const log = createLogger('TrinityAutonomyRoutes');
const router = Router();

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const mode = await getAutonomyMode(workspaceId);
    res.json({
      mode,
      descriptions: TRINITY_AUTONOMY_DESCRIPTIONS,
      modes: Object.keys(TRINITY_AUTONOMY_DESCRIPTIONS) as TrinityAutonomyMode[],
    });
  } catch (err) {
    log.error('autonomy GET failed', err);
    res.status(500).json({ error: 'Failed to read autonomy mode' });
  }
});

const setSchema = z.object({
  mode: z.enum(['off', 'advisory', 'order_execution', 'supervised_autonomous']),
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager role required to change Trinity autonomy' });
    }
    const parsed = setSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid mode', details: parsed.error.flatten() });
    }
    if (!isValidAutonomyMode(parsed.data.mode)) {
      return res.status(400).json({ error: 'Invalid autonomy mode' });
    }
    const updatedBy = (req.user as { id?: string } | undefined)?.id;
    await setAutonomyMode(workspaceId, parsed.data.mode, updatedBy);
    res.json({ ok: true, mode: parsed.data.mode });
  } catch (err) {
    log.error('autonomy POST failed', err);
    res.status(500).json({ error: 'Failed to update autonomy mode' });
  }
});

export default router;
