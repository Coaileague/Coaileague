/**
 * Email Automation Service
 * Uses Resend API for autonomous email sending
 * Integrates with billing to charge per email sent
 * 
 * Trinity Integration: Connected via trinityPlatformConnector for email tracking and insights
 */

import { Resend } from "resend";
import { db } from "../db";
import { emailEvents, creditTransactions, workspaceCredits } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { trinityPlatformConnector } from './ai-brain/trinityPlatformConnector';

const resendApiKey = process.env.RESEND_API_KEY;

function getResendClient(): Resend | null {
  if (!resendApiKey) {
    return null;
  }
  return new Resend(resendApiKey);
}

export interface EmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface EmailCampaignOptions extends EmailOptions {
  workspaceId: string;
  userId?: string;
  emailType: "sales" | "marketing" | "onboarding" | "client_onboarding" | "upsell" | "support" | "notification";
  recipientCount?: number;
}

// Pricing per email type (in cents)
export const EMAIL_PRICING: Record<EmailCampaignOptions["emailType"], number> = {
  sales: 2,
  marketing: 1,
  onboarding: 1,
  client_onboarding: 3,
  upsell: 2,
  support: 1,
  notification: 1,
};

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const resend = getResendClient();
    if (!resend) {
      return { success: false, error: "Resend API key is not configured" };
    }

    const response = await resend.emails.send({
      from: options.from || "CoAIleague <noreply@coaileague.com>",
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    });

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, messageId: response.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function sendBilledEmail(
  options: EmailCampaignOptions
): Promise<{ success: boolean; sentCount: number; cost: number; error?: string }> {
  try {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const recipientCount = options.recipientCount || recipients.length;
    
    const pricePerEmail = EMAIL_PRICING[options.emailType] || EMAIL_PRICING.notification;
    const totalCost = recipientCount * pricePerEmail;

    // Check workspace credits
    const workspace = await db.query.workspaceCredits.findFirst({
      where: (credits, { eq: eqOp }) => eqOp(credits.workspaceId, options.workspaceId),
    });

    if (!workspace || workspace.currentBalance < totalCost) {
      return {
        success: false,
        sentCount: 0,
        cost: totalCost,
        error: `Insufficient credits. Required: $${(totalCost / 100).toFixed(2)}, Available: $${((workspace?.currentBalance || 0) / 100).toFixed(2)}`,
      };
    }

    let sentCount = 0;
    for (const email of recipients) {
      const result = await sendEmail({
        ...options,
        to: email,
      });

      if (result.success) {
        sentCount++;
        
        // Log email event
        await db.insert(emailEvents).values({
          workspaceId: options.workspaceId,
          userId: options.userId,
          emailType: options.emailType,
          recipientEmail: email,
          status: "sent",
          resendId: result.messageId,
          sentAt: new Date(),
        }).catch((err) => console.error("[Email] Failed to log event:", err));
      } else {
        // Log failed email
        await db.insert(emailEvents).values({
          workspaceId: options.workspaceId,
          userId: options.userId,
          emailType: options.emailType,
          recipientEmail: email,
          status: "failed",
          errorMessage: result.error,
        }).catch((err) => console.error("[Email] Failed to log event:", err));
      }
    }

    // Deduct credits if any emails were sent
    if (sentCount > 0) {
      const chargedAmount = sentCount * pricePerEmail;
      const newBalance = workspace.currentBalance - chargedAmount;
      
      await db.update(workspaceCredits)
        .set({
          currentBalance: newBalance,
          totalCreditsSpent: (workspace.totalCreditsSpent || 0) + chargedAmount,
        })
        .where(eq(workspaceCredits.workspaceId, options.workspaceId));

      // Create credit transaction
      await db.insert(creditTransactions).values({
        workspaceId: options.workspaceId,
        userId: options.userId,
        transactionType: "deduction",
        amount: -chargedAmount,
        balanceAfter: newBalance,
        featureKey: "email_automation",
        featureName: `Email Campaign (${options.emailType})`,
      }).catch((err) => console.error("[Email] Failed to log transaction:", err));
    }

    // Emit email campaign results to Trinity for platform awareness
    trinityPlatformConnector.emitServiceEvent('email', 'campaign_completed', {
      action: `Email campaign sent: ${sentCount}/${recipientCount} delivered`,
      workspaceId: options.workspaceId,
      userId: options.userId,
      severity: sentCount === recipientCount ? 'info' : 'warning',
      data: {
        emailType: options.emailType,
        sentCount,
        recipientCount,
        cost: sentCount * pricePerEmail,
        successRate: recipientCount > 0 ? ((sentCount / recipientCount) * 100).toFixed(1) : 0,
      },
    }).catch(err => console.error('[Email] Failed to emit Trinity event:', err));

    return {
      success: true,
      sentCount,
      cost: sentCount * pricePerEmail,
    };
  } catch (error) {
    console.error("[Email Campaign] Failed:", error);
    
    // Emit failure event to Trinity
    trinityPlatformConnector.emitServiceEvent('email', 'campaign_failed', {
      action: `Email campaign failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      workspaceId: options.workspaceId,
      severity: 'error',
      requiresAction: true,
      data: { emailType: options.emailType },
    }).catch(err => console.error('[Email] Failed to emit Trinity event:', err));

    return {
      success: false,
      sentCount: 0,
      cost: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export const EMAIL_TEMPLATES = {
  sales: {
    subject: "Transform Your Workforce Management - CoAIleague",
    html: (companyName: string, contactName: string) => `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">Hello ${contactName},</h1>
        <p>We're excited to introduce CoAIleague, the AI-powered workforce management platform that's revolutionizing how companies like ${companyName || 'yours'} operate.</p>
        <h2 style="color: #10b981; font-size: 18px;">What You Get:</h2>
        <ul style="line-height: 1.8;">
          <li>Autonomous scheduling powered by Gemini 2.0 Flash AI</li>
          <li>Automatic payroll processing and tax calculations</li>
          <li>Real-time compliance monitoring</li>
          <li>Integrated contractor pool management</li>
        </ul>
        <p style="margin-top: 30px;">
          <a href="https://coaileague.com/schedule-demo" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Schedule a Demo</a>
        </p>
      </div>
    `,
  },
  marketing: {
    subject: "Save 40+ Hours Per Week with AI Workforce Management",
    html: (feature: string) => `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">Your Workforce, Automated</h1>
        <p>Imagine your entire scheduling, payroll, and compliance operations running on autopilot.</p>
        <h2 style="color: #10b981; font-size: 18px;">Key Feature: ${feature}</h2>
        <p>Learn how our customers save thousands of dollars monthly.</p>
        <a href="https://coaileague.com/features" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">Explore Features</a>
      </div>
    `,
  },
  onboarding: {
    subject: "Welcome to CoAIleague! Your onboarding starts here",
    html: (userName: string) => `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">Welcome ${userName}!</h1>
        <p>You've just taken the first step toward workforce automation excellence.</p>
        <ol style="line-height: 2;">
          <li><a href="https://coaileague.com/onboarding/setup">Complete workspace setup</a></li>
          <li><a href="https://coaileague.com/onboarding/team">Invite your team</a></li>
          <li><a href="https://coaileague.com/onboarding/first-schedule">Create your first schedule</a></li>
        </ol>
      </div>
    `,
  },
  client_onboarding: {
    subject: "Your Client Workspace is Ready on CoAIleague",
    html: (clientName: string, setupLink: string) => `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">${clientName} is Ready!</h1>
        <p>Your new client workspace has been created and is ready to launch.</p>
        <a href="${setupLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">Complete Client Setup</a>
      </div>
    `,
  },
  upsell: {
    subject: "Unlock Advanced Features",
    html: (featureName: string, benefit: string) => `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">Level Up Your Workforce Management</h1>
        <p>${benefit}</p>
        <a href="https://coaileague.com/upgrade" style="background: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">Upgrade Now</a>
      </div>
    `,
  },
};

export type EmailTemplateType = keyof typeof EMAIL_TEMPLATES;

export async function sendTemplatedEmail(
  type: EmailTemplateType,
  to: string | string[],
  templateData: Record<string, string>,
  workspaceId: string,
  userId?: string
): Promise<{ success: boolean; cost: number; error?: string }> {
  const template = EMAIL_TEMPLATES[type];
  if (!template) {
    return { success: false, cost: 0, error: `Unknown template type: ${type}` };
  }

  const values = Object.values(templateData);
  const html = template.html(...(values as [string, string]));
  const subject = template.subject;

  const result = await sendBilledEmail({
    to,
    subject,
    html,
    workspaceId,
    userId,
    emailType: type as EmailCampaignOptions["emailType"],
    recipientCount: Array.isArray(to) ? to.length : 1,
  });

  return {
    success: result.success,
    cost: result.cost,
    error: result.error,
  };
}
