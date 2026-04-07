import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { readLimiter } from "../middleware/rateLimiter";
import { requireManager, requireSysop, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { breaksService } from "../services/breaksService";
import { createLogger } from '../lib/logger';
const log = createLogger('BreakRoutes');


const router = Router();

  router.get('/jurisdiction', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const jurisdiction = (req.query.state as string) || 'CA';
      const breaksService = (await import('../services/breaksService')).breaksService;
      const rules = await breaksService.getLaborLawRulesByJurisdiction(jurisdiction);
      res.json(rules);
    } catch (error) {
      log.error('Breaks jurisdiction error:', error);
      res.json([]);
    }
  });

router.get("/status/:employeeId", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;

    const status = await breaksService.getBreakStatus(workspaceId, employeeId);

    if (!status) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ success: true, data: status });
  } catch (error: unknown) {
    log.error('Error fetching break status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/workspace-status", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const statuses = await breaksService.getWorkspaceBreakStatus(workspaceId);

    res.json({ 
      success: true, 
      data: statuses,
      summary: {
        onBreak: statuses.filter(s => s.currentStatus === 'on-break').length,
        idle: statuses.filter(s => s.currentStatus === 'idle').length,
        working: statuses.filter(s => s.currentStatus === 'not-on-break').length,
      }
    });
  } catch (error: unknown) {
    log.error('Error fetching workspace break status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/compliance-report", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const report = await breaksService.getBreakComplianceReport(workspaceId);

    res.json({ 
      success: true, 
      data: report,
      percentCompliant: Math.round((report.compliant / report.totalEmployees) * 100),
    });
  } catch (error: unknown) {
    log.error('Error fetching break compliance report:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/rules", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const rules = await breaksService.getAllLaborLawRules();
    res.json({ success: true, data: rules });
  } catch (error: unknown) {
    log.error('Error fetching labor law rules:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/rules/workspace", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const rules = await breaksService.getWorkspaceLaborLawRules(workspaceId);
    res.json({ success: true, data: rules });
  } catch (error: unknown) {
    log.error('Error fetching workspace labor law rules:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/rules/:jurisdiction", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { jurisdiction } = req.params;
    const rules = await breaksService.getLaborLawRulesByJurisdiction(jurisdiction);
    if (!rules) {
      return res.status(404).json({ error: 'Jurisdiction not found' });
    }
    res.json({ success: true, data: rules });
  } catch (error: unknown) {
    log.error('Error fetching jurisdiction rules:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/calculate", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftStart, shiftEnd, jurisdiction } = req.body;

    if (!shiftStart || !shiftEnd) {
      return res.status(400).json({ error: 'shiftStart and shiftEnd are required' });
    }

    let rules;
    if (jurisdiction) {
      rules = await breaksService.getLaborLawRulesByJurisdiction(jurisdiction);
      if (!rules) {
        return res.status(404).json({ error: 'Jurisdiction not found' });
      }
    } else {
      rules = await breaksService.getWorkspaceLaborLawRules(workspaceId);
    }

    const calculation = breaksService.calculateRequiredBreaks(
      new Date(shiftStart),
      new Date(shiftEnd),
      rules
    );
    res.json({ success: true, data: calculation });
  } catch (error: unknown) {
    log.error('Error calculating breaks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/auto-schedule", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftId, optimizeForCoverage, otherShiftIds } = req.body;

    if (!shiftId) {
      return res.status(400).json({ error: 'shiftId is required' });
    }

    const scheduledBreaks = await breaksService.autoScheduleBreaks(
      workspaceId,
      shiftId,
      { optimizeForCoverage, otherShiftIds }
    );

    res.json({ 
      success: true, 
      data: scheduledBreaks,
      message: `${scheduledBreaks.length} break(s) scheduled successfully`
    });
  } catch (error: unknown) {
    log.error('Error auto-scheduling breaks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/auto-schedule/bulk", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftIds, optimizeForCoverage } = req.body;

    if (!shiftIds || !Array.isArray(shiftIds) || shiftIds.length === 0) {
      return res.status(400).json({ error: 'shiftIds array is required' });
    }

    // Bulk auto-scheduling is a Business-tier feature
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const wsTier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(wsTier, 'business')) {
      return res.status(402).json({ error: 'Bulk break auto-scheduling requires the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
    }

    const results = [];
    for (const shiftId of shiftIds) {
      try {
        const breaks = await breaksService.autoScheduleBreaks(
          workspaceId,
          shiftId,
          { optimizeForCoverage, otherShiftIds: shiftIds.filter(id => id !== shiftId) }
        );
        results.push({ shiftId, success: true, breaks });
      } catch (error: unknown) {
        results.push({ shiftId, success: false, error: sanitizeError(error) });
      }
    }

    res.json({ 
      success: true, 
      data: results,
      summary: {
        total: shiftIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      }
    });
  } catch (error: unknown) {
    log.error('Error bulk auto-scheduling breaks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/compliance", requireManager, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const compliance = await breaksService.checkShiftCompliance(workspaceId, start, end);

    const compliantCount = compliance.filter(c => c.isCompliant).length;
    const nonCompliantCount = compliance.filter(c => !c.isCompliant).length;

    res.json({ 
      success: true, 
      data: compliance,
      summary: {
        total: compliance.length,
        compliant: compliantCount,
        nonCompliant: nonCompliantCount,
        complianceRate: compliance.length > 0 
          ? Math.round((compliantCount / compliance.length) * 100) 
          : 100,
      }
    });
  } catch (error: unknown) {
    log.error('Error checking shift compliance:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/shift/:shiftId", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftId } = req.params;

    const breaks = await breaksService.getScheduledBreaksForShift(workspaceId, shiftId);
    res.json({ success: true, data: breaks });
  } catch (error: unknown) {
    log.error('Error fetching shift breaks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.patch("/jurisdiction", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { jurisdiction } = req.body;

    if (!jurisdiction) {
      return res.status(400).json({ error: 'jurisdiction is required' });
    }

    // Validate jurisdiction exists
    const rules = await breaksService.getLaborLawRulesByJurisdiction(jurisdiction);
    if (!rules) {
      return res.status(404).json({ error: 'Invalid jurisdiction code' });
    }

    const updated = await breaksService.updateWorkspaceJurisdiction(workspaceId, jurisdiction);

    res.json({ 
      success: true, 
      data: {
        laborLawJurisdiction: updated.laborLawJurisdiction,
        rules,
      },
      message: `Jurisdiction updated to ${rules.jurisdictionName}`
    });
  } catch (error: unknown) {
    log.error('Error updating jurisdiction:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/seed-rules", requireAuth, requireSysop, async (req: AuthenticatedRequest, res) => {
  try {

    const seededCount = await breaksService.seedLaborLawRules();

    res.json({ 
      success: true, 
      message: `${seededCount} labor law rules seeded successfully`
    });
  } catch (error: unknown) {
    log.error('Error seeding labor law rules:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
