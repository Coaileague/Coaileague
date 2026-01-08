import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { leads, leadActivities, deals, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import '../types';

export function registerLeadCrmRoutes(app: Express, requireAuth: any) {
  const router = Router();

  const getWorkspaceId = (req: Request): string | null => {
    return (req as any).workspaceId || null;
  };

  const requireWorkspace = (req: Request, res: Response): string | null => {
    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace context required" });
      return null;
    }
    return workspaceId;
  };

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { status, industry, assignedTo, limit = 100 } = req.query;
      
      let conditions: any[] = [eq(leads.organizationId, workspaceId)];
      if (status) conditions.push(eq(leads.leadStatus, status as string));
      if (industry) conditions.push(eq(leads.industry, industry as string));
      if (assignedTo) conditions.push(eq(leads.assignedTo, assignedTo as string));

      const result = await db.select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.createdAt))
        .limit(Number(limit));

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;

      const [lead] = await db.select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const activities = await db.select({
        activity: leadActivities,
        user: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(leadActivities)
      .leftJoin(users, eq(leadActivities.userId, users.id))
      .where(and(eq(leadActivities.leadId, id), eq(leadActivities.workspaceId, workspaceId)))
      .orderBy(desc(leadActivities.createdAt));

      res.json({ success: true, data: { lead, activities } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const userId = (req.user as any)?.id;
      
      const { 
        companyName, industry, companyWebsite, estimatedEmployees,
        contactName, contactTitle, contactEmail, contactPhone,
        leadStatus, leadScore, estimatedValue, source, notes, nextFollowUpDate, assignedTo
      } = req.body;

      const [lead] = await db.insert(leads).values({
        organizationId: workspaceId,
        companyName,
        industry,
        companyWebsite,
        estimatedEmployees,
        contactName,
        contactTitle,
        contactEmail,
        contactPhone,
        leadStatus: leadStatus || 'new',
        leadScore: leadScore || 0,
        estimatedValue: estimatedValue ? String(estimatedValue) : undefined,
        source: source || 'manual',
        notes,
        nextFollowUpDate,
        assignedTo: assignedTo || userId
      }).returning();

      await db.insert(leadActivities).values({
        leadId: lead.id,
        userId,
        workspaceId,
        activityType: 'status_change',
        description: 'Lead created',
        newStatus: lead.leadStatus
      });

      res.json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const updates = req.body;

      const [existing] = await db.select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      if (!existing) return res.status(404).json({ error: "Lead not found" });

      if (updates.estimatedValue) updates.estimatedValue = String(updates.estimatedValue);
      updates.updatedAt = new Date();

      const [updated] = await db.update(leads)
        .set(updates)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)))
        .returning();

      if (updates.leadStatus && updates.leadStatus !== existing.leadStatus) {
        await db.insert(leadActivities).values({
          leadId: id,
          userId,
          workspaceId,
          activityType: 'status_change',
          description: `Status changed from ${existing.leadStatus} to ${updates.leadStatus}`,
          previousStatus: existing.leadStatus || undefined,
          newStatus: updates.leadStatus
        });
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      await db.delete(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/:id/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const { activityType, description } = req.body;

      const [lead] = await db.select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const [activity] = await db.insert(leadActivities).values({
        leadId: id,
        userId,
        workspaceId,
        activityType,
        description
      }).returning();

      if (activityType === 'email_sent' || activityType === 'call') {
        await db.update(leads)
          .set({ lastContactedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      }

      res.json({ success: true, data: activity });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/deals", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { stage, status, ownerId, limit = 50 } = req.query;
      
      let conditions: any[] = [eq(deals.organizationId, workspaceId)];
      if (stage) conditions.push(eq(deals.stage, stage as string));
      if (status) conditions.push(eq(deals.status, status as string));
      if (ownerId) conditions.push(eq(deals.ownerId, ownerId as string));

      const result = await db.select()
        .from(deals)
        .where(and(...conditions))
        .orderBy(desc(deals.createdAt))
        .limit(Number(limit));

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/deals", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const userId = (req.user as any)?.id;
      
      const { 
        dealName, companyName, leadId, rfpId, stage,
        estimatedValue, probability, expectedCloseDate, notes, ownerId
      } = req.body;

      const [deal] = await db.insert(deals).values({
        organizationId: workspaceId,
        dealName,
        companyName,
        leadId,
        rfpId,
        stage: stage || 'prospect',
        estimatedValue: estimatedValue ? String(estimatedValue) : undefined,
        probability: probability || 50,
        expectedCloseDate,
        notes,
        ownerId: ownerId || userId
      }).returning();

      res.json({ success: true, data: deal });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/deals/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const updates = req.body;

      if (updates.estimatedValue) updates.estimatedValue = String(updates.estimatedValue);
      updates.updatedAt = new Date();
      if (updates.status === 'won') updates.actualCloseDate = new Date();

      const [updated] = await db.update(deals)
        .set(updates)
        .where(and(eq(deals.id, id), eq(deals.organizationId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/pipeline/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const pipelineStats = await db.select({
        stage: deals.stage,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${deals.estimatedValue}::numeric), 0)::numeric`
      })
      .from(deals)
      .where(and(eq(deals.status, 'active'), eq(deals.organizationId, workspaceId)))
      .groupBy(deals.stage);

      const leadStats = await db.select({
        status: leads.leadStatus,
        count: sql<number>`count(*)::int`
      })
      .from(leads)
      .where(eq(leads.organizationId, workspaceId))
      .groupBy(leads.leadStatus);

      res.json({ 
        success: true, 
        data: { 
          pipeline: pipelineStats,
          leads: leadStats
        } 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/crm', router);
}
