import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { externalEmailsSent, emailDrafts, users } from '@shared/schema';
import { eq, and, desc, sql, like, or } from 'drizzle-orm';
import '../types';

export function registerExternalEmailRoutes(app: Express, requireAuth: any) {
  const router = Router();

  // ==================== EMAILS ====================

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { status, emailType, limit = 50 } = req.query;
      
      let conditions = [eq(externalEmailsSent.workspaceId, workspaceId), eq(externalEmailsSent.isDraft, false)];
      if (status) conditions.push(eq(externalEmailsSent.status, status as string));
      if (emailType) conditions.push(eq(externalEmailsSent.emailType, emailType as string));

      const emails = await db.select({
        email: externalEmailsSent,
        sentByUser: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(externalEmailsSent)
      .leftJoin(users, eq(externalEmailsSent.sentBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(externalEmailsSent.createdAt))
      .limit(Number(limit));

      res.json({ success: true, data: emails });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      const [email] = await db.select().from(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      if (!email) return res.status(404).json({ error: "Email not found" });

      res.json({ success: true, data: email });
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
        fromEmail, toEmail, ccEmails, bccEmails, subject, bodyHtml, bodyText,
        emailType, relatedEntityType, relatedEntityId, scheduledFor, isDraft
      } = req.body;

      const [email] = await db.insert(externalEmailsSent).values({
        workspaceId,
        sentBy: userId,
        fromEmail: fromEmail || `noreply@${workspaceId}.coaileague.com`,
        toEmail,
        ccEmails,
        bccEmails,
        subject,
        bodyHtml,
        bodyText,
        emailType: emailType || 'manual',
        relatedEntityType,
        relatedEntityId,
        scheduledFor,
        isDraft: isDraft || false,
        status: isDraft ? 'pending' : 'pending'
      }).returning();

      res.json({ success: true, data: email });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/:id/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      const [email] = await db.select().from(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      if (!email) return res.status(404).json({ error: "Email not found" });

      try {
        const { sendEmail } = await import('../email');
        const result = await sendEmail({
          to: email.toEmail,
          subject: email.subject,
          html: email.bodyHtml,
          text: email.bodyText || undefined
        });

        const [updated] = await db.update(externalEmailsSent)
          .set({ 
            status: 'sent', 
            sentAt: new Date(), 
            isDraft: false,
            externalMessageId: result?.id 
          })
          .where(eq(externalEmailsSent.id, id))
          .returning();

        res.json({ success: true, data: updated });
      } catch (sendError: any) {
        await db.update(externalEmailsSent)
          .set({ status: 'failed', errorMessage: sendError.message })
          .where(eq(externalEmailsSent.id, id));

        res.status(500).json({ error: "Failed to send email", details: sendError.message });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/enhance", requireAuth, async (req: Request, res: Response) => {
    try {
      const { subject, body, context, tone } = req.body;

      try {
        const { enhanceEmailWithGemini } = await import('../gemini');
        const enhanced = await enhanceEmailWithGemini({
          subject,
          body,
          context: context || 'professional business communication',
          tone: tone || 'professional'
        });

        res.json({ success: true, data: enhanced });
      } catch (aiError: any) {
        res.json({ 
          success: true, 
          data: { subject, body, enhanced: false, message: "AI enhancement unavailable" } 
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      const updates = req.body;

      const [updated] = await db.update(externalEmailsSent)
        .set(updates)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)))
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

      await db.delete(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DRAFTS ====================

  router.get("/drafts", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const userId = (req.user as any)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const drafts = await db.select().from(emailDrafts)
        .where(and(eq(emailDrafts.workspaceId, workspaceId), eq(emailDrafts.userId, userId)))
        .orderBy(desc(emailDrafts.lastAutoSavedAt));

      res.json({ success: true, data: drafts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/drafts", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const userId = (req.user as any)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { toEmail, ccEmails, subject, bodyHtml, relatedEntityType, relatedEntityId } = req.body;

      const [draft] = await db.insert(emailDrafts).values({
        workspaceId,
        userId,
        toEmail,
        ccEmails,
        subject,
        bodyHtml,
        relatedEntityType,
        relatedEntityId
      }).returning();

      res.json({ success: true, data: draft });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/drafts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;
      const updates = req.body;

      updates.lastAutoSavedAt = new Date();

      const [updated] = await db.update(emailDrafts)
        .set(updates)
        .where(and(eq(emailDrafts.id, id), eq(emailDrafts.userId, userId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/drafts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      await db.delete(emailDrafts)
        .where(and(eq(emailDrafts.id, id), eq(emailDrafts.userId, userId)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/external-emails', router);
}
