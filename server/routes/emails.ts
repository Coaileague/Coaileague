/**
 * Email Automation API Routes
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { 
  sendEmail, 
  sendBilledEmail, 
  sendTemplatedEmail,
  EMAIL_TEMPLATES,
  EMAIL_PRICING,
  type EmailTemplateType,
} from "../services/emailAutomation";
import { requireAuth } from "../auth";
import { db } from "../db";
import { emailEvents } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

const sendEmailSchema = z.object({
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

// Send a single email (no billing)
router.post("/send", requireAuth, async (req: Request, res: Response) => {
  try {
    const validated = sendEmailSchema.parse(req.body);
    
    const result = await sendEmail({
      to: validated.to,
      subject: validated.subject,
      html: validated.html,
      text: validated.text,
      from: validated.from,
      replyTo: validated.replyTo,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ 
      success: true, 
      messageId: result.messageId,
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
    const workspaceId = user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: "Workspace not found" });
    }

    const validated = sendBilledEmailSchema.parse(req.body);
    
    const result = await sendBilledEmail({
      ...validated,
      workspaceId,
      userId: user.id,
    });

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
    const workspaceId = user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: "Workspace not found" });
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
    const workspaceId = user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: "Workspace not found" });
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

export default router;
