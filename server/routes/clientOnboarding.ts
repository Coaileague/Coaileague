/**
 * Client Onboarding Routes
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { sendManualEmail, sendAutonomousEmail } from "../services/resendEmailService";
import { ONBOARDING_PIPELINE } from "@shared/clientOnboardingConfig";

const router = Router();

router.post("/send-manual", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      to: z.array(z.string().email()).or(z.string().email()),
      stage: z.string(),
      data: z.record(z.unknown()),
    });

    const { to, stage, data } = schema.parse(req.body);
    const user = req.user as any;

    const recipients = Array.isArray(to) ? to : [to];
    const stageConfig = ONBOARDING_PIPELINE.stages.find((s) => s.id === stage);

    const emailTemplate = (stageConfig as any)?.email_template || "prospectOutreach";

    const result = await sendManualEmail(
      recipients,
      emailTemplate,
      data,
      user.currentWorkspaceId
    );

    res.json({
      success: result.success,
      sent: result.count,
      cost: `$${(result.cost / 100).toFixed(2)}`,
      error: result.error,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.post("/autonomous", requireAuth, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      campaignType: z.enum(["prospect", "rfp", "onboarding"]),
      count: z.number().min(1).max(1000),
    });

    const { campaignType, count } = schema.parse(req.body);
    const user = req.user as any;

    const recipients = Array.from({ length: count }, (_, i) => ({
      email: `prospect${i}@company.com`,
      companyName: `Company ${i + 1}`,
    }));

    const result = await sendAutonomousEmail(
      campaignType,
      recipients,
      user.currentWorkspaceId,
      `Autonomous ${campaignType} Campaign`
    );

    res.json({
      success: result.success,
      sent: result.sent,
      cost: `$${(result.cost / 100).toFixed(2)}`,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

export default router;
