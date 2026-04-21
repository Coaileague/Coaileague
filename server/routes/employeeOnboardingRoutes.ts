/**
 * Employee Document Onboarding Routes
 * 
 * API endpoints for managing employee document requirements and work eligibility.
 * Security guards must complete critical documents before being assigned to shifts.
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../rbac';
import { storage } from '../storage';
import { db } from '../db';
import { employeeDocumentOnboardingService, SecurityPosition } from '../services/employeeDocumentOnboardingService';
import { createLogger } from '../lib/logger';
const log = createLogger('EmployeeOnboardingRoutes');


export const employeeOnboardingRoutes = Router();

// Get employee's own onboarding status (required documents, work eligibility)
employeeOnboardingRoutes.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const employee = await storage.getEmployeeByUserId(userId);
    
    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }
    
    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(employee.id);
    
    if (!status) {
      return res.status(404).json({ message: "Unable to fetch onboarding status" });
    }
    
    res.json(status);
  } catch (error: unknown) {
    log.error("Error fetching employee onboarding status:", error);
    res.status(500).json({ message: "Failed to fetch onboarding status" });
  }
});

// Get employee-specific required onboarding documents for checklist UI
employeeOnboardingRoutes.get('/required-documents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const employee = await storage.getEmployeeByUserId(userId);
    if (!employee) return res.json([]);

    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(employee.id);
    if (!status) return res.json([]);

    const docs = status.requirements.map((item) => ({
      id: item.requirement.id,
      displayName: item.requirement.name || item.requirement.documentType,
      category: item.requirement.category,
      required: true,
      status: item.status === 'approved' ? 'approved' : 'pending',
      uploadRoute: `/onboarding-forms?step=${item.requirement.id}`,
    }));

    res.json(docs);
  } catch (error: unknown) {
    log.error("Error fetching required onboarding documents:", error);
    res.status(500).json({ message: "Failed to fetch required documents" });
  }
});

// Get required documents list by position (before :employeeId route to avoid conflict)
employeeOnboardingRoutes.get('/requirements/:position', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { position } = req.params;
    const requirements = employeeDocumentOnboardingService.getRequiredDocuments(position as SecurityPosition);
    res.json(requirements);
  } catch (error: unknown) {
    log.error("Error fetching document requirements:", error);
    res.status(500).json({ message: "Failed to fetch requirements" });
  }
});

// Get specific employee's onboarding status (Manager view)
employeeOnboardingRoutes.get('/:employeeId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(employeeId);
    
    if (!status) {
      return res.status(404).json({ message: "Employee not found" });
    }
    
    res.json(status);
  } catch (error: unknown) {
    log.error("Error fetching employee onboarding status:", error);
    res.status(500).json({ message: "Failed to fetch onboarding status" });
  }
});

// Check employee work eligibility (Used by scheduling)
employeeOnboardingRoutes.get('/:employeeId/work-eligibility', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);
    res.json(eligibility);
  } catch (error: unknown) {
    log.error("Error checking work eligibility:", error);
    res.status(500).json({ message: "Failed to check work eligibility" });
  }
});

// Get workspace-wide onboarding overview (Manager dashboard)
employeeOnboardingRoutes.get('/workspace/:workspaceId/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const overview = await employeeDocumentOnboardingService.getWorkspaceOnboardingOverview(workspaceId);
    res.json(overview);
  } catch (error: unknown) {
    log.error("Error fetching workspace onboarding overview:", error);
    res.status(500).json({ message: "Failed to fetch onboarding overview" });
  }
});

// Trigger document requirement notifications for employee
employeeOnboardingRoutes.post('/:employeeId/notify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    await employeeDocumentOnboardingService.notifyDocumentRequired(employeeId);
    res.json({ success: true, message: "Notification sent" });
  } catch (error: unknown) {
    log.error("Error sending document notification:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

// Create onboarding tasks for employee
employeeOnboardingRoutes.post('/:employeeId/create-tasks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    await employeeDocumentOnboardingService.createOnboardingTasksForEmployee(employeeId);
    res.json({ success: true, message: "Onboarding tasks created" });
  } catch (error: unknown) {
    log.error("Error creating onboarding tasks:", error);
    res.status(500).json({ message: "Failed to create tasks" });
  }
});
