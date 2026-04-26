import { sanitizeError } from '../middleware/errorHandler';
import type { Express } from 'express';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orgInvitations, proposals } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { trinityOutreachService } from '../services/trinityOutreachService';
import { requireManager } from '../rbac';
import '../types';

export function registerSalesRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const salesRouter = Router();

  salesRouter.get("/invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(403).json({ error: "Workspace context required" });
      }

      const list = await db.select().from(orgInvitations)
        .where(and(eq(orgInvitations.sentBy, user?.id!), eq(orgInvitations.workspaceId, workspaceId)))
        .orderBy(desc(orgInvitations.createdAt));
      res.json({ success: true, data: list });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.post("/invitations/send", requireManager, async (req: Request, res: Response) => {
    try {
      const { email, organizationName, contactName } = req.body;
      const token = crypto.randomUUID();
      const resolvedWorkspaceId = req.workspaceId;
      const result = await db.insert(orgInvitations).values({
        workspaceId: resolvedWorkspaceId!,
        email,
        organizationName,
        contactName,
        invitationToken: token,
        invitationTokenExpiry: new Date(Date.now() + 14*24*60*60*1000),
        sentBy: (req.user)?.id,
        status: "pending",
      }).returning();
      res.json({ success: true, invitation: result[0] });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.get("/proposals", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const list = await db.select().from(proposals)
        .where(and(eq(proposals.proposalType, 'sales'), eq(proposals.createdBy, user?.id)))
        .orderBy(desc(proposals.createdAt));
      res.json({ success: true, data: list });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.post("/proposals", requireManager, async (req: Request, res: Response) => {
    try {
      const { title, description, prospectEmail, prospectName, suggestedTier, estimatedValue } = req.body;
      const resolvedWorkspaceId = req.workspaceId;
      const result = await db.insert(proposals).values({
        workspaceId: resolvedWorkspaceId!,
        proposalName: title,
        proposalType: 'sales',
        description,
        prospectEmail,
        prospectName,
        suggestedTier: suggestedTier || "starter",
        estimatedValue: estimatedValue ? String(estimatedValue) : undefined,
        status: "draft",
        createdBy: (req.user)?.id || "system",
      }).returning();
      res.json({ success: true, proposal: result[0] });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.post("/outreach/crawl", requireManager, async (req: Request, res: Response) => {
    try {
      const { urls } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "urls array is required" });
      }
      if (urls.length > 20) {
        return res.status(400).json({ error: "Maximum 20 URLs per crawl request" });
      }

      const validUrls = urls.filter((u: string) => {
        if (typeof u !== 'string' || u.length > 500) return false;
        try {
          const normalized = u.startsWith('http') ? u : `https://${u}`;
          const parsed = new URL(normalized);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch { return false; }
      });
      if (validUrls.length === 0) {
        return res.status(400).json({ error: "No valid URLs provided" });
      }

      const results = await trinityOutreachService.crawlMultipleWebsites(validUrls);
      const candidates = await trinityOutreachService.buildProspectList(results);

      res.json({
        success: true,
        crawled: results.length,
        candidatesFound: candidates.length,
        results,
        candidates,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.post("/outreach/send", requireManager, async (req: Request, res: Response) => {
    try {
      const { candidates, customMessage, trialDays } = req.body;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: "candidates array is required" });
      }

      const user = req.user;
      const result = await trinityOutreachService.sendOutreachInvitations(
        candidates,
        user?.id,
        { customMessage, trialDays }
      );

      res.json({ success: true, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.get("/outreach/pipeline", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const summary = await trinityOutreachService.getPipelineSummary(user?.id);
      const prospects = await trinityOutreachService.getProspectsByStage(user?.id);

      res.json({ success: true, summary, prospects });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.get("/outreach/pipeline/:stage", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const stage = req.params.stage;
      const prospects = await trinityOutreachService.getProspectsByStage(
        user?.id,
        stage === 'all' ? undefined : stage as any
      );

      res.json({ success: true, data: prospects });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/sales', ...middlewares, salesRouter);
}
