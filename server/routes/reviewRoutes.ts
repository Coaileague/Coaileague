import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireManager, requireOwner, type AuthenticatedRequest } from "../rbac";
import { readLimiter } from "../middleware/rateLimiter";
import { db } from "../db";
import { insertReportSubmissionSchema, reportAttachments } from '@shared/schema';
import { eq } from "drizzle-orm";
import { sendReportDeliveryEmail } from "../services/emailCore";
import crypto from "crypto";
import { createLogger } from '../lib/logger';
const log = createLogger('ReviewRoutes');


const router = Router();

router.get("/api/reviews", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: "No workspace context" });

    const reviews = await storage.getPerformanceReviewsByWorkspace(workspaceId);
    res.json(reviews);
  } catch (error) {
    log.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

router.post("/api/reviews", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: "No workspace context" });

    const { insertPerformanceReviewSchema } = await import("@shared/schema");
    const validated = insertPerformanceReviewSchema.parse({
      ...req.body,
      workspaceId,
    });

    const review = await storage.createPerformanceReview(validated);
    res.status(201).json(review);
  } catch (error: unknown) {
    log.error("Error creating review:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create review" });
  }
});

router.patch("/api/reviews/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: "No workspace context" });

    const { id } = req.params;

    const { insertPerformanceReviewSchema } = await import("@shared/schema");
    const validated = insertPerformanceReviewSchema
      .partial()
      .omit({ workspaceId: true, employeeId: true })
      .parse(req.body);

    const updated = await storage.updatePerformanceReview(id, workspaceId, validated);

    if (!updated) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating review:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update review" });
  }
});

router.get("/api/ratings/employer", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { targetId, period = "30" } = req.query;
    const periodDays = parseInt(period as string) || 30;

    const { employerRatingsService } = await import("../services/employerRatingsService");
    const stats = await employerRatingsService.calculateEmployerRatingStats(
      workspaceId,
      targetId as string | undefined,
      periodDays
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    log.error("Error calculating employer ratings:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/ratings/employer/trends", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { targetId, granularity = "week" } = req.query;

    const { employerRatingsService } = await import("../services/employerRatingsService");
    const trends = await employerRatingsService.getRatingTrends(
      workspaceId,
      targetId as string | undefined,
      granularity as "week" | "month"
    );
    res.json({ success: true, data: trends });
  } catch (error: unknown) {
    log.error("Error fetching rating trends:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/api/ratings/at-risk-managers", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { threshold = "3.0" } = req.query;

    const { employerRatingsService } = await import("../services/employerRatingsService");
    const atRiskManagers = await employerRatingsService.identifyAtRiskManagers(
      workspaceId,
      parseFloat(threshold as string) || 3.0
    );

    res.json({
      success: true,
      data: atRiskManagers,
    });
  } catch (error: unknown) {
    log.error("Error identifying at-risk managers:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});


// === Report Templates ===
router.get("/api/report-templates", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: "No workspace context" });

    const templates = await storage.getReportTemplatesByWorkspace(workspaceId);
    res.json(templates);
  } catch (error) {
    log.error("Error fetching report templates:", error);
    res.status(500).json({ message: "Failed to fetch report templates" });
  }
});

router.post("/api/report-templates/:id/toggle", requireOwner, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    const template = await storage.toggleReportTemplateActivation(id, workspaceId);
    res.json(template);
  } catch (error) {
    log.error("Error toggling template activation:", error);
    res.status(500).json({ message: "Failed to toggle template activation" });
  }
});

router.post("/api/report-templates/seed-industry", requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { seedIndustryTemplates } = await import('../services/industryTemplates');
    const seeded = await seedIndustryTemplates(workspaceId, userId);

    res.json({
      message: `Successfully seeded ${seeded.length} industry templates`,
      templates: seeded,
    });
  } catch (error) {
    log.error("Error seeding industry templates:", error);
    res.status(500).json({ message: "Failed to seed industry templates" });
  }
});

// === Report Submissions ===
router.get("/api/report-submissions", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { status, employeeId } = req.query;
    const submissions = await storage.getReportSubmissions(workspaceId, { 
      status: status as string, 
      employeeId: employeeId as string 
    });
    res.json(submissions);
  } catch (error) {
    log.error("Error fetching report submissions:", error);
    res.status(500).json({ message: "Failed to fetch report submissions" });
  }
});

router.post("/api/report-submissions", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const validated = insertReportSubmissionSchema.parse({
      ...req.body,
      workspaceId: workspaceId,
    });

    const submission = await storage.createReportSubmission(validated);
    res.json(submission);
  } catch (error) {
    log.error("Error creating report submission:", error);
    res.status(500).json({ message: "Failed to create report submission" });
  }
});

router.patch("/api/report-submissions/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const submission = await storage.updateReportSubmission(id, req.body);
    res.json(submission);
  } catch (error) {
    log.error("Error updating report submission:", error);
    res.status(500).json({ message: "Failed to update report submission" });
  }
});

router.post("/api/report-submissions/:id/review", requireManager, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { approved, reviewNotes } = req.body;
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);

    const submission = await storage.reviewReportSubmission(id, {
      approved,
      reviewNotes,
      reviewedBy: user!.id,
    });

    res.json(submission);
  } catch (error) {
    log.error("Error reviewing report submission:", error);
    res.status(500).json({ message: "Failed to review report submission" });
  }
});

router.post("/api/report-submissions/:id/send-to-client", requireManager, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }
    
    const submission = await storage.getReportSubmissionById(id);
    if (!submission) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (submission.workspaceId !== workspaceId) {
      return res.status(403).json({ message: "Access denied to this report" });
    }

    if (submission.status !== 'approved') {
      return res.status(400).json({ message: "Only approved reports can be sent to clients" });
    }

    if (!submission.clientId) {
      return res.status(400).json({ message: "No client assigned to this report" });
    }

    const clients = await storage.getClientsByWorkspace(workspaceId);
    const client = clients.find(c => c.id === submission.clientId);
    if (!client || !client.email) {
      return res.status(400).json({ message: "Client not found or has no email address" });
    }

    const employees = await storage.getEmployeesByWorkspace(workspaceId);
    const employee = employees.find(e => e.id === submission.employeeId);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee';

    const templates = await storage.getReportTemplatesByWorkspace(workspaceId);
    const template = templates.find(t => t.id === submission.templateId);
    const reportName = template?.name || 'Report';

    const attachments = await db.select().from(reportAttachments).where(eq(reportAttachments.submissionId, id));
    const attachmentCount = attachments.length;

    const emailResult = await sendReportDeliveryEmail(client.email, {
      clientName: client.companyName || `${client.firstName} ${client.lastName}`,
      reportNumber: submission.reportNumber,
      reportName,
      submittedBy: employeeName,
      submittedDate: new Date(submission.submittedAt || submission.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      reportData: submission.formData as Record<string, any>,
      attachmentCount: attachmentCount > 0 ? attachmentCount : undefined,
    });

    if (!emailResult.success) {
      log.error('Failed to send report email:', emailResult.error);
      return res.status(500).json({ message: "Failed to send email to client" });
    }

    const updatedSubmission = await storage.updateReportSubmission(id, {
      status: 'sent_to_customer',
    });

    res.json({ 
      success: true, 
      submission: updatedSubmission,
      emailSent: true 
    });
  } catch (error) {
    log.error("Error sending report to client:", error);
    res.status(500).json({ message: "Failed to send report to client" });
  }
});

router.post("/api/report-submissions/:id/generate-access", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const generateAccessBodySchema = z.object({
      clientId: z.string().min(1, 'Client ID is required'),
      expirationDays: z.number().int().positive().optional(),
    });
    const generateAccessParsed = generateAccessBodySchema.safeParse(req.body);
    if (!generateAccessParsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: generateAccessParsed.error.flatten() });
    }
    const expirationDays = generateAccessParsed.data.expirationDays ?? 30;
    
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const access = await storage.createCustomerReportAccess({
      submissionId: id,
      clientId: generateAccessParsed.data.clientId,
      accessToken,
      expiresAt,
    });

    res.json(access);
  } catch (error) {
    log.error("Error generating customer access:", error);
    res.status(500).json({ message: "Failed to generate customer access" });
  }
});

export default router;

