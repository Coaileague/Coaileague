/**
 * TRINITY INBOUND EMAIL PROCESSOR
 * Phase 13 — Inbound Email Routing and Trinity Auto-Processing
 *
 * Receives parsed email payloads, identifies sender + category, extracts
 * structured data via Trinity AI, and routes to the correct downstream
 * pipeline. Every email is logged to inbound_email_log regardless of outcome.
 *
 * 7-Step architecture: Trigger → Fetch → Validate → Process → Mutate → Confirm → Notify
 */

import { db } from '../../db';
import { aiGuardRails, type AIRequestContext } from '../aiGuardRails';
import { publishEvent } from '../orchestration/pipelineErrorHandler';
import {
  employees,
  clients,
  shifts,
  shiftCoverageRequests,
  incidentReports,
  documentVault,
  supportTickets,
  inboundEmailLog,
  employeeCertifications,
  workspaces,
} from '@shared/schema';
import { getWorkspaceTier, hasTierAccess } from '../../tierGuards';
import { eq, and, gte, lte, ilike, or, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { storage } from '../../storage';
import { platformEventBus } from '../platformEventBus';
import { fireCallOffSequence } from '../staffingBroadcastService';
import { createLogger } from '../../lib/logger';
import { scheduleNonBlocking } from '../../lib/scheduleNonBlocking';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('trinityInboundEmailProcessor');


// Dynamic import for AI to avoid circular deps at module load
async function getAIClient() {
  const { UnifiedGeminiClient } = await import('../ai-brain/providers/geminiClient');
  return new UnifiedGeminiClient();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailCategory = 'calloff' | 'incident' | 'docs' | 'support' | 'careers' | 'unknown';

export interface ParsedInboundEmail {
  messageId?: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size?: number;
    content?: string;
    url?: string;
  }>;
  receivedAt?: Date;
  rawPayload?: Record<string, unknown>;
}

interface ProcessingResult {
  logId: string;
  status: 'processed' | 'needs_review' | 'failed' | 'duplicate';
  downstreamRecordId?: string;
  downstreamRecordType?: string;
  message: string;
}

// ─── Category Detection ───────────────────────────────────────────────────────

export function detectCategoryFromRecipient(toEmail: string): EmailCategory {
  const local = toEmail.split('@')[0]?.toLowerCase() || '';
  if (local === 'calloffs' || local === 'calloff') return 'calloff';
  if (local === 'incidents' || local === 'incident') return 'incident';
  if (local === 'docs' || local === 'documents') return 'docs';
  if (local === 'support') return 'support';
  if (local.startsWith('careers') || local === 'jobs' || local === 'apply' || local === 'recruitment') return 'careers';
  // T010 FIX: billing@ and staffing@ were falling through to 'unknown' — now correctly routed.
  if (local === 'billing' || local === 'invoice' || local === 'invoices' || local === 'accounts') return 'billing';
  if (local === 'staffing' || local === 'staff' || local === 'scheduling' || local === 'payroll') return 'staffing';
  // L4 Fallback: Route general operations emails to staffing for triage
  if (local === 'ops' || local === 'operations' || local === 'schedule') return 'staffing';

  // L3 CRM: Route calloffs@ to CRM for lead creation if no officer found
  if (local === 'calloffs' || local === 'calloff') return 'calloff';
  return 'unknown';
}

// ─── Sender Resolution ────────────────────────────────────────────────────────

interface ResolvedSender {
  id: string;
  type: 'employee' | 'client';
  workspaceId: string;
  name: string;
  userId?: string | null;
}

async function resolveSender(fromEmail: string): Promise<ResolvedSender | null> {
  // Step 1: check employees table
  const [emp] = await db.select({
    id: employees.id,
    workspaceId: employees.workspaceId,
    firstName: employees.firstName,
    lastName: employees.lastName,
    userId: employees.userId,
  })
    .from(employees)
    .where(and(
      ilike(employees.email, fromEmail),
      eq(employees.isActive, true),
    ))
    .limit(1);

  if (emp) {
    return {
      id: emp.id,
      type: 'employee',
      workspaceId: emp.workspaceId,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      userId: emp.userId,
    };
  }

  // Step 2: check clients table
  const [client] = await db.select({
    id: clients.id,
    workspaceId: clients.workspaceId,
    name: (clients as any).name,
  })
    .from(clients)
    .where(ilike(clients.email, fromEmail))
    .limit(1);

  if (client) {
    return {
      id: client.id,
      type: 'client',
      workspaceId: client.workspaceId,
      name: client.name || fromEmail,
    };
  }

  return null;
}

// ─── Trinity AI Extraction ────────────────────────────────────────────────────

async function extractStructuredData(
  category: EmailCategory,
  subject: string,
  bodyText: string,
  senderName: string,
): Promise<{ data: Record<string, unknown>; confidence: number }> {
  // Guard against prompt injection in user-controlled email fields
  const guardContext: AIRequestContext = {
    workspaceId: 'inbound-email',
    userId: 'email-processor',
    feature: 'email_classification',
    userInput: `${senderName}\n${subject}\n${bodyText.slice(0, 1500)}`,
  };
  const guardResult = await aiGuardRails.validateRequest(guardContext);
  if (!(guardResult as any).allowed) {
    throw new Error(`Email content blocked by AI guard rails: ${(guardResult as any).reason}`);
  }

  const prompts: Record<EmailCategory, string> = {
    calloff: `You are a security operations assistant. Extract calloff information from this email.
Return ONLY valid JSON with these fields:
- officerName (string or null)
- shiftDate (YYYY-MM-DD string or null — the date they cannot work)
- shiftTime (string like "08:00-16:00" or null)
- reason (one of: call_off, sick, emergency, or null)
- additionalNotes (string or null)
- confidence (number 0-1 based on how clearly the email states a calloff)

Email from ${senderName}:
Subject: ${subject}
Body: ${bodyText.slice(0, 1500)}`,

    incident: `You are a security operations assistant. Extract incident report information.
Return ONLY valid JSON with these fields:
- reportingOfficerName (string or null)
- incidentDate (YYYY-MM-DD or null)
- incidentTime (HH:MM string or null)
- location (string or null)
- incidentType (string — e.g. theft, trespass, injury, disturbance, or null)
- severity (one of: low, medium, high, critical or null)
- description (string — cleaned incident description or null)
- confidence (number 0-1)

Email from ${senderName}:
Subject: ${subject}
Body: ${bodyText.slice(0, 1500)}`,

    docs: `You are a document management assistant. Identify the document type from this email.
Return ONLY valid JSON with these fields:
- documentType (one of: license, certification, contract, onboarding, i9, id_verification, insurance, other or null)
- entityName (person or company name associated with this document or null)
- documentDescription (brief description or null)
- urgency (one of: low, normal, high or null)
- confidence (number 0-1)

Email from ${senderName}:
Subject: ${subject}
Body: ${bodyText.slice(0, 1500)}`,

    support: `You are a support ticket triage assistant. Classify this support email.
Return ONLY valid JSON with these fields:
- category (one of: billing, scheduling, technical, general or null)
- priority (one of: low, normal, high, urgent or null)
- summary (one sentence summary of the issue or null)
- confidence (number 0-1)

Email from ${senderName}:
Subject: ${subject}
Body: ${bodyText.slice(0, 1500)}`,

    unknown: `Return ONLY valid JSON: {"confidence": 0, "category": "unknown"}`,
  };

  try {
    const ai = await getAIClient();
    const response = await ai.generateContent(prompts[category], { // withGemini
      temperature: 0.1,
      maxOutputTokens: 500,
    });

    const text = (response as any).trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);
    return { data: parsed, confidence: Number(parsed.confidence) || 0 };
  } catch (err: any) {
    log.warn('[InboundProcessor] Trinity extraction error:', err.message);
    return { data: {}, confidence: 0 };
  }
}

// ─── PIPELINE 1 — Calloff ─────────────────────────────────────────────────────

async function processCalloff(
  email: ParsedInboundEmail,
  sender: ResolvedSender,
  aiData: Record<string, unknown>,
  logId: string,
): Promise<{ downstreamRecordId?: string; downstreamRecordType?: string; needsReview?: boolean; reviewReason?: string }> {
  const workspaceId = sender.workspaceId;
  const confidence = Number(aiData.confidence) || 0;

  // Low confidence — flag for review but don't auto-process
  if (confidence < 0.6) {
    await notifyAdmins(workspaceId, `Calloff email from ${sender.name} could not be automatically processed (confidence ${(confidence * 100).toFixed(0)}%). Manual review required.`, logId);
    return { needsReview: true, reviewReason: `Trinity confidence too low: ${(confidence * 100).toFixed(0)}%` };
  }

  const shiftDate = String(aiData.shiftDate || '');
  if (!shiftDate) {
    return { needsReview: true, reviewReason: 'Could not determine shift date from email' };
  }

  // FETCH: find the officer's shift on that date
  const today = new Date();
  const [targetShift] = await db.select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, sender.id),
      gte(shifts.startTime, new Date(`${shiftDate}T00:00:00`)),
      lte(shifts.startTime, new Date(`${shiftDate}T23:59:59`)),
    ))
    .limit(1);

  if (!targetShift) {
    await notifyAdmins(workspaceId, `Calloff email from ${sender.name} for ${shiftDate} — no matching shift found. Manual review required.`, logId);
    return { needsReview: true, reviewReason: `No shift found for ${sender.name} on ${shiftDate}` };
  }

  // Gather supervisor
  const [supervisorEmployee] = await db.select({ userId: employees.userId })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true),
      or(
        eq(employees.workspaceRole, 'org_manager'),
        eq(employees.workspaceRole, 'supervisor'),
        eq(employees.workspaceRole, 'co_owner'),
      ),
    ))
    .limit(1);

  const reasonRaw = String(aiData.reason || 'call_off');
  const validReasons = ['call_off', 'ncns', 'sick', 'emergency', 'manual'];
  const safeReason = validReasons.includes(reasonRaw) ? reasonRaw : 'call_off';

  // L4 Threading: Maintain email threading for calloff sequence
  const threadId = email.messageId || logId;

  // MUTATE: fire the calloff cascade (same service as manual calloff — no duplication)
  await fireCallOffSequence({
    workspaceId,
    shiftId: targetShift.id,
    officerEmployeeId: sender.id,
    siteName: targetShift.title || 'Unknown Site',
    shiftDate,
    shiftStart: targetShift.startTime.toISOString(),
    shiftEnd: targetShift.endTime.toISOString(),
    supervisorUserId: supervisorEmployee?.userId || '',
    orgName: workspaceId,
    reason: safeReason,
  });

  // CONFIRM: send confirmation reply via NDS — P27-G02 FIX
  scheduleNonBlocking('inbound-email.calloff-confirm', async () => {
    const { NotificationDeliveryService } = await import('../notificationDeliveryService');
    const { PLATFORM } = await import('../../config/platformConfig');
    const confirmSubject = `Calloff Received — ${shiftDate}`;
    const confirmHtml = `<p>Hi ${sender.name},</p><p>Your calloff for <strong>${shiftDate}</strong> has been received and a replacement is being arranged. Your supervisor has been notified.</p><p>— ${PLATFORM.name} Operations</p>`;
    await NotificationDeliveryService.send({
      type: 'internal_email_received',
      workspaceId: sender.workspaceId || 'system',
      recipientUserId: email.fromEmail,
      channel: 'email',
      subject: confirmSubject,
      body: { to: email.fromEmail, subject: confirmSubject, html: confirmHtml },
      idempotencyKey: `calloff-confirm-${logId}`,
    });
  });

  return {
    downstreamRecordId: targetShift.id,
    downstreamRecordType: 'shift_coverage_request',
  };
}

// ─── PIPELINE 2 — Incident ────────────────────────────────────────────────────

async function processIncident(
  email: ParsedInboundEmail,
  sender: ResolvedSender,
  aiData: Record<string, unknown>,
  logId: string,
): Promise<{ downstreamRecordId?: string; downstreamRecordType?: string; needsReview?: boolean; reviewReason?: string }> {
  const workspaceId = sender.workspaceId;
  const confidence = Number(aiData.confidence) || 0;

  const now = new Date();
  const incidentNumber = `INC-EMAIL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

  let occurredAt: Date | null = null;
  if (aiData.incidentDate) {
    try {
      occurredAt = new Date(`${aiData.incidentDate}${aiData.incidentTime ? `T${aiData.incidentTime}:00` : 'T00:00:00'}`);
    } catch (err: unknown) {
      log.warn('[TrinityInboundEmail] Failed to parse incident date (using null):', err instanceof Error ? err.message : String(err));
    }
  }

  const status = confidence < 0.5 ? 'draft' : 'pending_review';

  // MUTATE: create incident_reports record
  const [report] = await db.insert(incidentReports).values({
    workspaceId,
    incidentNumber,
    reportedBy: sender.id,
    title: String(aiData.incidentType || email.subject || 'Email Incident Report'),
    severity: (String(aiData.severity || 'medium')) as 'low' | 'medium' | 'high' | 'critical',
    incidentType: String(aiData.incidentType || 'general'),
    rawDescription: email.bodyText || '',
    locationAddress: String(aiData.location || ''),
    status,
    occurredAt: occurredAt || now,
    submissionMethod: 'email',
    inboundEmailLogId: logId,
  } as any).returning({ id: incidentReports.id });

  // Store attachments in document vault if present (email storage quota enforced)
  const attachments = email.attachments || [];
  const { checkCategoryQuota, recordStorageUsage } = await import('../storage/storageQuotaService');
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per-attachment cap (OMEGA-L9)
  for (const att of attachments.filter(a => a.url)) {
    const attBytes = att.size || 0;
    if (attBytes > MAX_ATTACHMENT_BYTES) {
      log.warn(`[TrinityInboundEmail] Attachment rejected — exceeds 10 MB per-attachment cap (att: ${att.filename}, size: ${attBytes}, workspace: ${workspaceId})`);
      continue;
    }
    const quotaCheck = await checkCategoryQuota(workspaceId, 'email', attBytes).catch(() => ({ allowed: true }));
    if (!quotaCheck.allowed) {
      log.warn(`[TrinityInboundEmail] Incident attachment rejected — email quota exceeded for workspace ${workspaceId} (att: ${att.filename}, size: ${attBytes})`);
      continue;
    }
    await db.insert(documentVault).values({
      workspaceId,
      title: att.filename || 'Incident Attachment',
      category: 'incident_evidence',
      fileUrl: att.url!,
      mimeType: att.contentType,
      fileSizeBytes: attBytes,
      relatedEntityType: 'incident_report',
      relatedEntityId: report.id,
      uploadedBy: sender.id,
    } as any).then(() => {
      if (attBytes > 0) {
        recordStorageUsage(workspaceId, 'email', attBytes).catch(() => null);
      }
    }).catch((err: unknown) => {
      log.warn('[TrinityInboundEmail] Vault insert for incident attachment failed (non-blocking):', err instanceof Error ? err.message : String(err));
    });
  }

  // NOTIFY: route to supervisor
  await notifyAdmins(workspaceId, `New incident report submitted via email by ${sender.name}. ${confidence < 0.5 ? 'Low confidence — manual completion required.' : 'Ready for review.'}`, logId, {
    type: 'incident_report_received',
    title: 'Incident Report — Email Submission',
    actionUrl: `/incidents/${report.id}`,
    relatedEntityType: 'incident_report',
    relatedEntityId: report.id,
  });

  // CONFIRM: send acknowledgment via NDS — P27-G02 FIX
  scheduleNonBlocking('inbound-email.incident-confirm', async () => {
    const { NotificationDeliveryService } = await import('../notificationDeliveryService');
    const { PLATFORM } = await import('../../config/platformConfig');
    const confirmSubject = `Incident Report Received — ${incidentNumber}`;
    const confirmHtml = `<p>Hi ${sender.name},</p><p>Your incident report has been received (Reference: <strong>${incidentNumber}</strong>) and routed to your supervisor for review.</p><p>— ${PLATFORM.name} Operations</p>`;
    await NotificationDeliveryService.send({
      type: 'internal_email_received',
      workspaceId: sender.workspaceId || 'system',
      recipientUserId: email.fromEmail,
      channel: 'email',
      subject: confirmSubject,
      body: { to: email.fromEmail, subject: confirmSubject, html: confirmHtml },
      idempotencyKey: `incident-confirm-${logId}`,
    });
  });

  return { downstreamRecordId: report.id, downstreamRecordType: 'incident_report' };
}

// ─── PIPELINE 3 — Docs ───────────────────────────────────────────────────────

async function processDocs(
  email: ParsedInboundEmail,
  sender: ResolvedSender,
  aiData: Record<string, unknown>,
  logId: string,
): Promise<{ downstreamRecordId?: string; downstreamRecordType?: string; needsReview?: boolean; reviewReason?: string }> {
  const workspaceId = sender.workspaceId;
  const attachments = email.attachments || [];

  if (attachments.length === 0) {
    // No attachments — reply asking to resubmit via NDS — P27-G02 FIX
    scheduleNonBlocking('inbound-email.docs-no-attachment', async () => {
      const { NotificationDeliveryService } = await import('../notificationDeliveryService');
      const { PLATFORM } = await import('../../config/platformConfig');
      const confirmSubject = 'Document Submission — Attachment Required';
      const confirmHtml = `<p>Hi ${sender.name},</p><p>We received your email but no document was attached. Please resubmit your email with the document attached.</p><p>— ${PLATFORM.name} Document Processing</p>`;
      await NotificationDeliveryService.send({
        type: 'internal_email_received',
        workspaceId: sender.workspaceId || 'system',
        recipientUserId: email.fromEmail,
        channel: 'email',
        subject: confirmSubject,
        body: { to: email.fromEmail, subject: confirmSubject, html: confirmHtml },
        idempotencyKey: `docs-no-attachment-confirm-${logId}`,
      });
    });
    return { needsReview: true, reviewReason: 'No attachments in docs@ email' };
  }

  const docType = String(aiData.documentType || 'other');

  // MUTATE: store each attachment in document vault with SHA-256 integrity hash (email quota enforced)
  const { checkCategoryQuota: checkDocQuota, recordStorageUsage: recordDocStorage } =
    await import('../storage/storageQuotaService');
  const MAX_DOC_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per-attachment cap (OMEGA-L9)
  const vaultIds: string[] = [];
  for (const att of attachments.filter(a => a.url)) {
    const attBytes = att.size || 0;
    if (attBytes > MAX_DOC_ATTACHMENT_BYTES) {
      log.warn(`[TrinityInboundEmail] Docs@ attachment rejected — exceeds 10 MB per-attachment cap (att: ${att.filename}, size: ${attBytes}, workspace: ${workspaceId})`);
      continue;
    }
    const quotaCheck = await checkDocQuota(workspaceId, 'email', attBytes).catch(() => ({ allowed: true }));
    if (!quotaCheck.allowed) {
      log.warn(`[TrinityInboundEmail] Docs@ attachment rejected — email quota exceeded for workspace ${workspaceId} (att: ${att.filename}, size: ${attBytes})`);
      continue;
    }
    const title = att.filename || `Document from ${sender?.name ?? 'Unknown'}`;
    const contentKey = `${att.url}:${title}:${workspaceId}`;
    const integrityHash = createHash('sha256').update(contentKey).digest('hex');

    const [vaultEntry] = await db.insert(documentVault).values({
      workspaceId,
      title,
      category: docType,
      fileUrl: att.url!,
      mimeType: att.contentType,
      fileSizeBytes: attBytes,
      relatedEntityType: sender?.type ?? 'unknown',
      relatedEntityId: sender?.id ?? null,
      uploadedBy: sender?.id ?? null,
      integrityHash,
      createdAt: new Date(),
    } as any).returning({ id: documentVault.id });
    if (vaultEntry) {
      vaultIds.push(vaultEntry.id);
      if (attBytes > 0) {
        recordDocStorage(workspaceId, 'email', attBytes).catch(() => null);
      }
    }
  }

  // ── Phase 17 Integration: Link license/certification docs to officer cert record ──
  if ((docType === 'license' || docType === 'certification') && sender?.type === 'employee' && sender.id && vaultIds.length > 0) {
    // Find the most recent active cert for this employee to attach the document to
    const latestCert = await db.query.employeeCertifications.findFirst({
      where: and(
        eq(employeeCertifications.employeeId, sender.id),
        eq(employeeCertifications.workspaceId, workspaceId)
      ),
      orderBy: desc(employeeCertifications.createdAt),
    });

    if (latestCert) {
      await db
        .update(employeeCertifications)
        .set({ documentId: vaultIds[0], updatedAt: new Date() })
        .where(eq(employeeCertifications.id, latestCert.id));
      log.info(`[InboundEmail] Linked vault doc ${vaultIds[0]} to cert ${latestCert.id} for employee ${sender.id}`);
    } else {
      log.info(`[InboundEmail] No cert record found for employee ${sender.id} — vault doc stored but unlinked`);
    }
  }

  // Route to correct reviewer based on doc type
  const reviewerNote = docType === 'license' || docType === 'certification'
    ? 'Routed to compliance officer for review. License document linked to officer certification record.'
    : docType === 'contract'
    ? 'Routed to manager for review.'
    : 'Routed for HR review.';

  await notifyAdmins(workspaceId, `Document received via email from ${sender.name} (type: ${docType}). ${reviewerNote}`, logId, {
    type: 'document_received',
    title: `Document Received — ${docType}`,
    relatedEntityType: 'document_vault',
    relatedEntityId: vaultIds[0],
  });

  // CONFIRM via NDS — P27-G02 FIX
  scheduleNonBlocking('inbound-email.docs-received', async () => {
    const { NotificationDeliveryService } = await import('../notificationDeliveryService');
    const confirmSubject = 'Document Received';
    const confirmHtml = `<p>Hi ${sender.name},</p><p>Your document${attachments.length > 1 ? 's have' : ' has'} been received and routed for review. ${reviewerNote}</p><p>— CoAIleague Document Processing</p>`;
    await NotificationDeliveryService.send({
      type: 'internal_email_received',
      workspaceId: sender.workspaceId || 'system',
      recipientUserId: email.fromEmail,
      channel: 'email',
      subject: confirmSubject,
      body: { to: email.fromEmail, subject: confirmSubject, html: confirmHtml },
      idempotencyKey: `docs-received-confirm-${logId}`,
    });
  });

  return { downstreamRecordId: vaultIds[0], downstreamRecordType: 'document_vault' };
}

// ─── PIPELINE 4 — Support ─────────────────────────────────────────────────────
// Trinity-first: attempt autonomous resolution before creating a ticket.
//   Tier 0: FAQ exact match → reply immediately, no ticket needed.
//   Tier 1: Category instant answer → reply with resolution + lightweight ticket.
//   Tier 2: Trinity AI triad → reply with AI answer.
//   Tier 3: Create ticket + confirm receipt (human path, ~1% of volume).

/** Instant email answers indexed by support sub-category */
const EMAIL_INSTANT_ANSWERS: Record<string, string> = {
  billing: 'Your current invoice and billing history are available in the app under Billing > Invoices. If you see a charge you don\'t recognize, please reply with the specific invoice number or date range and our finance team will verify it within one business day.',
  scheduling: 'Your schedule is visible in the app under the Schedule tab. If a shift appears incorrect, your operations supervisor can update it. Please reply with the shift date and location and we\'ll correct it right away.',
  technical: 'To resolve most technical issues, try logging out of the app and back in. If the problem persists, please reply with the exact error message or the page where it occurs and our platform team will investigate.',
  general: null as any,
};

/** Lightweight FAQ search for inbound email text */
async function emailFaqLookup(message: string, workspaceId: string): Promise<string | null> {
  try {
    const { pool } = await import('../../db');
    const words = message.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return null;
    const tsQuery = words.slice(0, 6).join(' | ');
    const result = await pool.query(`
      SELECT answer FROM faq_entries
      WHERE status = 'published'
        AND (workspace_id = $1 OR workspace_id IS NULL)
        AND to_tsvector('english', question || ' ' || COALESCE(answer, '')) @@ to_tsquery('english', $2)
      ORDER BY CASE WHEN workspace_id = $1 THEN 0 ELSE 1 END, LENGTH(answer) ASC
      LIMIT 1
    `, [workspaceId, tsQuery.replace(/[|&!():*]/g, ' ').split(/\s+/).filter(Boolean).join(' | ')]);
    return result.rows[0]?.answer || null;
  } catch (_) {
    return null;
  }
}

async function processSupport(
  email: ParsedInboundEmail,
  sender: ResolvedSender | null,
  aiData: Record<string, unknown>,
  workspaceId: string,
  logId: string,
): Promise<{ downstreamRecordId?: string; downstreamRecordType?: string; needsReview?: boolean; reviewReason?: string }> {
  const now = new Date();
  const ticketNumber = `TKT-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-5)}`;
  const category = String(aiData.category || 'general');
  const priority = String(aiData.priority || 'normal');
  const senderName = sender ? sender.name : email.fromEmail;
  const fullBody = [email.subject || '', email.bodyText || ''].join(' ').slice(0, 2000);

  // ── Tier 0: FAQ exact match ────────────────────────────────────────────────
  const faqAnswer = await emailFaqLookup(fullBody, workspaceId);
  if (faqAnswer) {
    scheduleNonBlocking('inbound-email.support-faq-reply', async () => {
      const { NotificationDeliveryService } = await import('../notificationDeliveryService');
      const subject = `Re: ${email.subject || 'Your Support Request'}`;
      const html = `<p>Hi ${senderName.split(' ')[0] || 'there'},</p><p>${faqAnswer}</p><p>If this didn't fully answer your question, simply reply to this email and we'll follow up right away.</p><p>— Trinity Support</p>`;
      await NotificationDeliveryService.send({
        type: 'internal_email_received',
        workspaceId,
        recipientUserId: email.fromEmail,
        channel: 'email',
        subject,
        body: { to: email.fromEmail, subject, html },
        idempotencyKey: `support-faq-reply-${logId}`,
      });
    });
    return { downstreamRecordType: 'faq_resolved' };
  }

  // ── Tier 1: Category instant answer ───────────────────────────────────────
  const instantAnswer = EMAIL_INSTANT_ANSWERS[category];
  if (instantAnswer) {
    scheduleNonBlocking('inbound-email.support-instant-reply', async () => {
      const { NotificationDeliveryService } = await import('../notificationDeliveryService');
      const subject = `Re: ${email.subject || 'Your Support Request'}`;
      const html = `<p>Hi ${senderName.split(' ')[0] || 'there'},</p><p>${instantAnswer}</p><p>If you need further help, reply here and our support team will assist you.</p><p>— Trinity Support</p>`;
      await NotificationDeliveryService.send({
        type: 'internal_email_received',
        workspaceId,
        recipientUserId: email.fromEmail,
        channel: 'email',
        subject,
        body: { to: email.fromEmail, subject, html },
        idempotencyKey: `support-instant-reply-${logId}`,
      });
    });
    return { downstreamRecordType: 'auto_resolved' };
  }

  // ── Tier 2: Trinity AI triad ───────────────────────────────────────────────
  let aiAnswerResolved = false;
  try {
    const { resolveWithTrinityBrain } = await import('../trinityVoice/trinityAIResolver');
    const aiResult = await resolveWithTrinityBrain({ issue: fullBody, workspaceId });
    if (aiResult.canResolve && aiResult.answer && aiResult.answer.length > 30) {
      aiAnswerResolved = true;
      const aiAnswer = aiResult.answer;
      scheduleNonBlocking('inbound-email.support-ai-reply', async () => {
        const { NotificationDeliveryService } = await import('../notificationDeliveryService');
        const subject = `Re: ${email.subject || 'Your Support Request'}`;
        const html = `<p>Hi ${senderName.split(' ')[0] || 'there'},</p><p>${aiAnswer.replace(/\n/g, '<br>')}</p><p>If this didn't fully resolve your question, reply here and a specialist will follow up.</p><p>— Trinity Support</p>`;
        await NotificationDeliveryService.send({
          type: 'internal_email_received',
          workspaceId,
          recipientUserId: email.fromEmail,
          channel: 'email',
          subject,
          body: { to: email.fromEmail, subject, html },
          idempotencyKey: `support-ai-reply-${logId}`,
        });
      });
      return { downstreamRecordType: 'ai_resolved' };
    }
  } catch (err: unknown) {
    log.warn('[TrinityInboundEmail] Trinity AI resolver failed (falling through to Tier 3 ticket creation):', err instanceof Error ? err.message : String(err));
  }

  // ── Tier 3: Create ticket + confirm receipt ────────────────────────────────
  const [ticket] = await db.insert(supportTickets).values({
    workspaceId,
    ticketNumber,
    type: 'support',
    priority,
    subject: email.subject || 'Support Request (Email)',
    description: email.bodyText || 'No body content.',
    status: 'open',
    requestedBy: senderName,
    employeeId: sender?.type === 'employee' ? sender.id : null,
    clientId: sender?.type === 'client' ? sender.id : null,
    submissionMethod: 'email',
    emailCategory: category,
    inboundEmailLogId: logId,
  } as any).returning({ id: supportTickets.id });

  const routingNote = category === 'billing'
    ? 'Routed to finance team.'
    : category === 'scheduling'
    ? 'Routed to operations.'
    : category === 'technical'
    ? 'Routed to platform staff.'
    : 'Routed to support.';

  await notifyAdmins(workspaceId, `New support ticket ${ticketNumber} from ${senderName} (${category}). ${routingNote}`, logId, {
    type: 'support_ticket_created',
    title: `Support Ticket — ${ticketNumber}`,
    actionUrl: `/helpdesk/${ticket.id}`,
    relatedEntityType: 'support_ticket',
    relatedEntityId: ticket.id,
  });

  scheduleNonBlocking('inbound-email.support-ticket-confirm', async () => {
    const { NotificationDeliveryService } = await import('../notificationDeliveryService');
    const confirmSubject = `Support Request Received — ${ticketNumber}`;
    const confirmHtml = `<p>Hi ${senderName.split(' ')[0] || 'there'},</p><p>We've received your support request (Ticket: <strong>${ticketNumber}</strong>). ${routingNote} We will follow up with you shortly.</p><p>— Trinity Support</p>`;
    await NotificationDeliveryService.send({
      type: 'internal_email_received',
      workspaceId,
      recipientUserId: email.fromEmail,
      channel: 'email',
      subject: confirmSubject,
      body: { to: email.fromEmail, subject: confirmSubject, html: confirmHtml },
      idempotencyKey: `support-confirm-${logId}`,
    });
  });

  return { downstreamRecordId: ticket.id, downstreamRecordType: 'support_ticket' };
}

// ─── Admin Notification Helper ────────────────────────────────────────────────

async function notifyAdmins(
  workspaceId: string,
  message: string,
  logId: string,
  extra?: {
    type?: string;
    title?: string;
    actionUrl?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  },
): Promise<void> {
  try {
    const admins = await db.select({ userId: employees.userId, workspaceRole: employees.workspaceRole })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
      ));

    const adminRoles = ['org_owner', 'co_owner', 'org_manager', 'manager', 'supervisor'];
    const adminUserIds = admins
      .filter(e => adminRoles.includes(e.workspaceRole || ''))
      .map(e => e.userId)
      .filter(Boolean) as string[];

    for (const userId of adminUserIds) {
      await storage.createNotification({
        workspaceId,
        userId,
        type: extra?.type || 'inbound_email',
        title: extra?.title || 'Inbound Email Processed',
        message,
        actionUrl: extra?.actionUrl || `/audit?ref=email-${logId}`,
        relatedEntityType: extra?.relatedEntityType || 'inbound_email_log',
        relatedEntityId: extra?.relatedEntityId || logId,
      } as any).catch((err: unknown) => {
        log.warn('[TrinityInboundEmail] notifyAdmins createNotification failed:', err instanceof Error ? err.message : String(err));
      });
    }
  } catch (err: unknown) {
    log.warn('[TrinityInboundEmail] notifyAdmins failed (non-blocking):', err instanceof Error ? err.message : String(err));
  }
}

// ─── CAREERS APPLICATION PIPELINE ────────────────────────────────────────────

async function processCareersApplication(
  email: ParsedInboundEmail,
  workspaceId: string,
  logId: string,
): Promise<{ downstreamRecordId?: string; downstreamRecordType?: string; needsReview?: boolean; reviewReason?: string }> {
  try {
    // Lazy imports to avoid circular dependency issues
    const { createCandidate } = await import('../recruitment/candidateService');
    const { screenCandidate } = await import('../recruitment/trinityScreeningService');
    const { sendEmailRound1, processEmailReply } = await import('../recruitment/emailInterviewService');
    const { interviewCandidates: icTable, candidateInterviewSessions: cisTable } = await import('@shared/schema');
    const { eq: drizzleEq, and: drizzleAnd, ilike: drizzleIlike, desc: drizzleDesc } = await import('drizzle-orm');

    // ── REPLY DETECTION: If sender is already a candidate in this workspace
    // with an active interview session, route to email-reply scoring instead.
    const [existingCandidate] = await db.select()
      .from(icTable)
      .where(drizzleAnd(
        drizzleEq(icTable.workspaceId, workspaceId),
        drizzleIlike(icTable.email, email.fromEmail),
      ))
      .limit(1);

    if (existingCandidate && ['email_round_1', 'email_round_2'].includes(existingCandidate.stage)) {
      // Find the most recent active email session for this candidate
      const [activeSession] = await db.select()
        .from(cisTable)
        .where(drizzleAnd(
          drizzleEq(cisTable.candidateId, existingCandidate.id),
          drizzleEq(cisTable.workspaceId, workspaceId),
          drizzleEq(cisTable.status, 'in_progress'),
        ))
        .orderBy(drizzleDesc(cisTable.startedAt))
        .limit(1);

      if (activeSession) {
        await processEmailReply(activeSession.id, email.bodyText || email.bodyHtml || '');
        return {
          downstreamRecordId: existingCandidate.id,
          downstreamRecordType: 'interview_candidate',
        };
      }
    }
    // ── END REPLY DETECTION ──

    // Parse applicant name from email
    const fromParts = (email.fromName || '').split(' ');
    const firstName = fromParts[0] || email.fromEmail.split('@')[0] || 'Applicant';
    const lastName = fromParts.slice(1).join(' ') || '';

    // Detect position type from subject or body
    const text = ((email.subject || '') + ' ' + (email.bodyText || '')).toLowerCase();
    let positionType = 'unarmed_officer';
    let positionTitle = 'Security Officer';
    if (text.includes('armed') || text.includes('firearm') || text.includes('weapon')) {
      positionType = 'armed_officer';
      positionTitle = 'Armed Security Officer';
    } else if (text.includes('supervisor') || text.includes('manager') || text.includes('lead')) {
      positionType = 'supervisor';
      positionTitle = 'Security Supervisor';
    }

    // Create candidate record
    const candidate = await createCandidate({
      workspaceId,
      firstName,
      lastName,
      email: email.fromEmail,
      positionType,
      positionTitle,
      stage: 'new',
      sourceEmail: email.toEmail,
      inboundEmailLogId: logId,
      rawApplicationText: email.bodyText || email.bodyHtml || '',
    });

    // Run Trinity initial screen
    const screenResult = await screenCandidate(
      candidate,
      email.bodyText || email.bodyHtml || '',
      positionType,
    );

    // Update candidate with score
    await db.update(
      (await import('@shared/schema')).interviewCandidates,
    )
      .set({
        qualificationScore: screenResult.score,
        resumeParsed: screenResult.parsedData as Record<string, unknown>,
        stage: screenResult.score >= 60 ? 'screening' : 'decided',
        decision: screenResult.score < 60 ? 'reject' : null,
        updatedAt: new Date(),
      })
      .where((await import('drizzle-orm')).eq(
        (await import('@shared/schema')).interviewCandidates.id,
        candidate.id,
      ));

    // If qualified, auto-send Round 1 email questions
    if (screenResult.score >= 60) {
      try {
        await sendEmailRound1(
          { ...candidate, qualificationScore: screenResult.score, stage: 'screening' },
          workspaceId,
        );
      } catch (emailErr: any) {
        log.warn('[CareersPipeline] Could not auto-send Round 1 email:', emailErr.message);
      }
    }

    // Notify workspace managers
    await notifyAdmins(
      workspaceId,
      `New job application received from ${firstName} ${lastName} (${email.fromEmail}). Trinity score: ${screenResult.score}/100. ${screenResult.score >= 60 ? 'Qualified — Round 1 email sent.' : 'Below threshold — not qualified.'}`,
      logId,
      {
        type: 'new_job_application',
        title: 'New Job Application',
        actionUrl: `/recruitment/candidates/${candidate.id}`,
        relatedEntityType: 'interview_candidate',
        relatedEntityId: candidate.id,
      },
    );

    return {
      downstreamRecordId: candidate.id,
      downstreamRecordType: 'interview_candidate',
    };
  } catch (err: any) {
    log.error('[CareersPipeline] Error processing application:', err.message);
    return {
      needsReview: true,
      reviewReason: `Careers pipeline error: ${err.message}`,
    };
  }
}

// ─── Workspace resolution from careers alias ──────────────────────────────────
// Supports:
//   careers@domain.com          → first workspace found (single-tenant fallback)
//   careers-acme@domain.com     → workspace whose company name starts with "acme"
//   jobs-acme@domain.com        → same

async function resolveWorkspaceFromCareersAlias(toEmail: string): Promise<string | null> {
  const local = toEmail.split('@')[0]?.toLowerCase() || '';

  // Extract org slug from alias: careers-ACME → 'acme', jobs-secureforce → 'secureforce'
  const orgSlugMatch = local.match(/^(?:careers|jobs|apply|recruitment)-(.+)$/);
  const orgSlug = orgSlugMatch?.[1];

  try {
    if (orgSlug) {
      // Try to match workspace by company name (case-insensitive prefix or contains)
      const allWorkspaces = await db.select({
        id: workspaces.id,
        companyName: workspaces.companyName,
      }).from(workspaces).limit(100);

      const slug = orgSlug.toLowerCase().replace(/[-_]/g, '');
      const matched = allWorkspaces.find(ws => {
        const name = (ws.companyName || '').toLowerCase().replace(/[\s-_]/g, '');
        return name.startsWith(slug) || name.includes(slug);
      });
      if (matched) return matched.id;
    }

    // Fallback: for generic careers@ or when orgSlug doesn't match, return null
    // (require explicit alias for security — no implicit first-workspace fallback)
    return null;
  } catch {
    return null;
  }
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

export async function processInboundEmail(email: ParsedInboundEmail): Promise<ProcessingResult> {
  // ── STEP 1: Initial log entry (RECEIVED) ──────────────────────────────────
  const category = detectCategoryFromRecipient(email.toEmail);
  const bodyPreview = (email.bodyText || '').slice(0, 500);

  const [logEntry] = await db.insert(inboundEmailLog).values({
    messageId: email.messageId || null,
    fromEmail: email.fromEmail,
    fromName: email.fromName || null,
    toEmail: email.toEmail,
    subject: email.subject || null,
    bodyPreview,
    bodyFull: email.bodyText || null,
    hasAttachments: (email.attachments?.length || 0) > 0,
    attachmentCount: email.attachments?.length || 0,
    attachmentMeta: (email.attachments || []).map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      url: a.url,
    })),
    category,
    processingStatus: 'processing',
    rawPayload: email.rawPayload || {},
    receivedAt: email.receivedAt || new Date(),
  }).returning({ id: inboundEmailLog.id });

  const logId = logEntry.id;

  // ── STEP 2: Dedup check (already done in route via unique constraint, but verify) ──
  // The UNIQUE constraint on message_id handles this at DB level.

  // ── STEP 3: Resolve sender identity ──────────────────────────────────────
  const sender = await resolveSender(email.fromEmail);
  const unverifiedSender = !sender;

  let workspaceId = sender?.workspaceId;

  // Update log with sender info
  await db.update(inboundEmailLog)
    .set({
      workspaceId: workspaceId || null,
      identifiedSenderId: sender?.id || null,
      identifiedSenderType: sender?.type || null,
      unverifiedSender,
    })
    .where(eq(inboundEmailLog.id, logId));

  // ── STEP 4: Handle unidentified senders ──────────────────────────────────
  if (unverifiedSender || !workspaceId) {
    // For support@, we still process — sender doesn't need to be recognized
    if (category === 'support') {
      workspaceId = PLATFORM_WORKSPACE_ID;
      const result = await processSupport(email, null, {}, workspaceId, logId);
      await db.update(inboundEmailLog)
        .set({
          processingStatus: result.needsReview ? 'needs_review' : 'processed',
          trinityActionTaken: 'inbound.support.process',
          downstreamRecordId: result.downstreamRecordId || null,
          downstreamRecordType: result.downstreamRecordType || null,
          needsReview: result.needsReview || false,
          reviewReason: result.reviewReason || null,
          processedAt: new Date(),
        })
        .where(eq(inboundEmailLog.id, logId));
      return { logId, status: result.needsReview ? 'needs_review' : 'processed', ...result, message: 'Support ticket created for unverified sender' };
    }

    // For careers@, jobs@, apply@, or careers-[orgshort]@ — external applicants are always
    // unknown senders. Resolve workspace from recipient alias (careers-ACME@... → ACME workspace)
    if (category === 'careers') {
      const resolvedCareersWorkspaceId = await resolveWorkspaceFromCareersAlias(email.toEmail);
      if (resolvedCareersWorkspaceId) {
        workspaceId = resolvedCareersWorkspaceId;
        await db.update(inboundEmailLog)
          .set({ workspaceId })
          .where(eq(inboundEmailLog.id, logId));
        // Fall through to careers pipeline below
      } else {
        // No workspace found for this careers alias — route to platform admin
        await db.update(inboundEmailLog)
          .set({
            processingStatus: 'needs_review',
            needsReview: true,
            reviewReason: `Careers email received but no matching workspace found for alias: ${email.toEmail}`,
            processedAt: new Date(),
          })
          .where(eq(inboundEmailLog.id, logId));
        return { logId, status: 'needs_review', message: 'Careers email — no matching workspace for alias' };
      }
    } else {
    // All other pipelines require a recognized sender
    await db.update(inboundEmailLog)
      .set({
        processingStatus: 'needs_review',
        needsReview: true,
        reviewReason: 'Sender email not found in any workspace employee or client record',
        processedAt: new Date(),
      })
      .where(eq(inboundEmailLog.id, logId));

    // Notify platform admin
    try {
      await (storage.createNotification({
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId: 'root',
        type: 'inbound_email_unmatched',
        title: 'Inbound Email — Unmatched Sender',
        message: `Email from ${email.fromEmail} to ${email.toEmail} could not be matched to any workspace. Manual review required.`,
        actionUrl: `/audit?ref=email-${logId}`,
        relatedEntityType: 'inbound_email_log',
        relatedEntityId: logId,
      } as any));
    } catch (err: unknown) {
      log.warn('[TrinityInboundEmail] Admin notification for unmatched sender failed (non-blocking):', err instanceof Error ? err.message : String(err));
    }

    return { logId, status: 'needs_review', message: 'Sender not matched — flagged for admin review' };
    } // end else (non-careers, non-support unverified sender)
  } // end if (unverifiedSender || !workspaceId)

  // ── Phase 30: Tier check — Professional required for doc routing ──────────
  // calloff, incident, and support emails are always processed (safety features).
  // docs routing requires Professional tier or higher.
  if (category === 'docs' && workspaceId) {
    try {
      const workspaceTier = await getWorkspaceTier(workspaceId);
      if (!hasTierAccess(workspaceTier, 'professional')) {
        await db.update(inboundEmailLog)
          .set({
            processingStatus: 'tier_not_met',
            needsReview: true,
            reviewReason: `Document routing requires Professional plan. Workspace is on ${workspaceTier} plan.`,
            processedAt: new Date(),
          })
          .where(eq(inboundEmailLog.id, logId));
        return { logId, status: 'tier_not_met', message: `Document email routing requires Professional plan (workspace on ${workspaceTier})` };
      }
    } catch (tierErr) {
      // Non-blocking — proceed with processing on tier check failure
    }
  }

  // ── STEP 5: Trinity intent extraction ────────────────────────────────────
  // Note: careers emails bypass extractStructuredData — processed by processCareersApplication directly
  const actionMap: Record<EmailCategory, string> = {
    calloff: 'inbound.calloff.process',
    incident: 'inbound.incident.process',
    docs: 'inbound.docs.process',
    support: 'inbound.support.process',
    careers: 'interview.screen',
    unknown: 'inbound.email.query',
  };

  let aiData: any = {};
  let confidence = 1.0;
  if (category !== 'careers') {
    const extracted = await extractStructuredData(
      category,
      email.subject || '',
      email.bodyText || '',
      sender?.name || email.fromName || email.fromEmail,
    );
    aiData = extracted.data;
    confidence = extracted.confidence;
  }

  // ── STEP 6: Route to correct pipeline ────────────────────────────────────
  let pipelineResult: Awaited<ReturnType<typeof processCalloff>> = {};
  try {
    if (category === 'calloff') {
      pipelineResult = await processCalloff(email, sender, aiData, logId);
    } else if (category === 'incident') {
      pipelineResult = await processIncident(email, sender, aiData, logId);
    } else if (category === 'docs') {
      pipelineResult = await processDocs(email, sender, aiData, logId);
    } else if (category === 'support') {
      pipelineResult = await processSupport(email, sender, aiData, workspaceId, logId);
    } else if (category === 'careers') {
      pipelineResult = await processCareersApplication(email, workspaceId!, logId);
    } else {
      pipelineResult = {
        needsReview: true,
        reviewReason: `Unknown email category — recipient: ${email.toEmail}`,
      };
    }
  } catch (pipelineErr: any) {
    const failMsg = `Pipeline ${category} threw: ${pipelineErr.message}`;
    log.error('[InboundProcessor] Pipeline error:', failMsg);
    await db.update(inboundEmailLog)
      .set({
        processingStatus: 'failed',
        failureReason: failMsg,
        processedAt: new Date(),
      })
      .where(eq(inboundEmailLog.id, logId));

    // Publish event so Trinity and monitors react
    publishEvent(
      platformEventBus.publish({
        type: 'inbound_email_failed',
        category: 'communications',
        title: 'Inbound Email Pipeline Failure',
        description: failMsg,
        workspaceId,
        metadata: { logId, category, fromEmail: email.fromEmail },
        visibility: 'org_leadership',
      }),
      '[InboundProcessor] pipeline failure event publish',
    );

    return { logId, status: 'failed', message: failMsg };
  }

  // ── STEP 7: Final log update ──────────────────────────────────────────────
  const finalStatus = pipelineResult.needsReview ? 'needs_review' : 'processed';
  await db.update(inboundEmailLog)
    .set({
      processingStatus: finalStatus,
      trinityActionTaken: actionMap[category],
      trinityConfidence: String(confidence),
      downstreamRecordId: pipelineResult.downstreamRecordId || null,
      downstreamRecordType: pipelineResult.downstreamRecordType || null,
      needsReview: pipelineResult.needsReview || false,
      reviewReason: pipelineResult.reviewReason || null,
      processedAt: new Date(),
    })
    .where(eq(inboundEmailLog.id, logId));

  return {
    logId,
    status: finalStatus,
    downstreamRecordId: pipelineResult.downstreamRecordId,
    downstreamRecordType: pipelineResult.downstreamRecordType,
    message: `${category} pipeline: ${finalStatus}`,
  };
}

/**
 * Manually reprocess a flagged inbound email by its log ID.
 * Used by the Trinity inbound.email.reprocess action.
 */
export async function reprocessInboundEmail(logId: string): Promise<ProcessingResult> {
  const [entry] = await db.select().from(inboundEmailLog).where(eq(inboundEmailLog.id, logId)).limit(1);
  if (!entry) throw new Error(`Inbound email log not found: ${logId}`);

  const email: ParsedInboundEmail = {
    messageId: undefined, // Clear so re-processing doesn't hit unique constraint
    fromEmail: entry.fromEmail,
    fromName: entry.fromName || undefined,
    toEmail: entry.toEmail,
    subject: entry.subject || undefined,
    bodyText: entry.bodyFull || undefined,
    attachments: (entry.attachmentMeta as any[]) || [],
    rawPayload: entry.rawPayload as Record<string, unknown> || {},
  };

  return processInboundEmail(email);
}
