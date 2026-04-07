/**
 * Email Automation API Routes
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { 
  sendBilledEmail, 
  sendTemplatedEmail,
  EMAIL_TEMPLATES,
  EMAIL_PRICING,
  type EmailTemplateType,
} from "../services/emailAutomation";
import { sendEmail } from "../email"; // infra
import { requireAuth } from "../auth";
import { requirePlatformStaff } from "../rbac";
import { db } from "../db";
import { emailEvents } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { seedEmails, clearEmailSeedData } from "../seed-emails";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('Emails');


const router = Router();

const sendEmailSchema = z.object({ // infra
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  from: z.string().email().optional(),
  replyTo: z.string().email().optional(),
});

const sendBilledEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  html: z.string().min(1),
  emailType: z.enum(["sales", "marketing", "onboarding", "client_onboarding", "upsell", "support", "notification"]),
});

const sendTemplateSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  template: z.enum(["sales", "marketing", "onboarding", "client_onboarding", "upsell"]),
  data: z.record(z.string()),
});

// Send a single email (no billing) — platform staff only
router.post("/send", requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const validated = sendEmailSchema.parse(req.body); // infra
    
    const result = await sendEmail({ // infra
      to: validated.to,
      subject: validated.subject,
      html: validated.html,
      text: validated.text,
      from: validated.from,
      replyTo: validated.replyTo,
    });

    if (!result.success) {
      return res.status(400).json({ error: "Email failed to send or Resend is not configured" });
    }

    res.json({ 
      success: true, 
      messageId: result.id,
      message: "Email sent successfully" 
    });
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : "Invalid request" 
    });
  }
});

// Send email campaign with billing
router.post("/campaign", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const validated = sendBilledEmailSchema.parse(req.body);
    
    const result = await sendBilledEmail({
      ...validated,
      workspaceId,
      userId: user.id,
    });

    if (result.success) {
      platformEventBus.emit('email.campaign_sent', {
        workspaceId,
        emailType: validated.emailType,
        sentCount: result.sentCount,
        cost: result.cost,
      });
    }

    res.json({
      success: result.success,
      sentCount: result.sentCount,
      cost: `$${(result.cost / 100).toFixed(2)}`,
      error: result.error,
    });
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : "Invalid request" 
    });
  }
});

// Send using a pre-built template
router.post("/template", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id?: string; currentWorkspaceId?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const validated = sendTemplateSchema.parse(req.body);
    
    const result = await sendTemplatedEmail(
      validated.template as EmailTemplateType,
      validated.to,
      validated.data,
      workspaceId,
      user.id
    );

    res.json({
      success: result.success,
      cost: `$${(result.cost / 100).toFixed(2)}`,
      error: result.error,
    });
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof z.ZodError ? error.errors : "Invalid request" 
    });
  }
});

// Get available templates
router.get("/templates", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    templates: Object.entries(EMAIL_TEMPLATES).map(([tmplType, template]) => ({
      type: tmplType,
      subject: template.subject,
      pricing: EMAIL_PRICING[tmplType as keyof typeof EMAIL_PRICING],
    })),
  });
});

// Get email history
router.get("/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { currentWorkspaceId?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const events = await db.query.emailEvents.findMany({
      where: (table, { eq: eqOp }) => eqOp(table.workspaceId, workspaceId),
      orderBy: [desc(emailEvents.createdAt)],
      limit: 100,
    });

    res.json({ emails: events });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch email history" });
  }
});

// Get pricing info
router.get("/pricing", (_req: Request, res: Response) => {
  const pricing = Object.entries(EMAIL_PRICING).map(([pricingType, pricingValue]) => ({
    type: pricingType,
    price: `$${(pricingValue / 100).toFixed(2)}`,
    priceCents: pricingValue,
  }));

  res.json({ 
    pricing,
    currency: "USD",
    perEmail: true,
  });
});

// Development seed endpoint (requires authentication)
router.post("/seed-dev", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { currentWorkspaceId?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const result = await seedEmails(workspaceId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to seed emails" });
    }

    res.json({
      success: true,
      message: `Successfully seeded ${result.emailCount} test emails`,
      emailCount: result.emailCount,
      trinityActionRequired: result.trinityActionRequired,
    });
  } catch (error) {
    log.error("Email seeding error:", error);
    res.status(500).json({ error: "Failed to seed test emails" });
  }
});

// Seed test emails (development only)
router.post("/seed", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { currentWorkspaceId?: string; role?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    // Only allow org owners or admins to seed data
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const result = await seedEmails(workspaceId);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to seed emails" });
    }

    res.json({
      success: true,
      message: `Successfully seeded ${result.emailCount} test emails`,
      emailCount: result.emailCount,
      trinityActionRequired: result.trinityActionRequired,
    });
  } catch (error) {
    log.error("Email seeding error:", error);
    res.status(500).json({ error: "Failed to seed test emails" });
  }
});

// Clear seeded emails (development only)
router.delete("/seed", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { currentWorkspaceId?: string };
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(403).json({ error: "Workspace not found" });
    }

    const result = await clearEmailSeedData(workspaceId);
    
    res.json({
      success: true,
      message: "Successfully cleared seeded emails",
    });
  } catch (error) {
    log.error("Email clear error:", error);
    res.status(500).json({ error: "Failed to clear seeded emails" });
  }
});

export default router;
