import { sanitizeError } from '../middleware/errorHandler';
import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orgDocuments, orgDocumentAccess, orgDocumentSignatures, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import '../types';
import { documentSigningService } from '../services/documentSigningService';
import { creditManager } from '../services/billing/creditManager';
import { createLogger } from '../lib/logger';
const log = createLogger('DocumentLibraryRoutes');


export function registerDocumentLibraryRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const router = Router();

  // ==================== DOCUMENTS ====================

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { category, requiresSignature } = req.query;
      
      let conditions = [eq(orgDocuments.workspaceId, workspaceId), eq(orgDocuments.isActive, true)];
      if (category) conditions.push(eq(orgDocuments.category, category as string));
      if (requiresSignature === 'true') conditions.push(eq(orgDocuments.requiresSignature, true));

      const docs = await db.select({
        document: orgDocuments,
        uploadedByUser: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(orgDocuments)
      .leftJoin(users, eq(orgDocuments.uploadedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(orgDocuments.createdAt));

      res.json({ success: true, data: docs });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/my/pending-signatures", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const pending = await (documentSigningService as any).getMyPendingSignatures(userId, workspaceId);
      res.json({ success: true, data: pending });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/external/verify/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      const [sigRequest] = await db.select({
        signature: orgDocumentSignatures,
        document: orgDocuments
      })
      .from(orgDocumentSignatures)
      .leftJoin(orgDocuments, eq(orgDocumentSignatures.documentId, orgDocuments.id))
      .where(eq(orgDocumentSignatures.verificationToken, token));

      if (!sigRequest) return res.status(404).json({ error: "Invalid or expired token" });

      res.json({ success: true, data: sigRequest });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;
      const userId = (req.user)?.id;

      const [doc] = await db.select().from(orgDocuments)
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)));

      if (!doc) return res.status(404).json({ error: "Document not found" });

      await db.insert(orgDocumentAccess).values({
        documentId: id,
        userId,
        viewedAt: new Date(),
        ipAddress: req.ip || req.socket.remoteAddress
      });

      res.json({ success: true, data: doc });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { 
        category, fileName, filePath, fileSizeBytes, fileType, 
        description, requiresSignature, signatureRequired, totalSignaturesRequired 
      } = req.body;

      const [doc] = await db.insert(orgDocuments).values({
        workspaceId,
        uploadedBy: userId,
        category,
        fileName,
        filePath,
        fileSizeBytes,
        fileType,
        description,
        requiresSignature: requiresSignature || false,
        signatureRequired,
        totalSignaturesRequired: totalSignaturesRequired || 0
      }).returning();

      res.json({ success: true, data: doc });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;
      const { title, description, category, fileUrl, fileName, fileType, fileSize, status, tags, signatureRequired, totalSignaturesRequired } = req.body;

      const safeDocUpdates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) safeDocUpdates.title = title;
      if (description !== undefined) safeDocUpdates.description = description;
      if (category !== undefined) safeDocUpdates.category = category;
      if (fileUrl !== undefined) safeDocUpdates.fileUrl = fileUrl;
      if (fileName !== undefined) safeDocUpdates.fileName = fileName;
      if (fileType !== undefined) safeDocUpdates.fileType = fileType;
      if (fileSize !== undefined) safeDocUpdates.fileSize = fileSize;
      if (status !== undefined) safeDocUpdates.status = status;
      if (tags !== undefined) safeDocUpdates.tags = tags;
      if (signatureRequired !== undefined) safeDocUpdates.signatureRequired = signatureRequired;
      if (totalSignaturesRequired !== undefined) safeDocUpdates.totalSignaturesRequired = totalSignaturesRequired;

      const [updated] = await db.update(orgDocuments)
        .set(safeDocUpdates)
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.put("/:id/signature-fields", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;
      const { signatureFields } = req.body;
      const [updated] = await db.update(orgDocuments)
        .set({ signatureFields, updatedAt: new Date() })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)))
        .returning();
      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Signature fields error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;

      await db.update(orgDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== SIGNATURES ====================

  router.get("/:id/signatures", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const signatures = await db.select({
        signature: orgDocumentSignatures,
        signer: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }
      })
      .from(orgDocumentSignatures)
      .leftJoin(users, eq(orgDocumentSignatures.signerUserId, users.id))
      .where(eq(orgDocumentSignatures.documentId, id))
      .orderBy(desc(orgDocumentSignatures.signedAt));

      res.json({ success: true, data: signatures });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req.user)?.id;
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const { signatureData, signatureType, signerEmail, signerName } = req.body;

      const [signature] = await db.insert(orgDocumentSignatures).values({
        workspaceId: workspaceId,
        documentId: id,
        signerUserId: userId,
        signerEmail,
        signerName,
        signatureData,
        signatureType: signatureType || 'drawn',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }).returning();

      await db.update(orgDocuments)
        .set({ signaturesCompleted: sql`${orgDocuments.signaturesCompleted} + 1`, updatedAt: new Date() })
        .where(eq(orgDocuments.id, id));

      res.json({ success: true, data: signature });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/send-for-signature", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      const { id } = req.params;
      const { recipients, message } = req.body;

      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient is required" });
      }

      const senderName = (req.user)?.firstName 
        ? `${(req.user).firstName} ${(req.user).lastName || ''}`.trim()
        : (req.user)?.email || 'Organization';

      const result = await documentSigningService.sendDocumentForSignature({
        documentId: id,
        workspaceId,
        senderId: userId,
        senderName,
        recipients: recipients.map((r: any) => ({
          email: r.email,
          name: r.name,
          userId: r.userId,
          type: r.type || (r.userId ? 'internal' : 'external'),
        })),
        message,
      });

      // Deduct 3 credits per document sent for e-signature (replaces DocuSign at $500+/year)
      if (workspaceId) {
        creditManager.deductCredits({
          workspaceId,
          userId: userId || 'system',
          featureKey: 'document_signing_send',
          featureName: 'Digital E-Signature Send',
          description: `Document ${id} sent for e-signature to ${recipients.length} recipient(s)`,
          amountOverride: 3,
          relatedEntityType: 'org_document',
          relatedEntityId: id,
        }).catch((err: Error) => { log.error('[DocumentLibrary] E-sig credit deduction failed (non-blocking):', sanitizeError(err)); });
      }

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/request-signature", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      const { id } = req.params;
      const { signerEmail, signerName } = req.body;

      const senderName = (req.user)?.firstName 
        ? `${(req.user).firstName} ${(req.user).lastName || ''}`.trim()
        : 'Organization';

      const result = await documentSigningService.sendDocumentForSignature({
        documentId: id,
        workspaceId,
        senderId: userId,
        senderName,
        recipients: [{ email: signerEmail, name: signerName, type: 'external' as const }],
      });

      const firstSig = result[0];
      res.json({ success: true, data: firstSig, signatureLink: `/sign/${firstSig?.verificationToken}` });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/sign-internal", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user)?.id;
      const { id } = req.params;
      const { signatureData, signatureType } = req.body;

      if (!signatureData) return res.status(400).json({ error: "Signature data is required" });

      const result = await documentSigningService.processInternalSignature(
        id, userId, signatureData, signatureType || 'drawn',
        req.ip || req.socket.remoteAddress || '',
        req.headers['user-agent'] || ''
      );

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/:id/signature-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const status = await (documentSigningService as any).getSignatureStatus(id);
      res.json({ success: true, data: status });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/send-reminders", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await (documentSigningService as any).sendDocumentReminders(id);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/external/sign/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { signatureData, signatureType, workspaceId: bodyWorkspaceId } = req.body;
      // Check 4: accept workspace scope from body or query param so the link can carry it
      const requestedWorkspaceId = bodyWorkspaceId || (req.query.workspaceId as string | undefined);

      if (!signatureData) return res.status(400).json({ error: "Signature data is required" });

      const result = await documentSigningService.processExternalSignature(
        token, signatureData, signatureType || 'drawn',
        req.ip || req.socket.remoteAddress || '',
        req.headers['user-agent'] || '',
        requestedWorkspaceId   // Check 4: pass workspace scope for token binding
      );

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== ACCESS LOGS ====================

  router.get("/:id/access-log", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const logs = await db.select({
        access: orgDocumentAccess,
        user: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }
      })
      .from(orgDocumentAccess)
      .leftJoin(users, eq(orgDocumentAccess.userId, users.id))
      .where(eq(orgDocumentAccess.documentId, id))
      .orderBy(desc(orgDocumentAccess.viewedAt));

      res.json({ success: true, data: logs });
    } catch (error: unknown) {
      log.error('[DocumentLibrary] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/documents', ...middlewares, router);
}
