import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { orgInvitations, salesProposals } from '@shared/schema';
import '../types';

export function registerSalesRoutes(app: Express, requireAuth: any) {
  const salesRouter = Router();

  salesRouter.get("/invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await db.select().from(orgInvitations);
      res.json({ success: true, data: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  salesRouter.post("/invitations/send", requireAuth, async (req: Request, res: Response) => {
    try {
      const { email, organizationName, contactName } = req.body;
      const token = Math.random().toString(36).substring(2, 15);
      const result = await db.insert(orgInvitations).values({
        email,
        organizationName,
        contactName,
        invitationToken: token,
        invitationTokenExpiry: new Date(Date.now() + 14*24*60*60*1000),
        sentBy: (req.user as any)?.id,
        status: "pending",
      }).returning();
      res.json({ success: true, invitation: result[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  salesRouter.get("/proposals", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await db.select().from(salesProposals);
      res.json({ success: true, data: list });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  salesRouter.post("/proposals", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, description, prospectEmail, prospectName, suggestedTier, estimatedValue } = req.body;
      const result = await db.insert(salesProposals).values({
        title,
        description,
        prospectEmail,
        prospectName,
        suggestedTier: suggestedTier || "starter",
        estimatedValue: estimatedValue ? String(estimatedValue) : undefined,
        status: "draft",
        createdBy: (req.user as any)?.id || "system",
      }).returning();
      res.json({ success: true, proposal: result[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/sales', salesRouter);
}
