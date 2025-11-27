/**
 * Email Campaigns & Prospects Routes
 * Handles manual prospect targeting and autonomous campaign management
 * Integrated with centralized config and billing
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { sendManualEmail, sendAutonomousEmail } from "../services/resendEmailService";
import { ONBOARDING_PIPELINE } from "@shared/clientOnboardingConfig";
import { db } from "../db";
import { emailCampaigns } from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Send manual email to individual prospect
router.post("/send-manual", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      to: z.array(z.string().email()).or(z.string().email()),
      stage: z.string(),
      templateData: z.object({
        companyName: z.string(),
        contactName: z.string(),
        rfpTitle: z.string().optional(),
        terms: z.string().optional(),
        workspaceUrl: z.string().optional(),
      }),
    });

    const { to, stage, templateData } = schema.parse(req.body);
    const user = req.user as any;

    const recipients = Array.isArray(to) ? to : [to];
    const stageConfig = ONBOARDING_PIPELINE.stages.find((s) => s.id === stage);

    const emailTemplate = (stageConfig as any)?.email_template || "prospectOutreach";

    const result = await sendManualEmail(
      recipients,
      emailTemplate,
      templateData,
      user.currentWorkspaceId
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error || "Failed to send emails" });
    }

    res.json({
      success: true,
      sent: result.count,
      cost: `$${(result.cost / 100).toFixed(2)}`,
      message: `Successfully sent ${result.count} email(s)`,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Start autonomous email campaign
router.post("/autonomous-campaign", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      campaignType: z.enum(["prospect", "rfp", "onboarding"]),
      campaignName: z.string(),
      recipientCount: z.number().min(1).max(1000),
    });

    const { campaignType, campaignName, recipientCount } = schema.parse(req.body);
    const user = req.user as any;

    // Generate mock recipients for autonomous campaign
    const recipients = Array.from({ length: recipientCount }, (_, i) => ({
      email: `prospect_auto_${i}@coaileague-demo.com`,
      companyName: `Auto Company ${i + 1}`,
      contactName: `Contact ${i + 1}`,
    }));

    const result = await sendAutonomousEmail(
      campaignType,
      recipients,
      user.currentWorkspaceId,
      campaignName
    );

    res.json({
      success: result.success,
      sent: result.sent,
      cost: `$${(result.cost / 100).toFixed(2)}`,
      campaignName,
      message: `Campaign "${campaignName}" started: ${result.sent} emails sent`,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get all email campaigns
router.get("/campaigns", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const campaigns = await db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.workspaceId, user.currentWorkspaceId));

    res.json({ data: campaigns });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get campaign details
router.get("/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { id } = req.params;

    const campaign = await db
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.workspaceId, user.currentWorkspaceId))
      .then((c) => c.find((x) => x.id === id));

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    res.json({ data: campaign });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get onboarding stages for UI dropdown
router.get("/stages", requireAuth, (_req: Request, res: Response) => {
  res.json({
    data: ONBOARDING_PIPELINE.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      description: stage.description,
      duration: stage.duration,
    })),
  });
});

export default router;
