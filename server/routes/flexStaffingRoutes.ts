import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  flexContractors, flexAvailability, flexGigs, 
  flexGigApplications, flexGigRatings, users
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import '../types';

export function registerFlexStaffingRoutes(app: Express, requireAuth: any) {
  const router = Router();

  // ==================== CONTRACTORS ====================
  
  router.get("/contractors", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const contractors = await db.select({
        contractor: flexContractors,
        user: { id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName }
      })
      .from(flexContractors)
      .leftJoin(users, eq(flexContractors.userId, users.id))
      .where(and(eq(flexContractors.workspaceId, workspaceId), eq(flexContractors.isActive, true)))
      .orderBy(desc(flexContractors.ratingAverage));

      res.json({ success: true, data: contractors });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/contractors", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { userId, hourlyRate, certifications, bio } = req.body;
      const inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const [contractor] = await db.insert(flexContractors).values({
        workspaceId,
        userId,
        hourlyRate: hourlyRate ? String(hourlyRate) : undefined,
        certifications: certifications || [],
        bio,
        inviteToken,
        invitedAt: new Date(),
      }).returning();

      res.json({ success: true, data: contractor });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/contractors/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
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

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== AVAILABILITY ====================

  router.get("/availability/:contractorId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contractorId } = req.params;
      const { startDate, endDate } = req.query;

      let query = db.select().from(flexAvailability)
        .where(eq(flexAvailability.contractorId, contractorId));

      const availability = await query.orderBy(flexAvailability.availableDate);
      res.json({ success: true, data: availability });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contractorId, dates } = req.body;

      const values = dates.map((d: any) => ({
        contractorId,
        availableDate: d.date,
        availableStartTime: d.startTime,
        availableEndTime: d.endTime,
        isAllDay: d.isAllDay ?? true
      }));

      const inserted = await db.insert(flexAvailability).values(values).returning();
      res.json({ success: true, data: inserted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/availability/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await db.delete(flexAvailability).where(eq(flexAvailability.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GIGS ====================

  router.get("/gigs", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });

      const { status, startDate, endDate } = req.query;
      
      let conditions = [eq(flexGigs.workspaceId, workspaceId)];
      if (status) conditions.push(eq(flexGigs.status, status as string));

      const gigs = await db.select().from(flexGigs)
        .where(and(...conditions))
        .orderBy(desc(flexGigs.gigDate));

      res.json({ success: true, data: gigs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/gigs", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
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

      res.json({ success: true, data: gig });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/gigs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      const updates = req.body;

      if (updates.payRate) updates.payRate = String(updates.payRate);
      updates.updatedAt = new Date();

      const [updated] = await db.update(flexGigs)
        .set(updates)
        .where(and(eq(flexGigs.id, id), eq(flexGigs.workspaceId, workspaceId)))
        .returning();

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/gigs/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      
      await db.delete(flexGigs)
        .where(and(eq(flexGigs.id, id), eq(flexGigs.workspaceId, workspaceId)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== APPLICATIONS ====================

  router.get("/gigs/:gigId/applications", requireAuth, async (req: Request, res: Response) => {
    try {
      const { gigId } = req.params;

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/gigs/:gigId/apply", requireAuth, async (req: Request, res: Response) => {
    try {
      const { gigId } = req.params;
      const { contractorId, message } = req.body;

      const [application] = await db.insert(flexGigApplications).values({
        gigId,
        contractorId,
        message,
      }).returning();

      await db.update(flexGigs)
        .set({ applicationsCount: sql`${flexGigs.applicationsCount} + 1` })
        .where(eq(flexGigs.id, gigId));

      res.json({ success: true, data: application });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/applications/:id/review", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = (req.user as any)?.id;

      const [updated] = await db.update(flexGigApplications)
        .set({ status, reviewedAt: new Date(), reviewedBy: userId })
        .where(eq(flexGigApplications.id, id))
        .returning();

      if (status === 'accepted') {
        const [app] = await db.select().from(flexGigApplications).where(eq(flexGigApplications.id, id));
        if (app) {
          await db.update(flexGigs)
            .set({ status: 'assigned', assignedContractorId: app.contractorId, assignedAt: new Date() })
            .where(eq(flexGigs.id, app.gigId));
        }
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== RATINGS ====================

  router.post("/gigs/:gigId/rate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { gigId } = req.params;
      const { contractorId, ratingByWorkspace, contractorRating, contractorComment, ratingByContractor, workspaceRating, workspaceComment } = req.body;

      const existing = await db.select().from(flexGigRatings)
        .where(and(eq(flexGigRatings.gigId, gigId), eq(flexGigRatings.contractorId, contractorId)));

      if (existing.length > 0) {
        const [updated] = await db.update(flexGigRatings)
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
        res.json({ success: true, data: updated });
      } else {
        const [rating] = await db.insert(flexGigRatings).values({
          gigId,
          contractorId,
          ratedByWorkspace: ratingByWorkspace ?? false,
          contractorRating,
          contractorComment,
          ratedByContractor: ratingByContractor ?? false,
          workspaceRating,
          workspaceComment
        }).returning();
        res.json({ success: true, data: rating });
      }

      if (contractorRating) {
        const ratings = await db.select().from(flexGigRatings)
          .where(eq(flexGigRatings.contractorId, contractorId));
        const validRatings = ratings.filter(r => r.contractorRating);
        const avg = validRatings.reduce((sum, r) => sum + (r.contractorRating || 0), 0) / validRatings.length;
        
        await db.update(flexContractors)
          .set({ ratingAverage: String(avg.toFixed(2)), totalRatings: validRatings.length })
          .where(eq(flexContractors.id, contractorId));
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/flex', router);
}
