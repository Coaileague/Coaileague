/**
 * PHASE 46 — HOLIDAY CALENDAR API ROUTES
 *
 * Routes:
 *   GET    /api/holidays              — list holidays for workspace (optional ?year=YYYY)
 *   POST   /api/holidays              — create custom holiday (org_owner only)
 *   PUT    /api/holidays/:id          — update holiday (org_owner only, future only)
 *   DELETE /api/holidays/:id          — delete custom holiday (org_owner only, future only)
 *   POST   /api/holidays/validate-timezone — validate IANA timezone string
 *   GET    /api/holidays/check-date   — check if a date is a holiday for this workspace
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import {
  isValidIANATimezone,
  getWorkspaceHolidays,
  createWorkspaceHoliday,
  updateWorkspaceHoliday,
  deleteWorkspaceHoliday,
  isHolidayForWorkspace,
} from '../services/holidayService';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('HolidayRoutes');


const router = Router();

// ─── GET /api/holidays ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    
    const holidays = await getWorkspaceHolidays(workspaceId, year);
    return res.json({ holidays });
  } catch (err: any) {
    log.error('[HolidayRoutes] GET /api/holidays error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// ─── POST /api/holidays/validate-timezone ─────────────────────────────────────
router.post('/validate-timezone', requireAuth, (req: any, res) => {
  const { timezone } = req.body;
  if (!timezone) return res.status(400).json({ error: 'timezone is required' });
  
  const valid = isValidIANATimezone(timezone);
  return res.json({ valid, timezone: valid ? timezone : null });
});

// ─── GET /api/holidays/check-date ────────────────────────────────────────────
router.get('/check-date', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const { date, state_code } = req.query;
    
    if (!date) return res.status(400).json({ error: 'date is required' });
    
    const isHoliday = await isHolidayForWorkspace(
      workspaceId,
      new Date(date as string),
      state_code as string | undefined
    );
    
    return res.json({ isHoliday, date, stateCode: state_code || null });
  } catch (err: any) {
    log.error('[HolidayRoutes] check-date error:', err.message);
    return res.status(500).json({ error: 'Failed to check holiday status' });
  }
});

// ─── POST /api/holidays ───────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  holidayType: z.enum(['custom']).default('custom'),
  stateCode: z.string().length(2).optional(),
  appliesToDifferential: z.boolean().default(true),
});

router.post('/', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId, id: userId } = req.user;
    
    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Only org owners can manage holidays' });
    }
    
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    
    const holiday = await createWorkspaceHoliday({
      workspaceId,
      name: parsed.data.name,
      date: parsed.data.date,
      holidayType: parsed.data.holidayType,
      stateCode: parsed.data.stateCode,
      appliesToDifferential: parsed.data.appliesToDifferential,
      createdBy: userId,
    });
    
    return res.status(201).json({ holiday });
  } catch (err: any) {
    log.error('[HolidayRoutes] POST /api/holidays error:', err.message);
    return res.status(500).json({ error: 'Failed to create holiday' });
  }
});

// ─── PUT /api/holidays/:id ────────────────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stateCode: z.string().length(2).optional(),
  appliesToDifferential: z.boolean().optional(),
});

router.put('/:id', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId } = req.user;
    
    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Only org owners can manage holidays' });
    }
    
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    
    const holiday = await updateWorkspaceHoliday(req.params.id, workspaceId, parsed.data);
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found or cannot be modified (past or non-existent)' });
    }
    
    return res.json({ holiday });
  } catch (err: any) {
    log.error('[HolidayRoutes] PUT error:', err.message);
    return res.status(500).json({ error: 'Failed to update holiday' });
  }
});

// ─── DELETE /api/holidays/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId } = req.user;
    
    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Only org owners can manage holidays' });
    }
    
    const deleted = await deleteWorkspaceHoliday(req.params.id, workspaceId);
    if (!deleted) {
      return res.status(404).json({ error: 'Custom holiday not found or cannot be deleted (past, federal/state, or non-existent)' });
    }
    
    return res.json({ success: true });
  } catch (err: any) {
    log.error('[HolidayRoutes] DELETE error:', err.message);
    return res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

export default router;
