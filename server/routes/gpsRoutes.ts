import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { recordBreadcrumb, getShiftBreadcrumbs } from '../services/gpsGeofenceService';
import { db } from '../db';
import { employees, timeEntries } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('GpsRoutes');


const router = Router();

const breadcrumbSchema = z.object({
  employeeId: z.string().min(1),
  timeEntryId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().optional(),
});

router.post('/breadcrumb', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const parsed = breadcrumbSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const { employeeId, timeEntryId, latitude, longitude, accuracyMeters } = parsed.data;

    const [emp] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId))).limit(1);
    if (!emp) {
      return res.status(403).json({ error: 'Employee does not belong to this workspace' });
    }

    const [entry] = await db.select({ id: timeEntries.id }).from(timeEntries)
      .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, workspaceId))).limit(1);
    if (!entry) {
      return res.status(403).json({ error: 'Time entry does not belong to this workspace' });
    }

    const result = await recordBreadcrumb(
      workspaceId,
      employeeId,
      timeEntryId,
      { latitude, longitude },
      accuracyMeters
    );

    return res.json({ success: true, id: result.id });
  } catch (error: unknown) {
    log.error('[GPS] Breadcrumb recording error:', error);
    return res.status(500).json({ error: 'Failed to record GPS breadcrumb' });
  }
});

router.get('/trail/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { timeEntryId } = req.params;
    if (!timeEntryId) {
      return res.status(400).json({ error: 'Time entry ID required' });
    }

    const [entry] = await db.select({ id: timeEntries.id }).from(timeEntries)
      .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, workspaceId))).limit(1);
    if (!entry) {
      return res.status(403).json({ error: 'Time entry does not belong to this workspace' });
    }

    const trail = await getShiftBreadcrumbs(workspaceId, timeEntryId);

    return res.json({ trail, count: trail.length });
  } catch (error: unknown) {
    log.error('[GPS] Trail retrieval error:', error);
    return res.status(500).json({ error: 'Failed to retrieve GPS trail' });
  }
});

export default router;
