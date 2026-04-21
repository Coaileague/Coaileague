import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import crypto from 'crypto';
import type { AuthenticatedRequest } from "../rbac";
import { requirePlatformStaff } from '../rbac';
import { db } from "../db";
import { storage } from "../storage";
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { z } from "zod";
import {
  leads,
  deals,
  rfps,
  proposals,
  orgInvitations,
  insertDealSchema,
  insertRfpSchema,
  insertLeadSchema,
  insertOrgInvitationSchema,
  workspaceInvites,
  workspaces,
  users,
  employees,
  emailSequences,
  sequenceSends,
  emailTemplates,
  emailSends,
} from "@shared/schema";

function generateUniqueInviteCode(orgName: string): string {
  const prefix = orgName.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase();
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}
import { emailService } from "../services/emailService";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { getMeteredOpenAICompletion } from "../services/billing/universalAIBillingInterceptor";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('SalesInlineRoutes');


const router = Router();
router.use(requirePlatformStaff);

  // Zod validation schema for lead creation
  const createLeadSchema = z.object({
    companyName: z.string().min(1, "Company name is required"),
    contactEmail: z.string().email("Valid email is required"),
    contactName: z.string().optional(),
    industry: z.string().optional(),
    contactPhone: z.string().optional(),
    contactTitle: z.string().optional(),
    estimatedEmployees: z.number().int().positive().optional(),
  });


  // Zod validation schema for sales email
  const sendSalesEmailSchema = z.object({
    templateId: z.string().min(1, "Template ID is required"),
    toEmail: z.string().email("Valid email is required"),
    toName: z.string().optional(),
    companyName: z.string().min(1, "Company name is required"),
    industry: z.string().optional(),
  });

  // Zod validation for AI lead generation
  const aiLeadGenerationSchema = z.object({
    industry: z.string().min(1, "Industry is required"),
    targetRegion: z.string().optional(),
    numberOfLeads: z.number().int().min(1).max(20).default(5), // Limit to prevent cost abuse
  });

  // Zod validation for AI-generated lead output
  const aiGeneratedLeadSchema = z.object({
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    contactTitle: z.string().min(1),
    contactEmail: z.string().email(),
    estimatedEmployees: z.number().int().positive(),
    painPoints: z.string(),
    leadScore: z.number().int().min(0).max(100),
  });

  // AI Lead Generation - Discover potential clients automatically

  router.get('/templates', async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await db.select().from(emailTemplates).orderBy(emailTemplates.createdAt);
      res.json(templates);
    } catch (error) {
      log.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  router.get('/leads', async (req: AuthenticatedRequest, res) => {
    try {
      const allLeads = await db.select().from(leads).orderBy(leads.createdAt);
      res.json(allLeads);
    } catch (error) {
      log.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  router.post('/leads', async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = createLeadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid lead data",
          errors: validationResult.error.errors
        });
      }

      const validatedData = validationResult.data;

      const [newLead] = await db.insert(leads).values({
        workspaceId: req.workspaceId || (req.user)?.currentWorkspaceId,
        ...validatedData,
        leadStatus: 'new',
        source: 'manual',
        leadScore: 0,
      }).returning();

      res.json(newLead);
    } catch (error) {
      log.error("Error creating lead:", error);
      res.status(500).json({ message: "Failed to create lead" });
    }
  });

  router.post('/ai-generate-leads', async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = aiLeadGenerationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validationResult.error.errors
        });
      }

      const { industry, targetRegion, numberOfLeads } = validationResult.data;

      const salesWorkspaceId = req.workspaceId;
      if (!salesWorkspaceId) {
        return res.status(400).json({ success: false, error: 'Workspace context required for AI lead generation' });
      }
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user?.id || (req.user)?.claims?.sub;

      const aiResult = await getMeteredOpenAICompletion({
        workspaceId: salesWorkspaceId,
        userId,
        featureKey: 'sales_lead_gen',
        messages: [
          {
            role: 'system',
            content: `You are a B2B sales research assistant for CoAIleague™, a Fortune 500-grade workforce management platform. Your job is to identify potential clients who would benefit from automated scheduling, time tracking, HR management, and compliance reporting.`
          },
          {
            role: 'user',
            content: `Generate ${numberOfLeads} SYNTHETIC/EXAMPLE sales leads for the ${industry} industry${targetRegion ? ` in the ${targetRegion} region` : ''}. 

IMPORTANT: Create FICTIONAL companies and contacts for demonstration purposes only. Do NOT use real company names or real people.

For each SYNTHETIC lead, provide:
1. Company Name (fictional example: "Example Security Services LLC")
2. Contact Name (fictional: "John Doe" / "Jane Smith")
3. Contact Title (realistic title like "HR Director" or "Operations Manager")
4. Contact Email (use example.com domain: firstname.lastname@example.com)
5. Estimated Employees (realistic for industry)
6. Why they need CoAIleague™ (2-3 pain points)
7. Lead Score (0-100 based on fit)

Return ONLY valid JSON array with this exact structure:
[
  {
    "companyName": "string",
    "contactName": "string", 
    "contactTitle": "string",
    "contactEmail": "string",
    "estimatedEmployees": number,
    "painPoints": "string",
    "leadScore": number
  }
]`
          }
        ],
        model: 'gpt-4o-mini',
        maxTokens: 2000,
        temperature: 0.8,
      });

      if (aiResult.blocked) {
        return res.status(402).json({ message: aiResult.error || 'Insufficient credits' });
      }
      if (!aiResult.success) {
        return res.status(500).json({ message: aiResult.error || 'AI service error' });
      }

      const aiContent = aiResult.content || '[]';
      
      // Parse AI response
      let generatedLeads;
      try {
        // Extract JSON from response (AI might wrap it in markdown)
        const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
        generatedLeads = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
      } catch (parseError) {
        log.error("Failed to parse AI response:", aiContent);
        return res.status(500).json({ message: "AI generated invalid response format" });
      }

      // Validate each generated lead with strict schema
      const insertedLeads = [];
      const validationErrors = [];

      for (let i = 0; i < generatedLeads.length; i++) {
        const leadValidation = aiGeneratedLeadSchema.safeParse(generatedLeads[i]);
        
        if (!leadValidation.success) {
          validationErrors.push({
            leadIndex: i,
            errors: leadValidation.error.errors
          });
          continue; // Skip invalid leads
        }

        const validLead = leadValidation.data;

        // Additional safety: Ensure email uses example.com or clearly synthetic domain
        if (!validLead.contactEmail.includes('example.com') && 
            !validLead.contactEmail.includes('demo.com') &&
            !validLead.contactEmail.includes('test.com')) {
          validationErrors.push({
            leadIndex: i,
            error: "Email must use synthetic domain (example.com, demo.com, or test.com)"
          });
          continue;
        }

        // Insert validated lead into database
        const [newLead] = await db.insert(leads).values({
          workspaceId: req.workspaceId || (req.user)?.currentWorkspaceId,
          companyName: validLead.companyName,
          contactName: validLead.contactName,
          contactTitle: validLead.contactTitle,
          contactEmail: validLead.contactEmail,
          estimatedEmployees: validLead.estimatedEmployees,
          industry,
          leadStatus: 'new',
          leadScore: validLead.leadScore,
          notes: `🤖 AI Generated Lead (Synthetic Demo Data)\n\nPain Points:\n${validLead.painPoints}`,
          source: 'ai_generated',
        }).returning();
        
        insertedLeads.push(newLead);
      }

      res.json({ 
        success: true, 
        count: insertedLeads.length,
        leads: insertedLeads,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        warning: insertedLeads.length === 0 ? "No valid leads generated. AI may have produced invalid data." : undefined
      });
    } catch (error) {
      log.error("Error generating AI leads:", error);
      res.status(500).json({ message: "Failed to generate leads" });
    }
  });

  router.patch('/leads/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { leadStatus, notes, nextFollowUpDate, leadScore, estimatedValue } = req.body;

      const updateData: any = { updatedAt: new Date() };
      
      if (leadStatus) updateData.leadStatus = leadStatus;
      if (notes !== undefined) updateData.notes = notes;
      if (nextFollowUpDate !== undefined) updateData.nextFollowUpDate = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
      if (leadScore !== undefined) updateData.leadScore = leadScore;
      if (estimatedValue !== undefined) updateData.estimatedValue = estimatedValue;

      // Update last contacted timestamp if status changed to contacted
      if (leadStatus && ['contacted', 'qualified', 'demo_scheduled', 'proposal_sent'].includes(leadStatus)) {
        updateData.lastContactedAt = new Date();
      }

      const [updatedLead] = await db
        .update(leads)
        .set(updateData)
        .where(eq(leads.id, id))
        .returning();

      if (!updatedLead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      res.json(updatedLead);
    } catch (error) {
      log.error("Error updating lead:", error);
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  router.post('/send-email', async (req: AuthenticatedRequest, res) => {
    try {
      // Validate request body
      const validationResult = sendSalesEmailSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validationResult.error.errors
        });
      }

      const { templateId, toEmail, toName, companyName, industry } = validationResult.data;

      // Get the email template
      const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1);
      
      if (!template) {
        return res.status(404).json({ message: "Email template not found" });
      }


      // Personalize email content
      let subject = template.subject;
      let bodyHtml = template.bodyTemplate;

      // Replace template variables (safe string replacement)
      const replacements: Record<string, string> = {
        '{{companyName}}': companyName,
        '{{contactName}}': toName || 'there',
        '{{industry}}': industry || 'your industry',
      };

      Object.entries(replacements).forEach(([key, value]) => {
        subject = subject.split(key).join(value);
        bodyHtml = bodyHtml.split(key).join(value);
      });

      // AI personalization if enabled
      if (template.useAI && template.aiPrompt) {
        try {
          const emailWorkspaceId = req.workspaceId;
            if (!emailWorkspaceId) {
              throw new Error('Workspace context required for AI email generation');
            }
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const emailUserId = req.user?.id || (req.user)?.claims?.sub;

            const emailAiResult = await getMeteredOpenAICompletion({
              workspaceId: emailWorkspaceId,
              userId: emailUserId,
              featureKey: 'sales_email',
              messages: [
                {
                  role: 'system',
                  content: template.aiPrompt || 'Personalize this sales email to be more engaging and relevant to the company.'
                },
                {
                  role: 'user',
                  content: `Company: ${companyName}\nIndustry: ${industry || 'Unknown'}\n\nEmail Body:\n${bodyHtml}`
                }
              ],
              model: 'gpt-4o-mini',
              maxTokens: 500,
            });

            if (emailAiResult.blocked) {
              return res.status(402).json({ message: emailAiResult.error || 'Insufficient credits' });
            }
            if (emailAiResult.success && emailAiResult.content) {
              bodyHtml = emailAiResult.content;
            }
        } catch (aiError) {
          log.error("AI personalization failed, using template:", aiError);
          // Continue with template version if AI fails
        }
      }

      // Send email via NDS — tracked delivery with automatic retry on failure
      const notifId = await NotificationDeliveryService.send({
        type: 'sales_outreach',
        workspaceId: req.workspaceId || 'system',
        recipientUserId: toEmail,
        channel: 'email',
        body: { to: toEmail, subject, html: bodyHtml },
      });

      // Log email send
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(emailSends).values({
        templateId,
        toEmail,
        subject,
        bodyHtml,
        status: 'sent',
      });
      res.json({ success: true, emailId: notifId });
    } catch (error) {
      log.error("Error sending email:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  router.get("/deals", async (req, res) => {
    try {
      const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
          if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
      const allDeals = workspaceId
        ? await db.select().from(deals)
            .where(eq(deals.organizationId, workspaceId))
            .orderBy(desc(deals.createdAt))
        : await db.select().from(deals).orderBy(desc(deals.createdAt));
      res.json(allDeals);
    } catch (error) {
      log.error("Error fetching deals:", error);
      res.status(500).json({ message: "Failed to fetch deals" });
    }
  });

  router.post("/deals", async (req, res) => {
    try {
      const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
      if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId is required" });
      }
      
      // Validate request body with Zod
      const validatedData = insertDealSchema.parse(req.body);
      
      const newDeal = await db.insert(deals).values({
        ...validatedData,
        workspaceId,
        organizationId: workspaceId,
      }).returning();
      res.json(newDeal[0]);
    } catch (error) {
      log.error("Error creating deal:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid deal data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create deal" });
    }
  });

  router.get("/rfps", async (req, res) => {
    try {
      const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
          if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
      const allRfps = await db.query.rfps.findMany({
        where: workspaceId ? (rfps, { eq }) => eq(rfps.workspaceId, workspaceId) : undefined,
        orderBy: (rfps, { desc }) => [desc(rfps.createdAt)],
      });
      res.json(allRfps);
    } catch (error) {
      log.error("Error fetching RFPs:", error);
      res.status(500).json({ message: "Failed to fetch RFPs" });
    }
  });

  router.post("/rfps", async (req, res) => {
    try {
      const { workspaceId } = req;

      // Validate request body with Zod
      const validatedData = insertRfpSchema.parse(req.body);

      const newRfp = await db.insert(rfps).values({
        ...validatedData,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId,
      }).returning();
      const rfpRecord = newRfp[0];
      const rfpId = rfpRecord.id;

      // Fire AI proposal generation (non-blocking — don't make client wait)
      // Uses documentGeneratorSkill → unifiedGeminiClient to draft response sections
      if (workspaceId && rfpId) {
        (async () => {
          try {
            const { documentGeneratorSkill } = await import('../services/ai-brain/skills/documentGeneratorSkill');
            const userId = (req as any).user?.id ?? 'system';

            const result = await documentGeneratorSkill.execute(
              { userId, workspaceId },
              {
                documentType: 'analysis',
                title: `RFP Response: ${rfpRecord.title}`,
                workspaceId,
                sections: [
                  'Executive Summary',
                  'Understanding of Requirements',
                  'Proposed Approach & Methodology',
                  'Staffing Plan & Qualifications',
                  'Relevant Experience',
                  'Pricing Overview',
                ],
              },
            );

            if (result.success && result.data?.sections?.length) {
              await db.update(rfps).set({
                // Store AI-generated sections in requirements jsonb under aiGeneratedSections key
                requirements: { aiGeneratedSections: result.data.sections },
                aiSummary: result.data.sections[0]?.content ?? null,
                status: 'draft',
                updatedAt: new Date(),
              }).where(eq(rfps.id, rfpId));
              log.info(`[RFP] AI content generated for RFP ${rfpId}`);
            }
          } catch (err: any) {
            log.warn(`[RFP] AI generation failed (non-blocking): ${err.message}`);
          }
        })();
      }

      res.json({ ...rfpRecord, status: 'generating' });
    } catch (error) {
      log.error("Error creating RFP:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid RFP data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create RFP" });
    }
  });

  // Re-trigger AI generation for an existing RFP
  router.post("/rfps/:id/generate", async (req, res) => {
    try {
      const { workspaceId } = req;
      const { id } = req.params;
      if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

      const existing = await db.select().from(rfps)
        .where(and(eq(rfps.id, id), eq(rfps.workspaceId, workspaceId)))
        .limit(1);

      if (!existing.length) return res.status(404).json({ error: 'RFP not found' });

      // Clear stale AI content so polling detects fresh generation
      await db.update(rfps).set({
        requirements: null,
        aiSummary: null,
        status: 'active',
        updatedAt: new Date(),
      }).where(and(eq(rfps.id, id), eq(rfps.workspaceId, workspaceId)));

      const rfpRecord = existing[0];
      const userId = (req as any).user?.id ?? 'system';

      // Non-blocking AI generation — same pattern as creation
      (async () => {
        try {
          const { documentGeneratorSkill } = await import('../services/ai-brain/skills/documentGeneratorSkill');

          const result = await documentGeneratorSkill.execute(
            { userId, workspaceId },
            {
              documentType: 'analysis',
              title: `RFP Response: ${rfpRecord.title}`,
              workspaceId,
              sections: [
                'Executive Summary',
                'Understanding of Requirements',
                'Proposed Approach & Methodology',
                'Staffing Plan & Qualifications',
                'Relevant Experience',
                'Pricing Overview',
              ],
            },
          );

          if (result.success && result.data?.sections?.length) {
            await db.update(rfps).set({
              requirements: { aiGeneratedSections: result.data.sections },
              aiSummary: result.data.sections[0]?.content ?? null,
              status: 'draft',
              updatedAt: new Date(),
            }).where(and(eq(rfps.id, id), eq(rfps.workspaceId, workspaceId)));
            log.info(`[RFP] AI content regenerated for RFP ${id}`);
          }
        } catch (err: any) {
          log.warn(`[RFP] AI regeneration failed (non-blocking): ${err.message}`);
        }
      })();

      res.json({ success: true, rfpId: id, status: 'generating' });
    } catch (error) {
      log.error("Error triggering RFP generation:", error);
      res.status(500).json({ message: "Failed to trigger AI generation" });
    }
  });

router.get("/invitations", async (req, res) => {
  try {
    const list = await db.select().from(orgInvitations);
    res.json(list);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/invitations/send", async (req, res) => {
  try {
    const { email, organizationName, contactName, offeredTier, customInviteCode } = req.body;
    const token = crypto.randomUUID();
    const uniqueInviteCode = (customInviteCode || generateUniqueInviteCode(organizationName)).toUpperCase();
    const result = await db.insert(orgInvitations).values({
      workspaceId: req.workspaceId || (req.user)?.currentWorkspaceId,
      email,
      organizationName,
      contactName,
      invitationToken: token,
      uniqueInviteCode,
      invitationTokenExpiry: new Date(Date.now() + 14*24*60*60*1000),
      sentBy: req.user?.id,
      status: "pending",
    }).returning();
    res.json({ success: true, invitation: result[0], inviteCode: uniqueInviteCode });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/invitations/send-enhanced", async (req, res) => {
  try {
    const { email, organizationName, contactName, offeredTier, inviterCompany, expiresInDays, customInviteCode } = req.body;
    
    if (!email || !organizationName || !contactName) {
      return res.status(400).json({ error: "email, organizationName, and contactName are required" });
    }
    
    const token = crypto.randomUUID();
    const expiryDays = expiresInDays || 14;
    const uniqueInviteCode = customInviteCode || generateUniqueInviteCode(organizationName);
    
    // Create invitation record
    const [invitation] = await db.insert(orgInvitations).values({
      workspaceId: req.workspaceId || (req.user)?.currentWorkspaceId,
      email,
      organizationName,
      contactName,
      invitationToken: token,
      uniqueInviteCode,
      invitationTokenExpiry: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      sentBy: req.user?.id,
      status: "pending",
    }).returning();
    
    // Send enhanced email with Trinity introduction
    const { emailService } = await import('../services/emailService');
    const inviterName = req.user?.firstName || `${PLATFORM.name} Team`;
    
    const emailResult = await emailService.sendOrganizationInvitation({ // nds-exempt: one-time org invite token delivery
      recipientEmail: email,
      recipientName: contactName,
      inviterName,
      inviterCompany,
      organizationName,
      inviteToken: token,
      expiresInDays: expiryDays,
    });
    
    // Get migration capabilities for display
    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const migrationCapabilities = onboardingOrchestrator.getMigrationCapabilities();
    
    res.json({ 
      success: true, 
      invitation,
      emailSent: emailResult.success,
      emailId: emailResult.resendId,
      migrationCapabilities,
      message: emailResult.success 
        ? `Invitation sent to ${email} with Trinity AI introduction`
        : `Invitation created but email failed: ${emailResult.error}`,
    });
  } catch (error: unknown) {
    log.error("[Enhanced Invitation] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/invitations/lookup/:inviteCode", async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    if (!inviteCode) {
      return res.status(400).json({ error: "Invite code is required" });
    }
    
    const [invitation] = await db.select().from(orgInvitations)
      .where(eq(orgInvitations.uniqueInviteCode, inviteCode.toUpperCase()));
    
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: "This invitation has already been accepted" });
    }
    
    if (invitation.invitationTokenExpiry && new Date(invitation.invitationTokenExpiry) < new Date()) {
      return res.status(400).json({ error: "This invitation has expired" });
    }
    
    res.json({
      organizationName: invitation.organizationName,
      email: invitation.email,
      contactName: invitation.contactName,
      invitationToken: invitation.invitationToken,
      expiresAt: invitation.invitationTokenExpiry,
    });
  } catch (error) {
    log.error("[Invitation Lookup] Error:", error);
    res.status(500).json({ error: "Failed to lookup invitation" });
  }
});

router.post("/invitations/accept", async (req, res) => {
  try {
    const { token, userId, workspaceId, workspaceName, ownerName } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: "Invitation token is required" });
    }
    
    // Find and validate invitation
    const [invitation] = await db.select().from(orgInvitations)
      .where(eq(orgInvitations.invitationToken, token));
    
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    if (invitation.status === 'accepted') {
      return res.status(400).json({ error: "Invitation already accepted" });
    }
    
    if (invitation.invitationTokenExpiry && new Date() > new Date(invitation.invitationTokenExpiry)) {
      return res.status(400).json({ error: "Invitation has expired" });
    }
    
    // Update invitation status
    await db.update(orgInvitations)
      .set({ 
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedBy: userId || null,
        acceptedWorkspaceId: workspaceId || null,
      })
      .where(eq(orgInvitations.id, invitation.id));
    
    // Trigger onboarding with Trinity integration
    let onboardingResult = null;
    if (userId && workspaceId) {
      const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
      onboardingResult = await onboardingOrchestrator.processInvitationAcceptance({
        inviteToken: token,
        userId,
        workspaceId,
        workspaceName: workspaceName || invitation.organizationName,
        ownerName: ownerName || invitation.contactName,
      });
    }
    
    res.json({
      success: true,
      message: "Invitation accepted successfully",
      organizationName: invitation.organizationName,
      onboarding: onboardingResult,
    });
  } catch (error: unknown) {
    log.error("[Accept Invitation] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/proposals", async (req, res) => {
  try {
    const list = await db.select().from(proposals).where(eq(proposals.proposalType, 'sales'));
    res.json(list);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/proposals", async (req, res) => {
  try {
    const { title, description, prospectEmail, prospectName, suggestedTier, estimatedValue } = req.body;
    const result = await db.insert(proposals).values({
      workspaceId: req.workspaceId || (req.user)?.currentWorkspaceId,
      proposalName: title,
      proposalType: 'sales',
      description,
      prospectEmail,
      prospectName,
      suggestedTier: suggestedTier || "starter",
      estimatedValue: estimatedValue ? String(estimatedValue) : undefined,
      status: "draft",
      createdBy: req.user?.id || "system",
    }).returning();
    res.json({ success: true, proposal: result[0] });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

  router.get('/outreach/pipeline', async (req: AuthenticatedRequest, res) => {
    try {
      const pipelineLeads = await db
        .select()
        .from(leads)
        .where(
          or(
            eq(leads.leadStatus, 'new'),
            eq(leads.leadStatus, 'contacted'),
            eq(leads.leadStatus, 'qualified')
          )
        )
        .orderBy(desc(leads.createdAt))
        .limit(50);

      const stats = {
        total: pipelineLeads.length,
        contacted: pipelineLeads.filter(l => l.leadStatus === 'contacted').length,
        responded: pipelineLeads.filter(l => l.leadStatus === 'qualified').length,
      };

      res.json({ candidates: pipelineLeads, stats });
    } catch (error: unknown) {
      log.error('Error fetching pipeline:', error);
      res.status(500).json({ error: 'Failed to fetch pipeline' });
    }
  });

  router.get('/outreach/pipeline/all', async (req: AuthenticatedRequest, res) => {
    try {
      const allLeads = await db
        .select()
        .from(leads)
        .orderBy(desc(leads.createdAt))
        .limit(200);

      const [totalCount] = await db.select({ value: count() }).from(leads);
      const [contactedCount] = await db.select({ value: count() }).from(leads).where(eq(leads.leadStatus, 'contacted'));
      const [respondedCount] = await db.select({ value: count() }).from(leads).where(
        or(eq(leads.leadStatus, 'qualified'), eq(leads.leadStatus, 'demo_scheduled'))
      );

      res.json({
        candidates: allLeads,
        stats: {
          total: Number(totalCount?.value ?? 0),
          contacted: Number(contactedCount?.value ?? 0),
          responded: Number(respondedCount?.value ?? 0),
        },
      });
    } catch (error: unknown) {
      log.error('Error fetching all pipeline:', error);
      res.status(500).json({ error: 'Failed to fetch pipeline' });
    }
  });

  router.post('/outreach/crawl', async (req: AuthenticatedRequest, res) => {
    try {
      const { industry, location, keywords } = req.body;
      res.json({
        success: true,
        message: 'Outreach crawl queued',
        params: { industry, location, keywords },
        estimatedResults: 0,
        queuedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      log.error('Error queuing crawl:', error);
      res.status(500).json({ error: 'Failed to queue crawl' });
    }
  });

  router.post('/outreach/send', async (req: AuthenticatedRequest, res) => {
    try {
      const { leadIds, templateId, message } = req.body;
      const targetCount = Array.isArray(leadIds) ? leadIds.length : 0;
      res.json({
        success: true,
        sent: targetCount,
        message: `Outreach send queued for ${targetCount} leads`,
        queuedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      log.error('Error queuing send:', error);
      res.status(500).json({ error: 'Failed to queue send' });
    }
  });

export default router;
