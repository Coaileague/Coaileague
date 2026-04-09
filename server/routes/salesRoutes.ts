import { sanitizeError } from '../middleware/errorHandler';
import type { Express } from 'express';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orgInvitations, proposals, activities, employees } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { trinityOutreachService } from '../services/trinityOutreachService';
import { documentDeliveryService } from '../services/documentDeliveryService';
import { hasManagerAccess, requireManager } from '../rbac';
import '../types';

async function verifyWorkspaceMembership(userId: string, workspaceId: string): Promise<{ authorized: boolean; role?: string }> {
  const [emp] = await db.select().from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)));
  if (!emp) return { authorized: false };
  return { authorized: true, role: emp.workspaceRole || 'staff' };
}

export function registerSalesRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const salesRouter = Router();

  salesRouter.get("/invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const list = await db.select().from(orgInvitations)
        .where(eq(orgInvitations.sentBy, user?.id))
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

  salesRouter.get("/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const salesActivityList = await db.select().from(activities)
        .where(eq(activities.createdByUserId, user?.id))
        .orderBy(desc(activities.createdAt));
      res.json({ success: true, data: salesActivityList });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  const docRouter = Router();

  docRouter.post("/deliver/disciplinary", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { workspaceId, employeeId, employeeName, reportTitle, reportDate, severity, description, actionRequired } = req.body;
      if (!workspaceId || !employeeId || !employeeName || !severity) {
        return res.status(400).json({ error: "workspaceId, employeeId, employeeName, and severity are required" });
      }

      const membership = await verifyWorkspaceMembership(user?.id, workspaceId);
      if (!membership.authorized || !hasManagerAccess(membership.role)) {
        return res.status(403).json({ error: "Insufficient permissions for this workspace" });
      }

      const result = await documentDeliveryService.sendDisciplinaryReport(workspaceId, {
        employeeId,
        employeeName,
        reportTitle: reportTitle || 'Disciplinary Report',
        reportDate: reportDate || new Date().toISOString().split('T')[0],
        severity,
        description: description || '',
        actionRequired,
        issuedBy: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Management',
      });

      res.json({ success: result.success, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  docRouter.post("/deliver/training-report", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { workspaceId, traineeId, traineeName, reportTitle, trainingDate, score, passed, observations, recommendations } = req.body;
      if (!workspaceId || !traineeId || !traineeName) {
        return res.status(400).json({ error: "workspaceId, traineeId, and traineeName are required" });
      }

      const membership = await verifyWorkspaceMembership(user?.id, workspaceId);
      if (!membership.authorized || !hasManagerAccess(membership.role)) {
        return res.status(403).json({ error: "Insufficient permissions for this workspace" });
      }

      const result = await documentDeliveryService.sendFieldTrainingReport(workspaceId, {
        traineeId,
        traineeName,
        reportTitle: reportTitle || 'Field Training Report',
        trainingDate: trainingDate || new Date().toISOString().split('T')[0],
        score,
        passed: passed !== false,
        observations: observations || '',
        recommendations,
        trainerId: user?.id || 'system',
        trainerName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Trainer',
      });

      res.json({ success: result.success, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  docRouter.post("/deliver/promotion", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { workspaceId, employeeId, employeeName, currentRole, proposedRole, effectiveDate, justification, salaryChange } = req.body;
      if (!workspaceId || !employeeId || !employeeName || !currentRole || !proposedRole) {
        return res.status(400).json({ error: "workspaceId, employeeId, employeeName, currentRole, and proposedRole are required" });
      }

      const membership = await verifyWorkspaceMembership(user?.id, workspaceId);
      if (!membership.authorized || !hasManagerAccess(membership.role)) {
        return res.status(403).json({ error: "Insufficient permissions for this workspace" });
      }

      const result = await documentDeliveryService.sendPromotionForm(workspaceId, {
        employeeId,
        employeeName,
        currentRole,
        proposedRole,
        effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
        justification: justification || '',
        salaryChange,
        recommendedBy: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Management',
      });

      res.json({ success: result.success, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  docRouter.post("/deliver/contract-proposal", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { workspaceId, clientEmail, clientName, proposalTitle, proposalSummary, portalUrl, expiresAt, value } = req.body;
      if (!clientEmail || !proposalTitle) {
        return res.status(400).json({ error: "clientEmail and proposalTitle are required" });
      }

      if (workspaceId) {
        const membership = await verifyWorkspaceMembership(user?.id, workspaceId);
        if (!membership.authorized || !hasManagerAccess(membership.role)) {
          return res.status(403).json({ error: "Insufficient permissions for this workspace" });
        }
      }

      const result = await documentDeliveryService.sendContractProposal(workspaceId || 'system', {
        clientEmail,
        clientName: clientName || 'Client',
        proposalTitle,
        proposalSummary: proposalSummary || '',
        portalUrl: portalUrl || '#',
        expiresAt: expiresAt || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
        value,
      });

      res.json({ success: result.success, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  docRouter.post("/deliver/onboarding", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const { workspaceId, employeeId, employeeName, employeeEmail, startDate, position, managerName, documentsIncluded, portalUrl } = req.body;
      if (!workspaceId || !employeeId || !employeeName || !employeeEmail) {
        return res.status(400).json({ error: "workspaceId, employeeId, employeeName, and employeeEmail are required" });
      }

      const membership = await verifyWorkspaceMembership(user?.id, workspaceId);
      if (!membership.authorized || !hasManagerAccess(membership.role)) {
        return res.status(403).json({ error: "Insufficient permissions for this workspace" });
      }

      const result = await documentDeliveryService.sendOnboardingPacket(workspaceId, {
        employeeId,
        employeeName,
        employeeEmail,
        startDate: startDate || new Date().toISOString().split('T')[0],
        position: position || 'New Hire',
        managerName,
        documentsIncluded: documentsIncluded || ['Employee Handbook', 'Benefits Overview', 'Tax Forms'],
        portalUrl,
      });

      res.json({ success: result.success, ...result });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  docRouter.get("/routing-rules", requireAuth, async (_req: Request, res: Response) => {
    try {
      const rules = documentDeliveryService.getRoutingRules();
      res.json({ success: true, rules });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  salesRouter.post("/outreach/crawl", requireAuth, async (req: Request, res: Response) => {
    try {
      const { url, keywords, prospectType } = req.body;
      if (!url) return res.status(400).json({ error: "url is required" });
      res.json({
        success: true,
        crawlId: `crawl_${Date.now()}`,
        status: 'initiated',
        url,
        keywords: keywords || [],
        prospectType: prospectType || 'general',
        estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
        results: [],
        message: 'Crawl initiated. Results will be available shortly.',
      });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/sales', ...middlewares, salesRouter);
  app.use('/api/document-delivery', ...middlewares, docRouter);
}
