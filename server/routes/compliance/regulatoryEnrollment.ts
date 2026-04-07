import { sanitizeError } from '../../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../../db';
import { complianceEnrollments } from '../../../shared/schema/domains/workforce/index';
import { employees } from '../../../shared/schema/domains/workforce/index';
import { workspaces } from '../../../shared/schema/domains/orgs/index';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../../auth';
import { createLogger } from '../../lib/logger';
const log = createLogger('RegulatoryEnrollment');


const router = Router();

// ─── 30-day deadline helper ────────────────────────────────────────────────
function computeDeadline(workspaceCreatedAt: Date): Date {
  const d = new Date(workspaceCreatedAt);
  d.setDate(d.getDate() + 30);
  return d;
}

// ─── GET /api/compliance/enrollment/status ─────────────────────────────────
// Current user's enrollment record + deadline info
router.get('/status', requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const [ws] = await db.select({
      id: workspaces.id,
      createdAt: workspaces.createdAt,
      name: workspaces.name,
    }).from(workspaces).where(eq(workspaces.id, workspaceId));

    if (!ws) return res.status(404).json({ error: 'Workspace not found' });

    const deadline = computeDeadline(ws.createdAt!);
    const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

    // Find the employee record for the current user
    const [employee] = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      organizationalTitle: employees.organizationalTitle,
      workspaceRole: employees.workspaceRole,
      guardCardVerified: employees.guardCardVerified,
    }).from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, userId)))
      .limit(1);

    if (!employee) {
      return res.json({
        success: true,
        data: {
          enrolled: false,
          enrollment: null,
          deadline,
          daysRemaining,
          isOverdue: daysRemaining < 0,
          workspaceName: ws.name,
        },
      });
    }

    const [enrollment] = await db.select()
      .from(complianceEnrollments)
      .where(and(
        eq(complianceEnrollments.workspaceId, workspaceId),
        eq(complianceEnrollments.employeeId, employee.id),
      ))
      .limit(1);

    res.json({
      success: true,
      data: {
        enrolled: !!enrollment,
        enrollment: enrollment || null,
        employee,
        deadline,
        daysRemaining,
        isOverdue: daysRemaining < 0,
        workspaceName: ws.name,
        requiresAction: !enrollment || enrollment.status === 'pending' || enrollment.status === 'rejected',
      },
    });
  } catch (err: unknown) {
    log.error('enrollment status error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── GET /api/compliance/enrollment/workspace ─────────────────────────────
// All users' enrollment status — for owners/managers
router.get('/workspace', requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const [ws] = await db.select({
      id: workspaces.id,
      createdAt: workspaces.createdAt,
      name: workspaces.name,
    }).from(workspaces).where(eq(workspaces.id, workspaceId));

    if (!ws) return res.status(404).json({ error: 'Workspace not found' });

    const deadline = computeDeadline(ws.createdAt!);
    const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

    // All active employees in workspace
    const allEmployees = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      organizationalTitle: employees.organizationalTitle,
      workspaceRole: employees.workspaceRole,
      userId: employees.userId,
      status: employees.status,
    }).from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.status, 'active'),
      ));

    // All enrollment records
    const enrollments = await db.select()
      .from(complianceEnrollments)
      .where(eq(complianceEnrollments.workspaceId, workspaceId));

    const enrollmentMap = new Map(enrollments.map(e => [e.employeeId, e]));

    const members = allEmployees.map(emp => ({
      ...emp,
      enrollment: enrollmentMap.get(emp.id) || null,
      enrollmentStatus: enrollmentMap.get(emp.id)?.status || 'pending',
      credentialType: enrollmentMap.get(emp.id)?.credentialType || null,
    }));

    const submitted = members.filter(m => m.enrollmentStatus !== 'pending').length;
    const total = members.length;

    res.json({
      success: true,
      data: {
        members,
        deadline,
        daysRemaining,
        isOverdue: daysRemaining < 0,
        completionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
        submitted,
        total,
        workspaceName: ws.name,
      },
    });
  } catch (err: unknown) {
    log.error('workspace enrollment error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── POST /api/compliance/enrollment/submit ───────────────────────────────
// Submit or update current user's enrollment
router.post('/submit', requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const { credentialType, fileUrl, cardNumber, issuingState, issuingAgency, expirationDate, notes } = req.body;

    if (!credentialType) return res.status(400).json({ error: 'credentialType is required' });

    const [ws] = await db.select({ createdAt: workspaces.createdAt })
      .from(workspaces).where(eq(workspaces.id, workspaceId));

    if (!ws) return res.status(404).json({ error: 'Workspace not found' });

    const deadline = computeDeadline(ws.createdAt!);

    const [employee] = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, userId)))
      .limit(1);

    if (!employee) return res.status(404).json({ error: 'Employee record not found for this workspace' });

    // Upsert enrollment record
    const [existing] = await db.select({ id: complianceEnrollments.id })
      .from(complianceEnrollments)
      .where(and(
        eq(complianceEnrollments.workspaceId, workspaceId),
        eq(complianceEnrollments.employeeId, employee.id),
      )).limit(1);

    if (existing) {
      const [updated] = await db.update(complianceEnrollments)
        .set({
          credentialType,
          fileUrl: fileUrl || null,
          cardNumber: cardNumber || null,
          issuingState: issuingState || 'TX',
          issuingAgency: issuingAgency || 'TX DPS',
          expirationDate: expirationDate ? new Date(expirationDate) : null,
          status: 'submitted',
          submittedAt: new Date(),
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(complianceEnrollments.id, existing.id))
        .returning();
      res.json({ success: true, data: updated });
    } else {
      const [created] = await db.insert(complianceEnrollments)
        .values({
          workspaceId,
          employeeId: employee.id,
          userId,
          credentialType,
          fileUrl: fileUrl || null,
          cardNumber: cardNumber || null,
          issuingState: issuingState || 'TX',
          issuingAgency: issuingAgency || 'TX DPS',
          expirationDate: expirationDate ? new Date(expirationDate) : null,
          status: 'submitted',
          deadline,
          submittedAt: new Date(),
          notes: notes || null,
        })
        .returning();
      res.json({ success: true, data: created });
    }
  } catch (err: unknown) {
    log.error('enrollment submit error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── PATCH /api/compliance/enrollment/:employeeId/review ─────────────────
// Owner/manager reviews and approves/rejects a submission
router.patch('/:employeeId/review', requireAuth, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const { employeeId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected', 'waived'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved, rejected, or waived' });
    }

    const [updated] = await db.update(complianceEnrollments)
      .set({
        status,
        reviewedAt: new Date(),
        reviewedBy: userId,
        rejectionReason: rejectionReason || null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(complianceEnrollments.workspaceId, workspaceId),
        eq(complianceEnrollments.employeeId, employeeId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Enrollment not found' });
    res.json({ success: true, data: updated });
  } catch (err: unknown) {
    log.error('enrollment review error:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
