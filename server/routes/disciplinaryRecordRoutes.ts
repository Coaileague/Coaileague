import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  disciplinaryRecords,
  insertDisciplinaryRecordSchema,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('disciplinaryRecordRoutes');

const router = Router();

// GET /api/disciplinary-records?employeeId=xxx
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const { employeeId } = req.query;
    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const records = await db
      .select()
      .from(disciplinaryRecords)
      .where(and(
        eq(disciplinaryRecords.workspaceId, workspaceId),
        eq(disciplinaryRecords.employeeId, employeeId),
      ))
      .orderBy(desc(disciplinaryRecords.issuedAt));

    res.json(records);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/disciplinary-records
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const parsed = insertDisciplinaryRecordSchema.safeParse({
      ...req.body,
      workspaceId,
      issuedBy: req.user,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    const [record] = await db.insert(disciplinaryRecords).values(parsed.data).returning();

    platformEventBus.publish({
      type: 'disciplinary_record_created',
      category: 'workforce',
      title: `Disciplinary Record — ${parsed.data.recordType}`,
      description: `${parsed.data.recordType} issued for officer`,
      workspaceId,
      metadata: {
        recordId: record.id,
        employeeId: parsed.data.employeeId,
        recordType: parsed.data.recordType,
        isTermination: parsed.data.recordType === 'termination',
      },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.status(201).json(record);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/disciplinary-records/:id — acknowledge, update status, add notes
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { id } = req.params;
    const { status, notes, acknowledgedAt, acknowledgedBy, documentUrl } = req.body;

    // Validate URL scheme to prevent stored XSS via javascript: or data: URLs
    if (documentUrl !== undefined) {
      try {
        const parsed = new URL(documentUrl);
        if (!['https:', 'http:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'documentUrl must use http or https protocol' });
        }
      } catch {
        return res.status(400).json({ error: 'documentUrl is not a valid URL' });
      }
    }

    const [updated] = await db
      .update(disciplinaryRecords)
      .set({
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        ...(acknowledgedAt !== undefined && { acknowledgedAt: new Date(acknowledgedAt) }),
        ...(acknowledgedBy !== undefined && { acknowledgedBy }),
        ...(documentUrl !== undefined && { documentUrl }),
        updatedAt: new Date(),
      })
      .where(and(eq(disciplinaryRecords.id, id), eq(disciplinaryRecords.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Record not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
