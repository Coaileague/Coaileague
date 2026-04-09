import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { externalEmailsSent, emailDrafts, users } from '@shared/schema';
import { eq, and, desc, sql, like, or } from 'drizzle-orm';
import '../types';
import { createLogger } from '../lib/logger';
import { EMAIL } from '../config/platformConfig';
const log = createLogger('ExternalEmailRoutes');


export function registerExternalEmailRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const router = Router();

  // ==================== EMAILS ====================

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
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
      .limit(Math.min(Number(limit) || 50, 500));

      res.json({ success: true, data: emails });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/drafts", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const drafts = await db.select().from(emailDrafts)
        .where(and(eq(emailDrafts.workspaceId, workspaceId), eq(emailDrafts.userId, userId)))
        .orderBy(desc(emailDrafts.lastAutoSavedAt));

      res.json({ success: true, data: drafts });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;

      const [email] = await db.select().from(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      if (!email) return res.status(404).json({ error: "Email not found" });

      res.json({ success: true, data: email });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { 
        fromEmail, toEmail, ccEmails, bccEmails, subject, bodyHtml, bodyText,
        emailType, relatedEntityType, relatedEntityId, scheduledFor, isDraft, attachments
      } = req.body;

      const [email] = await db.insert(externalEmailsSent).values({
        workspaceId,
        sentBy: userId,
        fromEmail: fromEmail || EMAIL.senders.noreply,
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
        status: isDraft ? 'pending' : 'pending',
        attachments: attachments ? JSON.stringify(attachments) : null
      }).returning();

      res.json({ success: true, data: email });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;

      const [email] = await db.select().from(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      if (!email) return res.status(404).json({ error: "Email not found" });

      try {
        const { sendEmail } = await import('../email'); // infra
        const result = await sendEmail({ // infra
          to: email.toEmail,
          subject: email.subject,
          html: email.bodyHtml,
          text: email.bodyText || undefined,
          workspaceId,
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
      } catch (sendError: unknown) {
        await db.update(externalEmailsSent)
          .set({ status: 'failed', errorMessage: (sendError as any)?.message ?? 'Unknown error' })
          .where(eq(externalEmailsSent.id, id));

        res.status(500).json({ error: "Failed to send email" });
      }
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
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
      } catch (aiError: unknown) {
        res.json({ 
          success: true, 
          data: { subject, body, enhanced: false, message: "AI enhancement unavailable" } 
        });
      }
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;
      const { subject, body, status, notes, tags } = req.body;

      const safeEmailUpdates: Record<string, any> = {};
      if (subject !== undefined) safeEmailUpdates.subject = subject;
      if (body !== undefined) safeEmailUpdates.body = body;
      if (status !== undefined) safeEmailUpdates.status = status;
      if (notes !== undefined) safeEmailUpdates.notes = notes;
      if (tags !== undefined) safeEmailUpdates.tags = tags;

      const [updated] = await db.update(externalEmailsSent)
        .set(safeEmailUpdates)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const { id } = req.params;

      await db.delete(externalEmailsSent)
        .where(and(eq(externalEmailsSent.id, id), eq(externalEmailsSent.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== DRAFTS ====================

  router.post("/drafts", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = (req.user)?.id;
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
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/drafts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user)?.id;
      const { id } = req.params;
      const { to, cc, bcc, subject: draftSubject, body: draftBody, templateId } = req.body;

      const safeDraftUpdates: Record<string, any> = { lastAutoSavedAt: new Date() };
      if (to !== undefined) safeDraftUpdates.to = to;
      if (cc !== undefined) safeDraftUpdates.cc = cc;
      if (bcc !== undefined) safeDraftUpdates.bcc = bcc;
      if (draftSubject !== undefined) safeDraftUpdates.subject = draftSubject;
      if (draftBody !== undefined) safeDraftUpdates.body = draftBody;
      if (templateId !== undefined) safeDraftUpdates.templateId = templateId;

      const [updated] = await db.update(emailDrafts)
        .set(safeDraftUpdates)
        .where(and(eq(emailDrafts.id, id), eq(emailDrafts.userId, userId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/drafts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user)?.id;
      const { id } = req.params;

      await db.delete(emailDrafts)
        .where(and(eq(emailDrafts.id, id), eq(emailDrafts.userId, userId)));

      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== AI INTELLIGENCE ====================

  router.post("/analyze", requireAuth, async (req: Request, res: Response) => {
    try {
      const { subject, body, fromAddress, threadContext } = req.body;
      
      const { emailIntelligenceService } = await import('../services/emailIntelligenceService');
      const analysis = await emailIntelligenceService.analyzeEmail(
        subject || '',
        body || '',
        fromAddress || 'unknown',
        threadContext
      );
      
      res.json({ success: true, data: analysis });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/smart-compose", requireAuth, async (req: Request, res: Response) => {
    try {
      const { context, recipientInfo, intent, tone, length, keyPoints } = req.body;
      
      const { emailIntelligenceService } = await import('../services/emailIntelligenceService');
      const result = await emailIntelligenceService.smartCompose({
        context: context || '',
        recipientInfo,
        intent: intent || 'reply',
        tone: tone || 'professional',
        length: length || 'medium',
        keyPoints,
      });
      
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/summarize-thread", requireAuth, async (req: Request, res: Response) => {
    try {
      const { emails } = req.body;
      
      if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: "Emails array required" });
      }
      
      const { emailIntelligenceService } = await import('../services/emailIntelligenceService');
      const summary = await emailIntelligenceService.summarizeThread(emails);
      
      res.json({ success: true, data: summary });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/reply-suggestions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { from, subject, body, userContext } = req.body;
      
      const { emailIntelligenceService } = await import('../services/emailIntelligenceService');
      const suggestions = await emailIntelligenceService.generateReplySuggestions(
        { from: from || '', subject: subject || '', body: body || '' },
        userContext
      );
      
      res.json({ success: true, data: suggestions });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/compliance-check", requireAuth, async (req: Request, res: Response) => {
    try {
      const { subject, body, industry, regulations } = req.body;
      
      const { emailIntelligenceService } = await import('../services/emailIntelligenceService');
      const result = await emailIntelligenceService.checkCompliance(
        subject || '',
        body || '',
        { industry, regulations }
      );
      
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[ExternalEmail] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/external-emails', ...middlewares, router);
}
