import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { leads, leadActivities, deals, users } from '@shared/schema';
import { eq, and, desc, sql, like, or, asc } from 'drizzle-orm';
import '../types';

export function registerLeadCrmRoutes(app: Express, requireAuth: any) {
  const router = Router();

  // ==================== LEADS ====================

  router.get("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, industry, assignedTo, limit = 100 } = req.query;
      
      let conditions: any[] = [];
      if (status) conditions.push(eq(leads.leadStatus, status as string));
      if (industry) conditions.push(eq(leads.industry, industry as string));
      if (assignedTo) conditions.push(eq(leads.assignedTo, assignedTo as string));

      const query = conditions.length > 0
        ? db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt)).limit(Number(limit))
        : db.select().from(leads).orderBy(desc(leads.createdAt)).limit(Number(limit));

      const result = await query;
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [lead] = await db.select().from(leads).where(eq(leads.id, id));
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const activities = await db.select({
        activity: leadActivities,
        user: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(leadActivities)
      .leftJoin(users, eq(leadActivities.userId, users.id))
      .where(eq(leadActivities.leadId, id))
      .orderBy(desc(leadActivities.createdAt));

      res.json({ success: true, data: { lead, activities } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      const workspaceId = (req as any).workspaceId;
      
      const { 
        companyName, industry, companyWebsite, estimatedEmployees,
        contactName, contactTitle, contactEmail, contactPhone,
        leadStatus, leadScore, estimatedValue, source, notes, nextFollowUpDate, assignedTo
      } = req.body;

      const [lead] = await db.insert(leads).values({
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

      if (workspaceId) {
        await db.insert(leadActivities).values({
          leadId: lead.id,
          userId,
          workspaceId,
          activityType: 'status_change',
          description: 'Lead created',
          newStatus: lead.leadStatus
        });
      }

      res.json({ success: true, data: lead });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const workspaceId = (req as any).workspaceId;
      const updates = req.body;

      const [existing] = await db.select().from(leads).where(eq(leads.id, id));
      if (!existing) return res.status(404).json({ error: "Lead not found" });

      if (updates.estimatedValue) updates.estimatedValue = String(updates.estimatedValue);
      updates.updatedAt = new Date();

      const [updated] = await db.update(leads)
        .set(updates)
        .where(eq(leads.id, id))
        .returning();

      if (workspaceId && updates.leadStatus && updates.leadStatus !== existing.leadStatus) {
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
      const { id } = req.params;
      await db.delete(leads).where(eq(leads.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== LEAD ACTIVITIES ====================

  router.post("/:id/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const workspaceId = (req as any).workspaceId;

      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { activityType, description } = req.body;

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
          .where(eq(leads.id, id));
      }

      res.json({ success: true, data: activity });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DEALS ====================

  router.get("/deals", requireAuth, async (req: Request, res: Response) => {
    try {
      const { stage, status, ownerId, limit = 50 } = req.query;
      
      let conditions: any[] = [];
      if (stage) conditions.push(eq(deals.stage, stage as string));
      if (status) conditions.push(eq(deals.status, status as string));
      if (ownerId) conditions.push(eq(deals.ownerId, ownerId as string));

      const query = conditions.length > 0
        ? db.select().from(deals).where(and(...conditions)).orderBy(desc(deals.createdAt)).limit(Number(limit))
        : db.select().from(deals).orderBy(desc(deals.createdAt)).limit(Number(limit));

      const result = await query;
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/deals", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      
      const { 
        dealName, companyName, leadId, rfpId, stage,
        estimatedValue, probability, expectedCloseDate, notes, ownerId
      } = req.body;

      const [deal] = await db.insert(deals).values({
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
      const { id } = req.params;
      const updates = req.body;

      if (updates.estimatedValue) updates.estimatedValue = String(updates.estimatedValue);
      updates.updatedAt = new Date();

      if (updates.status === 'won') updates.actualCloseDate = new Date();

      const [updated] = await db.update(deals)
        .set(updates)
        .where(eq(deals.id, id))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PIPELINE STATS ====================

  router.get("/pipeline/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const pipelineStats = await db.select({
        stage: deals.stage,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${deals.estimatedValue}::numeric), 0)::numeric`
      })
      .from(deals)
      .where(eq(deals.status, 'active'))
      .groupBy(deals.stage);

      const leadStats = await db.select({
        status: leads.leadStatus,
        count: sql<number>`count(*)::int`
      })
      .from(leads)
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
