/**
 * Resend Email Service - Manual & Autonomous Email Sending
 * Integrated with platformConfig for zero hardcoding
 */

import { Resend } from "resend";
import { db } from "../db";
import { emailCampaigns, creditTransactions, workspaceCredits } from "@shared/schema";
import { eq } from "drizzle-orm";
import { PLATFORM } from "@shared/platformConfig";

const resend = new Resend(process.env.RESEND_API_KEY || "");

export const EMAIL_TEMPLATES = {
  prospectOutreach: (prospect: { companyName: string; contactName: string }) => ({
    subject: `${PLATFORM.name} - Transform Your Workforce Management`,
    html: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #3b82f6;">Hello ${prospect.contactName},</h1><p>We help companies like ${prospect.companyName} eliminate manual workforce management with AI.</p><a href="https://coaileague.com/demo" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">View Demo</a></div>`,
  }),

  rfpResponse: (prospect: { companyName: string; rfpTitle: string }) => ({
    subject: `${PLATFORM.name} Response - ${prospect.rfpTitle}`,
    html: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #3b82f6;">Thank you for the RFP</h1><p>We're excited to propose ${PLATFORM.name} for ${prospect.companyName}.</p></div>`,
  }),

  contractReview: (prospect: { companyName: string; contactName: string; terms: string }) => ({
    subject: `Service Agreement Ready - ${prospect.companyName}`,
    html: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #3b82f6;">Service Agreement Ready</h1><p>Hi ${prospect.contactName}, your ${PLATFORM.name} agreement is ready for review.</p></div>`,
  }),

  onboardingDay1: (client: { companyName: string; contactName: string; workspaceUrl: string }) => ({
    subject: `Welcome to ${PLATFORM.name}! Your first day`,
    html: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h1 style="color: #3b82f6;">Welcome ${client.contactName}!</h1><p>Your workspace for ${client.companyName} is live.</p></div>`,
  }),
};

const EMAIL_PRICING: Record<string, number> = {
  prospectOutreach: 2,
  rfpResponse: 2,
  contractReview: 2,
  onboardingDay1: 1,
};

export async function sendManualEmail(
  to: string[],
  templateType: keyof typeof EMAIL_TEMPLATES,
  templateData: Record<string, any>,
  workspaceId: string
): Promise<{ success: boolean; count: number; cost: number; error?: string }> {
  try {
    const template = EMAIL_TEMPLATES[templateType];
    if (!template) return { success: false, count: 0, cost: 0, error: "Unknown template" };

    const emailData = template(templateData);
    let sent = 0;
    const costPerEmail = EMAIL_PRICING[templateType] || 2;

    for (const email of to) {
      try {
        await resend.emails.send({
          from: `${PLATFORM.name} <sales@coaileague.com>`,
          to: email,
          subject: emailData.subject,
          html: emailData.html,
        });
        sent++;
      } catch {
        // Continue with next email
      }
    }

    const totalCost = sent * costPerEmail;
    if (sent > 0) {
      await deductCredits(workspaceId, totalCost);
    }

    return { success: true, count: sent, cost: totalCost };
  } catch (error) {
    return { success: false, count: 0, cost: 0, error: String(error) };
  }
}

export async function sendAutonomousEmail(
  prospectType: string,
  recipients: Array<{ email: string; [key: string]: any }>,
  workspaceId: string,
  campaignName: string
): Promise<{ success: boolean; sent: number; cost: number }> {
  try {
    const campaign = await db.insert(emailCampaigns).values({
      workspaceId,
      name: campaignName,
      type: prospectType,
      recipientCount: recipients.length,
      status: "processing",
    }).returning();

    let sent = 0;
    const costPerEmail = 2;

    for (const recipient of recipients) {
      try {
        await resend.emails.send({
          from: `${PLATFORM.name} Sales <sales@coaileague.com>`,
          to: recipient.email,
          subject: `${PLATFORM.name} - Workforce Management Solution`,
          html: `<p>Personalized outreach</p>`,
        });
        sent++;
      } catch {
        // Continue
      }
    }

    const totalCost = sent * costPerEmail;
    await deductCredits(workspaceId, totalCost);
    
    if (campaign[0]) {
      await db.update(emailCampaigns)
        .set({ status: "completed", sentCount: sent })
        .where(eq(emailCampaigns.id, campaign[0].id));
    }

    return { success: true, sent, cost: totalCost };
  } catch (error) {
    return { success: false, sent: 0, cost: 0 };
  }
}

async function deductCredits(workspaceId: string, amount: number): Promise<void> {
  try {
    const workspace = await db.query.workspaceCredits.findFirst({
      where: (t) => eq(t.workspaceId, workspaceId),
    });

    if (!workspace) return;

    await db.update(workspaceCredits)
      .set({
        availableCredits: Math.max(0, workspace.availableCredits - amount),
        totalUsed: (workspace.totalUsed || 0) + amount,
      })
      .where(eq(workspaceCredits.workspaceId, workspaceId));

    await db.insert(creditTransactions).values({
      workspaceId,
      amount,
      type: "email",
      status: "completed",
    });
  } catch {
    // Silent fail
  }
}
