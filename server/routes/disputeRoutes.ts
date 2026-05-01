import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  employees,
  users,
  shifts,
  reportTemplates,
  reportSubmissions,
  auditLogs,
  disputes,
  timeEntries as timeEntriesTable
} from '@shared/schema';
import { sql, eq, and, or, desc, inArray, gte } from "drizzle-orm";
import { MANAGER_ROLES } from "@shared/platformConfig";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('DisputeRoutes');


const router = Router();

router.post('/', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { createDisputeSchema } = await import('@shared/schema');
    const validationResult = createDisputeSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Validation failed", 
        errors: validationResult.error.errors 
      });
    }

    const data = validationResult.data;
    
    const { analyzeDispute, detectComplianceCategory } = await import('../services/disputeAI');
    const { createNotification } = await import('../services/notificationService');

    const employee = await storage.getEmployeeByUserId(userId);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found" });
    }

    let targetExists = false;
    
    if (data.targetType === 'performance_reviews') {
      const review = await storage.getPerformanceReview(data.targetId, workspaceId);
      targetExists = !!review;
    } else if (data.targetType === 'report_submissions') {
      const submission = await storage.getReportSubmissionById(data.targetId);
      if (submission) {
        const reportSubmissionsList = await storage.getReportSubmissions(workspaceId, {});
        targetExists = reportSubmissionsList.some(s => s.id === data.targetId);
      }
    } else if (data.targetType === 'employer_ratings') {
      targetExists = true;
    } else if (data.targetType === 'composite_scores') {
      targetExists = true;
    }

    if (!targetExists) {
      return res.status(404).json({ message: "Target entity not found in workspace" });
    }

    const reviewDeadline = new Date();
    reviewDeadline.setDate(reviewDeadline.getDate() + 7);

    const appealDeadline = new Date();
    appealDeadline.setDate(appealDeadline.getDate() + 14);

    let aiAnalysis: any = null;
    let complianceData: any = null;
    
    try {
      complianceData = detectComplianceCategory(data.reason, (data as any).type);
      aiAnalysis = await analyzeDispute(
        data.title,
        data.reason,
        (data as any).type,
        data.requestedOutcome || null,
        data.evidence || null
      );
    } catch (aiError) {
      log.error('AI analysis failed for dispute creation:', aiError);
    }

    // RACE CONDITION FIX: Atomic duplicate check + insert using advisory lock
    // Advisory lock key derived from workspace+user+target to serialize concurrent submissions
    const lockKey = `${workspaceId}:${userId}:${data.targetId}:${data.targetType}`;
    const lockHash = Array.from(lockKey).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);

    const duplicateOrDispute = await db.transaction(async (tx) => {
      // Acquire advisory lock scoped to this transaction - serializes concurrent dispute submissions
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockHash})`);

      const recentDuplicateWindow = new Date();
      recentDuplicateWindow.setMinutes(recentDuplicateWindow.getMinutes() - 5);
      const [existing] = await tx.select({ id: disputes.id })
        .from(disputes)
        .where(and(
          eq(disputes.workspaceId, workspaceId),
          eq(disputes.filedBy, userId),
          eq(disputes.targetId, data.targetId),
          eq(disputes.targetType, data.targetType),
          gte(disputes.filedAt, recentDuplicateWindow)
        ))
        .limit(1);

      if (existing) {
        return { duplicate: true, existingId: existing.id } as const;
      }

      const [newDispute] = await tx.insert(disputes).values({
        ...data,
        workspaceId: workspaceId,
        filedBy: userId,
        filedByRole: employee.role || 'employee',
        filedAt: new Date(),
        reviewDeadline,
        appealDeadline,
        canBeAppealed: true,
        appealedToUpperManagement: false,
        changesApplied: false,
        aiSummary: aiAnalysis?.summary || null,
        aiRecommendation: aiAnalysis?.recommendation || null,
        aiConfidenceScore: aiAnalysis?.confidenceScore?.toString() || null,
        aiAnalysisFactors: aiAnalysis?.analysisFactors || null,
        aiProcessedAt: aiAnalysis ? new Date() : null,
        aiModel: aiAnalysis?.model || null,
        complianceCategory: complianceData?.category || null,
        regulatoryReference: complianceData?.regulatoryReference || null,
      } as any).returning();

      return { duplicate: false, dispute: newDispute } as const;
    });

    if (duplicateOrDispute.duplicate) {
      return res.status(409).json({
        message: "A dispute for this item was already submitted recently. Please wait before submitting again.",
        code: 'DUPLICATE_DISPUTE',
        existingDisputeId: duplicateOrDispute.existingId,
      });
    }

    const dispute = duplicateOrDispute.dispute;

    try {
      const managerEmployees = await db.select({ userId: employees.userId })
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          inArray(employees.workspaceRole, [...MANAGER_ROLES])
        ));

      for (const manager of managerEmployees) {
        await createNotification({
          workspaceId: workspaceId,
          userId: manager.userId,
          type: 'dispute_filed' as any,
          title: '🚨 New Dispute Filed',
          message: `${employee.firstName || 'Employee'} filed a dispute: "${data.title}"`,
          actionUrl: `/disputes/${dispute.id}`,
          relatedEntityType: 'dispute',
          relatedEntityId: dispute.id,
          createdBy: userId,
          idempotencyKey: `dispute_filed-${dispute.id}-${manager.userId}`
        });
      }
    } catch (notifyError) {
      log.error('Error sending dispute notification:', notifyError);
    }

    try {
      await storage.createAuditLog({
        workspaceId: workspaceId,
        action: 'dispute_created',
        entityType: 'dispute',
        entityId: dispute.id,
        userId,
        details: {
          title: data.title,
          type: data.disputeType,
          amount: (data as any).amountDisputed,
          filedBy: employee.firstName,
        },
      });
    } catch (auditError) {
      log.error('Audit log error:', auditError);
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error creating dispute:", error);
    res.status(500).json({ message: "Failed to create dispute" });
  }
});

router.get('/', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { status, disputeType, assignedTo } = req.query;
    
    const disputes = await storage.getDisputesByWorkspace(
      workspaceId,
      { 
        status: status as string, 
        disputeType: disputeType as string,
        assignedTo: assignedTo as string 
      }
    );

    res.json(disputes);
  } catch (error) {
    log.error("Error fetching disputes:", error);
    res.status(500).json({ message: "Failed to fetch disputes" });
  }
});

router.get('/my-disputes', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const disputes = await storage.getDisputesByFiledBy(userId, workspaceId);
    res.json(disputes);
  } catch (error) {
    log.error("Error fetching my disputes:", error);
    res.status(500).json({ message: "Failed to fetch disputes" });
  }
});

router.get('/target/:targetType/:targetId', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { targetType, targetId } = req.params;
    const disputes = await storage.getDisputesByTarget(targetType, targetId, workspaceId);
    res.json(disputes);
  } catch (error) {
    log.error("Error fetching target disputes:", error);
    res.status(500).json({ message: "Failed to fetch disputes" });
  }
});

router.get('/pending-review', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const disputes = await storage.getDisputesByWorkspace(
      workspaceId,
      { status: 'pending,under_review' }
    );

    const { analyzeDispute, detectComplianceCategory } = await import('../services/disputeAI');
    
    const disputesWithAI = await Promise.all(disputes.map(async (dispute: any) => {
      if (!dispute.aiSummary) {
        try {
          const aiAnalysis = await analyzeDispute(
            dispute.title,
            dispute.reason,
            dispute.disputeType,
            dispute.requestedOutcome,
            dispute.evidence
          );
          
          const compliance = detectComplianceCategory(dispute.reason, dispute.disputeType);
          
          await storage.updateDispute(dispute.id, workspaceId, {
            aiSummary: aiAnalysis.summary,
            aiRecommendation: aiAnalysis.recommendation,
            aiConfidenceScore: aiAnalysis.confidenceScore,
            aiAnalysisFactors: aiAnalysis.analysisFactors,
            aiProcessedAt: new Date(),
            aiModel: aiAnalysis.model,
            complianceCategory: compliance.category,
            regulatoryReference: compliance.regulatoryReference,
          });
          
          return { ...dispute, ...aiAnalysis, ...compliance };
        } catch (error) {
          log.error('Error analyzing dispute:', error);
          return dispute;
        }
      }
      return dispute;
    }));

    res.json(disputesWithAI);
  } catch (error) {
    log.error("Error fetching pending disputes:", error);
    res.status(500).json({ message: "Failed to fetch pending disputes" });
  }
});

router.get('/disputeable-items', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const employee = await storage.getEmployeeByUserId(userId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const [reviews, writeUps] = await Promise.all([
      storage.getPerformanceReviewsByEmployee(employee.id, workspaceId),
      storage.getReportSubmissions(workspaceId, {
        employeeId: employee.id,
        status: 'approved',
      }),
    ]);

    res.json({
      reviews: reviews.map((r: any) => ({
        id: r.id,
        type: 'performance_review',
        title: `${r.reviewType} Review - ${r.reviewPeriodStart ? new Date(r.reviewPeriodStart).toLocaleDateString() : 'N/A'}`,
        date: r.completedAt || r.createdAt,
      })),
      writeups: writeUps.map((w: any) => ({
        id: w.id,
        type: 'report_submission',
        title: w.reportNumber || 'Incident Report',
        date: w.submittedAt,
      })),
    });
  } catch (error) {
    log.error("Error fetching disputeable items:", error);
    res.status(500).json({ message: "Failed to fetch disputeable items" });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const dispute = await storage.getDispute(id, workspaceId);
    
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    const employee = await storage.getEmployeeByUserId(userId);
    const isHROrManager = employee && ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager'].includes(employee.workspaceRole || '');
    
    if (!isHROrManager && dispute.filedBy !== userId) {
      return res.status(403).json({ message: "You can only view your own disputes" });
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error fetching dispute:", error);
    res.status(500).json({ message: "Failed to fetch dispute" });
  }
});

router.patch('/:id/assign', async (req: any, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ message: "Manager access required to assign disputes" });
    }
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ message: "assignedTo is required" });
    }

    const dispute = await storage.updateDispute(id, workspaceId, {
      assignedTo,
      status: 'under_review',
    });

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error assigning dispute:", error);
    res.status(500).json({ message: "Failed to assign dispute" });
  }
});

router.patch('/:id', async (req: any, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ message: "Manager access required to update disputes" });
    }
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const updates = req.body;
    
    const dispute = await storage.updateDispute(id, workspaceId, updates);
    
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error updating dispute:", error);
    res.status(500).json({ message: "Failed to update dispute" });
  }
});

router.post('/:id/resolve', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const { resolution, resolutionAction } = req.body;

    if (!resolution || !resolutionAction) {
      return res.status(400).json({ message: "resolution and resolutionAction are required" });
    }

    const dispute = await storage.resolveDispute(
      id,
      workspaceId,
      userId,
      resolution,
      resolutionAction
    );
    
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error resolving dispute:", error);
    res.status(500).json({ message: "Failed to resolve dispute" });
  }
});

router.post('/:id/apply-changes', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    
    const dispute = await storage.getDispute(id, workspaceId);
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    if (dispute.status !== 'resolved') {
      return res.status(400).json({ message: "Dispute must be resolved before applying changes" });
    }

    const targetType = dispute.targetType;
    const targetId = dispute.targetId;
    const resolution = dispute.resolutionAction;
    
    if (targetType === 'timeEntry' && resolution === 'approve') {
      const entry = await storage.getTimeEntry(targetId);
      if (entry) {
        await storage.updateTimeEntry(targetId, { status: 'approved' });
      }
    } else if (targetType === 'shift' && resolution === 'reschedule') {
      await storage.updateShift(targetId, { status: 'rescheduled', updatedAt: new Date() });
    } else if (targetType === 'payroll' && resolution === 'adjust_payment') {
      await storage.updatePayrollEntry(targetId, { status: 'adjusting', updatedAt: new Date() });
    }
    
    const updated = await storage.applyDisputeChanges(id, workspaceId);
    res.json(updated);
  } catch (error) {
    log.error("Error applying dispute changes:", error);
    res.status(500).json({ message: "Failed to apply dispute changes" });
  }
});

router.post('/:id/review', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const { decision, reviewerNotes } = req.body;

    if (!decision || !reviewerNotes) {
      return res.status(400).json({ message: "decision and reviewerNotes are required" });
    }

    const validDecisions = ['approve', 'reject', 'escalate'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ message: "Invalid decision. Must be: approve, reject, or escalate" });
    }

    const statusMap: { [key: string]: string } = {
      approve: 'approved',
      reject: 'rejected',
      escalate: 'under_review',
    };

    const dispute = await storage.updateDispute(id, workspaceId, {
      reviewerRecommendation: decision,
      reviewerNotes,
      reviewStartedAt: new Date(),
      status: statusMap[decision],
      resolvedAt: decision !== 'escalate' ? new Date() : null,
      resolvedBy: decision !== 'escalate' ? userId : null,
      resolution: decision !== 'escalate' ? reviewerNotes : null,
    });

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    res.json(dispute);
  } catch (error) {
    log.error("Error reviewing dispute:", error);
    res.status(500).json({ message: "Failed to review dispute" });
  }
});

router.get('/:id/investigation-context', async (req: any, res) => {
  try {
    const { id } = req.params;
    const userWorkspaceId = req.workspaceId || req.user?.currentWorkspaceId;

    const dispute = await db.query.disputes.findFirst({
      where: (disputes, { eq, and }) => and(
        eq(disputes.id, id),
        eq(disputes.workspaceId, userWorkspaceId)
      ),
    });

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    const employee = await db.select().from(employees).where(eq(employees.id, dispute.filedBy)).limit(1);
    if (!employee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const employeeData = employee[0];

    const timeEntriesData = await db.select({
      totalEntries: sql<number>`count(*)`,
      lateClockIns: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}))`,
      totalHours: sql<number>`sum(total_hours)`,
      avgHoursPerWeek: sql<number>`avg(total_hours)`,
      entriesLast30Days: sql<number>`count(*) filter (where clock_in >= now() - interval '30 days')`,
      lateClockInsLast30Days: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}) and clock_in >= now() - interval '30 days')`,
    })
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.employeeId, employeeData.id));

    const writeUpsData = await db.select({
      count: sql<number>`count(*)`,
      last30Days: sql<number>`count(*) filter (where submitted_at >= now() - interval '30 days')`,
      last90Days: sql<number>`count(*) filter (where submitted_at >= now() - interval '90 days')`,
    })
      .from(reportTemplates)
      .innerJoin(
        reportSubmissions,
        eq(reportSubmissions.templateId, reportTemplates.id)
      )
      .where(
        and(
          eq(reportSubmissions.employeeId, employeeData.id),
          eq(reportTemplates.isDisciplinary, true)
        )
      );

    const auditEntries = await db.select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, dispute.workspaceId),
          or(
            eq(auditLogs.userId, dispute.filedBy),
            eq(auditLogs.entityId, employeeData.id)
          )
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    const orgWideMetrics = await db.select({
      totalEmployees: sql<number>`count(distinct employee_id)`,
      avgLateClockInRate: sql<number>`avg(case when clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}) then 1.0 else 0.0 end)`,
      avgHoursPerWeek: sql<number>`avg(total_hours)`,
    })
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.workspaceId, dispute.workspaceId));

    const performanceReviews = await db.query.performanceReviews.findMany({
      where: (reviews, { eq }) => eq(reviews.employeeId, employeeData.id),
      orderBy: (reviews, { desc }) => [desc(reviews.completedAt)],
      limit: 5,
    });

    const employerRatings = await db.query.employerRatings.findMany({
      where: (ratings, { eq }) => eq(ratings.employeeId, employeeData.id),
      orderBy: (ratings, { desc }) => [desc(ratings.submittedAt)],
      limit: 5,
    });

    const trackOSMetrics = timeEntriesData[0] || {};

    res.json({
      dispute: {
        id: dispute.id,
        type: (dispute as any).type,
        title: dispute.title,
        reason: dispute.reason,
        filedAt: dispute.createdAt,
        status: dispute.status,
        aiSummary: dispute.aiSummary,
        aiRecommendation: dispute.aiRecommendation,
        aiConfidenceScore: dispute.aiConfidenceScore,
      },
      employee: {
        id: employeeData.id,
        name: `${employeeData.firstName || ''} ${employeeData.lastName || ''}`.trim(),
        email: employeeData.email,
        role: employeeData.role,
        hireDate: employeeData.createdAt,
      },
      trackOSMetrics,
      disciplinaryRecord: writeUpsData[0] || {},
      auditLogs: auditEntries,
      organizationWideComparison: orgWideMetrics[0] || {},
      performanceReviews,
      employerRatings,
    });
  } catch (error) {
    log.error("Error fetching investigation context:", error);
    res.status(500).json({ message: "Failed to fetch investigation context" });
  }
});

router.post('/:id/ai-analysis', async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const dispute = await db.query.disputes.findFirst({
      where: (disputes, { eq }) => eq(disputes.id, id),
    });

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    const { analyzeDispute, detectComplianceCategory } = await import('../services/disputeAI');
    const { sentimentAnalyzer } = await import('../services/sentimentAnalyzer');

    const aiAnalysis = await analyzeDispute(
      dispute.title,
      dispute.reason,
      (dispute as any).disputeType,
      dispute.requestedOutcome,
      dispute.evidence
    );

    const compliance = detectComplianceCategory(dispute.reason, (dispute as any).disputeType);

    let sentimentResult = null;
    try {
      sentimentResult = await (sentimentAnalyzer as any).analyze(dispute.reason);
    } catch (sentError) {
      log.error('Sentiment analysis failed:', sentError);
    }

    await storage.updateDispute(id, dispute.workspaceId, {
      aiSummary: aiAnalysis.summary,
      aiRecommendation: aiAnalysis.recommendation,
      aiConfidenceScore: aiAnalysis.confidenceScore,
      aiAnalysisFactors: aiAnalysis.analysisFactors,
      aiProcessedAt: new Date(),
      aiModel: aiAnalysis.model,
      complianceCategory: compliance.category,
      regulatoryReference: compliance.regulatoryReference,
    });

    res.json({
      success: true,
      analysis: aiAnalysis,
      compliance,
      sentiment: sentimentResult,
    });
  } catch (error) {
    log.error("Error running AI analysis:", error);
    res.status(500).json({ message: "Failed to run AI analysis" });
  }
});

export default router;
