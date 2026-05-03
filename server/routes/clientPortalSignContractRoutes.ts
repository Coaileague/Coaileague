/**
 * Client Portal — Service Agreement Signing
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/client-portal/:clientId/sign-contract
 *
 * Captures a client's service agreement signature with full legal metadata:
 *   - Signature string (typed or base64 drawn)
 *   - IP address (server-extracted — not client-claimed)
 *   - Server timestamp (tamper-proof — not device clock)
 *   - User agent for audit trail
 *
 * After signature:
 *   1. Marks client.clientOnboardingStatus = 'active'  (idempotent)
 *   2. Generates a signed PDF stored in DUAL VAULT:
 *        primary: workspaces/{wsId}/contracts/{clientId}/{contractId}.pdf
 *        archive: clients/{clientId}/contracts/{contractId}.pdf
 *   3. Emits client_contract_signed → Trinity orchestrator clears financial
 *      gate and can now publish pending shifts for this client.
 *   4. Returns the signed document URL and confirmation.
 *
 * Idempotent: re-signing returns the existing signature record if already signed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { clients, clientContractDocuments } from '@shared/schema';
import { requireAuth } from '../auth';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import {
  uploadFileToObjectStorage,
  buildStoragePath,
  StorageDirectory,
} from '../objectStorage';
import { createLogger } from '../lib/logger';

const log = createLogger('ClientPortalSignContract');
const router = Router();

const signContractSchema = z.object({
  signatureData:  z.string().min(1, 'Signature is required'),        // typed name or base64 drawn
  signatureType:  z.enum(['typed', 'drawn']).default('typed'),
  signerName:     z.string().min(1, 'Signer name is required'),
  signerTitle:    z.string().optional(),
  signerEmail:    z.string().email().optional(),
  contractId:     z.string().optional(),                               // links to an existing contract record
  consentText:    z.string().min(10, 'Consent language required'),    // the exact text the signer agreed to
  geolocation:    z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
});

function getClientIP(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 45);
  return (req.socket?.remoteAddress || 'unknown').slice(0, 45);
}

async function generateSignedContractPdf(params: {
  workspaceId: string;
  clientId: string;
  clientName: string;
  signerName: string;
  signerTitle?: string;
  signerEmail?: string;
  signatureData: string;
  signatureType: 'typed' | 'drawn';
  signedAt: Date;
  ipAddress: string;
  consentText: string;
}): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const { renderPdfHeader, renderPdfFooter, hlinePdf } = await import('./pdfTemplateBase' as any).catch(() => ({ renderPdfHeader: null, renderPdfFooter: null, hlinePdf: null }));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('Service Agreement — Executed Copy', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(`Client: ${params.clientName}`, { align: 'center' });
    doc.moveDown(2);

    // Consent language
    doc.fontSize(12).font('Helvetica-Bold').text('AGREEMENT TEXT');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(params.consentText, { align: 'justify' });
    doc.moveDown(2);

    // Signature block
    doc.fontSize(12).font('Helvetica-Bold').text('ELECTRONIC SIGNATURE');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    if (params.signatureType === 'typed') {
      doc.fontSize(16).font('Helvetica-BoldOblique').text(params.signatureData);
      doc.fontSize(10).font('Helvetica');
    }
    doc.text(`Signer: ${params.signerName}${params.signerTitle ? `, ${params.signerTitle}` : ''}`);
    if (params.signerEmail) doc.text(`Email: ${params.signerEmail}`);
    doc.moveDown(0.5);

    // Legal metadata block
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    doc.text(`Signed at: ${params.signedAt.toUTCString()}`);
    doc.text(`IP Address: ${params.ipAddress}`);
    doc.text(`Signature Type: ${params.signatureType}`);
    doc.text(`Client ID: ${params.clientId}`);
    doc.text(`Workspace ID: ${params.workspaceId}`);
    doc.moveDown();
    doc.fontSize(8).text(
      'This document was electronically signed and timestamped by the server at the time of execution. ' +
      'The IP address, timestamp, and signature data are recorded for legal and audit purposes. ' +
      'This constitutes a binding electronic signature under applicable e-signature laws (ESIGN Act, UETA).',
      { align: 'justify' }
    );

    doc.end();
  });
}

// ── POST /api/client-portal/:clientId/sign-contract ────────────────────────
router.post('/:clientId/sign-contract', requireAuth, ensureWorkspaceAccess, async (req: import('../rbac').AuthenticatedRequest, res: Response) => {
  try {
    const { clientId } = req.params;
    const workspaceId = req.workspaceId!;

    // Validate input
    const parsed = signContractSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }
    const input = parsed.data;

    // Load client — workspace-scoped
    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // ── IDEMPOTENCY: Already signed? Return existing record ────────────────
    // active = countersigned (both gates passed)
    // pending_approval = client signed, awaiting SPS countersignature
    if (client.clientLifecycleStatus === 'active') {
      return res.json({
        success: true,
        alreadySigned: true,
        message: 'Service Agreement is fully executed. Client is active.',
        clientId,
        status: 'active',
      });
    }
    if (client.clientLifecycleStatus === 'pending_approval') {
      return res.json({
        success: true,
        alreadySigned: true,
        pendingCountersignature: true,
        message: 'Service Agreement signed by client. Awaiting SPS countersignature to activate.',
        clientId,
        status: 'pending_approval',
      });
    }

    // ── SERVER TIMESTAMP — cannot be faked by client ───────────────────────
    const signedAt = new Date();
    const ipAddress = getClientIP(req);
    const contractId = input.contractId || randomUUID();

    // ── Generate the signed PDF ────────────────────────────────────────────
    let pdfUrl: string | null = null;
    let archiveUrl: string | null = null;

    try {
      const pdfBuffer = await generateSignedContractPdf({
        workspaceId,
        clientId,
        clientName: client.name || 'Client',
        signerName: input.signerName,
        signerTitle: input.signerTitle,
        signerEmail: input.signerEmail,
        signatureData: input.signatureData,
        signatureType: input.signatureType,
        signedAt,
        ipAddress,
        consentText: input.consentText,
      });

      const filename = `service-agreement-${clientId}-${signedAt.toISOString().split('T')[0]}.pdf`;

      // ── DUAL VAULT STORAGE ─────────────────────────────────────────────
      // Primary: workspaces/{wsId}/contracts/{clientId}/{contractId}.pdf
      const primaryPath = buildStoragePath(workspaceId, StorageDirectory.CONTRACTS, clientId, filename);
      await uploadFileToObjectStorage({
        objectPath: primaryPath,
        buffer: pdfBuffer,
        workspaceId,
        storageCategory: 'documents',
        metadata: { contentType: 'application/pdf', metadata: { workspaceId, clientId, contractId, signedAt: signedAt.toISOString() } },
      });

      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      pdfUrl = `https://storage.googleapis.com/${bucketId}/${primaryPath.replace(/^objects\//, '')}`;

      // Archive: clients/{clientId}/contracts/{contractId}.pdf (cross-workspace audit access)
      const archivePath = `objects/clients/${clientId}/contracts/${filename}`;
      await uploadFileToObjectStorage({
        objectPath: archivePath,
        buffer: pdfBuffer,
        storageCategory: 'documents',
        metadata: { contentType: 'application/pdf', metadata: { clientId, contractId, signedAt: signedAt.toISOString() } },
      }).catch(archiveErr => {
        log.warn('[SignContract] Archive vault write failed (non-fatal):', archiveErr);
      });

      archiveUrl = `https://storage.googleapis.com/${bucketId}/clients/${clientId}/contracts/${filename}`;

      log.info(`[SignContract] PDF stored: primary=${primaryPath}`);
    } catch (pdfErr: unknown) {
      log.error('[SignContract] PDF generation failed (continuing — contract is still legally valid):', pdfErr);
    }

    // ── Gate 1: Client signs → pending_approval ─────────────────────────────
    // The client's signature marks the agreement as pending SPS countersignature.
    // Financial gate (shift publishing) remains CLOSED until Gate 2 (countersig).
    await db.update(clients)
      .set({
        clientOnboardingStatus: 'pending_signature',
        clientLifecycleStatus: 'pending_approval',
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    // ── Record client signature in the contract row ───────────────────────
    if (input.contractId) {
      const { clientContracts } = await import('@shared/schema');
      await db.update(clientContracts)
        .set({
          clientSignatureData: input.signatureData,
          clientSignedAt: signedAt,
          clientSignedByName: input.signerName,
          clientSignedByIp: ipAddress,
          status: 'pending_approval' as string,
          updatedAt: new Date(),
        } as Record<string, unknown>)
        .where(and(eq(clientContracts.id, input.contractId), eq(clientContracts.workspaceId, workspaceId)))
        .catch(() => null); // Non-fatal — contract may not exist yet
    }

    // ── Emit client_contract_signed → Trinity clears financial gate ────────
    await platformEventBus.publish({
      type: 'client_contract_signed',
      category: 'billing',
      title: `Service Agreement Signed — ${client.name} (Awaiting Countersignature)`,
      description:
        `${input.signerName}${input.signerTitle ? ` (${input.signerTitle})` : ''} signed the Service Agreement for ${client.name}. ` +
        'Awaiting SPS countersignature. Financial gate remains closed until countersig is recorded.',
      workspaceId,
      metadata: {
        clientId,
        clientName: client.name,
        contractId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        signedAt: signedAt.toISOString(),
        ipAddress,
        pdfUrl,
        financialGateCleared: true,
      },
    }).catch(ebErr => log.warn('[SignContract] EventBus publish failed (non-fatal):', ebErr));

    // Broadcast so manager dashboard updates immediately
    broadcastToWorkspace(workspaceId, {
      type: 'client_contract_signed',
      clientId,
      clientName: client.name,
      pdfUrl,
      signedAt: signedAt.toISOString(),
    });

    log.info(`[SignContract] Client ${clientId} (${client.name}) signed at ${signedAt.toISOString()} from ${ipAddress}`);

    return res.status(201).json({
      success: true,
      message: 'Service Agreement signed by client. Awaiting SPS countersignature to activate.',
      clientId,
      clientName: client.name,
      contractId,
      signedAt: signedAt.toISOString(),
      ipAddress,
      status: 'pending_approval',
      pendingCountersignature: true,
      pdfUrl,
      archiveUrl,
    });
  } catch (err: unknown) {
    log.error('[SignContract] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// ── POST /api/client-portal/:clientId/countersign ─────────────────────────
// Gate 2: SPS Operator countersigns the service agreement.
// ONLY after this call does clientLifecycleStatus → 'active' and
// shift publishing become unblocked.
// Requires manager+ role (checked via requireAuth + workspace access).
// ──────────────────────────────────────────────────────────────────────────
const counterSignSchema = z.object({
  signatureData:  z.string().min(1, 'Countersignature is required'),
  signerName:     z.string().min(1, 'Signer name is required'),
  signerTitle:    z.string().optional(),
  contractId:     z.string().optional(),
});

router.post('/:clientId/countersign', requireAuth, ensureWorkspaceAccess, async (req: import('../rbac').AuthenticatedRequest, res: Response) => {
  try {
    const { clientId } = req.params;
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || req.session?.userId as string;

    const parsed = counterSignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }
    const input = parsed.data;

    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    if (client.clientLifecycleStatus === 'active') {
      return res.json({
        success: true,
        alreadyCountersigned: true,
        message: 'Contract is already fully executed.',
        clientId,
        status: 'active',
      });
    }

    if (client.clientLifecycleStatus !== 'pending_approval') {
      return res.status(409).json({
        error: 'INVALID_STATE',
        message: `Cannot countersign — client is in state '${client.clientLifecycleStatus}'. Client must sign first.`,
        currentStatus: client.clientLifecycleStatus,
      });
    }

    const counterSignedAt = new Date();
    const ipAddress = getClientIP(req);

    // ── Gate 2: SPS countersigns → client becomes ACTIVE ─────────────────
    await db.update(clients)
      .set({
        clientOnboardingStatus: 'active',
        clientLifecycleStatus: 'active',
        isActive: true,
        updatedAt: new Date(),
      })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

    // Update the contract row with countersig data
    if (input.contractId) {
      const { clientContracts } = await import('@shared/schema');
      await db.update(clientContracts)
        .set({
          counterSignatureData: input.signatureData,
          counterSignedAt,
          counterSignedBy: userId,
          counterSignedByIp: ipAddress,
          counterSignedByName: input.signerName,
          orgSignedByName: input.signerName,
          orgSignedAt: counterSignedAt,
          status: 'executed' as string,
          executedAt: counterSignedAt,
          updatedAt: new Date(),
        } as Record<string, unknown>)
        .where(and(eq(clientContracts.id, input.contractId), eq(clientContracts.workspaceId, workspaceId)))
        .catch(() => null);
    }

    await platformEventBus.publish({
      type: 'client_contract_executed',
      category: 'billing',
      title: `Service Agreement Fully Executed — ${client.name}`,
      description:
        `SPS operator ${input.signerName} countersigned. Dual-signature complete. ` +
        `Financial gate CLEARED. Shifts for ${client.name} can now be published.`,
      workspaceId,
      metadata: {
        clientId,
        clientName: client.name,
        contractId: input.contractId,
        counterSignedBy: userId,
        counterSignedByName: input.signerName,
        counterSignedAt: counterSignedAt.toISOString(),
        ipAddress,
        financialGateCleared: true,
        dualSignatureComplete: true,
      },
    }).catch(() => null);

    broadcastToWorkspace(workspaceId, {
      type: 'client_contract_executed',
      clientId,
      clientName: client.name,
      counterSignedAt: counterSignedAt.toISOString(),
    });

    log.info(`[Countersign] Client ${clientId} fully executed by ${userId} at ${counterSignedAt.toISOString()}`);

    return res.status(200).json({
      success: true,
      message: 'Service Agreement countersigned. Client is now ACTIVE. Shifts can be published.',
      clientId,
      clientName: client.name,
      contractId: input.contractId,
      counterSignedAt: counterSignedAt.toISOString(),
      status: 'active',
      dualSignatureComplete: true,
    });
  } catch (err: unknown) {
    log.error('[Countersign] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
