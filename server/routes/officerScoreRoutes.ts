import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  employees,
  officerReadiness,
  officerScoreEvents,
  officerComplaints,
  officerGrievances,
  workspaceMembers,
  users,
} from '@shared/schema';
import { officerScoreService } from '../services/officerScoreService';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('OfficerScoreRoutes');


const router = Router();

// Helper: get employee record for the authed user in their current workspace
async function getMyEmployee(userId: string, workspaceId: string) {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
    .limit(1);
  return emp ?? null;
}

// Helper: get workspace role for authed user
async function getWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  return member?.role ?? null;
}

/**
 * GET /api/score/me
 * Returns the authed employee's readiness score + full event history.
 * If no score record exists yet, initializes one (unless user is owner with no field activity).
 */
router.get('/api/score/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(400).json({ error: 'Missing user or workspace context.' });
    }

    const emp = await getMyEmployee(userId, workspaceId);
    if (!emp) {
      return res.status(404).json({ error: 'No employee record found for this workspace.' });
    }

    const workspaceRole = await getWorkspaceRole(userId, workspaceId);
    const data = await officerScoreService.getScoreWithHistory(emp.id, workspaceId);

    // If no score record yet, try to initialize (respects owner rules)
    if (!data.score) {
      await officerScoreService.getOrInitScore(emp.id, workspaceId, { workspaceRole: workspaceRole ?? undefined });
      const fresh = await officerScoreService.getScoreWithHistory(emp.id, workspaceId);
      return res.json({ ...fresh, employeeId: emp.id });
    }

    return res.json({ ...data, employeeId: emp.id });
  } catch (err: unknown) {
    log.error('[ScoreRoute] GET /api/score/me error:', err);
    res.status(500).json({ error: 'Failed to retrieve score.' });
  }
});

/**
 * GET /api/score/employee/:employeeId
 * Manager/Owner/Support: view any employee's score + history in their workspace.
 */
router.get('/api/score/employee/:employeeId', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const { employeeId } = req.params;

    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace context.' });

    const workspaceRole = await getWorkspaceRole(userId, workspaceId);
    const allowedRoles = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'];
    if (!allowedRoles.includes(workspaceRole ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    // Verify employee belongs to this workspace
    const [emp] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!emp) return res.status(404).json({ error: 'Employee not found in this workspace.' });

    const data = await officerScoreService.getScoreWithHistory(employeeId, workspaceId);
    return res.json({ ...data, employeeId });
  } catch (err: unknown) {
    log.error('[ScoreRoute] GET /api/score/employee error:', err);
    res.status(500).json({ error: 'Failed to retrieve employee score.' });
  }
});

/**
 * POST /api/score/grievance
 * Employee submits a grievance against a specific score event.
 */
const grievanceSchema = z.object({
  scoreEventId: z.string().min(1),
  submittedReason: z.string().min(20, 'Please provide a detailed reason (at least 20 characters).'),
  officerEvidence: z
    .array(z.object({ type: z.string(), description: z.string(), url: z.string().optional() }))
    .optional(),
});

router.post('/api/score/grievance', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(400).json({ error: 'Missing context.' });
    }

    const parsed = grievanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input.' });
    }

    const emp = await getMyEmployee(userId, workspaceId);
    if (!emp) return res.status(404).json({ error: 'Employee record not found.' });

    const result = await officerScoreService.submitGrievance({
      employeeId: emp.id,
      workspaceId,
      scoreEventId: parsed.data.scoreEventId,
      submittedReason: parsed.data.submittedReason,
      officerEvidence: parsed.data.officerEvidence,
    });

    res.json(result);
  } catch (err: unknown) {
    log.error('[ScoreRoute] POST /api/score/grievance error:', err);
    res.status(500).json({ error: sanitizeError(err) ?? 'Failed to submit grievance.' });
  }
});

/**
 * GET /api/admin/score/complaints
 * Manager view: all open complaints in their workspace
 */
router.get('/api/admin/score/complaints', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const workspaceRole = await getWorkspaceRole(userId, workspaceId);
    const allowedRoles = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'];
    if (!allowedRoles.includes(workspaceRole ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    const complaints = await db
      .select()
      .from(officerComplaints)
      .where(eq(officerComplaints.workspaceId, workspaceId))
      .orderBy(desc(officerComplaints.createdAt))
      .limit(100);

    res.json({ complaints });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to retrieve complaints.' });
  }
});

/**
 * GET /api/admin/score/grievances
 * Manager + CoAIleague support: all grievances in workspace
 */
router.get('/api/admin/score/grievances', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const workspaceRole = await getWorkspaceRole(userId, workspaceId);
    const allowedRoles = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'];
    if (!allowedRoles.includes(workspaceRole ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    const grievances = await db
      .select()
      .from(officerGrievances)
      .where(eq(officerGrievances.workspaceId, workspaceId))
      .orderBy(desc(officerGrievances.createdAt))
      .limit(100);

    res.json({ grievances });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to retrieve grievances.' });
  }
});

/**
 * PUT /api/admin/score/grievances/:id/verdict
 * Support agent (platform_support or manager) makes binding verdict.
 */
const verdictSchema = z.object({
  verdict: z.enum(['resolved_upheld', 'resolved_reversed']),
  finalVerdict: z.string().min(10),
  pointsRestored: z.number().min(0).max(50).optional(),
  complaintDismissed: z.boolean().optional(),
  liaisonNotes: z.string().optional(),
});

router.put('/api/admin/score/grievances/:id/verdict', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.session?.userId;
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;

    const parsed = verdictSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message });
    }

    await officerScoreService.resolveGrievance({
      grievanceId: req.params.id,
      verdict: parsed.data.verdict,
      finalVerdict: parsed.data.finalVerdict,
      resolvedBy: userId,
      pointsRestored: parsed.data.pointsRestored,
      complaintDismissed: parsed.data.complaintDismissed,
      liaisonNotes: parsed.data.liaisonNotes,
    });

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) ?? 'Failed to record verdict.' });
  }
});

/**
 * PUT /api/admin/score/complaints/:id/resolve
 * Manager resolves a complaint (dismissed or resolved).
 */
router.put('/api/admin/score/complaints/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const [complaint] = await db
      .select()
      .from(officerComplaints)
      .where(eq(officerComplaints.id, req.params.id))
      .limit(1);

    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    await db
      .update(officerComplaints)
      .set({ status, resolutionNotes, resolvedAt: new Date(), officerUnderReview: false })
      .where(eq(officerComplaints.id, req.params.id));

    // Update the officer's active complaint count
    const remaining = await db
      .select({ id: officerComplaints.id })
      .from(officerComplaints)
      .where(
        and(
          eq(officerComplaints.employeeId, complaint.employeeId),
          eq(officerComplaints.officerUnderReview, true)
        )
      );

    if (remaining.length === 0) {
      await db
        .update(officerReadiness)
        .set({ underReview: false, activeComplaintCount: 0 })
        .where(eq(officerReadiness.employeeId, complaint.employeeId));
    }

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to resolve complaint.' });
  }
});

export default router;
