
import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { 
  // @ts-expect-error — TS migration: fix in refactoring sprint
  offboardingCases, 
  // @ts-expect-error — TS migration: fix in refactoring sprint
  exitInterviews,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  assetReturns,
  employees,
  workspaces
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "./auth";

const router = Router();

// ============================================================================
// Offboarding Cases
// ============================================================================

router.get('/api/offboarding/cases', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId)
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const cases = await (db as any).query.offboardingCases.findMany({
      where: eq(offboardingCases.workspaceId, workspace.id),
      orderBy: desc(offboardingCases.createdAt),
      with: {
        employee: true
      }
    });

    res.json(cases);
  } catch (error) {
    console.error("Error fetching offboarding cases:", error);
    res.status(500).json({ message: "Failed to fetch cases" });
  }
});

router.post('/api/offboarding/cases', requireAuth, async (req: any, res) => {
  try {
    const { 
      employeeId, 
      terminationType, 
      reason, 
      lastWorkDate, 
      initiatedBy 
    } = req.body;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId)
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const [offboardingCase] = await db.insert(offboardingCases)
      .values({
        workspaceId: employee.workspaceId,
        employeeId,
        terminationType,
        reason,
        lastWorkDate: new Date(lastWorkDate),
        initiatedBy,
        status: 'in_progress',
        exitInterviewCompleted: false,
        assetsReturned: false,
        accessRevoked: false,
        finalPayrollProcessed: false
      })
      .returning();

    res.json(offboardingCase);
  } catch (error) {
    console.error("Error creating offboarding case:", error);
    res.status(500).json({ message: "Failed to create case" });
  }
});

router.patch('/api/offboarding/cases/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(offboardingCases)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(offboardingCases.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating case:", error);
    res.status(500).json({ message: "Failed to update case" });
  }
});

// ============================================================================
// Exit Interviews
// ============================================================================

router.get('/api/offboarding/exit-interviews/:caseId', requireAuth, async (req: any, res) => {
  try {
    const { caseId } = req.params;

    const interview = await (db as any).query.exitInterviews.findFirst({
      where: eq(exitInterviews.offboardingCaseId, caseId)
    });

    res.json(interview);
  } catch (error) {
    console.error("Error fetching exit interview:", error);
    res.status(500).json({ message: "Failed to fetch interview" });
  }
});

router.post('/api/offboarding/exit-interviews', requireAuth, async (req: any, res) => {
  try {
    const { 
      offboardingCaseId, 
      responses, 
      overallSatisfaction,
      wouldRecommend,
      comments
    } = req.body;

    const [interview] = await db.insert(exitInterviews)
      .values({
        offboardingCaseId,
        responses: responses || {},
        overallSatisfaction,
        wouldRecommend,
        comments,
        completedAt: new Date()
      })
      .returning();

    // Update case
    await db.update(offboardingCases)
      .set({
        exitInterviewCompleted: true,
        updatedAt: new Date()
      })
      .where(eq(offboardingCases.id, offboardingCaseId));

    res.json(interview);
  } catch (error) {
    console.error("Error creating exit interview:", error);
    res.status(500).json({ message: "Failed to create interview" });
  }
});

// ============================================================================
// Asset Returns
// ============================================================================

router.get('/api/offboarding/assets/:caseId', requireAuth, async (req: any, res) => {
  try {
    const { caseId } = req.params;

    const assets = await (db as any).query.assetReturns.findMany({
      where: eq(assetReturns.offboardingCaseId, caseId)
    });

    res.json(assets);
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ message: "Failed to fetch assets" });
  }
});

router.post('/api/offboarding/assets', requireAuth, async (req: any, res) => {
  try {
    const { offboardingCaseId, assetType, assetId, description } = req.body;

    const [asset] = await db.insert(assetReturns)
      .values({
        offboardingCaseId,
        assetType,
        assetId,
        description,
        status: 'pending'
      })
      .returning();

    res.json(asset);
  } catch (error) {
    console.error("Error creating asset return:", error);
    res.status(500).json({ message: "Failed to create asset return" });
  }
});

router.patch('/api/offboarding/assets/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, returnedBy, notes } = req.body;

    const [updated] = await db.update(assetReturns)
      .set({
        status,
        returnedBy,
        returnedAt: status === 'returned' ? new Date() : null,
        notes,
        updatedAt: new Date()
      })
      .where(eq(assetReturns.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating asset:", error);
    res.status(500).json({ message: "Failed to update asset" });
  }
});

export default router;
