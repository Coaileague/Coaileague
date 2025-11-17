/**
 * AutoForce™ Core Automation API Routes
 * 
 * Endpoints for triggering the three core automation workflows:
 * 1. AI Scheduling (with confidence scoring and approval queue)
 * 2. Automated Invoicing (anchor period close + Stripe)
 * 3. Automated Payroll (anchor period close + Gusto)
 * 
 * Plus: Migration wizard for importing external data via Gemini Vision
 */

import { Router, type Request, type Response } from 'express';
import { automationEngine } from '../services/automation-engine';
import { storage } from '../storage';
import { z } from 'zod';

export const automationRouter = Router();

// ============================================================================
// AI SCHEDULING AUTOMATION
// ============================================================================

/**
 * POST /api/automation/schedule/generate
 * Generate AI-optimized schedule with confidence scoring
 */
automationRouter.post('/schedule/generate', async (req: any, res: Response) => {
  try {
    const { startDate, endDate, requirements } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employees for workspace
    const employees = await storage.getAllEmployees(req.workspace.id);
    
    // Get existing shifts in date range to avoid conflicts
    const existingShifts = await storage.getShiftsByDateRange(
      req.workspace.id,
      new Date(startDate),
      new Date(endDate)
    );

    // Call automation engine
    const result = await automationEngine.generateSchedule(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        employees,
        existingShifts,
        requirements,
      }
    );

    return res.json({
      success: true,
      transactionId: result.transactionId,
      decision: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.overallConfidence,
      shifts: result.decision.shifts,
      conflicts: result.decision.conflicts,
    });

  } catch (error) {
    console.error('Schedule generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate schedule',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/automation/schedule/apply
 * Apply approved AI schedule to database
 */
automationRouter.post('/schedule/apply', async (req: any, res: Response) => {
  try {
    const { transactionId, shifts } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Apply schedule
    const result = await automationEngine.applySchedule(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      transactionId,
      shifts,
      req.user.id
    );

    return res.json({
      success: true,
      shiftIds: result.shiftIds,
      message: `Successfully created ${result.shiftIds.length} shifts`,
    });

  } catch (error) {
    console.error('Schedule apply error:', error);
    return res.status(500).json({
      error: 'Failed to apply schedule',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// AUTOMATED INVOICING
// ============================================================================

/**
 * POST /api/automation/invoice/generate
 * Generate invoice for a specific client (single)
 */
automationRouter.post('/invoice/generate', async (req: any, res: Response) => {
  try {
    const { clientId, startDate, endDate } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get client
    const client = await storage.getClient(clientId);
    if (!client || client.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get time entries for this client in date range (stubbed for now)
    const timeEntries: any[] = []; // TODO: Implement actual time entry lookup

    if (timeEntries.length === 0) {
      return res.status(400).json({
        error: 'No billable time found for this client in the specified period',
      });
    }

    // Generate invoice
    const result = await automationEngine.generateInvoice(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        clientId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        timeEntries,
        client,
      }
    );

    return res.json({
      success: true,
      transactionId: result.transactionId,
      invoice: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.confidence,
      total: result.decision.total,
      anomalies: result.decision.anomalies,
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate invoice',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/automation/invoice/anchor-close
 * Run anchor period close and generate ALL invoices (biweekly automation)
 */
automationRouter.post('/invoice/anchor-close', async (req: any, res: Response) => {
  try {
    const { anchorDate } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run anchor period invoicing
    const result = await automationEngine.runAnchorPeriodInvoicing(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        workspaceId: req.workspace.id,
        anchorDate: new Date(anchorDate),
      }
    );

    return res.json({
      success: true,
      invoices: result.invoices,
      requiresApproval: result.requiresApproval,
      stats: {
        total: result.invoices.length,
        autoApproved: result.invoices.filter(inv => !inv.requiresApproval).length,
        needsReview: result.requiresApproval.length,
        totalAmount: result.invoices.reduce((sum, inv) => sum + inv.total, 0),
      },
    });

  } catch (error) {
    console.error('Anchor period invoicing error:', error);
    return res.status(500).json({
      error: 'Failed to run anchor period invoicing',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// AUTOMATED PAYROLL
// ============================================================================

/**
 * POST /api/automation/payroll/generate
 * Generate payroll for a specific employee (single)
 */
automationRouter.post('/payroll/generate', async (req: any, res: Response) => {
  try {
    const { employeeId, startDate, endDate } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employee
    const employee = await storage.getEmployee(employeeId);
    if (!employee || employee.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get time entries for this employee in date range (stubbed for now)
    const timeEntries: any[] = []; // TODO: Implement actual time entry lookup

    if (timeEntries.length === 0) {
      return res.status(400).json({
        error: 'No time entries found for this employee in the specified period',
      });
    }

    // Generate payroll
    const result = await automationEngine.generatePayroll(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        employeeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        timeEntries,
        employee,
      }
    );

    return res.json({
      success: true,
      transactionId: result.transactionId,
      payroll: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.confidence,
      netPay: result.decision.netPay,
      warnings: result.decision.warnings,
    });

  } catch (error) {
    console.error('Payroll generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate payroll',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/automation/payroll/anchor-close
 * Run anchor period close and generate ALL payroll (biweekly automation)
 */
automationRouter.post('/payroll/anchor-close', async (req: any, res: Response) => {
  try {
    const { anchorDate } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run anchor period payroll
    const result = await automationEngine.runAnchorPeriodPayroll(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        workspaceId: req.workspace.id,
        anchorDate: new Date(anchorDate),
      }
    );

    return res.json({
      success: true,
      payrolls: result.payrolls,
      requiresApproval: result.requiresApproval,
      stats: {
        total: result.payrolls.length,
        autoApproved: result.payrolls.filter(p => !p.requiresApproval).length,
        needsReview: result.requiresApproval.length,
        totalPayroll: result.payrolls.reduce((sum, p) => sum + p.netPay, 0),
      },
    });

  } catch (error) {
    console.error('Anchor period payroll error:', error);
    return res.status(500).json({
      error: 'Failed to run anchor period payroll',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// MIGRATION WIZARD (Gemini Vision)
// ============================================================================

/**
 * POST /api/automation/migrate/schedule
 * Extract schedule data from uploaded image/PDF using Gemini Vision
 */
automationRouter.post('/migrate/schedule', async (req: any, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({
        error: 'Missing required fields: imageBase64 and mimeType',
      });
    }

    // Extract schedule from image
    const result = await automationEngine.extractScheduleFromImage(
      {
        actorId: req.user.id,
        actorType: 'END_USER',
        actorName: req.user.name || undefined,
        workspaceId: req.workspace.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        imageBase64,
        mimeType,
        workspaceId: req.workspace.id,
      }
    );

    return res.json({
      success: true,
      extracted: result,
      stats: {
        employees: result.employees.length,
        shifts: result.shifts.length,
        confidence: result.confidence,
        warnings: result.warnings,
      },
    });

  } catch (error) {
    console.error('Schedule migration error:', error);
    return res.status(500).json({
      error: 'Failed to extract schedule from image',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/automation/status
 * Get automation system health and recent activity
 */
automationRouter.get('/status', async (req: any, res: Response) => {
  try {
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get recent automation events from audit log
    const recentEvents = await storage.getAuditEvents({
      workspaceId: req.workspace.id,
      actorType: 'AI_AGENT',
      limit: 50,
    });

    // Group by event type
    const stats = recentEvents.reduce((acc, event) => {
      const type = event.eventType;
      if (!acc[type]) {
        acc[type] = { count: 0, lastRun: event.timestamp };
      }
      acc[type].count++;
      if (event.timestamp && (!acc[type].lastRun || event.timestamp > acc[type].lastRun)) {
        acc[type].lastRun = event.timestamp;
      }
      return acc;
    }, {} as Record<string, { count: number; lastRun: Date | null }>);

    return res.json({
      success: true,
      status: 'operational',
      recentActivity: stats,
      totalEvents: recentEvents.length,
    });

  } catch (error) {
    console.error('Automation status error:', error);
    return res.status(500).json({
      error: 'Failed to get automation status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
