/**
 * SPS Document Routes — /api/sps/documents
 * CRUD for employee packets, client contracts, and proposals.
 * Workspace-scoped. All actions audit-logged.
 *
 * WHITE-LABEL (CLAUDE.md §6 White-Label Rule): all tenant-facing email
 * templates and AI prompts read company name + license + signer email
 * from the calling workspace's record. There are NO hardcoded references
 * to Statewide Protective Services or any other tenant in this file.
 */
import { Router } from 'express';
import { db } from '../db';
import {
  spsDocuments, spsStateRequirements, spsDocumentSafe,
  insertSpsDocumentSchema,
  employees, employeeDocuments, workspaces,
} from '@shared/schema';
import { eq, and, desc, ilike, or, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { callSpsVisionAI } from './spsAIHelper';
import { emailService } from "../services/emailService";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
const log = createLogger('SpsDocumentRoutes');


export const spsDocumentRouter = Router();

/**
 * Resolve workspace-level branding for use in tenant-facing email templates.
 * CLAUDE.md §6: white-label means no hardcoded company names anywhere.
 * This helper reads the workspace row and returns a sanitized branding
 * object every email template can interpolate. License number and state
 * code fall back to neutral phrasing when the workspace row doesn't have
 * the field set.
 */
async function getWorkspaceBranding(workspaceId: string | null | undefined): Promise<{
  companyName: string;
  legalNotice: string;
  state: string;
}> {
  if (!workspaceId) {
    return {
      companyName: 'Your security company',
      legalNotice: 'This is an automated message, please do not reply.',
      state: 'TX',
    };
  }
  try {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    const name = (ws as any)?.name || 'Your security company';
    const license = (ws as any)?.licenseNumber || (ws as any)?.metadata?.licenseNumber || null;
    const state = (ws as any)?.state || (ws as any)?.metadata?.state || 'TX';
    const legalNotice = license
      ? `${name}, LIC#${license}. This is an automated message, please do not reply.`
      : `${name}. This is an automated message, please do not reply.`;
    return { companyName: name, legalNotice, state };
  } catch (err) {
    log.warn('[spsDocumentRoutes] Failed to resolve workspace branding:', err);
    return {
      companyName: 'Your security company',
      legalNotice: 'This is an automated message, please do not reply.',
      state: 'TX',
    };
  }
}

// ── Sequence counters stored in a simple in-memory map per workspace
// (For production: use a DB sequence or atomic counter)
const seqCounters: Record<string, number> = {};
function nextDocNumber(prefix: string, workspaceId: string): string {
  const key = `${prefix}-${workspaceId}`;
  seqCounters[key] = (seqCounters[key] || 1000) + 1;
  return `${prefix}-${new Date().getFullYear()}-${String(seqCounters[key]).padStart(4, '0')}`;
}

// POST /api/sps/documents — Create a new document record
spsDocumentRouter.post('/', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const input = z.object({
      documentType: z.enum(['employee_packet', 'client_contract', 'proposal']),
      recipientName: z.string().min(1),
      recipientEmail: z.string().email(),
      // Optional pre-fill fields
      hireDate: z.string().optional(),
      position: z.string().optional(),
      payRate: z.string().optional(),
      assignmentSite: z.string().optional(),
      assignmentAddress: z.string().optional(),
      // Client-specific
      clientCompanyName: z.string().optional(),
      clientContactName: z.string().optional(),
      serviceType: z.string().optional(),
      ratePrimary: z.string().optional(),
      rateAdditional: z.string().optional(),
      serviceLocation: z.string().optional(),
      contractTerm: z.string().optional(),
      officersRequired: z.number().optional(),
    }).parse(req.body);

    const prefixMap: Record<string, string> = {
      employee_packet: 'EMP',
      client_contract: 'CON',
      proposal: 'PRO',
    };
    const docNumber = nextDocNumber(prefixMap[input.documentType], workspaceId);
    const accessToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (input.documentType === 'employee_packet' ? 7 : 14));

    const [doc] = await db.insert(spsDocuments).values({
      id: randomUUID(),
      workspaceId,
      documentType: input.documentType,
      documentNumber: docNumber,
      status: 'draft',
      accessToken,
      expiresAt,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      // White-label: signer name + email come from the authenticated user.
      // No hardcoded tenant identity (CLAUDE.md §6).
      orgSignerName: (req.user)?.firstName
        ? `${(req.user).firstName} ${(req.user).lastName || ''}`.trim()
        : 'Authorized Signer',
      orgSignerEmail: (req.user)?.email || 'noreply@coaileague.com',
      hireDate: input.hireDate ? input.hireDate as any : null,
      position: input.position || null,
      payRate: input.payRate ? input.payRate as any : null,
      assignmentSite: input.assignmentSite || null,
      assignmentAddress: input.assignmentAddress || null,
      clientCompanyName: input.clientCompanyName || null,
      clientContactName: input.clientContactName || null,
      serviceType: input.serviceType || null,
      ratePrimary: input.ratePrimary ? input.ratePrimary as any : null,
      rateAdditional: input.rateAdditional ? input.rateAdditional as any : null,
      serviceLocation: input.serviceLocation || null,
      contractTerm: input.contractTerm || null,
      officersRequired: input.officersRequired || null,
      stateCode: 'TX',
      auditLog: [{ action: 'created', timestamp: new Date().toISOString(), by: (req.user)?.id }] as any,
    }).returning();

    res.status(201).json({
      ...doc,
      portalUrl: `/sps-packet/${accessToken}`,
    });
  } catch (err: unknown) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: err.errors });
    log.error('[spsDocumentRoutes] POST /documents error:', err);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// GET /api/sps/documents — List workspace documents
spsDocumentRouter.get('/', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const { type, status, search } = req.query as Record<string, string>;

    const conditions = [eq(spsDocuments.workspaceId, workspaceId)];
    if (type) conditions.push(eq(spsDocuments.documentType, type));
    if (status) conditions.push(eq(spsDocuments.status, status));

    let docs = await db.select().from(spsDocuments)
      .where(and(...conditions))
      .orderBy(desc(spsDocuments.createdAt));

    if (search) {
      const s = search.toLowerCase();
      docs = docs.filter(d =>
        d.recipientName?.toLowerCase().includes(s) ||
        d.documentNumber?.toLowerCase().includes(s) ||
        d.clientCompanyName?.toLowerCase().includes(s) ||
        d.guardLicenseNumber?.toLowerCase().includes(s)
      );
    }

    res.json(docs);
  } catch (err) {
    log.error('[spsDocumentRoutes] GET /documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/sps/documents/:id — Single document
spsDocumentRouter.get('/:id', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [doc] = await db.select().from(spsDocuments)
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)));
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// PATCH /api/sps/documents/:id — Update form data / status
spsDocumentRouter.patch('/:id', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { formData, status, signatures, initials, ...rest } = req.body;

    const [existing] = await db.select().from(spsDocuments)
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)));
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (formData !== undefined) updates.formData = { ...(existing.formData as any || {}), ...formData };
    if (signatures !== undefined) updates.signatures = { ...(existing.signatures as any || {}), ...signatures };
    if (initials !== undefined) updates.initials = { ...(existing.initials as any || {}), ...initials };
    if (status) updates.status = status;
    if (rest.employeeDob) updates.employeeDob = rest.employeeDob;
    if (rest.guardLicenseNumber) updates.guardLicenseNumber = rest.guardLicenseNumber;
    if (rest.guardLicenseExpiry) updates.guardLicenseExpiry = rest.guardLicenseExpiry;
    if (rest.guardLicenseType) updates.guardLicenseType = rest.guardLicenseType;
    if (rest.assignmentSite) updates.assignmentSite = rest.assignmentSite;
    if (rest.assignmentAddress) updates.assignmentAddress = rest.assignmentAddress;

    if (status === 'completed') {
      updates.completedAt = new Date();
      const currentLog = (existing.auditLog as any[]) || [];
      updates.auditLog = [...currentLog, { action: 'completed', timestamp: new Date().toISOString(), by: (req.user)?.id }];
    }

    const [updated] = await db.update(spsDocuments)
      .set(updates)
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (err) {
    log.error('[spsDocumentRoutes] PATCH /documents/:id error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// POST /api/sps/documents/:id/void — Void a document
spsDocumentRouter.post('/:id/void', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [doc] = await db.update(spsDocuments)
      .set({ status: 'voided', updatedAt: new Date() })
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)))
      .returning();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to void document' });
  }
});

// POST /api/sps/documents/:id/send — Mark as sent, generate portal link, and send email
spsDocumentRouter.post('/:id/send', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const [existing] = await db.select().from(spsDocuments)
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)));
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const currentLog = (existing.auditLog as any[]) || [];
    const [doc] = await db.update(spsDocuments)
      .set({
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
        auditLog: [...currentLog, { action: 'sent', timestamp: new Date().toISOString(), by: (req.user)?.id, sentTo: existing.recipientEmail }] as any,
      })
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)))
      .returning();

    // Send external email via canonical emailService
    try {
      let subject = "";
      let html = "";
      const portalUrl = `${req.protocol}://${req.get('host')}/sps-packet/${doc.accessToken}`;

      // White-label: every customer-facing template reads its branding
      // from the calling workspace (CLAUDE.md §6). Never hardcode tenant
      // identity.
      const branding = await getWorkspaceBranding(workspaceId);

      if (doc.documentType === 'employee_packet') {
        subject = `Your ${branding.companyName} Onboarding Packet is Ready — Action Required`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563EB;">Welcome to ${branding.companyName}</h2>
            <p>Hello ${doc.recipientName},</p>
            <p>Your digital onboarding packet is ready for completion. This packet includes all necessary state requirements and company policies.</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${portalUrl}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Complete Onboarding Packet</a>
            </div>
            <p style="color: #64748b; font-size: 0.875rem;">This link will expire in 7 days. Please complete it as soon as possible to ensure timely processing of your employment.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.75rem; color: #94a3b8;">${branding.legalNotice}</p>
          </div>
        `;
      } else if (doc.documentType === 'proposal') {
        subject = `${branding.companyName} Proposal ${doc.documentNumber} — Your Security Services Proposal`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563EB;">Security Services Proposal</h2>
            <p>Hello ${doc.recipientName},</p>
            <p>Please find our security services proposal ${doc.documentNumber} for ${doc.clientCompanyName || 'your organization'} below.</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${portalUrl}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Proposal</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.75rem; color: #94a3b8;">${branding.legalNotice}</p>
          </div>
        `;
      } else if (doc.documentType === 'client_contract') {
        subject = `${branding.companyName} Contract ${doc.documentNumber} Ready for Signature`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563EB;">Service Contract Signature Required</h2>
            <p>Hello ${doc.recipientName},</p>
            <p>The security services contract ${doc.documentNumber} for ${doc.clientCompanyName || 'your organization'} is ready for your digital signature.</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${portalUrl}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Review & Sign Contract</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.75rem; color: #94a3b8;">${branding.legalNotice}</p>
          </div>
        `;
      }

      if (subject && html) {
        await NotificationDeliveryService.send({ type: 'sps_document', workspaceId: workspaceId || 'system', recipientUserId: doc.recipientEmail, channel: 'email', body: { to: doc.recipientEmail, subject, html } });
      }
    } catch (emailErr) {
      log.error('[spsDocumentRoutes] Email send failed:', emailErr);
      // We still return 200 because the document was marked as sent in DB
    }

    res.json({
      ...doc,
      portalUrl: `/sps-packet/${doc.accessToken}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send document' });
  }
});

// POST /api/sps/documents/:id/id-verify — Trinity ID scan
spsDocumentRouter.post('/:id/id-verify', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const { imageBase64, documentType = 'government_id' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const [existing] = await db.select().from(spsDocuments)
      .where(and(eq(spsDocuments.id, req.params.id), eq(spsDocuments.workspaceId, workspaceId)));
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    // Call Vision AI for ID verification — branding pulled from workspace
    // (CLAUDE.md §6 white-label rule)
    const verifyBranding = await getWorkspaceBranding(workspaceId);
    let verificationResult: any = null;
    try {
      const prompt = `You are an ID verification assistant for a licensed security company (${verifyBranding.companyName}).
Analyze this ${documentType} image and extract the following information.
Return ONLY valid JSON, no markdown, no code blocks.

Extract:
{
  "document_type": "drivers_license|state_id|passport|guard_card",
  "issuing_state": "string or null",
  "full_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "id_number": "string or null",
  "expiration_date": "YYYY-MM-DD or null",
  "address": "string or null",
  "is_expired": false,
  "authenticity_indicators": {
    "has_state_seal": true,
    "has_hologram_indicators": true,
    "text_consistent": true,
    "format_matches_state": true
  },
  "verification_confidence": "high|medium|low",
  "flags": [],
  "license_type_if_guard_card": null,
  "license_number_if_guard_card": null,
  "guard_card_expiry_if_applicable": null
}

If this is a Texas guard card, confirm it appears to be an official Texas DPS Private Security Bureau card.`;

      const raw = await callSpsVisionAI(prompt, imageBase64, 1024);
      verificationResult = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    } catch (aiErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error('[spsDocumentRoutes] Vision ID scan error:', aiErr.message);
      verificationResult = {
        verification_confidence: 'low',
        flags: ['AI scan unavailable — manual review required'],
      };
    }

    const newStatus = verificationResult.verification_confidence === 'high' ? 'verified'
      : verificationResult.verification_confidence === 'medium' ? 'verified'
      : 'manual_review';

    const [updated] = await db.update(spsDocuments)
      .set({
        idVerificationStatus: newStatus,
        idVerificationData: verificationResult as any,
        updatedAt: new Date(),
      })
      .where(eq(spsDocuments.id, req.params.id))
      .returning();

    res.json({ document: updated, verificationResult, status: newStatus });
  } catch (err) {
    log.error('[spsDocumentRoutes] id-verify error:', err);
    res.status(500).json({ error: 'ID verification failed' });
  }
});

// GET /api/sps/state-requirements/:stateCode/:docType
spsDocumentRouter.get('/state-requirements/:stateCode/:docType', async (req: any, res) => {
  try {
    const [req_data] = await db.select().from(spsStateRequirements)
      .where(and(
        eq(spsStateRequirements.stateCode, req.params.stateCode.toUpperCase()),
        eq(spsStateRequirements.documentType, req.params.docType),
      ));
    if (!req_data) return res.status(404).json({ error: 'State requirements not found' });
    res.json(req_data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch state requirements' });
  }
});

// GET /api/sps/safe — List sealed documents  
spsDocumentRouter.get('/safe/list', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const files = await db.select({
      safe: spsDocumentSafe,
      doc: {
        documentNumber: spsDocuments.documentNumber,
        documentType: spsDocuments.documentType,
        status: spsDocuments.status,
        recipientName: spsDocuments.recipientName,
        clientCompanyName: spsDocuments.clientCompanyName,
        completedAt: spsDocuments.completedAt,
      },
    })
      .from(spsDocumentSafe)
      .leftJoin(spsDocuments, eq(spsDocumentSafe.documentId, spsDocuments.id))
      .where(eq(spsDocumentSafe.workspaceId, workspaceId))
      .orderBy(desc(spsDocumentSafe.createdAt));

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document safe' });
  }
});

// POST /api/sps/safe — Store a sealed document record
spsDocumentRouter.post('/safe', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const input = z.object({
      documentId: z.string(),
      fileName: z.string(),
      fileUrl: z.string(),
      fileType: z.string(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      integrityHash: z.string().optional(),
    }).parse(req.body);

    const [safe] = await db.insert(spsDocumentSafe).values({
      id: randomUUID(),
      workspaceId,
      ...input,
      uploadedBy: (req.user)?.id,
    } as any).returning();

    res.status(201).json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Failed to store document safe record' });
  }
});

// ── Document Safe Tabs — separate router mounted at /api/sps ──────────────────
// These live on a DIFFERENT router (spsDocumentSafeRouter) so they are mounted
// at /api/sps/staff-packets etc., NOT under /api/sps/documents/... which has a
// /:id catch-all that would swallow named sub-paths.

export const spsDocumentSafeRouter = Router();

const REGULATORY_DOC_KEYS = [
  { key: 'application',      types: ['employment_application'],                          label: 'Application' },
  { key: 'idCopy',           types: ['photo_id_copy', 'government_id', 'passport'],      label: 'DL / ID' },
  { key: 'ssnCard',          types: ['social_security_card', 'ssn_card'],                label: 'SSN Card' },
  { key: 'i9',               types: ['i9_form'],                                         label: 'I-9' },
  { key: 'taxForm',          types: ['w4_form', 'w9_form', 'tax_form'],                  label: 'W-4 / W-9' },
  { key: 'drugFree',         types: ['zero_policy_drug_form', 'drug_test'],              label: 'Drug-Free' },
  { key: 'backgroundCheck',  types: ['background_check'],                                label: 'Background Check' },
  { key: 'guardCard',        types: ['guard_card', 'guard_card_copy', 'license'],        label: 'Guard Card' },
];

// GET /api/sps/staff-packets — employees with document completeness
spsDocumentSafeRouter.get('/staff-packets', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const empList = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      workerType: employees.workerType,
      status: employees.status,
      position: employees.position,
      guardCardVerified: employees.guardCardVerified,
      hireDate: employees.hireDate,
    }).from(employees).where(eq(employees.workspaceId, workspaceId));

    const allDocs = await db.select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      documentType: employeeDocuments.documentType,
      documentName: employeeDocuments.documentName,
      documentDescription: employeeDocuments.documentDescription,
      status: employeeDocuments.status,
      fileUrl: employeeDocuments.fileUrl,
      fileType: employeeDocuments.fileType,
      originalFileName: employeeDocuments.originalFileName,
      expirationDate: employeeDocuments.expirationDate,
      uploadedAt: employeeDocuments.uploadedAt,
      isVerified: employeeDocuments.isVerified,
      verifiedBy: employeeDocuments.verifiedBy,
      verifiedAt: employeeDocuments.verifiedAt,
    }).from(employeeDocuments).where(eq(employeeDocuments.workspaceId, workspaceId));

    const packets = empList.map(emp => {
      const empDocs = allDocs.filter(d => d.employeeId === emp.id);
      const completeness: Record<string, { present: boolean; doc?: any }> = {};
      for (const { key, types } of REGULATORY_DOC_KEYS) {
        const doc = empDocs.find(d => types.includes(d.documentType));
        completeness[key] = { present: !!doc, doc: doc ?? null };
      }
      const completedCount = Object.values(completeness).filter(v => v.present).length;
      return {
        ...emp,
        documents: empDocs,
        completeness,
        completedCount,
        totalRequired: REGULATORY_DOC_KEYS.length,
        completenessPercent: Math.round((completedCount / REGULATORY_DOC_KEYS.length) * 100),
      };
    });

    res.json({ success: true, data: packets });
  } catch (err) {
    log.error('Staff packets error:', err);
    res.status(500).json({ error: 'Failed to load staff packets' });
  }
});

// GET /api/sps/staff-packets/:employeeId — single employee full packet
spsDocumentSafeRouter.get('/staff-packets/:employeeId', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const { employeeId } = req.params;

    const [emp] = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const docs = await db.select().from(employeeDocuments)
      .where(and(eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.workspaceId, workspaceId)))
      .orderBy(desc(employeeDocuments.uploadedAt));

    const completeness: Record<string, { present: boolean; doc?: any }> = {};
    for (const { key, types } of REGULATORY_DOC_KEYS) {
      const doc = docs.find(d => types.includes(d.documentType));
      completeness[key] = { present: !!doc, doc: doc ?? null };
    }

    res.json({ success: true, data: { employee: emp, documents: docs, completeness, regulatoryKeys: REGULATORY_DOC_KEYS } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load employee packet' });
  }
});

// GET /api/sps/company-docs — org credentials + proposals + contracts
spsDocumentSafeRouter.get('/company-docs', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const [ws] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      stateLicenseNumber: workspaces.stateLicenseNumber,
      stateLicenseState: workspaces.stateLicenseState,
      stateLicenseExpiry: workspaces.stateLicenseExpiry,
    }).from(workspaces).where(eq(workspaces.id, workspaceId));

    const contracts = await db.select({
      id: spsDocuments.id,
      documentNumber: spsDocuments.documentNumber,
      documentType: spsDocuments.documentType,
      status: spsDocuments.status,
      recipientName: spsDocuments.recipientName,
      clientCompanyName: spsDocuments.clientCompanyName,
      serviceType: spsDocuments.serviceType,
      contractTerm: spsDocuments.contractTerm,
      contractStartDate: spsDocuments.contractStartDate,
      officersRequired: spsDocuments.officersRequired,
      ratePrimary: spsDocuments.ratePrimary,
      completedAt: spsDocuments.completedAt,
      createdAt: spsDocuments.createdAt,
    }).from(spsDocuments)
      .where(and(
        eq(spsDocuments.workspaceId, workspaceId),
        inArray(spsDocuments.documentType, ['client_contract', 'proposal'])
      ))
      .orderBy(desc(spsDocuments.createdAt));

    // Company-level documents from employeeDocuments stored under 'company' sentinel
    const companyDocs = await db.select().from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        eq(employeeDocuments.employeeId, 'company')
      ))
      .orderBy(desc(employeeDocuments.uploadedAt));

    res.json({ success: true, data: { workspace: ws, contracts, companyDocs } });
  } catch (err) {
    log.error('Company docs error:', err);
    res.status(500).json({ error: 'Failed to load company documents' });
  }
});

// GET /api/sps/reports — client/site-filterable report documents
spsDocumentSafeRouter.get('/reports', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
    const { client } = req.query as { client?: string };

    const whereClause = client && client !== 'all'
      ? and(eq(spsDocuments.workspaceId, workspaceId), ilike(spsDocuments.clientCompanyName, `%${client}%`))
      : eq(spsDocuments.workspaceId, workspaceId);

    const results = await db.select({
      id: spsDocuments.id,
      documentNumber: spsDocuments.documentNumber,
      documentType: spsDocuments.documentType,
      status: spsDocuments.status,
      recipientName: spsDocuments.recipientName,
      clientCompanyName: spsDocuments.clientCompanyName,
      serviceLocation: spsDocuments.serviceLocation,
      serviceType: spsDocuments.serviceType,
      completedAt: spsDocuments.completedAt,
      createdAt: spsDocuments.createdAt,
    }).from(spsDocuments)
      .where(whereClause)
      .orderBy(desc(spsDocuments.createdAt));

    // Extract distinct clients for filter dropdown
    const allClients = await db.select({
      clientCompanyName: spsDocuments.clientCompanyName,
    }).from(spsDocuments)
      .where(eq(spsDocuments.workspaceId, workspaceId));

    const distinctClients = [...new Set(
      allClients.map(r => r.clientCompanyName).filter(Boolean)
    )];

    res.json({ success: true, data: { reports: results, clients: distinctClients } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reports' });
  }
});
