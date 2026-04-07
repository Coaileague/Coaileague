import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth, type AuthenticatedRequest, hasManagerAccess, resolveWorkspaceForUser, getUserPlatformRole, hasPlatformWideAccess } from "../rbac";
import { storage } from "../storage";
import { createLogger } from '../lib/logger';
const log = createLogger('BenefitRoutes');


const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const benefits = await storage.getEmployeeBenefitsByWorkspace(workspaceId);
    res.json(benefits);
  } catch (error) {
    log.error("Error fetching benefits:", error);
    res.status(500).json({ message: "Failed to fetch benefits" });
  }
});

router.get('/employee/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { employeeId } = req.params;
    const benefits = await storage.getEmployeeBenefitsByEmployee(employeeId, workspaceId);
    res.json(benefits);
  } catch (error) {
    log.error("Error fetching employee benefits:", error);
    res.status(500).json({ message: "Failed to fetch employee benefits" });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { insertEmployeeBenefitSchema } = await import("@shared/schema");
    
    const validated = insertEmployeeBenefitSchema.parse({
      ...req.body,
      workspaceId: workspaceId,
    });

    const benefit = await storage.createEmployeeBenefit(validated);
    res.status(201).json(benefit);
  } catch (error: unknown) {
    log.error("Error creating benefit:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create benefit" });
  }
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { id } = req.params;
    
    const { insertEmployeeBenefitSchema } = await import("@shared/schema");
    const validated = insertEmployeeBenefitSchema
      .partial()
      .omit({ workspaceId: true, employeeId: true })
      .parse(req.body);
    
    const updated = await storage.updateEmployeeBenefit(id, workspaceId, validated);
    
    if (!updated) {
      return res.status(404).json({ message: "Benefit not found" });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating benefit:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update benefit" });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { id } = req.params;
    const deleted = await storage.deleteEmployeeBenefit(id, workspaceId);
    
    if (!deleted) {
      return res.status(404).json({ message: "Benefit not found" });
    }

    res.json({ message: "Benefit deleted successfully" });
  } catch (error) {
    log.error("Error deleting benefit:", error);
    res.status(500).json({ message: "Failed to delete benefit" });
  }
});

export default router;
