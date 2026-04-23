/**
 * SPS 10-Step Employee Onboarding Routes — /api/sps/forms
 *
 * WHITE-LABEL (TRINITY.md §6): no hardcoded company names. All tenant-facing
 * content reads from the workspace record.
 *
 * Endpoints:
 *   POST   /api/sps/forms/create              — start new onboarding session
 *   GET    /api/sps/forms/:id                 — fetch session + all 10 form data
 *   PUT    /api/sps/forms/:id/save-draft      — UPSERT form data (silent, no validation)
 *   POST   /api/sps/forms/:id/save            — alias for save-draft (compat)
 *   POST   /api/sps/forms/:id/submit-step/:step — validate + advance step
 *   POST   /api/sps/forms/:id/finalize        — generate PDF, create employee/trinity records
 *   POST   /api/sps/forms/:id/set-rate        — owner/co_owner sets hourly rate
 *   POST   /api/sps/forms/:id/grant-trinity   — manager+ enables trinity access
 *   POST   /api/sps/forms/upload              — upload credential/check image to GCS
 */
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  spsOnboarding,
  spsForm1Checklist, spsForm2OfferLetter, spsForm3W4, spsForm4I9,
  spsForm5DirectDeposit, spsForm6HandbookAck, spsForm7AtWill,
  spsForm8Uniform, spsForm9SecurityPolicy, spsForm10Credentials,
  spsEmployeeBankSetup, spsEmployeeTrinityAccess, spsOnboardingAuditLog,
} from '@shared/schema/domains/sps';
import { createLogger } from '../lib/logger';
const log = createLogger('SpsFormsRoutes');

export const spsFormsRouter = Router();

// Lightweight readiness endpoint for onboarding route smoke checks
spsFormsRouter.get('/status', (_req, res) => {
  return res.status(200).json({ ok: true, route: 'sps_onboarding', status: 'ready' });
});

// ── Multer: memory storage, 5 MB limit, images only ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are accepted'));
    }
    cb(null, true);
  },
});

// ── Encryption helpers (AES-256-CBC) ─────────────────────────────────────────
const ENC_KEY = process.env.FIELD_ENCRYPTION_KEY || 'changeme-32-byte-key-placeholder!'; // 32 chars
function encrypt(plain: string): string {
  const key = Buffer.from(ENC_KEY.slice(0, 32).padEnd(32, '0'));
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}
function decrypt(ciphertext: string): string {
  try {
    const [ivHex, encHex] = ciphertext.split(':');
    const key = Buffer.from(ENC_KEY.slice(0, 32).padEnd(32, '0'));
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '****';
  }
}

// ── Workspace resolver ────────────────────────────────────────────────────────
function resolveWorkspace(req: any): string | null {
  return req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId || null;
}

// ── Audit logger ─────────────────────────────────────────────────────────────
async function audit(
  onboardingId: string, workspaceId: string,
  action: string, actorId?: string, step?: number, details?: any,
) {
  try {
    await db.insert(spsOnboardingAuditLog).values({
      id: randomUUID(), onboardingId, workspaceId, action,
      step: step ?? null, actorId: actorId ?? null, details: details ?? {},
    });
  } catch (err) {
    log.warn(`[SpsForms] audit log write failed: ${(err as Error).message}`);
  }
}

// ── Form-table map: step → Drizzle table ─────────────────────────────────────
const FORM_TABLES: Record<number, any> = {
  1: spsForm1Checklist,
  2: spsForm2OfferLetter,
  3: spsForm3W4,
  4: spsForm4I9,
  5: spsForm5DirectDeposit,
  6: spsForm6HandbookAck,
  7: spsForm7AtWill,
  8: spsForm8Uniform,
  9: spsForm9SecurityPolicy,
  10: spsForm10Credentials,
};

// ── Step validators ───────────────────────────────────────────────────────────
type ValidationError = { field: string; message: string };

function validateStep(step: number, data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];
  const req = (field: string, label: string) => {
    if (!data[field] || String(data[field]).trim() === '') {
      errors.push({ field, message: `${label} is required` });
    }
  };
  switch (step) {
    case 1:
      req('full_legal_name', 'Full legal name');
      req('date_of_birth', 'Date of birth');
      req('hire_date', 'Hire date');
      req('position', 'Position');
      req('work_address', 'Work address');
      break;
    case 2:
      req('position_offered', 'Position offered');
      req('start_date', 'Start date');
      if (!data['salary_hourly_rate'] || Number(data['salary_hourly_rate']) <= 0) {
        errors.push({ field: 'salary_hourly_rate', message: 'Salary/hourly rate must be greater than 0' });
      }
      req('employee_signature', 'Employee signature');
      req('employer_signature', 'Employer signature');
      break;
    case 3:
      req('ssn', 'SSN');
      req('filing_status', 'Filing status');
      req('employee_signature', 'Employee signature');
      break;
    case 4:
      if (!data['email'] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data['email'])) {
        errors.push({ field: 'email', message: 'Valid email address is required' });
      }
      req('citizenship_status', 'Citizenship status');
      req('document_type', 'Document type');
      break;
    case 5:
      if (!data['routing_number'] || !/^\d{9}$/.test(String(data['routing_number']))) {
        errors.push({ field: 'routing_number', message: 'Routing number must be exactly 9 digits' });
      }
      if (!data['account_number'] || !/^\d+$/.test(String(data['account_number']))) {
        errors.push({ field: 'account_number', message: 'Account number must be numeric' });
      }
      req('account_type', 'Account type');
      req('employee_signature', 'Employee signature');
      break;
    case 6:
      for (let i = 1; i <= 5; i++) {
        if (!data[`ack${i}`]) errors.push({ field: `ack${i}`, message: `Acknowledgment ${i} must be accepted` });
      }
      req('employee_signature', 'Employee signature');
      break;
    case 7:
      req('employee_signature', 'Employee signature');
      req('employer_signature', 'Employer signature');
      req('employee_signed_at', 'Employee signature date');
      req('employer_signed_at', 'Employer signature date');
      break;
    case 8:
      req('uniform_shirt_size', 'Uniform shirt size');
      if (!data['deduction_ack1']) errors.push({ field: 'deduction_ack1', message: 'Uniform deduction acknowledgment 1 must be accepted' });
      if (!data['deduction_ack2']) errors.push({ field: 'deduction_ack2', message: 'Uniform deduction acknowledgment 2 must be accepted' });
      req('employee_signature', 'Employee signature');
      break;
    case 9:
      for (let i = 1; i <= 3; i++) {
        if (!data[`ack${i}`]) errors.push({ field: `ack${i}`, message: `Acknowledgment ${i} must be accepted` });
      }
      req('employee_signature', 'Employee signature');
      break;
    case 10:
      const credFields = ['drivers_license_front_url', 'drivers_license_back_url', 'guard_card_front_url', 'guard_card_back_url', 'ssn_front_url'];
      for (const f of credFields) {
        if (!data[f] || String(data[f]).trim() === '') {
          errors.push({ field: f, message: `${f.replace(/_url$/, '').replace(/_/g, ' ')} image is required` });
        }
      }
      break;
  }
  return errors;
}

// ── Map raw request body to Drizzle column names ──────────────────────────────
function mapFormData(step: number, data: Record<string, any>): Record<string, any> {
  switch (step) {
    case 1:
      return {
        fullLegalName: data.full_legal_name,
        dateOfBirth: data.date_of_birth,
        hireDate: data.hire_date,
        position: data.position,
        workAddress: data.work_address,
        phone: data.phone,
      };
    case 2:
      return {
        positionOffered: data.position_offered,
        startDate: data.start_date,
        salaryHourlyRate: data.salary_hourly_rate,
        employeeSignature: data.employee_signature,
        employerSignature: data.employer_signature,
        employeeSignedAt: data.employee_signed_at ? new Date(data.employee_signed_at) : null,
        employerSignedAt: data.employer_signed_at ? new Date(data.employer_signed_at) : null,
      };
    case 3: {
      const ssn = data.ssn ? String(data.ssn).replace(/\D/g, '') : '';
      return {
        ssnMasked: ssn.length >= 4 ? `XXX-XX-${ssn.slice(-4)}` : null,
        ssnEncrypted: ssn ? encrypt(ssn) : null,
        filingStatus: data.filing_status,
        multipleJobs: !!data.multiple_jobs,
        dependentsAmount: data.dependents_amount ?? null,
        otherIncome: data.other_income ?? null,
        extraWithholding: data.extra_withholding ?? null,
        employeeSignature: data.employee_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    }
    case 4:
      return {
        email: data.email,
        phone: data.phone,
        citizenshipStatus: data.citizenship_status,
        documentType: data.document_type,
        documentNumber: data.document_number,
        documentExpiry: data.document_expiry,
        employeeSignature: data.employee_signature,
        employerSignature: data.employer_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    case 5: {
      const acctRaw = data.account_number ? String(data.account_number) : '';
      return {
        bankName: data.bank_name,
        routingNumber: data.routing_number,
        accountNumberEncrypted: acctRaw ? encrypt(acctRaw) : null,
        accountNumberMasked: acctRaw.length >= 4 ? `****${acctRaw.slice(-4)}` : null,
        accountType: data.account_type,
        voidedCheckImageUrl: data.voided_check_image_url,
        employeeSignature: data.employee_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    }
    case 6:
      return {
        ack1: !!data.ack1, ack2: !!data.ack2, ack3: !!data.ack3,
        ack4: !!data.ack4, ack5: !!data.ack5,
        employeeSignature: data.employee_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    case 7:
      return {
        employeeSignature: data.employee_signature,
        employerSignature: data.employer_signature,
        employeeSignedAt: data.employee_signed_at ? new Date(data.employee_signed_at) : null,
        employerSignedAt: data.employer_signed_at ? new Date(data.employer_signed_at) : null,
      };
    case 8:
      return {
        uniformShirtSize: data.uniform_shirt_size,
        uniformPantsSize: data.uniform_pants_size,
        deductionAck1: !!data.deduction_ack1,
        deductionAck2: !!data.deduction_ack2,
        employeeSignature: data.employee_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    case 9:
      return {
        ack1: !!data.ack1, ack2: !!data.ack2, ack3: !!data.ack3,
        employeeSignature: data.employee_signature,
        signedAt: data.signed_at ? new Date(data.signed_at) : null,
      };
    case 10:
      return {
        driversLicenseFrontUrl: data.drivers_license_front_url,
        driversLicenseBackUrl: data.drivers_license_back_url,
        guardCardFrontUrl: data.guard_card_front_url,
        guardCardBackUrl: data.guard_card_back_url,
        ssnFrontUrl: data.ssn_front_url,
      };
    default:
      return {};
  }
}

// ── Upsert form row helper ────────────────────────────────────────────────────
async function upsertFormRow(step: number, onboardingId: string, workspaceId: string, data: Record<string, any>) {
  const table = FORM_TABLES[step];
  if (!table) return;
  const mapped = { ...mapFormData(step, data), updatedAt: new Date() };
  const [existing] = await db.select({ id: table.id })
    .from(table)
    .where(eq(table.onboardingId, onboardingId));
  if (existing) {
    await db.update(table).set(mapped).where(eq(table.onboardingId, onboardingId));
  } else {
    await db.insert(table).values({ id: randomUUID(), onboardingId, workspaceId, ...mapped });
  }
}

// ── POST /create ──────────────────────────────────────────────────────────────
spsFormsRouter.post('/create', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const id = randomUUID();
    await db.insert(spsOnboarding).values({
      id, workspaceId,
      status: 'in_progress',
      currentStep: 1,
      completedSteps: [],
    });
    await audit(id, workspaceId, 'session_created', req.user?.id);
    return res.status(201).json({ onboarding_id: id, id, current_step: 1, status: 'in_progress' });
  } catch (err) {
    log.error(`[SpsForms] create error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to create onboarding session' });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
spsFormsRouter.get('/:id', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const [session] = await db.select().from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    const fetchForm = async (table: any) => {
      const rows = await db.select().from(table).where(eq(table.onboardingId, session.id));
      return rows[0] ?? null;
    };

    const [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10] = await Promise.all([
      fetchForm(spsForm1Checklist), fetchForm(spsForm2OfferLetter), fetchForm(spsForm3W4),
      fetchForm(spsForm4I9), fetchForm(spsForm5DirectDeposit), fetchForm(spsForm6HandbookAck),
      fetchForm(spsForm7AtWill), fetchForm(spsForm8Uniform), fetchForm(spsForm9SecurityPolicy),
      fetchForm(spsForm10Credentials),
    ]);

    // Mask SSN on read — never expose encrypted ciphertext to client
    const safeF3 = f3 ? { ...f3, ssnEncrypted: undefined } : null;
    // Mask account number on read
    const safeF5 = f5 ? { ...f5, accountNumberEncrypted: undefined } : null;

    return res.json({
      ...session,
      form1: f1, form2: f2, form3: safeF3, form4: f4,
      form5: safeF5, form6: f6, form7: f7, form8: f8,
      form9: f9, form10: f10,
    });
  } catch (err) {
    log.error(`[SpsForms] get error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to fetch onboarding session' });
  }
});

// ── PUT /:id/save-draft ───────────────────────────────────────────────────────
const saveDraftHandler = async (req: any, res: any) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const [session] = await db.select({ id: spsOnboarding.id, workspaceId: spsOnboarding.workspaceId })
      .from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    const { step, data } = req.body;
    const stepNum = Number(step);
    if (!stepNum || stepNum < 1 || stepNum > 10) return res.status(400).json({ error: 'Invalid step number' });

    await upsertFormRow(stepNum, session.id, workspaceId, data ?? {});
    await db.update(spsOnboarding)
      .set({ updatedAt: new Date() })
      .where(eq(spsOnboarding.id, session.id));

    return res.json({ success: true });
  } catch (err) {
    log.error(`[SpsForms] save-draft error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to save draft' });
  }
};

spsFormsRouter.put('/:id/save-draft', saveDraftHandler);
// Backward-compatible alias expected by older SPS clients/integration tests.
spsFormsRouter.post('/:id/save', saveDraftHandler);

// ── POST /:id/submit-step/:step ───────────────────────────────────────────────
spsFormsRouter.post('/:id/submit-step/:step', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const stepNum = Number(req.params.step);
    if (!stepNum || stepNum < 1 || stepNum > 10) return res.status(400).json({ error: 'Invalid step number' });

    const [session] = await db.select().from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    const data = req.body.data ?? req.body;
    const errors = validateStep(stepNum, data);
    if (errors.length > 0) return res.json({ success: false, errors, nextStep: stepNum, completedSteps: session.completedSteps });

    await upsertFormRow(stepNum, session.id, workspaceId, data);

    const completed = Array.from(new Set([...((session.completedSteps as number[]) ?? []), stepNum]));
    const nextStep = stepNum < 10 ? stepNum + 1 : stepNum;
    await db.update(spsOnboarding)
      .set({ currentStep: nextStep, completedSteps: completed, updatedAt: new Date() })
      .where(eq(spsOnboarding.id, session.id));

    await audit(session.id, workspaceId, 'step_submitted', req.user?.id, stepNum);
    return res.json({ success: true, errors: [], nextStep, completedSteps: completed });
  } catch (err) {
    log.error(`[SpsForms] submit-step error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to submit step' });
  }
});

// ── POST /:id/finalize ────────────────────────────────────────────────────────
spsFormsRouter.post('/:id/finalize', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const [session] = await db.select().from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    // Collect all form data for PDF
    const fetchForm = async (table: any) => {
      const rows = await db.select().from(table).where(eq(table.onboardingId, session.id));
      return rows[0] ?? null;
    };
    const [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10] = await Promise.all([
      fetchForm(spsForm1Checklist), fetchForm(spsForm2OfferLetter), fetchForm(spsForm3W4),
      fetchForm(spsForm4I9), fetchForm(spsForm5DirectDeposit), fetchForm(spsForm6HandbookAck),
      fetchForm(spsForm7AtWill), fetchForm(spsForm8Uniform), fetchForm(spsForm9SecurityPolicy),
      fetchForm(spsForm10Credentials),
    ]);

    // Generate PDF
    let pdfUrl = '';
    try {
      const { generateSpsOnboardingPdf } = await import('../services/onboarding/spsFormsPdfService');
      pdfUrl = await generateSpsOnboardingPdf({
        session, workspaceId, forms: { f1, f2, f3, f4, f5, f6, f7, f8, f9, f10 },
      });
    } catch (pdfErr) {
      log.warn(`[SpsForms] PDF generation failed (non-fatal): ${(pdfErr as Error).message}`);
    }

    // Create Trinity access record (blocked until rate is set)
    const existingTrinity = await db.select({ id: spsEmployeeTrinityAccess.id })
      .from(spsEmployeeTrinityAccess)
      .where(and(
        eq(spsEmployeeTrinityAccess.workspaceId, workspaceId),
        eq(spsEmployeeTrinityAccess.employeeId, session.id),
      ));
    if (existingTrinity.length === 0) {
      await db.insert(spsEmployeeTrinityAccess).values({
        id: randomUUID(),
        workspaceId,
        employeeId: session.id,
        trinityEnabled: false,
        contactEmail: f4?.email ?? null,
        contactPhone: f4?.phone ?? null,
        workAddress: f1?.workAddress ?? null,
      });
    }

    // Store bank setup
    if (f5) {
      const existingBank = await db.select({ id: spsEmployeeBankSetup.id })
        .from(spsEmployeeBankSetup)
        .where(and(
          eq(spsEmployeeBankSetup.workspaceId, workspaceId),
          eq(spsEmployeeBankSetup.employeeId, session.id),
        ));
      if (existingBank.length === 0) {
        await db.insert(spsEmployeeBankSetup).values({
          id: randomUUID(),
          workspaceId,
          employeeId: session.id,
          bankName: f5.bankName,
          routingNumber: f5.routingNumber,
          accountNumberEncrypted: f5.accountNumberEncrypted,
          accountNumberMasked: f5.accountNumberMasked,
          accountType: f5.accountType,
          voidedCheckImageUrl: f5.voidedCheckImageUrl,
        });
      }
    }

    await db.update(spsOnboarding)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(spsOnboarding.id, session.id));

    await audit(session.id, workspaceId, 'finalized', req.user?.id, undefined, { pdfUrl });
    return res.json({ success: true, pdf_url: pdfUrl });
  } catch (err) {
    log.error(`[SpsForms] finalize error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to finalize onboarding' });
  }
});

// ── POST /:id/set-rate ────────────────────────────────────────────────────────
spsFormsRouter.post('/:id/set-rate', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const role = req.workspaceRole || req.user?.role;
    if (!['owner', 'co_owner'].includes(role ?? '')) {
      return res.status(403).json({ error: 'Only workspace owners can set hourly rates' });
    }

    const [session] = await db.select().from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    const rate = Number(req.body.hourly_rate);
    if (!rate || rate <= 0) return res.status(400).json({ error: 'hourly_rate must be greater than 0' });

    const visibleUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now

    await db.update(spsEmployeeTrinityAccess)
      .set({
        hourlyRate: String(rate),
        trinityEnabled: true,
        rateSetAt: new Date(),
        rateSetById: req.user?.id ?? null,
        visibleUntil,
        updatedAt: new Date(),
      })
      .where(and(
        eq(spsEmployeeTrinityAccess.workspaceId, workspaceId),
        eq(spsEmployeeTrinityAccess.employeeId, session.id),
      ));

    await audit(session.id, workspaceId, 'rate_set', req.user?.id, undefined, { rate, visibleUntil });
    return res.json({ success: true, visible_until: visibleUntil.toISOString() });
  } catch (err) {
    log.error(`[SpsForms] set-rate error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to set hourly rate' });
  }
});

// ── POST /:id/grant-trinity ───────────────────────────────────────────────────
spsFormsRouter.post('/:id/grant-trinity', async (req, res) => {
  try {
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const role = req.workspaceRole || req.user?.role;
    const allowed = ['owner', 'co_owner', 'manager', 'admin'];
    if (!allowed.includes(role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions to grant Trinity access' });
    }

    const [session] = await db.select().from(spsOnboarding)
      .where(and(eq(spsOnboarding.id, req.params.id), eq(spsOnboarding.workspaceId, workspaceId)));
    if (!session) return res.status(403).json({ error: 'Not found or access denied' });

    await db.update(spsEmployeeTrinityAccess)
      .set({ trinityEnabled: true, updatedAt: new Date() })
      .where(and(
        eq(spsEmployeeTrinityAccess.workspaceId, workspaceId),
        eq(spsEmployeeTrinityAccess.employeeId, session.id),
      ));

    await audit(session.id, workspaceId, 'trinity_granted', req.user?.id);
    return res.json({ success: true });
  } catch (err) {
    log.error(`[SpsForms] grant-trinity error: ${(err as Error).message}`);
    return res.status(500).json({ error: 'Failed to grant Trinity access' });
  }
});

// ── POST /upload — credential/check image to GCS ─────────────────────────────
spsFormsRouter.post('/upload', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workspaceId = resolveWorkspace(req);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const objectPath = `objects/sps-forms/${workspaceId}/${randomUUID()}.${ext}`;

    const { uploadFileToObjectStorage } = await import('../objectStorage');
    await uploadFileToObjectStorage({
      objectPath,
      buffer: req.file.buffer,
      workspaceId,
      storageCategory: 'documents',
      metadata: { contentType: req.file.mimetype },
    });

    // Build signed 1-year URL
    const { objectStorageClient } = await import('../objectStorage');
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) throw new Error('Bucket not configured');
    const pathParts = objectPath.startsWith('/') ? objectPath.slice(1).split('/') : objectPath.split('/');
    const objectName = pathParts.slice(1).join('/');
    const [signedUrl] = await objectStorageClient.bucket(bucketId).file(objectName).getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    return res.json({ url: signedUrl, path: objectPath });
  } catch (err) {
    log.error(`[SpsForms] upload error: ${(err as Error).message}`);
    // Distinguish multer file-type/size errors vs server errors
    if ((err as Error).message?.includes('image') || (err as Error).message?.includes('limit')) {
      return res.status(400).json({ error: (err as Error).message });
    }
    return res.status(500).json({ error: 'Upload failed' });
  }
});
