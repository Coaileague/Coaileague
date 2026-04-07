import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  performanceNotes,
  insertPerformanceNoteSchema,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('performanceNoteRoutes');

const router = Router();

// GET /api/performance-notes?employeeId=xxx
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { employeeId } = req.query;
    if (!employeeId || typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'employeeId is required' });
    }

    const notes = await db
      .select()
      .from(performanceNotes)
      .where(and(
        eq(performanceNotes.workspaceId, workspaceId),
        eq(performanceNotes.employeeId, employeeId),
      ))
      .orderBy(desc(performanceNotes.createdAt));

    res.json(notes);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/performance-notes
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const parsed = insertPerformanceNoteSchema.safeParse({
      ...req.body,
      workspaceId,
      notedBy: req.userId,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }

    const [note] = await db.insert(performanceNotes).values(parsed.data).returning();

    platformEventBus.publish({
      type: 'performance_note_added',
      category: 'workforce',
      title: `Performance Note — ${parsed.data.noteType}`,
      description: `Manager added a ${parsed.data.noteType} note for officer`,
      workspaceId,
      metadata: { noteId: note.id, employeeId: parsed.data.employeeId, noteType: parsed.data.noteType },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.status(201).json(note);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/performance-notes/:id
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { id } = req.params;
    const { content, noteType, isPrivate } = req.body;

    const [updated] = await db
      .update(performanceNotes)
      .set({
        ...(content !== undefined && { content }),
        ...(noteType !== undefined && { noteType }),
        ...(isPrivate !== undefined && { isPrivate }),
        updatedAt: new Date(),
      })
      .where(and(eq(performanceNotes.id, id), eq(performanceNotes.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Note not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// DELETE /api/performance-notes/:id
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { id } = req.params;
    const [deleted] = await db
      .delete(performanceNotes)
      .where(and(eq(performanceNotes.id, id), eq(performanceNotes.workspaceId, workspaceId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
