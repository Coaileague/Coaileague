import { requireAuth } from '../auth';
/**
 * Audit Suite Routes — AI Regulatory Audit Suite (All 6 Phases)
 * ==============================================================
 * Mounts at: /api/audit-suite
 *
 * Endpoint map:
 *   Phase 2 — Visual evidence
 *     POST  /visual-compliance/upload              Upload an artifact + run Trinity vision
 *     GET   /visual-compliance/:workspaceId        List artifacts (tenant-scoped)
 *     GET   /visual-compliance/:workspaceId/summary Slot coverage summary
 *
 *   Phase 3 — Auditor verification gate
 *     POST  /audits/:auditId/submit-paperwork      Auditor submits state authorization doc
 *     GET   /audits/:auditId/safe-status           Check if Document Safe is unlocked
 *     GET   /audits/:auditId/access-log            Immutable access log (tenant owner only)
 *
 *   Phase 4 — Audit packet + HITL
 *     POST  /audits/:auditId/generate-packet       Trinity generates draft PDF
 *     GET   /audits/:auditId/packets               List drafts for this audit
 *     POST  /audits/:auditId/packets/:draftId/approve  Owner approves → releases to auditor
 *     POST  /audits/:auditId/packets/:draftId/reject   Owner rejects with modify instructions
 *
 *   Phase 5 — Finalization
 *     POST  /audits/:auditId/verdict               Record PASS / PASS_WITH_CONDITIONS / FAIL
 *     GET   /audits/:auditId/citation              Get citation for this audit
 *     POST  /citations/:citationId/payment-proof   Upload money order + tracking
 *     GET   /:workspaceId/ledger                   Historical audit ledger for a tenant
 *
 *   Phase 6 — Cure period
 *     GET   /audits/:auditId/cure-status           Live countdown + reminder state
 *     POST  /audits/:auditId/upload-corrections    Owner uploads verified corrections
 *
 * Auth model:
 *   - Tenant-owner routes: requireAuth + workspace ownership check
 *   - Auditor routes:      requireAuditor middleware (auditorRoutes pattern)
 *   - Some routes are accessible to either (dual guard)
 *
 * TRINITY.md §G  — All DB queries workspace-scoped.
 * TRINITY.md §B  — No fire-and-forget; NDS for all notifications.
 * TRINITY.md §U  — LAW P3: multer.memoryStorage() only.
 */

import { Router, type Response } from 'express';
import multer from 'multer';
import { createLogger } from '../lib/logger';

// Phase 2
import {
  uploadVisualArtifact,
  listArtifactsForWorkspace,
  getArtifactSummary,
  ARTIFACT_TYPES,
  ARTIFACT_LABELS,
  type ArtifactType,
} from '../services/auditor/visualComplianceService';

// Phase 3
import {
  submitAuditorPaperwork,
  isAuditSafeUnlocked,
  getAccessLog,
} from '../services/auditor/auditVerificationGateService';

// Phase 4
import {
  generateAuditPacketPDF,
  approveAndSendDraft,
  rejectDraft,
  getDraftsForAudit,
} from '../services/auditor/generateAuditPacketPDF';

// Phase 5
import {
  recordVerdict,
  submitPaymentProof,
  getCitationForAudit,
  getAuditHistoricalLedger,
  type AuditVerdict,
} from '../services/auditor/auditCitationService';

// Phase 6
import {
  startCurePeriod,
  getCureStatus,
  verifyCureCorrections,
} from '../services/auditor/curePeriodTrackerService';

const log = createLogger('AuditSuiteRoutes');
export const auditSuiteRouter = Router();

// ── Global auth guard — all audit suite routes require auth ──────────────────
auditSuiteRouter.use(requireAuth);

// LAW P3: memory storage only — files stream to GCS, never touch Railway disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function requireAuditorSession(req: any, res: Response, next: any): void {
  if (!req.session?.auditorId) {
    res.status(401).json({ ok: false, error: 'Auditor session required' });
    return;
  }
  next();
}

function requireUserAuth(req: any, res: Response, next: any): void {
  if (!req.user?.id && !req.session?.userId) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return;
  }
  next();
}

// Accept either a logged-in tenant user OR an auditor session
function requireEitherAuth(req: any, res: Response, next: any): void {
  if (req.user?.id || req.session?.userId || req.session?.auditorId) {
    return next();
  }
  res.status(401).json({ ok: false, error: 'Authentication required' });
}

function getUserOrAuditorId(req: any): string {
  return req.user?.id ?? req.session?.userId ?? req.session?.auditorId ?? 'unknown';
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2 — Visual Evidence Capture
// ═══════════════════════════════════════════════════════════════════

// Returns the list of required slots with labels — used to build the upload form
auditSuiteRouter.get('/visual-compliance/slots', (req, res) => {
  res.json({
    ok: true,
    slots: ARTIFACT_TYPES.map(t => ({ type: t, label: ARTIFACT_LABELS[t] })),
  });
});

// Upload one visual artifact (multer parses multipart; we stream to GCS)
auditSuiteRouter.post(
  '/visual-compliance/upload',
  requireUserAuth,
  upload.single('file'),
  async (req: any, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const workspaceId   = req.workspaceId ?? req.body.workspaceId;
    const artifactType  = req.body.artifactType as ArtifactType;
    const auditId       = req.body.auditId;
    const registeredAddress = req.body.registeredAddress;

    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    if (!ARTIFACT_TYPES.includes(artifactType)) {
      return res.status(400).json({ ok: false, error: `Invalid artifactType. Must be one of: ${ARTIFACT_TYPES.join(', ')}` });
    }

    try {
      const result = await uploadVisualArtifact({
        workspaceId,
        artifactType,
        fileBuffer: file.buffer,
        mimeType:   file.mimetype,
        uploadedBy: getUserOrAuditorId(req),
        auditId,
        registeredAddress,
      });
      res.json({ ok: true, artifact: result });
    } catch (err: unknown) {
      log.error('[AuditSuite] visual upload error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// List artifacts for a workspace (optionally scoped to an auditId)
auditSuiteRouter.get(
  '/visual-compliance/:workspaceId',
  requireUserAuth,
  async (req: any, res) => {
    const { workspaceId } = req.params;
    const { auditId } = req.query;

    // Ensure the requester belongs to this workspace (tenant isolation)
    const callerWorkspaceId = req.workspaceId;
    if (callerWorkspaceId && callerWorkspaceId !== workspaceId) {
      return res.status(403).json({ ok: false, error: 'Cross-workspace access denied' });
    }

    try {
      const artifacts = await listArtifactsForWorkspace(workspaceId, auditId as string | undefined);
      res.json({ ok: true, artifacts });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Slot completion summary (which slots have been uploaded, which are missing)
auditSuiteRouter.get(
  '/visual-compliance/:workspaceId/summary',
  requireUserAuth,
  async (req: any, res) => {
    const { workspaceId } = req.params;
    const callerWorkspaceId = req.workspaceId;
    if (callerWorkspaceId && callerWorkspaceId !== workspaceId) {
      return res.status(403).json({ ok: false, error: 'Cross-workspace access denied' });
    }
    try {
      const summary = await getArtifactSummary(workspaceId);
      res.json({ ok: true, summary });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PHASE 3 — Auditor Verification Gate
// ═══════════════════════════════════════════════════════════════════

// Auditor uploads state authorization paperwork → Trinity verifies → unlocks safe
auditSuiteRouter.post(
  '/audits/:auditId/submit-paperwork',
  requireAuditorSession,
  upload.single('paperwork'),
  async (req: any, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: 'No paperwork file uploaded' });

    const { auditId } = req.params;
    const workspaceId = req.body.workspaceId;
    const auditorId   = req.session.auditorId;

    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const result = await submitAuditorPaperwork({
        auditId, workspaceId, auditorId,
        fileBuffer: file.buffer,
        mimeType:   file.mimetype,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      log.error('[AuditSuite] submit-paperwork error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Check if Document Safe is unlocked for a given audit
auditSuiteRouter.get(
  '/audits/:auditId/safe-status',
  requireEitherAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = (req.workspaceId ?? req.query.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const unlocked = await isAuditSafeUnlocked(auditId, workspaceId);
      res.json({ ok: true, unlocked });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Immutable access log (tenant owner sees who unlocked their safe and when)
auditSuiteRouter.get(
  '/audits/:auditId/access-log',
  requireUserAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const log_ = await getAccessLog(auditId, workspaceId);
      res.json({ ok: true, accessLog: log_ });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PHASE 4 — Audit Packet + HITL Approval Loop
// ═══════════════════════════════════════════════════════════════════

// Generate a draft audit packet PDF (Trinity compiles, owner reviews)
auditSuiteRouter.post(
  '/audits/:auditId/generate-packet',
  requireEitherAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = (req.workspaceId ?? req.body.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const result = await generateAuditPacketPDF({
        auditId,
        workspaceId,
        requestedBy: getUserOrAuditorId(req),
        modifyInstructions: req.body.modifyInstructions,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      log.error('[AuditSuite] generate-packet error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// List all drafts for an audit
auditSuiteRouter.get(
  '/audits/:auditId/packets',
  requireEitherAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = (req.workspaceId ?? req.query.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    try {
      const drafts = await getDraftsForAudit(auditId, workspaceId);
      res.json({ ok: true, drafts });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Owner approves a draft → it is marked sent to auditor
auditSuiteRouter.post(
  '/audits/:auditId/packets/:draftId/approve',
  requireUserAuth,
  async (req: any, res) => {
    const { draftId } = req.params;
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const result = await approveAndSendDraft(draftId, workspaceId, getUserOrAuditorId(req));
      res.json({ ok: true, message: 'Audit packet approved and released to auditor.', ...result });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Owner rejects a draft with modification instructions → Trinity regenerates
auditSuiteRouter.post(
  '/audits/:auditId/packets/:draftId/reject',
  requireUserAuth,
  async (req: any, res) => {
    const { auditId, draftId } = req.params;
    const workspaceId = req.workspaceId as string;
    const { modifyInstructions } = req.body;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    if (!modifyInstructions?.trim()) return res.status(400).json({ ok: false, error: 'modifyInstructions required' });

    try {
      await rejectDraft(draftId, workspaceId, getUserOrAuditorId(req), modifyInstructions);
      // Immediately regenerate with new instructions
      const newDraft = await generateAuditPacketPDF({
        auditId, workspaceId,
        requestedBy: getUserOrAuditorId(req),
        modifyInstructions,
      });
      res.json({ ok: true, message: 'Draft rejected. Trinity has generated a revised packet.', newDraft });
    } catch (err: unknown) {
      log.error('[AuditSuite] reject-draft error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PHASE 5 — Finalization Engine
// ═══════════════════════════════════════════════════════════════════

// Auditor records the final verdict
auditSuiteRouter.post(
  '/audits/:auditId/verdict',
  requireAuditorSession,
  upload.single('violationPdf'),
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = req.body.workspaceId;
    const auditorId   = req.session.auditorId;
    const verdict     = req.body.verdict as AuditVerdict;
    const conditionsText = req.body.conditionsText;
    const cureDays       = req.body.cureDays ? parseInt(req.body.cureDays, 10) : undefined;
    const fineAmount     = req.body.fineAmount ? parseFloat(req.body.fineAmount) : undefined;

    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    if (!['PASS', 'PASS_WITH_CONDITIONS', 'FAIL'].includes(verdict)) {
      return res.status(400).json({ ok: false, error: 'verdict must be PASS, PASS_WITH_CONDITIONS, or FAIL' });
    }
    if (verdict === 'FAIL' && !fineAmount) {
      return res.status(400).json({ ok: false, error: 'fineAmount required for FAIL verdict' });
    }
    if (verdict === 'PASS_WITH_CONDITIONS' && (!cureDays || cureDays < 1)) {
      return res.status(400).json({ ok: false, error: 'cureDays (>0) required for PASS_WITH_CONDITIONS' });
    }

    try {
      const result = await recordVerdict({
        auditId, workspaceId, auditorId, verdict,
        conditionsText,
        cureDays,
        fineAmount,
        violationPdfBuffer: req.file?.buffer,
        violationPdfMime:   req.file?.mimetype,
      });

      // Start cure period timer if PASS_WITH_CONDITIONS
      if (verdict === 'PASS_WITH_CONDITIONS' && cureDays) {
        try {
          await startCurePeriod({
            auditId, workspaceId,
            conditionsText: conditionsText ?? '',
            cureDays,
            setByAuditorId: auditorId,
          });
        } catch (err: unknown) {
          log.warn('[AuditSuite] Cure period start failed (non-fatal):', err?.message);
        }
      }

      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      log.error('[AuditSuite] verdict error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Get citation for an audit
auditSuiteRouter.get(
  '/audits/:auditId/citation',
  requireEitherAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = (req.workspaceId ?? req.query.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    try {
      const citation = await getCitationForAudit(auditId, workspaceId);
      res.json({ ok: true, citation });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Owner uploads payment proof (money order + certified mail tracking)
auditSuiteRouter.post(
  '/citations/:citationId/payment-proof',
  requireUserAuth,
  upload.single('moneyOrder'),
  async (req: any, res) => {
    const { citationId } = req.params;
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const result = await submitPaymentProof({
        citationId,
        workspaceId,
        submittedByUserId:    getUserOrAuditorId(req),
        moneyOrderBuffer:     req.file?.buffer,
        moneyOrderMime:       req.file?.mimetype,
        certifiedMailTracking: req.body.certifiedMailTracking,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      log.error('[AuditSuite] payment-proof error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Historical audit ledger for a workspace (past verdicts + citations)
auditSuiteRouter.get(
  '/:workspaceId/ledger',
  requireUserAuth,
  async (req: any, res) => {
    const { workspaceId } = req.params;
    const callerWorkspaceId = req.workspaceId;
    if (callerWorkspaceId && callerWorkspaceId !== workspaceId) {
      return res.status(403).json({ ok: false, error: 'Cross-workspace access denied' });
    }
    try {
      const ledger = await getAuditHistoricalLedger(workspaceId);
      res.json({ ok: true, ledger });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════
// PHASE 6 — Cure Period
// ═══════════════════════════════════════════════════════════════════

// Live cure-period countdown + reminder state
auditSuiteRouter.get(
  '/audits/:auditId/cure-status',
  requireEitherAuth,
  async (req: any, res) => {
    const { auditId } = req.params;
    const workspaceId = (req.workspaceId ?? req.query.workspaceId) as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });
    try {
      const status = await getCureStatus(auditId, workspaceId);
      res.json({ ok: true, cureStatus: status });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);

// Owner uploads corrections for Trinity verification
auditSuiteRouter.post(
  '/audits/:auditId/upload-corrections',
  requireUserAuth,
  upload.single('corrections'),
  async (req: any, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: 'No corrections file uploaded' });

    const { auditId } = req.params;
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId required' });

    try {
      const result = await verifyCureCorrections({
        auditId, workspaceId,
        submittedByUserId:  getUserOrAuditorId(req),
        correctionsBuffer:  file.buffer,
        correctionsMime:    file.mimetype,
      });
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      log.error('[AuditSuite] upload-corrections error:', err?.message);
      res.status(500).json({ ok: false, error: err?.message });
    }
  },
);
