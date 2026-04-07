/**
 * Performance Routes — Phase 35J Officer Performance Management & Disciplinary Records
 *
 * Route surface: /api/performance/*
 * Canonical routes owned by this file:
 *   GET/POST  /disciplinary          — disciplinary record CRUD (NDS notifications, appeal flow)
 *   PATCH     /disciplinary/:id/acknowledge  — officer acknowledgment (own record only)
 *   PATCH     /disciplinary/:id/appeal       — officer appeal submission
 *   GET/POST  /reviews               — performance review CRUD (Phase 35J dimensions)
 *   PATCH     /reviews/:id/acknowledge       — officer acknowledgment of review
 *   GET       /summary/:employeeId   — manager summary for scheduling context
 *   GET       /risk-roster           — risk-sorted officer roster for manager dashboard
 *
 * No other performance route files exist in this codebase — this is the single authoritative
 * surface for officer performance management.
 *
 * RBAC: org_owner/co_owner → all data; manager → direct reports only (fail-closed);
 *       officer → own records only.
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import {
  disciplinaryRecords,
  performanceReviews,
  employees,
  managerAssignments,
  insertDisciplinaryRecordSchema,
} from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { platformEventBus } from '../services/platformEventBus';
import { createNotification } from '../services/notificationService';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('performanceRoutes');

const router = Router();

const MANAGER_ROLES = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'];

function isManagerRole(role?: string | null): boolean {
  return MANAGER_ROLES.includes(role || '');
}

async function resolveCallerEmployee(req: AuthenticatedRequest) {
  const userId = req.userId;
  const workspaceId = req.workspaceId;
  if (!userId || !workspaceId) return null;
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
    .limit(1);
  return emp || null;
}

async function getDirectReportIds(managerId: string, workspaceId: string): Promise<string[]> {
  const assignments = await db
    .select({ employeeId: managerAssignments.employeeId })
    .from(managerAssignments)
    .where(and(eq(managerAssignments.managerId, managerId), eq(managerAssignments.workspaceId, workspaceId)));
  return assignments.map((a) => a.employeeId);
}

async function getEmployeeUserId(employeeId: string, workspaceId: string): Promise<string | null> {
  const [emp] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
    .limit(1);
  return emp?.userId || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCIPLINARY RECORDS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/performance/disciplinary — role-scoped access
// org_owner sees all; manager sees direct reports; officer sees own only
router.get('/disciplinary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const callerEmp = await resolveCallerEmployee(req);
    // Use session workspace role as fallback when no employee record exists (e.g., org_owners without emp record)
    const callerRole = callerEmp?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwner = ['org_owner', 'co_owner'].includes(callerRole);
    const isManager = isManagerRole(callerRole);

    const employeeIdFilter = req.query.employeeId as string | undefined;

    if (isOwner) {
      // org_owner can query any employeeId or all
      const records = await db
        .select()
        .from(disciplinaryRecords)
        .where(
          and(
            eq(disciplinaryRecords.workspaceId, workspaceId),
            employeeIdFilter ? eq(disciplinaryRecords.employeeId, employeeIdFilter) : undefined,
          ),
        )
        .orderBy(desc(disciplinaryRecords.issuedAt));
      return res.json(records);
    }

    if (isManager && callerEmp) {
      const directReports = await getDirectReportIds(callerEmp.id, workspaceId);
      if (employeeIdFilter) {
        if (!directReports.includes(employeeIdFilter)) {
          return res.status(403).json({ error: 'Access restricted to direct reports only' });
        }
        const records = await db
          .select()
          .from(disciplinaryRecords)
          .where(
            and(
              eq(disciplinaryRecords.workspaceId, workspaceId),
              eq(disciplinaryRecords.employeeId, employeeIdFilter),
            ),
          )
          .orderBy(desc(disciplinaryRecords.issuedAt));
        return res.json(records);
      }
      if (directReports.length === 0) return res.json([]);
      const records = await db
        .select()
        .from(disciplinaryRecords)
        .where(
          and(
            eq(disciplinaryRecords.workspaceId, workspaceId),
            inArray(disciplinaryRecords.employeeId, directReports),
          ),
        )
        .orderBy(desc(disciplinaryRecords.issuedAt));
      return res.json(records);
    }

    if (callerEmp) {
      // Officer — own records only
      const records = await db
        .select()
        .from(disciplinaryRecords)
        .where(
          and(
            eq(disciplinaryRecords.workspaceId, workspaceId),
            eq(disciplinaryRecords.employeeId, callerEmp.id),
          ),
        )
        .orderBy(desc(disciplinaryRecords.issuedAt));
      return res.json(records);
    }

    // Authenticated org_owners with no employee record: return empty array (no records to display)
    if (isOwner) return res.json([]);

    return res.status(403).json({ error: 'No employee context found' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/performance/disciplinary — manager+ only; fires NDS to officer
// Non-owner managers may only create records for their direct reports.
router.post('/disciplinary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const callerEmpForWrite = await resolveCallerEmployee(req);
    const callerRoleForWrite = callerEmpForWrite?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwnerForWrite = ['org_owner', 'co_owner'].includes(callerRoleForWrite);

    // Fail-closed: non-owner managers MUST have an employee record for direct-report scoping
    if (!isOwnerForWrite && !callerEmpForWrite) {
      return res.status(403).json({ error: 'Manager employee context required for scoped access' });
    }

    const parsed = insertDisciplinaryRecordSchema.safeParse({
      ...req.body,
      workspaceId,
      issuedBy: req.userId,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    // Non-owner managers are scoped to direct reports only
    if (!isOwnerForWrite && callerEmpForWrite) {
      const directReportIds = await getDirectReportIds(callerEmpForWrite.id, workspaceId);
      if (!directReportIds.includes(parsed.data.employeeId)) {
        return res.status(403).json({ error: 'You may only issue disciplinary records for your direct reports' });
      }
    }

    const [record] = await db.insert(disciplinaryRecords).values(parsed.data).returning();

    // NDS notification to officer
    const officerUserId = await getEmployeeUserId(parsed.data.employeeId, workspaceId);
    if (officerUserId) {
      const recordTypeLabel = (parsed.data.recordType || 'record').replace(/_/g, ' ');
      createNotification({
        workspaceId,
        userId: officerUserId,
        type: 'disciplinary_pattern',
        title: `Disciplinary Record Issued — ${recordTypeLabel}`,
        message: `A formal disciplinary record (${recordTypeLabel}) has been issued. Please review and acknowledge.`,
        actionUrl: '/performance',
        relatedEntityType: 'disciplinary_record',
        relatedEntityId: record.id,
        metadata: { recordType: parsed.data.recordType, recordId: record.id },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    platformEventBus
      .publish({
        type: 'disciplinary_record_created',
        category: 'workforce',
        title: `Disciplinary Record — ${parsed.data.recordType}`,
        description: `${parsed.data.recordType} issued for officer in workspace ${workspaceId}`,
        workspaceId,
        metadata: {
          recordId: record.id,
          employeeId: parsed.data.employeeId,
          recordType: parsed.data.recordType,
        },
        visibility: 'supervisor',
      })
      .catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/performance/disciplinary/:id/acknowledge — officer ONLY (acknowledgment is personal)
router.patch('/disciplinary/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const callerEmp = await resolveCallerEmployee(req);
    if (!callerEmp) return res.status(403).json({ error: 'Employee context required' });

    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(disciplinaryRecords)
      .where(and(eq(disciplinaryRecords.id, id), eq(disciplinaryRecords.workspaceId, workspaceId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Record not found' });

    // Acknowledgment is strictly officer-owned — only the subject employee may acknowledge
    if (existing.employeeId !== callerEmp.id) {
      return res.status(403).json({ error: 'Only the subject officer may acknowledge their own disciplinary record' });
    }

    const [updated] = await db
      .update(disciplinaryRecords)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: callerEmp.id,
        updatedAt: new Date(),
      })
      .where(and(eq(disciplinaryRecords.id, id), eq(disciplinaryRecords.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/performance/disciplinary/:id/appeal — officer submits appeal
router.patch('/disciplinary/:id/appeal', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const callerEmp = await resolveCallerEmployee(req);
    if (!callerEmp) return res.status(403).json({ error: 'Employee context required' });

    const { id } = req.params;
    const { appealReason } = req.body;
    if (!appealReason || typeof appealReason !== 'string') {
      return res.status(400).json({ error: 'appealReason is required' });
    }

    const [existing] = await db
      .select()
      .from(disciplinaryRecords)
      .where(and(eq(disciplinaryRecords.id, id), eq(disciplinaryRecords.workspaceId, workspaceId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Record not found' });

    // Appeal is strictly officer-owned
    if (existing.employeeId !== callerEmp.id) {
      return res.status(403).json({ error: 'You can only appeal your own records' });
    }

    if (existing.appealStatus === 'pending') {
      return res.status(409).json({ error: 'An appeal is already pending for this record' });
    }

    const [updated] = await db
      .update(disciplinaryRecords)
      .set({
        status: 'appealed',
        appealStatus: 'pending',
        appealReason: appealReason,
        updatedAt: new Date(),
      })
      .where(and(eq(disciplinaryRecords.id, id), eq(disciplinaryRecords.workspaceId, workspaceId)))
      .returning();

    platformEventBus
      .publish({
        type: 'disciplinary_pattern',
        category: 'workforce',
        title: 'Disciplinary Record Appealed',
        description: `Officer has appealed a disciplinary record in workspace ${workspaceId}`,
        workspaceId,
        metadata: { recordId: id, employeeId: callerEmp.id, appealReason },
        visibility: 'supervisor',
      })
      .catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE REVIEWS
// ─────────────────────────────────────────────────────────────────────────────

const insertReviewSchema = z.object({
  employeeId: z.string().min(1),
  reviewType: z.enum(['annual', 'quarterly', 'probation', '90_day', 'promotion', 'pip']).optional(),
  reviewPeriodStart: z.string().optional(),
  reviewPeriodEnd: z.string().optional(),
  overallRating: z.number().int().min(1).max(5).optional(),
  // Phase 35J required dimensions
  attendanceRating: z.number().int().min(1).max(5).optional(),
  reliabilityRating: z.number().int().min(1).max(5).optional(),
  professionalismRating: z.number().int().min(1).max(5).optional(),
  clientFeedbackRating: z.number().int().min(1).max(5).optional(),
  // Existing additional dimensions
  communicationRating: z.number().int().min(1).max(5).optional(),
  teamworkRating: z.number().int().min(1).max(5).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.array(z.string()).optional(),
  reviewerComments: z.string().optional(),
});

// GET /api/performance/reviews — role-scoped
router.get('/reviews', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const callerEmp = await resolveCallerEmployee(req);
    // Use session workspace role as fallback when no employee record exists (e.g., org_owners without emp record)
    const callerRole = callerEmp?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwner = ['org_owner', 'co_owner'].includes(callerRole);
    const isManager = isManagerRole(callerRole);
    const employeeIdFilter = req.query.employeeId as string | undefined;

    if (isOwner) {
      const reviews = await db
        .select()
        .from(performanceReviews)
        .where(
          and(
            eq(performanceReviews.workspaceId, workspaceId),
            employeeIdFilter ? eq(performanceReviews.employeeId, employeeIdFilter) : undefined,
          ),
        )
        .orderBy(desc(performanceReviews.createdAt));
      return res.json(reviews);
    }

    if (isManager && callerEmp) {
      const directReports = await getDirectReportIds(callerEmp.id, workspaceId);
      if (employeeIdFilter) {
        if (!directReports.includes(employeeIdFilter)) {
          return res.status(403).json({ error: 'Access restricted to direct reports only' });
        }
        const reviews = await db
          .select()
          .from(performanceReviews)
          .where(
            and(
              eq(performanceReviews.workspaceId, workspaceId),
              eq(performanceReviews.employeeId, employeeIdFilter),
            ),
          )
          .orderBy(desc(performanceReviews.createdAt));
        return res.json(reviews);
      }
      if (directReports.length === 0) return res.json([]);
      const reviews = await db
        .select()
        .from(performanceReviews)
        .where(
          and(
            eq(performanceReviews.workspaceId, workspaceId),
            inArray(performanceReviews.employeeId, directReports),
          ),
        )
        .orderBy(desc(performanceReviews.createdAt));
      return res.json(reviews);
    }

    if (callerEmp) {
      const reviews = await db
        .select()
        .from(performanceReviews)
        .where(
          and(eq(performanceReviews.workspaceId, workspaceId), eq(performanceReviews.employeeId, callerEmp.id)),
        )
        .orderBy(desc(performanceReviews.createdAt));
      return res.json(reviews);
    }

    // Authenticated org_owners with no employee record: return empty array
    if (isOwner) return res.json([]);

    return res.status(403).json({ error: 'No employee context found' });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/performance/reviews — manager+ only
// Non-owner managers may only submit reviews for their direct reports.
router.post('/reviews', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const callerEmpForReview = await resolveCallerEmployee(req);
    const callerRoleForReview = callerEmpForReview?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwnerForReview = ['org_owner', 'co_owner'].includes(callerRoleForReview);

    // Fail-closed: non-owner managers MUST have an employee record for direct-report scoping
    if (!isOwnerForReview && !callerEmpForReview) {
      return res.status(403).json({ error: 'Manager employee context required for scoped access' });
    }

    const parsed = insertReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    // Non-owner managers are scoped to direct reports only
    if (!isOwnerForReview && callerEmpForReview) {
      const directReportIds = await getDirectReportIds(callerEmpForReview.id, workspaceId);
      if (!directReportIds.includes(parsed.data.employeeId)) {
        return res.status(403).json({ error: 'You may only submit reviews for your direct reports' });
      }
    }

    const {
      employeeId,
      reviewType,
      reviewPeriodStart,
      reviewPeriodEnd,
      overallRating,
      attendanceRating,
      reliabilityRating,
      professionalismRating,
      clientFeedbackRating,
      communicationRating,
      teamworkRating,
      strengths,
      areasForImprovement,
      goals,
      reviewerComments,
    } = parsed.data;

    const [review] = await db
      .insert(performanceReviews)
      .values({
        workspaceId,
        employeeId,
        reviewerId: req.userId ?? undefined,
        reviewType: reviewType ?? 'annual',
        reviewPeriodStart: reviewPeriodStart ? new Date(reviewPeriodStart) : undefined,
        reviewPeriodEnd: reviewPeriodEnd ? new Date(reviewPeriodEnd) : undefined,
        overallRating,
        attendanceRating,
        // Phase 35J dedicated dimensions — stored in their own columns
        reliabilityRating,
        professionalismRating,
        clientFeedbackRating,
        // Standard additional dimensions
        communicationRating,
        teamworkRating,
        strengths,
        areasForImprovement,
        goals,
        reviewerComments,
        status: 'completed',
      })
      .returning();

    // Notify officer
    const officerUserId = await getEmployeeUserId(employeeId, workspaceId);
    if (officerUserId) {
      createNotification({
        workspaceId,
        userId: officerUserId,
        type: 'system',
        title: 'Performance Review Submitted',
        message: 'A performance review has been submitted for you. Please review and acknowledge.',
        actionUrl: '/performance',
        relatedEntityType: 'performance_review',
        relatedEntityId: review.id,
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/performance/reviews/:id/acknowledge — officer ONLY (acknowledgment is personal)
router.patch('/reviews/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const callerEmp = await resolveCallerEmployee(req);
    if (!callerEmp) return res.status(403).json({ error: 'Employee context required' });

    const { id } = req.params;
    const { employeeComments } = req.body;

    const [existing] = await db
      .select()
      .from(performanceReviews)
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Review not found' });

    // Acknowledgment is strictly officer-owned
    if (existing.employeeId !== callerEmp.id) {
      return res
        .status(403)
        .json({ error: 'Only the subject officer may acknowledge their own performance review' });
    }

    const [updated] = await db
      .update(performanceReviews)
      .set({
        employeeAcknowledgedAt: new Date(),
        updatedAt: new Date(),
        ...(employeeComments !== undefined ? { employeeComments } : {}),
      })
      .where(and(eq(performanceReviews.id, id), eq(performanceReviews.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/performance/summary/:employeeId — manager+ summary view for scheduling decisions
router.get('/summary/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const { employeeId } = req.params;

    // Enforce direct-report scope for non-owner managers
    const callerEmpForSummary = await resolveCallerEmployee(req);
    const callerRoleForSummary = callerEmpForSummary?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwnerForSummary = ['org_owner', 'co_owner'].includes(callerRoleForSummary);
    // Fail-closed: non-owner managers without employee record cannot bypass scoping
    if (!isOwnerForSummary && !callerEmpForSummary) {
      return res.status(403).json({ error: 'Manager employee context required for scoped access' });
    }
    if (!isOwnerForSummary && callerEmpForSummary) {
      const directReports = await getDirectReportIds(callerEmpForSummary.id, workspaceId);
      if (!directReports.includes(employeeId)) {
        return res.status(403).json({ error: 'Access restricted to direct reports only' });
      }
    }

    const [disciplinary, reviews] = await Promise.all([
      db
        .select()
        .from(disciplinaryRecords)
        .where(and(eq(disciplinaryRecords.workspaceId, workspaceId), eq(disciplinaryRecords.employeeId, employeeId)))
        .orderBy(desc(disciplinaryRecords.issuedAt)),
      db
        .select()
        .from(performanceReviews)
        .where(and(eq(performanceReviews.workspaceId, workspaceId), eq(performanceReviews.employeeId, employeeId)))
        .orderBy(desc(performanceReviews.createdAt)),
    ]);

    const activeWarnings = disciplinary.filter(
      (r) => r.status === 'active' && ['written_warning', 'suspension'].includes(r.recordType),
    );

    const avgRating = reviews.length
      ? reviews.reduce((sum, r) => sum + (r.overallRating || 0), 0) / reviews.length
      : null;

    res.json({
      employeeId,
      activeWarningCount: activeWarnings.length,
      hasActiveSuspension: activeWarnings.some((r) => r.recordType === 'suspension'),
      hasActiveWrittenWarning: activeWarnings.some((r) => r.recordType === 'written_warning'),
      totalDisciplinaryRecords: disciplinary.length,
      totalReviews: reviews.length,
      avgOverallRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      latestReview: reviews[0] || null,
      disciplinary,
      reviews,
    });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/performance/risk-roster — manager+ view: officers sorted by risk tier
router.get('/risk-roster', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!hasManagerAccess(req.workspaceRole ?? '')) return res.status(403).json({ error: 'Manager access required' });

    const callerEmp = await resolveCallerEmployee(req);
    const callerRole = callerEmp?.workspaceRole ?? (req.workspaceRole ?? '');
    const isOwner = ['org_owner', 'co_owner'].includes(callerRole);

    // Fail-closed: non-owner managers without employee record cannot access workspace-wide data
    if (!isOwner && !callerEmp) {
      return res.status(403).json({ error: 'Manager employee context required for scoped access' });
    }

    // Resolve which employees to include
    let scopedEmployeeIds: string[] | null = null;
    if (!isOwner && callerEmp) {
      scopedEmployeeIds = await getDirectReportIds(callerEmp.id, workspaceId);
      if (scopedEmployeeIds.length === 0) return res.json([]);
    }

    const empList = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));

    const filteredEmps = scopedEmployeeIds
      ? empList.filter((e) => scopedEmployeeIds!.includes(e.id))
      : empList;

    if (filteredEmps.length === 0) return res.json([]);

    const allEmpIds = filteredEmps.map((e) => e.id);

    const [allDisciplinary, allReviews] = await Promise.all([
      db
        .select()
        .from(disciplinaryRecords)
        .where(
          and(
            eq(disciplinaryRecords.workspaceId, workspaceId),
            eq(disciplinaryRecords.status, 'active'),
            inArray(disciplinaryRecords.employeeId, allEmpIds),
          ),
        ),
      db
        .select()
        .from(performanceReviews)
        .where(
          and(
            eq(performanceReviews.workspaceId, workspaceId),
            inArray(performanceReviews.employeeId, allEmpIds),
          ),
        )
        .orderBy(desc(performanceReviews.createdAt)),
    ]);

    const disciplinaryByEmp = new Map<string, typeof allDisciplinary>();
    for (const r of allDisciplinary) {
      if (!disciplinaryByEmp.has(r.employeeId)) disciplinaryByEmp.set(r.employeeId, []);
      disciplinaryByEmp.get(r.employeeId)!.push(r);
    }

    const reviewsByEmp = new Map<string, typeof allReviews>();
    for (const r of allReviews) {
      if (!reviewsByEmp.has(r.employeeId)) reviewsByEmp.set(r.employeeId, []);
      reviewsByEmp.get(r.employeeId)!.push(r);
    }

    const roster = filteredEmps.map((emp) => {
      const records = disciplinaryByEmp.get(emp.id) || [];
      const reviews = reviewsByEmp.get(emp.id) || [];
      const hasSuspension = records.some((r) => r.recordType === 'suspension');
      const hasWrittenWarning = records.some((r) => r.recordType === 'written_warning');
      const unacknowledged = records.filter((r) => !r.acknowledgedAt).length;
      const latestReview = reviews[0] || null;
      const avgRating =
        reviews.length ? reviews.reduce((s, r) => s + (r.overallRating || 0), 0) / reviews.length : null;
      const riskLevel = hasSuspension ? 'high' : hasWrittenWarning ? 'medium' : records.length > 0 ? 'low' : 'none';

      return {
        employeeId: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: emp.workspaceRole,
        activeRecords: records.length,
        hasSuspension,
        hasWrittenWarning,
        unacknowledged,
        riskLevel,
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        totalReviews: reviews.length,
        latestReviewDate: latestReview?.createdAt || null,
      };
    });

    // Sort by risk: high → medium → low → none, then by activeRecords desc
    const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
    roster.sort((a, b) => {
      const riskDiff = (riskOrder[a.riskLevel] ?? 4) - (riskOrder[b.riskLevel] ?? 4);
      if (riskDiff !== 0) return riskDiff;
      return b.activeRecords - a.activeRecords;
    });

    res.json(roster);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
