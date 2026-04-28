/**
 * Intelligent Onboarding Progress System API
 * Trinity-guided onboarding for tenants (company setup) and employees (officer onboarding)
 *
 * Tenant Routes:
 *   GET    /api/smart-onboarding/tenant                          — tenant progress + stats
 *   GET    /api/smart-onboarding/tenant/steps                   — all 12 tenant steps
 *   POST   /api/smart-onboarding/tenant/steps/:stepKey/complete — mark step complete
 *
 * Employee Routes:
 *   GET    /api/smart-onboarding/employees                       — all employees with % (manager)
 *   GET    /api/smart-onboarding/employee/:employeeId            — employee progress
 *   POST   /api/smart-onboarding/employee/:employeeId/steps/:stepKey/complete
 *   POST   /api/smart-onboarding/employee/:employeeId/steps/:stepKey/submit — submit doc/sig
 *   GET    /api/smart-onboarding/steps/employee                  — all 15 employee step definitions
 *
 * Document Routes:
 *   GET    /api/smart-onboarding/documents/:entityId             — all docs for entity
 *   GET    /api/smart-onboarding/document/:docId                 — single doc with content
 *   POST   /api/smart-onboarding/documents                       — create/upload document
 *   GET    /api/smart-onboarding/document/:docId/view            — render HTML document
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { complianceAlerts, employees, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';
import crypto from 'crypto';
import { format } from 'date-fns';
import { employeeDocumentOnboardingService } from '../services/employeeDocumentOnboardingService';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('IntelligentOnboardingRoutes');


export const intelligentOnboardingRouter = Router();
intelligentOnboardingRouter.use(requireAuth);

function getWorkspaceId(req: any): string | null {
  return req.session?.workspaceId || null;
}

// Convenience wrapper — uses raw pg driver for $1, $2 … parameterized queries
async function query(sql: string, params?: any[]): Promise<any[]> {
  const result = await (db.$client as any).query(sql, params);
  return result.rows || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: recalculate + persist tenant progress
// ─────────────────────────────────────────────────────────────────────────────
async function recalcTenantProgress(workspaceId: string) {
  const stepRows = await query(
    `SELECT step_key, required FROM tenant_onboarding_steps ORDER BY step_number`
  );
  const progRows = await query(
    `SELECT steps_completed FROM tenant_onboarding_progress WHERE workspace_id = $1`,
    [workspaceId]
  );
  const progRow = progRows[0];

  const completed: string[] = progRow?.steps_completed || [];
  const required = stepRows.filter((s: any) => s.required);
  const completedRequired = required.filter((s: any) => completed.includes(s.step_key));
  const pct = required.length > 0 ? Math.round((completedRequired.length / required.length) * 100) : 0;

  const remaining = stepRows.map((s: any) => s.step_key).filter((k: string) => !completed.includes(k));
  const currentStep = remaining[0] || null;
  const status = pct === 0 ? 'not_started' : pct === 100 ? 'complete' : 'in_progress';

  await query(
    `UPDATE tenant_onboarding_progress
     SET overall_progress_pct = $1,
         status = $2,
         current_step = $3,
         steps_remaining = $4::jsonb,
         last_updated_at = now()
     WHERE workspace_id = $5`,
    [pct, status, currentStep, JSON.stringify(remaining), workspaceId]
  );
  return pct;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: recalculate + persist employee progress
// ─────────────────────────────────────────────────────────────────────────────
async function recalcEmployeeProgress(workspaceId: string, employeeId: string) {
  const stepRows = await query(
    `SELECT step_key, required FROM employee_onboarding_steps ORDER BY step_number`
  );
  const progRows = await query(
    `SELECT steps_completed FROM employee_onboarding_progress WHERE workspace_id = $1 AND employee_id = $2`,
    [workspaceId, employeeId]
  );
  const progRow = progRows[0];

  const completed: string[] = progRow?.steps_completed || [];
  const required = stepRows.filter((s: any) => s.required);
  const completedRequired = required.filter((s: any) => completed.includes(s.step_key));
  const pct = required.length > 0 ? Math.round((completedRequired.length / required.length) * 100) : 0;

  const remaining = stepRows.map((s: any) => s.step_key).filter((k: string) => !completed.includes(k));
  const status = pct === 0 ? 'invited' : pct === 100 ? 'complete' : 'in_progress';

  await query(
    `UPDATE employee_onboarding_progress
     SET overall_progress_pct = $1,
         status = $2,
         steps_remaining = $3::jsonb,
         completed_at = CASE WHEN $4 = 'complete' THEN now() ELSE completed_at END,
         last_updated_at = now()
     WHERE workspace_id = $5 AND employee_id = $6`,
    [pct, status, JSON.stringify(remaining), status, workspaceId, employeeId]
  );
  return pct;
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/tenant', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  try {
    let progRows = await query(
      `SELECT * FROM tenant_onboarding_progress WHERE workspace_id = $1`,
      [workspaceId]
    );
    let progress = progRows[0];

    if (!progress) {
      await query(
        `INSERT INTO tenant_onboarding_progress
           (workspace_id, overall_progress_pct, status, steps_completed, steps_remaining, trinity_welcome_sent, last_updated_at)
         VALUES ($1, 0, 'not_started', '[]', '[]', false, now())
         ON CONFLICT (workspace_id) DO NOTHING`,
        [workspaceId]
      );
      progRows = await query(
        `SELECT * FROM tenant_onboarding_progress WHERE workspace_id = $1`,
        [workspaceId]
      );
      progress = progRows[0];
    }

    const steps = await query(`SELECT * FROM tenant_onboarding_steps ORDER BY step_number`);
    res.json({ success: true, progress, steps });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] tenant GET error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

intelligentOnboardingRouter.get('/tenant/steps', async (req: any, res) => {
  try {
    const steps = await query(`SELECT * FROM tenant_onboarding_steps ORDER BY step_number`);
    res.json({ success: true, steps });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

intelligentOnboardingRouter.post('/tenant/steps/:stepKey/complete', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { stepKey } = req.params;
  try {
    // Phase 2: only org owners, co-owners, and admins can advance setup wizard steps
    const { resolveWorkspaceForUser } = await import('../rbac');
    const { role, error: rbacErr } = await resolveWorkspaceForUser(userId);
    if (rbacErr || !['org_owner', 'co_owner', 'org_admin'].includes(role || '')) {
      return res.status(403).json({ error: 'Only organization owners and admins can complete setup steps' });
    }
    const existing = await query(
      `SELECT steps_completed FROM tenant_onboarding_progress WHERE workspace_id = $1`,
      [workspaceId]
    );
    if (!existing[0]) {
      await query(
        `INSERT INTO tenant_onboarding_progress
           (workspace_id, steps_completed, steps_remaining, status, last_updated_at)
         VALUES ($1, '[]', '[]', 'in_progress', now())
         ON CONFLICT (workspace_id) DO NOTHING`,
        [workspaceId]
      );
    }

    const stepJson = JSON.stringify([stepKey]);
    await query(
      `UPDATE tenant_onboarding_progress
       SET steps_completed = CASE
         WHEN NOT (steps_completed @> $1::jsonb) THEN steps_completed || $1::jsonb
         ELSE steps_completed
       END,
       status = 'in_progress',
       last_updated_at = now()
       WHERE workspace_id = $2`,
      [stepJson, workspaceId]
    );

    const flagMap: Record<string, string> = {
      company_profile: 'company_profile_complete',
      company_license: 'company_documents_complete',
      certificate_of_insurance: 'company_documents_complete',
      billing_setup: 'billing_setup_complete',
      first_client: 'first_client_added',
      first_officer: 'first_officer_added',
      historical_import: 'data_import_complete',
      first_schedule: 'first_schedule_published',
      compliance_verification: 'compliance_setup_complete',
    };
    if (flagMap[stepKey]) {
      await query(
        `UPDATE tenant_onboarding_progress SET ${flagMap[stepKey]} = true WHERE workspace_id = $1`,
        [workspaceId]
      );
    }

    const pct = await recalcTenantProgress(workspaceId);
    res.json({ success: true, newProgressPct: pct, stepCompleted: stepKey });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] tenant step complete error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE STEP DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/steps/employee', async (req: any, res) => {
  try {
    const steps = await query(`SELECT * FROM employee_onboarding_steps ORDER BY step_number`);
    res.json({ success: true, steps });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

intelligentOnboardingRouter.get('/required-documents', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const empRows = await query(
      `SELECT id
       FROM employees
       WHERE user_id = $1 AND workspace_id = $2
       LIMIT 1`,
      [userId, workspaceId]
    );
    const emp = empRows[0];
    if (!emp) return res.json([]);

    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(emp.id);
    if (!status) return res.json([]);

    const result = status.requirements.map((item) => ({
      id: item.requirement.id,
      displayName: item.requirement.name || item.requirement.documentType,
      category: item.requirement.category,
      required: true,
      status: item.status === 'approved' ? 'approved' : 'pending',
      uploadRoute: `/onboarding-forms?step=${item.requirement.id}`,
    }));

    res.json(result);
  } catch (err: unknown) {
    log.error('[SmartOnboarding] required-documents error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE MANAGER VIEW
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/employees', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  try {
    const rows = await query(
      `SELECT
         e.id, e.first_name, e.last_name, e.position, e.email, e.onboarding_status,
         p.overall_progress_pct, p.status as onboarding_progress_status,
         p.steps_completed, p.steps_remaining,
         p.completed_at, p.last_updated_at,
         p.photo_uploaded, p.guard_card_uploaded, p.i9_complete,
         p.employee_handbook_signed, p.background_check_authorized,
         (SELECT COUNT(*) FROM onboarding_documents od
          WHERE od.entity_id = e.id AND od.workspace_id = $1) as doc_count
       FROM employees e
       LEFT JOIN employee_onboarding_progress p
         ON p.employee_id = e.id AND p.workspace_id = $1
       WHERE e.workspace_id = $1
       ORDER BY p.overall_progress_pct DESC NULLS LAST, e.first_name`,
      [workspaceId]
    );
    res.json({ success: true, employees: rows });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] employees list error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE EMPLOYEE PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/employee/:employeeId', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { employeeId } = req.params;
  try {
    let progRows = await query(
      `SELECT * FROM employee_onboarding_progress WHERE workspace_id = $1 AND employee_id = $2`,
      [workspaceId, employeeId]
    );
    let progress = progRows[0];

    if (!progress) {
      await query(
        `INSERT INTO employee_onboarding_progress
           (workspace_id, employee_id, overall_progress_pct, status, steps_completed, steps_remaining, last_updated_at)
         VALUES ($1, $2, 0, 'invited', '[]',
           '["profile_photo","government_id","guard_card","ssn_card","employment_application","i9_verification","tax_withholding","direct_deposit","background_check","drug_free_policy","handbook_acknowledgment","sop_acknowledgment","emergency_contact","equipment_issuance","references"]'::jsonb,
           now())
         ON CONFLICT (workspace_id, employee_id) DO NOTHING`,
        [workspaceId, employeeId]
      );
      progRows = await query(
        `SELECT * FROM employee_onboarding_progress WHERE workspace_id = $1 AND employee_id = $2`,
        [workspaceId, employeeId]
      );
      progress = progRows[0];
    }

    const empRows = await query(
      `SELECT id, first_name, last_name, position, email FROM employees WHERE id = $1 AND workspace_id = $2`,
      [employeeId, workspaceId]
    );
    const employee = empRows[0];

    const docs = await query(
      `SELECT id, document_type, document_category, title, status, uploaded_at, signed_at, expiration_date, generated_by, sha256_hash
       FROM onboarding_documents WHERE entity_id = $1 AND workspace_id = $2 ORDER BY created_at`,
      [employeeId, workspaceId]
    );

    const steps = await query(`SELECT * FROM employee_onboarding_steps ORDER BY step_number`);

    res.json({ success: true, employee, progress, documents: docs, steps });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] employee GET error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MARK EMPLOYEE STEP COMPLETE
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.post('/employee/:employeeId/steps/:stepKey/complete', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { employeeId, stepKey } = req.params;
  try {
    const stepJson = JSON.stringify([stepKey]);
    await query(
      `INSERT INTO employee_onboarding_progress
         (workspace_id, employee_id, steps_completed, steps_remaining, status, last_updated_at)
       VALUES ($1, $2, $3::jsonb, '[]'::jsonb, 'in_progress', now())
       ON CONFLICT (workspace_id, employee_id) DO UPDATE
       SET steps_completed = CASE
             WHEN NOT (employee_onboarding_progress.steps_completed @> $3::jsonb)
             THEN employee_onboarding_progress.steps_completed || $3::jsonb
             ELSE employee_onboarding_progress.steps_completed
           END,
           status = 'in_progress',
           last_updated_at = now()`,
      [workspaceId, employeeId, stepJson]
    );

    const flagMap: Record<string, string> = {
      profile_photo: 'photo_uploaded',
      government_id: 'state_id_uploaded',
      guard_card: 'guard_card_uploaded',
      ssn_card: 'profile_complete',
      employment_application: 'employment_application_complete',
      i9_verification: 'i9_complete',
      tax_withholding: 'w4_complete',
      direct_deposit: 'direct_deposit_complete',
      background_check: 'background_check_authorized',
      drug_free_policy: 'drug_free_acknowledged',
      handbook_acknowledgment: 'employee_handbook_signed',
      sop_acknowledgment: 'sop_acknowledged',
      emergency_contact: 'emergency_contact_added',
      equipment_issuance: 'equipment_issued',
      references: 'references_submitted',
    };
    if (flagMap[stepKey]) {
      await query(
        `UPDATE employee_onboarding_progress SET ${flagMap[stepKey]} = true WHERE workspace_id = $1 AND employee_id = $2`,
        [workspaceId, employeeId]
      );
    }

    const pct = await recalcEmployeeProgress(workspaceId, employeeId);
    res.json({ success: true, newProgressPct: pct, stepCompleted: stepKey });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] employee step complete error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT STEP (creates document + marks complete)
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.post('/employee/:employeeId/steps/:stepKey/submit', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { employeeId, stepKey } = req.params;
  const { signerName, content, acknowledgmentText, documentTitle, metadata } = req.body;

  try {
    const stepRows = await query(
      `SELECT * FROM employee_onboarding_steps WHERE step_key = $1`,
      [stepKey]
    );
    const step = stepRows[0];
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const empRows = await query(
      `SELECT first_name, last_name FROM employees WHERE id = $1 AND workspace_id = $2`,
      [employeeId, workspaceId]
    );
    const emp = empRows[0];
    const empName = emp ? `${emp.first_name} ${emp.last_name}` : signerName || 'Employee';

    const docContent = content || generateStepDocument(stepKey, empName, signerName, acknowledgmentText);
    const hash = crypto.createHash('sha256').update(docContent).digest('hex');

    const docRows = await query(
      `INSERT INTO onboarding_documents
         (workspace_id, entity_type, entity_id, document_type, document_category,
          title, status, file_type, generated_by, uploaded_at, signed_at, signed_by,
          acknowledged_at, acknowledged_by, acknowledgment_text, sha256_hash, content, metadata)
       VALUES ($1, 'employee', $2, $3, $4, $5, $6, 'pdf', 'system', now(),
         CASE WHEN $7 THEN now() ELSE NULL END,
         CASE WHEN $7 THEN $8 ELSE NULL END,
         CASE WHEN $9 THEN now() ELSE NULL END,
         CASE WHEN $9 THEN $8 ELSE NULL END,
         $10, $11, $12, $13::jsonb)
       RETURNING id`,
      [
        workspaceId, employeeId, step.document_type || stepKey, step.category || 'identity',
        documentTitle || step.title,
        step.signature_required ? 'signed' : 'uploaded',
        step.signature_required, empName,
        step.acknowledgment_required,
        acknowledgmentText || '',
        hash, docContent,
        JSON.stringify(metadata || {}),
      ]
    );
    const docRow = docRows[0];

    const stepJson = JSON.stringify([stepKey]);
    await query(
      `INSERT INTO employee_onboarding_progress
         (workspace_id, employee_id, steps_completed, steps_remaining, status, last_updated_at)
       VALUES ($1, $2, $3::jsonb, '[]'::jsonb, 'in_progress', now())
       ON CONFLICT (workspace_id, employee_id) DO UPDATE
       SET steps_completed = CASE
             WHEN NOT (employee_onboarding_progress.steps_completed @> $3::jsonb)
             THEN employee_onboarding_progress.steps_completed || $3::jsonb
             ELSE employee_onboarding_progress.steps_completed
           END,
           status = 'in_progress',
           last_updated_at = now()`,
      [workspaceId, employeeId, stepJson]
    );

    const pct = await recalcEmployeeProgress(workspaceId, employeeId);

    res.json({
      success: true,
      documentId: docRow?.id,
      newProgressPct: pct,
      stepCompleted: stepKey,
      message: `Step "${step.title}" completed. Progress: ${pct}%`,
    });
  } catch (err: unknown) {
    log.error('[SmartOnboarding] submit step error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/documents/:entityId', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { entityId } = req.params;
  try {
    const rows = await query(
      `SELECT id, document_type, document_category, title, description, status,
              file_type, generated_by, uploaded_at, signed_at, signed_by,
              verified_at, expiration_date, acknowledged_at, version, is_current_version,
              sha256_hash, metadata, entity_type
       FROM onboarding_documents
       WHERE entity_id = $1 AND workspace_id = $2
       ORDER BY created_at`,
      [entityId, workspaceId]
    );
    res.json({ success: true, documents: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

intelligentOnboardingRouter.get('/document/:docId', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { docId } = req.params;
  try {
    const rows = await query(
      `SELECT * FROM onboarding_documents WHERE id = $1 AND workspace_id = $2`,
      [docId, workspaceId]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json({ success: true, document: doc });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// Render document HTML for browser preview
intelligentOnboardingRouter.get('/document/:docId/view', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const { docId } = req.params;
  try {
    const rows = await query(
      `SELECT content, title, status FROM onboarding_documents WHERE id = $1 AND workspace_id = $2`,
      [docId, workspaceId]
    );
    const doc = rows[0];
    if (!doc) {
      return res.status(404).send('<html><body><h2>Document not found</h2></body></html>');
    }
    if (doc.content) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(doc.content);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;text-align:center;color:#333}</style></head><body><h2>${doc.title}</h2><p>Status: ${doc.status}</p><p>Document content is stored externally.</p></body></html>`);
  } catch (err: unknown) {
    res.status(500).send('<html><body><h2>Error loading document</h2></body></html>');
  }
});

intelligentOnboardingRouter.post('/documents', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const {
    entityType, entityId, documentType, documentCategory, title, description,
    content, fileType, generatedBy, expirationDate, metadata,
  } = req.body;

  if (!entityId || !documentType || !title) {
    return res.status(400).json({ error: 'entityId, documentType, and title are required' });
  }
  try {
    const metadataObj = metadata || {};
    if (String(documentType).toLowerCase().includes('guard_card')) {
      const guardCardNumber = req.body.guardCardNumber || metadataObj.guardCardNumber;
      const guardCardExpiry = req.body.guardCardExpiry || metadataObj.guardCardExpiry || expirationDate;

      const validation = validateTxGuardCardNumber(String(guardCardNumber || ''));
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid guard card format',
          detail: validation.message,
          expectedFormat: validation.format,
        });
      }

      if (guardCardExpiry && new Date(guardCardExpiry) < new Date()) {
        await db.insert(complianceAlerts).values({
          workspaceId,
          employeeId: entityId,
          alertType: 'guard_card_expired',
          severity: 'critical',
          title: 'Guard card expired',
          message: `Guard card expired on ${format(new Date(guardCardExpiry), 'MMM d, yyyy')}. Employee cannot be scheduled until renewed.`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const hash = content ? crypto.createHash('sha256').update(content).digest('hex') : null;
    const rows = await query(
      `INSERT INTO onboarding_documents
         (workspace_id, entity_type, entity_id, document_type, document_category,
          title, description, status, file_type, generated_by, uploaded_at,
          sha256_hash, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded', $8, $9, now(), $10, $11, $12::jsonb)
       RETURNING id`,
      [
        workspaceId, entityType || 'employee', entityId, documentType,
        documentCategory || 'identity', title, description || '',
        fileType || 'pdf', generatedBy || 'manager',
        hash, content || '',
        JSON.stringify(metadataObj),
      ]
    );
    const row = rows[0];
    res.json({ success: true, documentId: row?.id });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARD CARD PSB NUMBER VALIDATION (Texas)
// ─────────────────────────────────────────────────────────────────────────────

export function validateTxGuardCardNumber(cardNumber: string): {
  valid: boolean; format: string; message: string
} {
  const pattern = /^[A-Z]-?\d{7,9}$/i;
  const clean = cardNumber.replace(/[-\s]/g, '').toUpperCase();
  const numericOnly = /^\d{7,9}$/.test(clean);
  const valid = pattern.test(clean) || numericOnly;
  return {
    valid,
    format: 'TX PSB: Letter + 7-9 digits (e.g., B12345678)',
    message: valid
      ? 'Format valid — pending expiry check'
      : 'Invalid format — Texas PSB numbers are 7-9 digits',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SELF-SERVICE: REQUIRED DOCUMENTS
// GET /api/smart-onboarding/required-documents — employee portal checklist
// (canonical URL: GET /api/employee-onboarding/required-documents in employeeOnboardingRoutes.ts)
// ─────────────────────────────────────────────────────────────────────────────

intelligentOnboardingRouter.get('/required-documents', async (req: any, res) => {
  const workspaceId = getWorkspaceId(req);
  if (!workspaceId) return res.status(403).json({ error: 'No workspace' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const empRows = await query(
      `SELECT id, position, state, is_armed FROM employees WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId]
    );
    const emp = empRows[0];
    if (!emp) return res.json([]);

    const progRows = await query(
      `SELECT steps_completed, steps_remaining FROM employee_onboarding_progress WHERE employee_id = $1 AND workspace_id = $2 LIMIT 1`,
      [emp.id, workspaceId]
    );
    const prog = progRows[0];
    if (!prog) return res.json([]);

    const completed = new Set<string>(prog.steps_completed || []);
    const required: string[] = prog.steps_remaining || [];

    const stepRows = await query(
      `SELECT step_key, title, document_type FROM employee_onboarding_steps ORDER BY step_number`
    );

    const result = stepRows
      .filter((s: any) => required.includes(s.step_key) || completed.has(s.step_key))
      .map((s: any) => ({
        id: s.step_key,
        displayName: s.title,
        category: s.document_type || 'compliance',
        required: true,
        status: completed.has(s.step_key) ? 'approved' : 'pending',
        uploadRoute: `/onboarding-forms?step=${s.step_key}`,
      }));

    res.json(result);
  } catch (err: unknown) {
    log.error('[SmartOnboarding] required-documents error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE DOCUMENT CONTENT (fallback for new submissions)
// ─────────────────────────────────────────────────────────────────────────────

function generateStepDocument(stepKey: string, empName: string, signerName: string, ackText?: string): string {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const baseStyle = `<style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}.header{background:#003087;color:white;padding:15px;text-align:center;font-weight:bold}.sig{border-top:2px solid #333;padding-top:15px;margin-top:25px}.stamp{background:#d4edda;border:2px solid #0a7c42;padding:10px;text-align:center;color:#0a7c42;font-weight:bold;margin-top:15px;border-radius:4px}</style>`;

  const templates: Record<string, string> = {
    drug_free_policy: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">DRUG-FREE WORKPLACE POLICY ACKNOWLEDGMENT</div><p>I, <strong>${empName}</strong>, acknowledge that I have received, read, and agree to comply with the Drug-Free Workplace Policy as a condition of employment.</p><p>${ackText || 'I understand that any violation may result in immediate termination.'}</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">ACKNOWLEDGED AND SIGNED — ${date}</div></body></html>`,
    handbook_acknowledgment: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">EMPLOYEE HANDBOOK ACKNOWLEDGMENT</div><p>I, <strong>${empName}</strong>, acknowledge receipt of the Employee Handbook and agree to read and comply with its contents.</p><p>${ackText || ''}</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">SIGNED — ${date}</div></body></html>`,
    sop_acknowledgment: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">STANDARD OPERATING PROCEDURES ACKNOWLEDGMENT</div><p>I, <strong>${empName}</strong>, acknowledge that I have reviewed and understood the Standard Operating Procedures and agree to follow them.</p><p>${ackText || ''}</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">SIGNED — ${date}</div></body></html>`,
    background_check: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">BACKGROUND CHECK AUTHORIZATION</div><p>I, <strong>${empName}</strong>, authorize the company to conduct a comprehensive pre-employment background investigation.</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">AUTHORIZED — ${date}</div></body></html>`,
    ssn_acknowledgment: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">SOCIAL SECURITY NUMBER ACKNOWLEDGMENT</div><p>I, <strong>${empName}</strong>, confirm the Social Security Number on file is correct and authorized for my use.</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">ACKNOWLEDGED — ${date}</div></body></html>`,
    employment_application: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">EMPLOYMENT APPLICATION — ${empName}</div><p>This confirms the employment application for <strong>${empName}</strong> has been completed and signed electronically.</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">SUBMITTED — ${date}</div></body></html>`,
    i9: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">FORM I-9 EMPLOYMENT ELIGIBILITY VERIFICATION — ${empName}</div><p>Section 1 has been completed and signed electronically by <strong>${empName}</strong>. This employee attests to being a citizen or authorized worker in the United States.</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">SECTION 1 COMPLETED — ${date}</div></body></html>`,
    w4_or_w9: `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">TAX WITHHOLDING FORM (W-4) — ${empName}</div><p>Employee <strong>${empName}</strong> has completed and signed their Federal Tax Withholding Certificate (W-4) electronically.</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">SIGNED — ${date}</div></body></html>`,
  };

  return templates[stepKey] || `<!DOCTYPE html><html><head>${baseStyle}</head><body><div class="header">ONBOARDING DOCUMENT — ${empName}</div><p>Step: ${stepKey}</p><p>${ackText || 'Document completed.'}</p><div class="sig"><div style="font-style:italic;font-size:18px">${signerName || empName}</div><div style="color:#666;font-size:12px">${date}</div></div><div class="stamp">COMPLETED — ${date}</div></body></html>`;
}
