import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at?: string;
    headers?: Record<string, string>;
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

router.post("/api/webhooks/resend", async (req, res) => {
  try {
    const event: ResendWebhookEvent = req.body;
    
    console.log(`[Resend Webhook] Event received: ${event.type}`);
    console.log(`[Resend Webhook] Email ID: ${event.data.email_id}`);
    console.log(`[Resend Webhook] To: ${event.data.to?.join(", ")}`);
    
    switch (event.type) {
      case "email.sent":
        console.log(`[Resend] Email sent to ${event.data.to?.join(", ")}`);
        break;
        
      case "email.delivered":
        console.log(`[Resend] Email delivered to ${event.data.to?.join(", ")}`);
        break;
        
      case "email.opened":
        console.log(`[Resend] Email opened by ${event.data.to?.join(", ")}`);
        break;
        
      case "email.clicked":
        console.log(`[Resend] Link clicked: ${event.data.click?.link}`);
        break;
        
      case "email.bounced":
        console.error(`[Resend] Email bounced for ${event.data.to?.join(", ")}`);
        break;
        
      case "email.complained":
        console.error(`[Resend] Spam complaint from ${event.data.to?.join(", ")}`);
        break;
        
      default:
        console.log(`[Resend] Unknown event type: ${event.type}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Resend Webhook] Error processing event:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
