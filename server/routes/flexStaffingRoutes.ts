import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { hasManagerAccess } from '../rbac';
import {
  flexContractors, flexAvailability, flexGigs,
  flexGigApplications, flexGigRatings, users
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import '../types';
import {
  filterSensitiveFieldsArray,
  filterContractorForResponse,
  createFilterContext,
  canViewPayRates,
} from '../utils/sensitiveFieldFilter';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('FlexStaffingRoutes');


export function registerFlexStaffingRoutes(app: Express, requireAuth: any, attachWorkspaceId?: any) {
  const router = Router();

  // ==================== CONTRACTORS ====================
  
  router.get("/contractors", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const contractors = await db.select({
        contractor: flexContractors,
        user: { id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName }
      })
      .from(flexContractors)
      .leftJoin(users, eq(flexContractors.userId, users.id))
      .where(and(eq(flexContractors.workspaceId, workspaceId), eq(flexContractors.isActive, true)))
      .orderBy(desc(flexContractors.ratingAverage));

      // PRIVACY: Filter pay rates - contractors should NOT see other contractors' rates
      // Only org_owner can see contractor pay rates
      const filterContext = createFilterContext(req);
      const filteredContractors = contractors.map(c => ({
        ...c,
        contractor: filterContractorForResponse(c.contractor, filterContext),
      }));

      res.json({ success: true, data: filteredContractors });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Error fetching contractors:', error);
      res.status(500).json({ error: 'Failed to fetch contractors' });
    }
  });

  router.post("/contractors", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { userId, hourlyRate, certifications, bio } = req.body;
      const inviteToken = randomUUID() + '-' + randomUUID();
      
      const [contractor] = await db.insert(flexContractors).values({
        workspaceId,
        userId,
        hourlyRate: hourlyRate ? String(hourlyRate) : undefined,
        certifications: certifications || [],
        bio,
        inviteToken,
        invitedAt: new Date(),
      }).returning();

      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'employees_updated' });
      } catch (e: unknown) { log.warn('[FlexStaffing] Broadcast failed:', e.message); }

      res.json({ success: true, data: contractor });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Error creating contractor:', error);
      res.status(500).json({ error: 'Failed to create contractor' });
    }
  });

  router.patch("/contractors/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasManagerAccess(req.workspaceRole || '')) {
        return res.status(403).json({ error: "Manager access required to update contractor profiles" });
      }
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
          if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
      const { id } = req.params;
      const { hourlyRate, certifications, bio, isPreferred, isActive } = req.body;

      const [updated] = await db.update(flexContractors)
        .set({
          hourlyRate: hourlyRate !== undefined ? String(hourlyRate) : undefined,
          certifications,
          bio,
          isPreferred,
          isActive,
          updatedAt: new Date()
        })
        .where(and(eq(flexContractors.id, id), eq(flexContractors.workspaceId, workspaceId)))
        .returning();

      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'employees_updated' });
      } catch (e: unknown) { log.warn('[FlexStaffing] Broadcast failed:', e.message); }

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== AVAILABILITY ====================

  router.get("/availability/:contractorId", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { contractorId } = req.params;

      const [contractor] = await db.select()
        .from(flexContractors)
        .where(and(eq(flexContractors.id, contractorId), eq(flexContractors.workspaceId, workspaceId)));
      
      if (!contractor) return res.status(404).json({ error: "Contractor not found" });

      const availability = await db.select()
        .from(flexAvailability)
        .where(eq(flexAvailability.contractorId, contractorId))
        .orderBy(flexAvailability.availableDate);

      res.json({ success: true, data: availability });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { contractorId, dates } = req.body;

      const [contractor] = await db.select()
        .from(flexContractors)
        .where(and(eq(flexContractors.id, contractorId), eq(flexContractors.workspaceId, workspaceId)));
      
      if (!contractor) return res.status(403).json({ error: "Contractor not in your workspace" });

      const values = dates.map((d: any) => ({
        contractorId,
        availableDate: d.date,
        availableStartTime: d.startTime,
        availableEndTime: d.endTime,
        isAllDay: d.isAllDay ?? true
      }));

      const inserted = await db.insert(flexAvailability).values(values).returning();
      res.json({ success: true, data: inserted });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/availability/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { id } = req.params;
      
      const [avail] = await db.select({
        availability: flexAvailability,
        contractor: flexContractors
      })
      .from(flexAvailability)
      .innerJoin(flexContractors, eq(flexAvailability.contractorId, flexContractors.id))
      .where(and(eq(flexAvailability.id, id), eq(flexContractors.workspaceId, workspaceId)));
      
      if (!avail) return res.status(404).json({ error: "Availability not found" });
      
      await db.delete(flexAvailability).where(eq(flexAvailability.id, id));
      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== GIGS ====================

  router.get("/gigs", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { status, startDate, endDate } = req.query;
      
      let conditions = [eq(flexGigs.workspaceId, workspaceId)];
      if (status) conditions.push(eq(flexGigs.status, status as string));

      const gigs = await db.select().from(flexGigs)
        .where(and(...conditions))
        .orderBy(desc(flexGigs.gigDate));

      res.json({ success: true, data: gigs });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/gigs", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const userId = (req.user as any)?.id;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { title, description, gigDate, startTime, endTime, locationName, locationAddress, requirements, payRate, notifyAll } = req.body;

      const [gig] = await db.insert(flexGigs).values({
        workspaceId,
        createdBy: userId,
        title,
        description,
        gigDate,
        startTime,
        endTime,
        locationName,
        locationAddress,
        requirements: requirements || [],
        payRate: String(payRate),
        notifyAll: notifyAll ?? true,
      }).returning();

      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'schedules_updated' });
      } catch (e: unknown) { log.warn('[FlexStaffing] Broadcast failed:', e.message); }

      platformEventBus.emit('flex.gig_created', {
        workspaceId,
        gigId: gig.id,
        title,
        gigDate,
        createdBy: userId,
      });

      res.json({ success: true, data: gig });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/gigs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasManagerAccess(req.workspaceRole || '')) {
        return res.status(403).json({ error: "Manager access required to update gigs" });
      }
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
          if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
      const { id } = req.params;
      const { title, description, gigDate, startTime, endTime, locationName, locationAddress, requirements, payRate, notifyAll, status } = req.body;

      const safeUpdates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) safeUpdates.title = title;
      if (description !== undefined) safeUpdates.description = description;
      if (gigDate !== undefined) safeUpdates.gigDate = gigDate;
      if (startTime !== undefined) safeUpdates.startTime = startTime;
      if (endTime !== undefined) safeUpdates.endTime = endTime;
      if (locationName !== undefined) safeUpdates.locationName = locationName;
      if (locationAddress !== undefined) safeUpdates.locationAddress = locationAddress;
      if (requirements !== undefined) safeUpdates.requirements = requirements;
      if (payRate !== undefined) safeUpdates.payRate = String(payRate);
      if (notifyAll !== undefined) safeUpdates.notifyAll = notifyAll;
      if (status !== undefined) safeUpdates.status = status;

      const [updated] = await db.update(flexGigs)
        .set(safeUpdates)
        .where(and(eq(flexGigs.id, id), eq(flexGigs.workspaceId, workspaceId)))
        .returning();

      platformEventBus.emit('flex.gig_updated', {
        workspaceId,
        gigId: id,
        updatedFields: Object.keys(req.body),
      });

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.delete("/gigs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasManagerAccess(req.workspaceRole || '')) {
        return res.status(403).json({ error: "Manager access required to delete gigs" });
      }
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
          if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
      const { id } = req.params;
      
      await db.delete(flexGigs)
        .where(and(eq(flexGigs.id, id), eq(flexGigs.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== APPLICATIONS ====================

  router.get("/gigs/:gigId/applications", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { gigId } = req.params;

      const [gig] = await db.select()
        .from(flexGigs)
        .where(and(eq(flexGigs.id, gigId), eq(flexGigs.workspaceId, workspaceId)));
      
      if (!gig) return res.status(404).json({ error: "Gig not found" });

      const applications = await db.select({
        application: flexGigApplications,
        contractor: flexContractors,
        user: { id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }
      })
      .from(flexGigApplications)
      .leftJoin(flexContractors, eq(flexGigApplications.contractorId, flexContractors.id))
      .leftJoin(users, eq(flexContractors.userId, users.id))
      .where(eq(flexGigApplications.gigId, gigId))
      .orderBy(desc(flexGigApplications.appliedAt));

      res.json({ success: true, data: applications });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.post("/gigs/:gigId/apply", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { gigId } = req.params;
      const { contractorId, message } = req.body;

      const [gig] = await db.select()
        .from(flexGigs)
        .where(and(eq(flexGigs.id, gigId), eq(flexGigs.workspaceId, workspaceId)));
      
      if (!gig) return res.status(404).json({ error: "Gig not found" });

      const [contractor] = await db.select()
        .from(flexContractors)
        .where(and(eq(flexContractors.id, contractorId), eq(flexContractors.workspaceId, workspaceId)));
      
      if (!contractor) return res.status(403).json({ error: "Contractor not in workspace" });

      const application = await db.transaction(async (tx) => {
        const [newApp] = await tx.insert(flexGigApplications).values({
          workspaceId: workspaceId,
          gigId,
          contractorId,
          message,
        }).returning();
        await tx.update(flexGigs)
          .set({ applicationsCount: sql`${flexGigs.applicationsCount} + 1` })
          .where(and(eq(flexGigs.id, gigId), eq(flexGigs.workspaceId, workspaceId)));
        return newApp;
      });

      platformEventBus.emit('flex.gig_application_submitted', {
        workspaceId,
        gigId,
        applicationId: application.id,
        contractorId,
      });

      res.json({ success: true, data: application });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  router.patch("/applications/:id/review", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!hasManagerAccess(req.workspaceRole || '')) {
        return res.status(403).json({ error: "Manager access required to review applications" });
      }
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { id } = req.params;
      const { status } = req.body;
      const userId = (req.user as any)?.id;

      const validStatuses = ['pending', 'accepted', 'rejected', 'withdrawn', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }

      const [appWithGig] = await db.select({
        application: flexGigApplications,
        gig: flexGigs
      })
      .from(flexGigApplications)
      .innerJoin(flexGigs, eq(flexGigApplications.gigId, flexGigs.id))
      .where(and(eq(flexGigApplications.id, id), eq(flexGigs.workspaceId, workspaceId)));
      
      if (!appWithGig) return res.status(404).json({ error: "Application not found" });

      const updated = await db.transaction(async (tx) => {
        const [updatedApp] = await tx.update(flexGigApplications)
          .set({ status, reviewedAt: new Date(), reviewedBy: userId })
          .where(eq(flexGigApplications.id, id))
          .returning();
        if (status === 'accepted') {
          await tx.update(flexGigs)
            .set({ status: 'assigned', assignedContractorId: appWithGig.application.contractorId, assignedAt: new Date() })
            .where(and(eq(flexGigs.id, appWithGig.application.gigId), eq(flexGigs.workspaceId, workspaceId)));
        }
        return updatedApp;
      });

      try {
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'schedules_updated' });
      } catch (e: unknown) { log.warn('[FlexStaffing] Broadcast failed:', e.message); }

      res.json({ success: true, data: updated });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  // ==================== RATINGS ====================

  router.post("/gigs/:gigId/rate", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      
      const { gigId } = req.params;
      const { contractorId, ratingByWorkspace, contractorRating, contractorComment, ratingByContractor, workspaceRating, workspaceComment } = req.body;

      const [gig] = await db.select()
        .from(flexGigs)
        .where(and(eq(flexGigs.id, gigId), eq(flexGigs.workspaceId, workspaceId)));
      
      if (!gig) return res.status(404).json({ error: "Gig not found" });

      const [contractor] = await db.select()
        .from(flexContractors)
        .where(and(eq(flexContractors.id, contractorId), eq(flexContractors.workspaceId, workspaceId)));
      
      if (!contractor) return res.status(403).json({ error: "Contractor not in workspace" });

      const existing = await db.select().from(flexGigRatings)
        .where(and(eq(flexGigRatings.gigId, gigId), eq(flexGigRatings.contractorId, contractorId)));

      const ratingResult = await db.transaction(async (tx) => {
        let upsertedRating: typeof existing[0];
        if (existing.length > 0) {
          const [updated] = await tx.update(flexGigRatings)
            .set({
              ratedByWorkspace: ratingByWorkspace ?? existing[0].ratedByWorkspace,
              contractorRating: contractorRating ?? existing[0].contractorRating,
              contractorComment: contractorComment ?? existing[0].contractorComment,
              ratedByContractor: ratingByContractor ?? existing[0].ratedByContractor,
              workspaceRating: workspaceRating ?? existing[0].workspaceRating,
              workspaceComment: workspaceComment ?? existing[0].workspaceComment,
              updatedAt: new Date()
            })
            .where(eq(flexGigRatings.id, existing[0].id))
            .returning();
          upsertedRating = updated;
        } else {
          const [rating] = await tx.insert(flexGigRatings).values({
            workspaceId: workspaceId,
            gigId,
            contractorId,
            ratedByWorkspace: ratingByWorkspace ?? false,
            contractorRating,
            contractorComment,
            ratedByContractor: ratingByContractor ?? false,
            workspaceRating,
            workspaceComment
          }).returning();
          upsertedRating = rating;
        }
        if (contractorRating) {
          const ratings = await tx.select().from(flexGigRatings)
            .where(eq(flexGigRatings.contractorId, contractorId));
          const validRatings = ratings.filter(r => r.contractorRating);
          const avg = validRatings.reduce((sum, r) => sum + (r.contractorRating || 0), 0) / validRatings.length;
          await tx.update(flexContractors)
            .set({ ratingAverage: String(avg.toFixed(2)), totalRatings: validRatings.length })
            .where(and(eq(flexContractors.id, contractorId), eq(flexContractors.workspaceId, workspaceId)));
        }
        return upsertedRating;
      });
      res.json({ success: true, data: ratingResult });
    } catch (error: unknown) {
      log.error('[FlexStaffing] Operation error:', error);
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  const middlewares = attachWorkspaceId ? [requireAuth, attachWorkspaceId] : [requireAuth];
  app.use('/api/flex', ...middlewares, router);
}
