/**
 * SPS Public Routes — /api/public/sps
 * Token-based access for external signers (employees, clients).
 * No authentication required — access controlled via access_token.
 */
import { Router } from 'express';
import { db } from '../db';
import { spsDocuments, spsNegotiationThreads, spsNegotiationMessages, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { callSpsVisionAI } from './spsAIHelper';
import { emailService } from "../services/emailService";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { createLogger } from '../lib/logger';
const log = createLogger('SpsPublicRoutes');


export const spsPublicRouter = Router();

// GET /api/public/sps/:token — Load document for external signing
spsPublicRouter.get('/:token', async (req, res) => {
  try {
    const [doc] = await db.select().from(spsDocuments)
      .where(eq(spsDocuments.accessToken, req.params.token));

    if (!doc) return res.status(404).json({ error: 'Document not found or link expired' });

    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'This signing link has expired' });
    }

    if (doc.status === 'voided') {
      return res.status(410).json({ error: 'This document has been voided' });
    }

    // Fetch workspace company details for white-label rendering
    const [ws] = await db.select({
      companyName: workspaces.companyName,
      stateLicenseNumber: workspaces.stateLicenseNumber,
      name: workspaces.name,
    }).from(workspaces).where(eq(workspaces.id, doc.workspaceId));

    // Mark as viewed if first view
    if (doc.status === 'sent' || doc.status === 'draft') {
      const currentLog = (doc.auditLog as any[]) || [];
      await db.update(spsDocuments)
        .set({
          status: 'viewed',
          viewedAt: new Date(),
          updatedAt: new Date(),
          auditLog: [...currentLog, {
            action: 'viewed',
            timestamp: new Date().toISOString(),
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
          }] as any,
        })
        .where(eq(spsDocuments.id, doc.id));
    }

    // Return document (redact sensitive fields for display)
    res.json({
      id: doc.id,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      status: doc.status,
      recipientName: doc.recipientName,
      recipientEmail: doc.recipientEmail,
      orgSignerName: doc.orgSignerName,
      hireDate: doc.hireDate,
      position: doc.position,
      payRate: doc.payRate,
      assignmentSite: doc.assignmentSite,
      assignmentAddress: doc.assignmentAddress,
      guardLicenseType: doc.guardLicenseType,
      clientCompanyName: doc.clientCompanyName,
      serviceType: doc.serviceType,
      ratePrimary: doc.ratePrimary,
      rateAdditional: doc.rateAdditional,
      serviceLocation: doc.serviceLocation,
      contractTerm: doc.contractTerm,
      officersRequired: doc.officersRequired,
      formData: doc.formData || {},
      signatures: doc.signatures || {},
      initials: doc.initials || {},
      stateCode: doc.stateCode,
      expiresAt: doc.expiresAt,
      idVerificationStatus: doc.idVerificationStatus,
      // Workspace branding (white-label)
      workspaceCompanyName: ws?.companyName || ws?.name || null,
      workspaceLicenseNumber: ws?.stateLicenseNumber || null,
    });
  } catch (err) {
    log.error('[spsPublicRoutes] GET /:token error:', err);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

// PATCH /api/public/sps/:token — Save progress (auto-save)
spsPublicRouter.patch('/:token', async (req, res) => {
  try {
    const [doc] = await db.select().from(spsDocuments)
      .where(eq(spsDocuments.accessToken, req.params.token));

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'completed' || doc.status === 'voided') {
      return res.status(400).json({ error: 'Document is sealed' });
    }

    const { formData, signatures, initials, fieldUpdates } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (formData) updates.formData = { ...(doc.formData as any || {}), ...formData };
    if (signatures) updates.signatures = { ...(doc.signatures as any || {}), ...signatures };
    if (initials) updates.initials = { ...(doc.initials as any || {}), ...initials };

    // Update specific employee fields if provided
    if (fieldUpdates) {
      const allowedFields = [
        'employeeDob', 'employeePob', 'employeeSsnLast4', 'employeeAddress',
        'employeePhone', 'guardLicenseNumber', 'guardLicenseExpiry', 'guardLicenseType',
        'uniformSize',
      ];
      for (const [key, val] of Object.entries(fieldUpdates)) {
        if (allowedFields.includes(key)) updates[key] = val;
      }
    }

    if (doc.status === 'viewed') {
      updates.status = 'partially_signed';
    }

    const [updated] = await db.update(spsDocuments)
      .set(updates)
      .where(eq(spsDocuments.id, doc.id))
      .returning();

    res.json({ saved: true, status: updated.status });
  } catch (err) {
    log.error('[spsPublicRoutes] PATCH /:token error:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// POST /api/public/sps/:token/submit — Final submission / seal
spsPublicRouter.post('/:token/submit', async (req, res) => {
  try {
    const [doc] = await db.select().from(spsDocuments)
      .where(eq(spsDocuments.accessToken, req.params.token));

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'completed') return res.status(400).json({ error: 'Document already completed' });
    if (doc.status === 'voided') return res.status(400).json({ error: 'Document is voided' });

    const { formData, signatures, initials, signerName } = req.body;

    const currentLog = (doc.auditLog as any[]) || [];
    const finalAuditEntry = {
      action: 'submitted',
      signerName: signerName || doc.recipientName,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    };

    const [completed] = await db.update(spsDocuments)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        formData: { ...(doc.formData as any || {}), ...(formData || {}) } as any,
        signatures: { ...(doc.signatures as any || {}), ...(signatures || {}) } as any,
        initials: { ...(doc.initials as any || {}), ...(initials || {}) } as any,
        auditLog: [...currentLog, finalAuditEntry] as any,
      })
      .where(eq(spsDocuments.id, doc.id))
      .returning();

    // Send completion emails via canonical emailService
    try {
      const docTypeLabel = completed.documentType === 'employee_packet' ? 'Onboarding Packet' : 'Contract';
      const subject = `${docTypeLabel} Completed — ${completed.documentNumber}`;

      // Resolve workspace identity for email footer
      let wsFooter = 'Your security company';
      try {
        const wsId = completed.workspaceId;
        if (wsId) {
          const [ws] = await db.select({ companyName: workspaces.companyName, licenseNumber: workspaces.stateLicenseNumber })
            .from(workspaces).where(eq(workspaces.id, wsId));
          if (ws?.companyName) {
            wsFooter = ws.companyName + (ws.licenseNumber ? `, LIC#${ws.licenseNumber}` : '');
          }
        }
      } catch { /* fall back to default */ }

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #16a34a;">Document Completed</h2>
          <p>The following document has been successfully completed and sealed:</p>
          <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Document Type:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${docTypeLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Document Number:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${completed.documentNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #64748b;">Completed At:</td>
              <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">${new Date(completed.completedAt!).toLocaleString()}</td>
            </tr>
          </table>
          <p>A copy of this document has been stored in the Document Safe.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 0.75rem; color: #94a3b8;">${wsFooter}.</p>
        </div>
      `;

      await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'sps_document', workspaceId: completed.workspaceId || 'system', recipientUserId: completed.recipientEmail, channel: 'email', body: { to: completed.recipientEmail, subject, html } });
      if (completed.orgSignerEmail) {
        await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'sps_document', workspaceId: completed.workspaceId || 'system', recipientUserId: completed.orgSignerEmail, channel: 'email', body: { to: completed.orgSignerEmail, subject, html } });
      }
    } catch (emailErr) {
      log.error('[spsPublicRoutes] Completion email failed:', emailErr);
    }

    res.json({
      success: true,
      documentNumber: completed.documentNumber,
      completedAt: completed.completedAt,
      message: `Your ${completed.documentType === 'employee_packet' ? 'onboarding packet' : 'contract'} has been submitted successfully. You will receive a confirmation email shortly.`,
    });
  } catch (err) {
    log.error('[spsPublicRoutes] POST /:token/submit error:', err);
    res.status(500).json({ error: 'Failed to submit document' });
  }
});

// POST /api/public/sps/:token/id-verify — Public ID verification (for signing portal)
spsPublicRouter.post('/:token/id-verify', async (req, res) => {
  try {
    const [doc] = await db.select().from(spsDocuments)
      .where(eq(spsDocuments.accessToken, req.params.token));
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { imageBase64, documentType = 'government_id' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    let verificationResult: any = {
      verification_confidence: 'low',
      flags: ['AI scan unavailable — manual review required'],
    };

    try {
      const prompt = `You are an ID verification assistant for a licensed Texas security company.
Analyze this ${documentType} image and extract information. Return ONLY valid JSON:
{
  "document_type": "drivers_license|state_id|passport|guard_card",
  "issuing_state": "string or null",
  "full_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "id_number": "string or null",
  "expiration_date": "YYYY-MM-DD or null",
  "address": "string or null",
  "is_expired": false,
  "authenticity_indicators": { "has_state_seal": true, "text_consistent": true },
  "verification_confidence": "high|medium|low",
  "flags": [],
  "license_type_if_guard_card": null,
  "license_number_if_guard_card": null,
  "guard_card_expiry_if_applicable": null
}`;
      const raw = await callSpsVisionAI(prompt, imageBase64, 1024);
      verificationResult = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    } catch { }

    const newStatus = verificationResult.verification_confidence === 'high' ? 'verified'
      : verificationResult.verification_confidence === 'medium' ? 'verified'
      : 'manual_review';

    await db.update(spsDocuments)
      .set({
        idVerificationStatus: newStatus,
        idVerificationData: verificationResult as any,
        updatedAt: new Date(),
      })
      .where(eq(spsDocuments.id, doc.id));

    res.json({ verificationResult, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'ID verification failed' });
  }
});

// Public proposal portal for client to view + reply
spsPublicRouter.get('/proposal/:clientToken', async (req, res) => {
  try {
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(eq(spsNegotiationThreads.clientAccessToken, req.params.clientToken));
    if (!thread) return res.status(404).json({ error: 'Proposal not found' });

    const messages = await db.select().from(spsNegotiationMessages)
      .where(eq(spsNegotiationMessages.threadId, thread.id))
      .orderBy(spsNegotiationMessages.createdAt);

    res.json({
      thread: {
        id: thread.id,
        proposalNumber: thread.proposalNumber,
        clientName: thread.clientName,
        clientEmail: thread.clientEmail,
        clientCompanyName: thread.clientCompanyName,
        serviceLocation: thread.serviceLocation,
        proposalData: thread.proposalData,
        status: thread.status,
        agreementDetected: thread.agreementDetected,
      },
      messages,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load proposal' });
  }
});

// POST /api/public/sps/proposal/:clientToken/reply — Client sends reply
spsPublicRouter.post('/proposal/:clientToken/reply', async (req, res) => {
  try {
    const [thread] = await db.select().from(spsNegotiationThreads)
      .where(eq(spsNegotiationThreads.clientAccessToken, req.params.clientToken));
    if (!thread) return res.status(404).json({ error: 'Proposal not found' });

    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

    // Check for agreement signals
    const AGREEMENT_SIGNALS = ['that works', 'we accept', 'agreed', "let's move forward", 'sounds good', 'deal', 'approved', 'confirmed', 'good to go'];
    const agreementDetected = AGREEMENT_SIGNALS.some(s => message.toLowerCase().includes(s));

    const [msg] = await db.transaction(async (tx) => {
      const [newMsg] = await tx.insert(spsNegotiationMessages).values({
        id: randomUUID(),
        threadId: thread.id,
        senderType: 'client',
        senderName: thread.clientName,
        senderEmail: thread.clientEmail,
        messageRaw: message,
        agreementSignalDetected: agreementDetected,
      }).returning();

      // Always bump updatedAt so admin lists ordered by activity stay current.
      const threadUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (agreementDetected && !thread.agreementDetected) {
        threadUpdates.agreementDetected = true;
        threadUpdates.agreementDetectedAt = new Date();
      }
      await tx.update(spsNegotiationThreads)
        .set(threadUpdates as any)
        .where(eq(spsNegotiationThreads.id, thread.id));

      return [newMsg];
    });

    res.status(201).json({ message: msg, agreementDetected });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send reply' });
  }
});
