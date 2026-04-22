import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db, pool } from '../db';
import {
  disciplinaryRecords,
  insertDisciplinaryRecordSchema,
  orgDocuments,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
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

// ─── Phase 4 — Trinity-powered disciplinary workflow ─────────────────────────

// POST /api/disciplinary-records/trinity-intake
// Manager provides 5-W context, Trinity generates the draft document.
router.post('/trinity-intake', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const {
      subjectId, subjectType, who, what, where, when, why, how,
      witnesses, priorIncidents, rawNarrative,
    } = req.body || {};

    if (!subjectId || !what || !why) {
      return res.status(400).json({
        error: 'Required: subjectId, what (incident description), why (policy basis)',
      });
    }

    const { runDisciplinaryWorkflow } = await import(
      '../services/trinity/trinityDisciplinaryWorkflow'
    );

    const result = await runDisciplinaryWorkflow({
      workspaceId,
      initiatedBy: (req.user as any)?.id || '',
      initiatedByRole: req.workspaceRole || '',
      subjectId,
      subjectType: subjectType || 'employee',
      who: who || '',
      what,
      where: where || '',
      when: when || new Date().toISOString(),
      why,
      how: how || '',
      witnesses,
      priorIncidents,
      rawNarrative,
    });

    res.json({ success: true, ...result });
  } catch (err: unknown) {
    log.error('[Disciplinary] Trinity intake failed:', (err as any)?.message);
    res.status(500).json({ error: 'Trinity document generation failed' });
  }
});

// POST /api/disciplinary-records/finalize
// Manager approves Trinity's draft → save record, queue signing, deduct score.
router.post('/finalize', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const {
      subjectId, subjectType, documentType, documentTitle, documentContent,
      sopViolationsFound, severityLevel, scoreDeduction,
      signingSequence, rehabilitationSuggestions, lodCount,
    } = req.body || {};

    if (!subjectId || !documentType || !documentContent) {
      return res.status(400).json({
        error: 'Required: subjectId, documentType, documentContent',
      });
    }

    const userId = (req.user as any)?.id || '';
    const issuedAtIso = new Date().toISOString().slice(0, 10);

    // 1. Create the org_documents shell first so we have a document id for signing.
    const [orgDoc] = await db.insert(orgDocuments).values({
      workspaceId,
      uploadedBy: userId,
      category: 'disciplinary',
      fileName: `${documentTitle || 'Disciplinary'}-${issuedAtIso}.txt`,
      filePath: `trinity-generated/pending`,
      description: documentTitle,
      requiresSignature: true,
      signatureRequired: 'specific_users',
      totalSignaturesRequired: Array.isArray(signingSequence) ? signingSequence.length : 2,
    } as any).returning();

    // 2. Create the canonical disciplinary record. We cross-link the
    //    org_documents id in `notes` (JSON) so the fully-signed event can
    //    find and activate this row.
    const notesPayload = {
      orgDocId: orgDoc.id,
      sopViolationsFound: sopViolationsFound || [],
      severityLevel: severityLevel || 'moderate',
      rehabilitationSuggestions: rehabilitationSuggestions || [],
      lodCount: lodCount ?? undefined,
      generatedByTrinity: true,
    };

    const [record] = await db.insert(disciplinaryRecords).values({
      workspaceId,
      employeeId: subjectId,
      recordType: documentType,
      description: documentContent,
      issuedBy: userId,
      status: 'pending_signature',
      notes: JSON.stringify(notesPayload),
    } as any).returning();

    // 3. Kick off the signing sequence starting with the subject (employee
    //    or contractor signs first, then the manager countersigns).
    try {
      const firstSigner = Array.isArray(signingSequence)
        ? signingSequence.find((s: any) => s.order === 1)
        : null;
      if (firstSigner && firstSigner.targetEmail) {
        const { documentSigningService } = await import(
          '../services/documentSigningService'
        );
        await documentSigningService.sendDocumentForSignature({
          documentId: orgDoc.id,
          workspaceId,
          senderUserId: userId,
          senderName: (req.user as any)?.email || 'Management',
          recipients: [{
            email: firstSigner.targetEmail,
            name: firstSigner.role === 'employee' ? 'Subject' : 'Manager',
            type: 'internal',
            employeeId: firstSigner.role === 'employee' ? subjectId : undefined,
          }],
          message: firstSigner.message,
        });
      }
    } catch (err: any) {
      log.warn('[Disciplinary] send-for-signature failed (non-fatal):', err?.message);
    }

    // 4. Score deduction — fires off the main request so the manager gets
    //    an immediate response. We drop 1/100th of the severity points from
    //    the normalized 0.0000–1.0000 score in coaileague_employee_profiles.
    const points = Number(scoreDeduction) || 0;
    scheduleNonBlocking('disciplinary.score-deduct', async () => {
      try {
        await pool.query(
          `UPDATE coaileague_employee_profiles
              SET overall_score = GREATEST(0, overall_score - ($1::numeric / 100)),
                  reliability_score = GREATEST(0, reliability_score - ($2::numeric / 200)),
                  updated_at = NOW()
            WHERE employee_id = $3 AND workspace_id = $4`,
          [points, points, subjectId, workspaceId],
        );
        log.info(
          `[DisciplinaryScore] Deducted ${points}pts from ${subjectId} for ${documentType}`,
        );
      } catch (err: any) {
        log.warn('[DisciplinaryScore] Deduction failed (non-fatal):', err?.message);
      }
    });

    // 5. Event log entry for cross-tenant score history.
    scheduleNonBlocking('disciplinary.event-log', async () => {
      try {
        await pool.query(
          `INSERT INTO employee_event_log
              (id, workspace_id, employee_id, event_type, event_source,
               points_change, points_type, reference_id, reference_type,
               is_automatic, metadata, created_at, updated_at)
           VALUES
              (gen_random_uuid(), $1, $2, 'disciplinary_action', 'hr_management',
               $3, 'negative', $4, 'disciplinary_record',
               TRUE, $5, NOW(), NOW())`,
          [
            workspaceId, subjectId, -points, record.id,
            JSON.stringify({
              documentType,
              severity: severityLevel || 'moderate',
              generatedByTrinity: true,
            }),
          ],
        );
      } catch (err: any) {
        log.warn('[Disciplinary] event-log insert failed (non-fatal):', err?.message);
      }
    });

    // 6. Emit an event so other subscribers (notifications, analytics) see it.
    platformEventBus.publish({
      type: 'disciplinary_record_created',
      category: 'workforce',
      title: `Disciplinary Record — ${documentType}`,
      description: documentTitle || `${documentType} issued`,
      workspaceId,
      metadata: {
        recordId: record.id,
        orgDocId: orgDoc.id,
        employeeId: subjectId,
        subjectType: subjectType || 'employee',
        recordType: documentType,
        severity: severityLevel || 'moderate',
        lodCount,
        generatedByTrinity: true,
      },
      visibility: 'supervisor',
    }).catch((err: any) => log.warn('[EventBus] publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      recordId: record.id,
      orgDocId: orgDoc.id,
      message: `Disciplinary document created. ${
        subjectType === 'contractor_1099' ? 'Letter of Dissatisfaction' : 'Write-up'
      } sent to ${
        subjectType === 'contractor_1099' ? 'contractor' : 'employee'
      } for signature.`,
    });
  } catch (err: unknown) {
    log.error('[Disciplinary] Finalize failed:', (err as any)?.message);
    res.status(500).json({ error: 'Failed to finalize disciplinary record' });
  }
});

// GET /api/disciplinary-records/my — employee self-service view
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = (req.user as any)?.id;
    if (!workspaceId || !userId) {
      return res.status(403).json({ error: 'Auth required' });
    }

    const { rows: emp } = await pool.query(
      `SELECT id FROM employees WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId],
    );
    if (!emp.length) return res.json([]);

    const records = await db
      .select()
      .from(disciplinaryRecords)
      .where(and(
        eq(disciplinaryRecords.workspaceId, workspaceId),
        eq(disciplinaryRecords.employeeId, emp[0].id),
      ))
      .orderBy(desc(disciplinaryRecords.issuedAt));

    res.json(records);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
