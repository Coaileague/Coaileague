import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orgDocuments, orgDocumentAccess, orgDocumentSignatures, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import '../types';

export function registerDocumentLibraryRoutes(app: Express, requireAuth: any) {
  const router = Router();

  // ==================== DOCUMENTS ====================

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      const userId = (req.user as any)?.id;

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const userId = (req.user as any)?.id;
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      const updates = req.body;

      updates.updatedAt = new Date();

      const [updated] = await db.update(orgDocuments)
        .set(updates)
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      await db.update(orgDocuments)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/:id/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const { signatureData, signatureType, signerEmail, signerName } = req.body;

      const [signature] = await db.insert(orgDocumentSignatures).values({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/:id/request-signature", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { signerEmail, signerName } = req.body;

      const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const [request] = await db.insert(orgDocumentSignatures).values({
        documentId: id,
        signerEmail,
        signerName,
        verificationToken,
      }).returning();

      res.json({ success: true, data: request, signatureLink: `/sign/${verificationToken}` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/external/sign/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { signatureData, signatureType } = req.body;

      const [updated] = await db.update(orgDocumentSignatures)
        .set({
          signatureData,
          signatureType: signatureType || 'drawn',
          verifiedAt: new Date(),
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent']
        })
        .where(eq(orgDocumentSignatures.verificationToken, token))
        .returning();

      if (updated) {
        await db.update(orgDocuments)
          .set({ signaturesCompleted: sql`${orgDocuments.signaturesCompleted} + 1`, updatedAt: new Date() })
          .where(eq(orgDocuments.id, updated.documentId));
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/documents', router);
}
