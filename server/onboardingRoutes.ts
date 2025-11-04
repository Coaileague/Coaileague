
import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { 
  onboardingApplications, 
  onboardingTemplates, 
  onboardingTasks,
  employees,
  workspaces
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "./auth";

const router = Router();

// ============================================================================
// Onboarding Templates
// ============================================================================

router.get('/api/onboarding/templates', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId)
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const templates = await db.query.onboardingTemplates.findMany({
      where: eq(onboardingTemplates.workspaceId, workspace.id),
      orderBy: desc(onboardingTemplates.createdAt)
    });

    res.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

router.post('/api/onboarding/templates', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { name, description, steps, estimatedDays } = req.body;

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId)
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const [template] = await db.insert(onboardingTemplates)
      .values({
        workspaceId: workspace.id,
        name,
        description,
        steps: steps || [],
        estimatedDays: estimatedDays || 7,
        isActive: true
      })
      .returning();

    res.json(template);
  } catch (error) {
    console.error("Error creating template:", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

// ============================================================================
// Onboarding Applications
// ============================================================================

router.get('/api/onboarding/applications', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId)
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const applications = await db.query.onboardingApplications.findMany({
      where: eq(onboardingApplications.workspaceId, workspace.id),
      orderBy: desc(onboardingApplications.createdAt),
      with: {
        employee: true
      }
    });

    res.json(applications);
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

router.post('/api/onboarding/applications', requireAuth, async (req: any, res) => {
  try {
    const { employeeId, templateId } = req.body;

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId)
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const template = templateId 
      ? await db.query.onboardingTemplates.findFirst({
          where: eq(onboardingTemplates.id, templateId)
        })
      : null;

    const [application] = await db.insert(onboardingApplications)
      .values({
        workspaceId: employee.workspaceId,
        employeeId,
        templateId,
        currentStep: 'personal_info',
        status: 'in_progress',
        completedSteps: [],
        progress: 0
      })
      .returning();

    res.json(application);
  } catch (error) {
    console.error("Error creating application:", error);
    res.status(500).json({ message: "Failed to create application" });
  }
});

router.patch('/api/onboarding/applications/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [updated] = await db.update(onboardingApplications)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(onboardingApplications.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating application:", error);
    res.status(500).json({ message: "Failed to update application" });
  }
});

// ============================================================================
// Onboarding Tasks
// ============================================================================

router.get('/api/onboarding/tasks/:applicationId', requireAuth, async (req: any, res) => {
  try {
    const { applicationId } = req.params;

    const tasks = await db.query.onboardingTasks.findMany({
      where: eq(onboardingTasks.applicationId, applicationId),
      orderBy: desc(onboardingTasks.createdAt)
    });

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

router.post('/api/onboarding/tasks', requireAuth, async (req: any, res) => {
  try {
    const { applicationId, title, description, dueDate, assignedTo } = req.body;

    const [task] = await db.insert(onboardingTasks)
      .values({
        applicationId,
        title,
        description,
        status: 'pending',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo
      })
      .returning();

    res.json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Failed to create task" });
  }
});

router.patch('/api/onboarding/tasks/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, completedBy, notes } = req.body;

    const [updated] = await db.update(onboardingTasks)
      .set({
        status,
        completedBy,
        completedAt: status === 'completed' ? new Date() : null,
        notes,
        updatedAt: new Date()
      })
      .where(eq(onboardingTasks.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
});

export default router;
