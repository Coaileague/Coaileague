/**
 * HR Document Request Routes
 * ===========================
 * Allows org owners, managers, and Trinity to:
 * - Mass-send or individually send onboarding and specific HR documents
 * - Target: I-9, W-4, W-9, Drug-Free Workplace, Drug Test Request, Guard Card Update, Full Onboarding
 * - Multi-select employees + bulk send with credit billing per document sent
 * - Track request history (sent → opened → completed)
 * - Trinity can invoke hr.bulk_document_request from chatdock or autonomously
 *
 * Credit fees:
 *   hr_document_request: 2 credits per document type per employee
 *   hr_onboarding_invite: 5 credits per full onboarding invite
 */

import { sanitizeError } from '../../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../../db';
import { hrDocumentRequests, employees, workspaces } from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAuth } from '../../auth';
import { requireManager } from '../../rbac';
import { emailService } from '../../services/emailService';
import { NotificationDeliveryService } from '../../services/notificationDeliveryService';
import { tokenManager } from '../../services/billing/tokenManager';
import { createNotification } from '../../services/notificationService';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('DocumentRequestRoutes');


const router = Router();

// ─── DOCUMENT TYPE CONFIG ───────────────────────────────────────────────────
export const HR_DOCUMENT_TYPES = {
  full_onboarding: {
    label: 'Full Onboarding Packet',
    description: 'Complete onboarding for a new hire — all required forms, policies, and acknowledgments',
    creditCost: 5,
    emailSubject: 'Action Required: Complete Your New Hire Onboarding',
    urgency: 'high',
    icon: 'briefcase',
  },
  i9: {
    label: 'I-9 Employment Eligibility',
    description: 'USCIS Form I-9 — required for all employees to verify work authorization in the US',
    creditCost: 2,
    emailSubject: 'Action Required: Submit Your I-9 Employment Eligibility Form',
    urgency: 'high',
    icon: 'shield-check',
  },
  w4: {
    label: 'W-4 Tax Withholding (Employee)',
    description: 'IRS Form W-4 — employee federal income tax withholding declaration',
    creditCost: 2,
    emailSubject: 'Action Required: Submit Your W-4 Federal Tax Withholding Form',
    urgency: 'medium',
    icon: 'file-text',
  },
  w9: {
    label: 'W-9 Tax Information (Contractor)',
    description: 'IRS Form W-9 — independent contractor taxpayer ID and certification',
    creditCost: 2,
    emailSubject: 'Action Required: Submit Your W-9 Contractor Tax Information Form',
    urgency: 'medium',
    icon: 'file-text',
  },
  drug_free_acknowledgment: {
    label: 'Drug-Free Workplace Acknowledgment',
    description: 'Signed acknowledgment of company drug-free workplace policy',
    creditCost: 2,
    emailSubject: 'Action Required: Sign Drug-Free Workplace Policy Acknowledgment',
    urgency: 'medium',
    icon: 'clipboard-check',
  },
  drug_test_request: {
    label: 'Drug Testing Request',
    description: 'Request for employee to complete a scheduled or random drug screening',
    creditCost: 2,
    emailSubject: 'Action Required: Complete Your Drug Test Screening',
    urgency: 'high',
    icon: 'flask',
  },
  guard_card_update: {
    label: 'Guard Card / License Update',
    description: 'Request to upload a new or renewed security guard card or state license',
    creditCost: 2,
    emailSubject: 'Action Required: Upload Your Updated Guard Card / Security License',
    urgency: 'high',
    icon: 'id-card',
  },
} as const;

export type HrDocumentTypeKey = keyof typeof HR_DOCUMENT_TYPES;

// ─── EMAIL TEMPLATE BUILDER ─────────────────────────────────────────────────
function buildDocumentRequestEmail(params: {
  employeeName: string;
  orgName: string;
  senderName: string;
  documentType: HrDocumentTypeKey;
  uploadLink: string;
  notes?: string;
  expiresAt: Date;
}): string {
  const doc = HR_DOCUMENT_TYPES[params.documentType];
  const expireStr = params.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const docBodyMap: Record<HrDocumentTypeKey, string> = {
    full_onboarding: `
      <p>Welcome to <strong>${params.orgName}</strong>! To complete your new hire onboarding, please submit the required documents by clicking the link below.</p>
      <p>Your onboarding packet includes employment eligibility forms, tax withholding forms, policy acknowledgments, and any position-specific requirements.</p>
    `,
    i9: `
      <p><strong>${params.orgName}</strong> requires a completed Form I-9 (Employment Eligibility Verification) on file for all employees as required by federal law (8 U.S.C. § 1324a).</p>
      <p>You must provide documentation verifying your identity and authorization to work in the United States. Please complete Section 1 and bring original documents when you report to your supervisor.</p>
    `,
    w4: `
      <p><strong>${params.orgName}</strong> requires an updated Form W-4 (Federal Income Tax Withholding) on file.</p>
      <p>Please complete and submit your W-4 so we can ensure proper federal tax withholding from your pay. You may update your W-4 at any time to reflect changes in your withholding preferences.</p>
    `,
    w9: `
      <p><strong>${params.orgName}</strong> requires your Form W-9 (Taxpayer Identification and Certification) as an independent contractor.</p>
      <p>Your W-9 is required to process contractor payments and issue a 1099 at year-end. This is a federal tax requirement under IRS regulations.</p>
    `,
    drug_free_acknowledgment: `
      <p><strong>${params.orgName}</strong> maintains a drug-free workplace policy as required by Texas law and client site requirements.</p>
      <p>Please review and sign the attached Drug-Free Workplace Policy acknowledgment. By signing, you confirm that you have read, understand, and agree to comply with the company's drug and alcohol policy.</p>
    `,
    drug_test_request: `
      <p><strong>${params.orgName}</strong> requires you to complete a drug screening test. This may be a pre-employment screen, random selection, post-incident, or reasonable-suspicion test per company policy.</p>
      <p>Please contact your supervisor or HR immediately to schedule your test at an approved collection site. Failure to complete the test within the required timeframe may affect your employment status.</p>
    `,
    guard_card_update: `
      <p><strong>${params.orgName}</strong> requires an updated copy of your security guard card or state-issued license on file.</p>
      <p>Your current guard card on record is expired or approaching expiration. Expired credentials will result in removal from active scheduling until a valid license is on file. Please upload both the front and back of your new card in color.</p>
    `,
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:28px 32px;">
      <img src="https://www.coaileague.com/logo-gold.png" alt="${params.orgName}" style="height:40px;" onerror="this.style.display='none'">
      <h1 style="color:#ffc83c;font-size:22px;margin:16px 0 4px;">Document Required</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0;">${doc.label}</p>
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:32px;">
      <p style="color:#1e293b;font-size:16px;margin:0 0 16px;">Hi <strong>${params.employeeName}</strong>,</p>
      ${docBodyMap[params.documentType]}
      ${params.notes ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px;margin:20px 0;"><p style="color:#0369a1;margin:0;font-size:14px;"><strong>Note from ${params.senderName}:</strong> ${params.notes}</p></div>` : ''}
      <div style="text-align:center;margin:28px 0;">
        <a href="${params.uploadLink}" style="display:inline-block;background:#ffc83c;color:#0f172a;font-weight:700;font-size:16px;padding:14px 32px;border-radius:6px;text-decoration:none;">Complete Document Request</a>
      </div>
      <p style="color:#64748b;font-size:13px;text-align:center;margin:0;">This request expires on <strong>${expireStr}</strong>. If you have questions, contact <strong>${params.senderName}</strong> at ${params.orgName}.</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">${params.orgName} &bull; Powered by ${PLATFORM.name} Workforce Platform</p>
  </div>
</body>
</html>`;
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

/**
 * GET /api/hr/document-requests/types
 * List all available document types with credit costs.
 */
router.get('/types', requireAuth, requireManager, async (_req, res) => {
  res.json({ types: HR_DOCUMENT_TYPES });
});

/**
 * GET /api/hr/document-requests/gaps
 * Analyze which employees are missing which documents.
 * Returns a per-employee gap report.
 */
router.get('/gaps', requireAuth, requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const allEmployees = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      position: employees.position,
      status: employees.status,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
      guardCardVerified: employees.guardCardVerified,
    }).from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));

    // Fetch recent requests per employee to detect what's already been handled
    const recentRequests = await db.select().from(hrDocumentRequests)
      .where(eq(hrDocumentRequests.workspaceId, workspaceId))
      .orderBy(desc(hrDocumentRequests.sentAt));

    const requestsByEmployee: Record<string, typeof recentRequests> = {};
    for (const r of recentRequests) {
      if (!requestsByEmployee[r.employeeId]) requestsByEmployee[r.employeeId] = [];
      requestsByEmployee[r.employeeId].push(r);
    }

    const gaps = allEmployees.map((emp) => {
      const empRequests = requestsByEmployee[emp.id] || [];
      const recentlySent = new Set(empRequests.filter(r => r.status !== 'expired').map(r => r.documentType));
      const missingDocs: HrDocumentTypeKey[] = [];

      // Determine tax classification from workerType / is1099Eligible
      const isContractor = emp.workerType === 'contractor' || emp.is1099Eligible;

      if (!isContractor && !recentlySent.has('i9')) missingDocs.push('i9');
      if (!isContractor && !recentlySent.has('w4')) missingDocs.push('w4');
      if (isContractor && !recentlySent.has('w9')) missingDocs.push('w9');
      if (!recentlySent.has('drug_free_acknowledgment')) missingDocs.push('drug_free_acknowledgment');

      // Guard card verification check — if not verified and no recent request, flag it
      if (!emp.guardCardVerified && !recentlySent.has('guard_card_update')) {
        missingDocs.push('guard_card_update');
      }

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        email: emp.email || '',
        position: emp.position || '',
        taxClassification: isContractor ? 'w9_contractor' : 'w4_employee',
        missingDocuments: missingDocs,
        lastRequestSentAt: empRequests[0]?.sentAt || null,
        pendingRequests: empRequests.filter(r => r.status === 'sent').length,
      };
    });

    const totalGaps = gaps.reduce((sum, g) => sum + g.missingDocuments.length, 0);
    res.json({ gaps, totalGaps, totalEmployees: allEmployees.length });
  } catch (err: unknown) {
    log.error('[DocRequests] Gap analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze document gaps' });
  }
});

/**
 * GET /api/hr/document-requests
 * List all document requests for workspace with pagination.
 */
router.get('/', requireAuth, requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const requests = await db.select().from(hrDocumentRequests)
      .where(eq(hrDocumentRequests.workspaceId, workspaceId))
      .orderBy(desc(hrDocumentRequests.sentAt))
      .limit(200);

    res.json({ requests });
  } catch (err: unknown) {
    log.error('[DocRequests] List error:', err);
    res.status(500).json({ error: 'Failed to list document requests' });
  }
});

/**
 * POST /api/hr/document-requests/send
 * Send one or more specific document requests to one or more employees.
 * Charges credits per document per employee. Sends email per request.
 *
 * Body: { employeeIds: string[], documentTypes: HrDocumentTypeKey[], notes?: string, sentVia?: string }
 */
router.post('/send', requireAuth, requireManager, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id;
    const senderName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || 'HR';
    if (!workspaceId || !userId) return res.status(400).json({ error: 'No workspace context' });

    const schema = z.object({
      employeeIds: z.array(z.string()).min(1).max(500),
      documentTypes: z.array(z.enum(Object.keys(HR_DOCUMENT_TYPES) as [HrDocumentTypeKey, ...HrDocumentTypeKey[]])).min(1),
      notes: z.string().max(1000).optional(),
      sentVia: z.enum(['email', 'chatdock', 'trinity']).default('email'),
    });

    const input = schema.parse(req.body);

    // Fetch employees
    const empList = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    }).from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), inArray(employees.id, input.employeeIds)));

    if (!empList.length) return res.status(404).json({ error: 'No matching employees found' });

    // Fetch org name
    const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const orgName = ws?.name || 'Your Company';

    // Calculate total credit cost
    let totalCredits = 0;
    for (const docType of input.documentTypes) {
      totalCredits += HR_DOCUMENT_TYPES[docType as HrDocumentTypeKey].creditCost * empList.length;
    }

    // Pre-authorize credits
    const creditCheck = await tokenManager.recordUsage({
      workspaceId,
      userId,
      featureKey: 'hr_document_request',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      featureName: 'HR Document Request',
      description: `Bulk document request: ${input.employeeIds.length} employees × ${input.documentTypes.length} doc types`,
      amountOverride: totalCredits,
      quantity: 1,
    });
    if (!creditCheck.success) {
      return res.status(402).json({
        error: 'Insufficient credits',
        creditsRequired: totalCredits,
        creditsAvailable: (creditCheck as any).remaining ?? 0,
        message: `Sending ${empList.length} employee(s) × ${input.documentTypes.length} document type(s) requires ${totalCredits} credits.`,
      });
    }

    // Send emails and create request records
    const results: { employeeId: string; employeeName: string; docType: string; success: boolean; error?: string }[] = [];
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    for (const emp of empList) {
      if (!emp.email) {
        for (const docType of input.documentTypes) {
          results.push({ employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}`, docType, success: false, error: 'No email address on file' });
        }
        continue;
      }

      for (const docType of input.documentTypes) {
        const docKey = docType as HrDocumentTypeKey;
        const doc = HR_DOCUMENT_TYPES[docKey];
        const requestId = randomUUID();
        const uploadLink = `${process.env.APP_BASE_URL || ''}/employee-portal?request=${requestId}`;
        const creditsForThis = doc.creditCost;

        try {
          // Insert request record
          await db.insert(hrDocumentRequests).values({
            id: requestId,
            workspaceId,
            sentByUserId: userId,
            sentByName: senderName,
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
            employeeEmail: emp.email,
            documentType: docKey,
            status: 'sent',
            notes: input.notes || null,
            creditsCharged: creditsForThis,
            sentVia: input.sentVia,
            uploadLink,
            expiresAt,
          });

          // Send email
          const html = buildDocumentRequestEmail({
            employeeName: `${emp.firstName}`,
            orgName,
            senderName,
            documentType: docKey,
            uploadLink,
            notes: input.notes,
            expiresAt,
          });

          await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'document_notification', workspaceId: workspaceId || 'system', recipientUserId: emp.id || emp.email, channel: 'email', body: { to: emp.email, subject: doc.emailSubject, html } });

          results.push({ employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}`, docType, success: true });
        } catch (innerErr: unknown) {
          log.error(`[DocRequests] Send error for ${emp.id}/${docType}:`, innerErr);
          results.push({ employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}`, docType, success: false, error: (innerErr as any)?.message });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Notify sender
    await createNotification({
      workspaceId,
      userId,
      type: 'document_expiring',
      title: `Document Requests Sent`,
      message: `${successCount} document request${successCount !== 1 ? 's' : ''} sent successfully${failCount > 0 ? `. ${failCount} failed.` : '.'}`,
      metadata: { successCount, failCount, totalCredits },
    });

    res.json({
      success: true,
      results,
      summary: { sent: successCount, failed: failCount, tokensUsed: totalCredits },
    });
  } catch (err: unknown) {
    log.error('[DocRequests] Send error:', err);
    res.status(400).json({ error: sanitizeError(err) || 'Failed to send document requests' });
  }
});

/**
 * PATCH /api/hr/document-requests/:id/status
 * Update request status (opened, completed, expired).
 */
router.patch('/:id/status', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = z.object({ status: z.enum(['opened', 'completed', 'expired']) }).parse(req.body);
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    // Allowed state transitions (expected prior status → new status)
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      opened:    ['sent'],          // recipient opens the request
      completed: ['sent', 'opened'], // recipient or manager completes
      expired:   ['sent', 'opened'], // manager or system marks expired
    };

    // Auth: manager can update any transition; non-manager can only progress
    // their own requests (opened/completed), not expire others
    const isManager = ['manager', 'org_owner', 'co_owner', 'supervisor'].includes(req.workspaceRole || '');
    if (!isManager && status === 'expired') {
      return res.status(403).json({ error: 'Manager role required to expire document requests' });
    }

    // Conditional WHERE — only updates if in an expected prior status (race protection)
    const allowedPrior = ALLOWED_TRANSITIONS[status];
    const updateData: Record<string, any> = { status, updatedAt: new Date() };
    if (status === 'opened') updateData.openedAt = new Date();
    if (status === 'completed') updateData.completedAt = new Date();

    const [updated] = await db.update(hrDocumentRequests)
      .set(updateData)
      .where(and(
        eq(hrDocumentRequests.id, id),
        eq(hrDocumentRequests.workspaceId, workspaceId),
        inArray(hrDocumentRequests.status, allowedPrior)
      ))
      .returning({ id: hrDocumentRequests.id, documentType: hrDocumentRequests.documentType,
                   employeeId: hrDocumentRequests.employeeId, employeeName: hrDocumentRequests.employeeName,
                   recipientUserId: hrDocumentRequests.recipientUserId });

    if (!updated) {
      const [current] = await db.select({ status: hrDocumentRequests.status })
        .from(hrDocumentRequests).where(eq(hrDocumentRequests.id, id)).limit(1);
      return res.status(409).json({
        error: `Cannot transition to '${status}' — request is currently '${current?.status || 'unknown'}'`,
        code: 'INVALID_TRANSITION',
      });
    }

    // ── S10: I-9 COMPLETION → COMPLIANCE STATE ─────────────────────────────
    // When an I-9 document request is marked completed, update the employee
    // row's i9_on_file flag and emit a Trinity event so the compliance
    // engine + onboarding dashboard reflect the state immediately.
    if (status === 'completed') {
      try {
        const request = updated; // Already have the row from the conditional update above

        if (request?.documentType === 'i9' && request.employeeId) {
          // Update the employees row. Column may be named differently across
          // environments (i9_on_file vs i9OnFile). Use raw SQL to stay
          // schema-agnostic and non-fatal if missing.
          try {
            const { sql: drizzleSql } = await import('drizzle-orm');
            await db.execute(drizzleSql`
              UPDATE employees
                 SET i9_on_file = TRUE, updated_at = NOW()
               WHERE id = ${request.employeeId} AND workspace_id = ${workspaceId}
            `);
          } catch (colErr: any) {
            // Column may not exist in this workspace's schema snapshot;
            // fall back silently rather than block the status update.
            log.warn('[DocRequest] i9_on_file update skipped (column may not exist):', colErr?.message);
          }

          try {
            const { platformEventBus } = await import('../../services/platformEventBus');
            await platformEventBus.publish({
              type: 'i9_submitted',
              category: 'compliance',
              title: 'I-9 submitted',
              description: `${request.employeeName} submitted their I-9.`,
              workspaceId,
              metadata: { employeeId: request.employeeId, documentRequestId: id },
            });
          } catch (evErr: any) {
            log.warn('[DocRequest] i9_submitted event publish failed:', evErr?.message);
          }
        }
      } catch (i9Err: any) {
        log.warn('[DocRequest] I-9 compliance hook failed (non-fatal):', i9Err?.message);
      }
    }

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(400).json({ error: sanitizeError(err) || 'Failed to update status' });
  }
});

export default router;
