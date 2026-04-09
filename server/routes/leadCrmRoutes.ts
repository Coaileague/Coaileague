import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { leads, activities, deals, users } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import '../types';
import { platformEventBus } from '../services/platformEventBus';
import { requireManager } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('LeadCrmRoutes');


export function registerLeadCrmRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const router = Router();

  const getWorkspaceId = (req: Request): string | null => {
    return req.workspaceId || null;
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
        .limit(Math.min(Number(limit) || 100, 500));

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
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
        .limit(Math.min(Number(limit) || 50, 500));

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
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
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
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

      const leadActivityList = await db.select({
        activity: activities,
        user: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(activities)
      .leftJoin(users, eq(activities.createdByUserId, users.id))
      .where(and(eq(activities.leadId, id), eq(activities.workspaceId, workspaceId)))
      .orderBy(desc(activities.createdAt));

      res.json({ success: true, data: { lead, activities: leadActivityList } });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/", requireManager, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const userId = (req.user)?.id;
      
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

      await db.insert(activities).values({
        organizationId: workspaceId,
        leadId: lead.id,
        createdByUserId: userId || 'system',
        workspaceId,
        activityType: 'status_change',
        subject: 'Lead created',
        newStatus: lead.leadStatus,
      });

      platformEventBus.emit('crm.lead_created', {
        workspaceId,
        leadId: lead.id,
        companyName,
        source: source || 'manual',
        createdBy: userId,
      });

      res.json({ success: true, data: lead });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/:id", requireManager, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const userId = (req.user)?.id;

      const [existing] = await db.select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      if (!existing) return res.status(404).json({ error: "Lead not found" });

      const { companyName, contactName, contactEmail, contactPhone, leadSource, source, leadStatus, estimatedValue, notes, tags, assignedTo, industry, website, address } = req.body;
      const safeLeadUpdates: Record<string, any> = { updatedAt: new Date() };
      if (companyName !== undefined) safeLeadUpdates.companyName = companyName;
      if (contactName !== undefined) safeLeadUpdates.contactName = contactName;
      if (contactEmail !== undefined) safeLeadUpdates.contactEmail = contactEmail;
      if (contactPhone !== undefined) safeLeadUpdates.contactPhone = contactPhone;
      if (source !== undefined) safeLeadUpdates.source = source;
      else if (leadSource !== undefined) safeLeadUpdates.source = leadSource;
      if (leadStatus !== undefined) safeLeadUpdates.leadStatus = leadStatus;
      if (estimatedValue !== undefined) safeLeadUpdates.estimatedValue = String(estimatedValue);
      if (notes !== undefined) safeLeadUpdates.notes = notes;
      if (tags !== undefined) safeLeadUpdates.tags = tags;
      if (assignedTo !== undefined) safeLeadUpdates.assignedTo = assignedTo;
      if (industry !== undefined) safeLeadUpdates.industry = industry;
      if (website !== undefined) safeLeadUpdates.website = website;
      if (address !== undefined) safeLeadUpdates.address = address;

      const [updated] = await db.update(leads)
        .set(safeLeadUpdates)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)))
        .returning();

      if (leadStatus && leadStatus !== existing.leadStatus) {
        await db.insert(activities).values({
          organizationId: workspaceId,
          leadId: id,
          createdByUserId: userId || 'system',
          workspaceId,
          activityType: 'status_change',
          subject: `Status changed from ${existing.leadStatus} to ${leadStatus}`,
          previousStatus: existing.leadStatus || undefined,
          newStatus: leadStatus,
        });

        platformEventBus.emit('crm.lead_status_changed', {
          workspaceId,
          leadId: id,
          previousStatus: existing.leadStatus,
          newStatus: leadStatus,
          changedBy: userId,
        });
      }

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/:id", requireManager, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      await db.delete(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/:id/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const userId = (req.user)?.id;
      const { activityType, description } = req.body;

      const [lead] = await db.select()
        .from(leads)
        .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      
      if (!lead) return res.status(404).json({ error: "Lead not found" });

      const [activity] = await db.insert(activities).values({
        organizationId: workspaceId,
        leadId: id,
        createdByUserId: userId || 'system',
        workspaceId,
        activityType,
        subject: description || activityType,
        notes: description,
      }).returning();

      if (activityType === 'email_sent' || activityType === 'call') {
        await db.update(leads)
          .set({ lastContactedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(leads.id, id), eq(leads.organizationId, workspaceId)));
      }

      res.json({ success: true, data: activity });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/deals", requireManager, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const userId = (req.user)?.id;
      
      const { 
        dealName, companyName, leadId, rfpId, stage,
        estimatedValue, probability, expectedCloseDate, notes, ownerId
      } = req.body;

      const [deal] = await db.insert(deals).values({
        workspaceId: workspaceId!,
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

      platformEventBus.emit('crm.deal_created', {
        workspaceId,
        dealId: deal.id,
        dealName,
        stage: stage || 'prospect',
        estimatedValue,
        createdBy: userId,
      });

      res.json({ success: true, data: deal });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/deals/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = requireWorkspace(req, res);
      if (!workspaceId) return;

      const { id } = req.params;
      const { name: dealName, status: dealStatus, stage, estimatedValue: dealValue, expectedCloseDate, leadId, assignedTo: dealAssignee, notes: dealNotes } = req.body;

      const safeDealUpdates: Record<string, any> = { updatedAt: new Date() };
      if (dealName !== undefined) safeDealUpdates.name = dealName;
      if (dealStatus !== undefined) safeDealUpdates.status = dealStatus;
      if (stage !== undefined) safeDealUpdates.stage = stage;
      if (dealValue !== undefined) safeDealUpdates.estimatedValue = String(dealValue);
      if (expectedCloseDate !== undefined) safeDealUpdates.expectedCloseDate = expectedCloseDate;
      if (leadId !== undefined) safeDealUpdates.leadId = leadId;
      if (dealAssignee !== undefined) safeDealUpdates.assignedTo = dealAssignee;
      if (dealNotes !== undefined) safeDealUpdates.notes = dealNotes;
      if (dealStatus === 'won') safeDealUpdates.actualCloseDate = new Date();

      const [updated] = await db.update(deals)
        .set(safeDealUpdates)
        .where(and(eq(deals.id, id), eq(deals.organizationId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[LeadCRM] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/crm', ...middlewares, router);
}
