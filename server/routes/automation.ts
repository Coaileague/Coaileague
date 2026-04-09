/**
 * CoAIleague Core Automation API Routes
 * 
 * Endpoints for triggering the three core automation workflows:
 * 1. AI Scheduling (with confidence scoring and approval queue)
 * 2. Automated Invoicing (anchor period close + Stripe)
 * 3. Automated Payroll (anchor period close + Gusto)
 * 
 * Plus: Migration wizard for importing external data via Gemini Vision
 */

import { setupAuth, requireAuth } from '../auth';
import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response } from 'express';
import { automationEngine } from '../services/automation-engine';
import { storage } from '../storage';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { db } from '../db';
import { employees, auditLogs } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { createNotification } from '../services/notificationService';
import { platformEventBus } from '../services/platformEventBus';
import { withCredits } from '../services/billing/creditWrapper';
import { ComplianceMonitoringService } from '../services/complianceMonitoring';
import { shiftMonitoringService } from '../services/automation/shiftMonitoringService';
import { loneWorkerSafetyService } from '../services/automation/loneWorkerSafetyService';
import { trinityAutomationToggle } from '../services/automation/trinityAutomationToggle';
import { photoGeofenceService } from '../services/photoGeofenceService';
import { quickbooksReceiptService } from '../services/quickbooksReceiptService';
import { createLogger } from '../lib/logger';
const log = createLogger('Automation');


export const automationRouter = Router();

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

const scheduleGenerateSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  requirements: z.string().optional(),
});

const scheduleApplySchema = z.object({
  transactionId: z.string().min(1),
  shifts: z.array(z.object({
    employeeId: z.string(),
    clientId: z.string().nullable().optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    role: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
});

const invoiceGenerateSchema = z.object({
  anchorDate: z.string().datetime(),
  clientId: z.string().optional(),
});

const invoiceApplySchema = z.object({
  transactionId: z.string().min(1),
  invoices: z.array(z.object({
    clientId: z.string(),
    lineItems: z.array(z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      amount: z.number(),
    })),
    totalAmount: z.number(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
});

const payrollGenerateSchema = z.object({
  anchorDate: z.string().datetime(),
});

const payrollApplySchema = z.object({
  transactionId: z.string().min(1),
  payrollItems: z.array(z.object({
    employeeId: z.string(),
    regularHours: z.number(),
    overtimeHours: z.number(),
    regularPay: z.number(),
    overtimePay: z.number(),
    totalPay: z.number(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
});

const migrationWizardSchema = z.object({
  imageBase64: z.string().min(1),
  extractionType: z.enum(['schedule', 'clients', 'payroll']),
});

// ============================================================================
// AI SCHEDULING AUTOMATION
// ============================================================================

/**
 * POST /api/automation/schedule/generate
 * Generate AI-optimized schedule with confidence scoring
 */
automationRouter.post('/schedule/generate', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = scheduleGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { startDate, endDate, requirements } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employees for workspace
    const employees = await storage.getEmployeesByWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId));
    
    // Get existing shifts in date range to avoid conflicts
    const existingShifts = await storage.getShiftsByWorkspace(
      (req.workspaceId || (req as any).user?.currentWorkspaceId),
      new Date(startDate),
      new Date(endDate)
    );

    // Call automation engine WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        featureKey: 'ai_scheduling',
        description: `Generated AI schedule from ${startDate} to ${endDate}`,
        userId: req.user?.id,
      },
      async () => {
        return await automationEngine.generateSchedule(
          {
            actorId: req.user?.id,
            actorType: 'END_USER',
            actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
            workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
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
      }
    );

    // Handle insufficient credits
    if (!creditResult.success) {
      if (creditResult.insufficientCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: creditResult.error,
          required: 25, // AI scheduling cost
        });
      }
      return res.status(500).json({
        error: 'Schedule generation failed',
        message: creditResult.error,
      });
    }

    const result = creditResult.result!;

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId), { type: 'schedules_updated' });
    } catch (e: unknown) { log.warn('[Automation] Broadcast failed:', e.message); }

    const _wsId1 = req.workspaceId || (req as any).user?.currentWorkspaceId;
    platformEventBus.publish({
      type: 'schedule_published',
      category: 'automation',
      title: 'AI Schedule Generated',
      description: 'AI Brain generated schedule — pending manager review',
      workspaceId: _wsId1,
      userId: req.user?.id,
      metadata: { source: 'ai_automation', transactionId: result.transactionId, requiresApproval: result.decision?.requiresApproval },
      visibility: 'manager',
    }).catch((err: unknown) => {
      log.warn('[Automation] Schedule activity log notification failed (non-fatal):', (err as any)?.message);
    });

    return res.json({
      success: true,
      transactionId: result.transactionId,
      decision: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.overallConfidence,
      shifts: result.decision.shifts,
      conflicts: result.decision.conflicts,
      creditsDeducted: creditResult.creditsDeducted,
    });

  } catch (error) {
    log.error('Schedule generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate schedule',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

/**
 * POST /api/automation/schedule/apply
 * Apply approved AI schedule to database
 */
automationRouter.post('/schedule/apply', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = scheduleApplySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { transactionId, shifts } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Apply schedule
    const result = await automationEngine.applySchedule(
      {
        actorId: req.user?.id,
        actorType: 'END_USER',
        actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      transactionId,
      shifts,
      req.user?.id
    );

    return res.json({
      success: true,
      shiftIds: result.shiftIds,
      message: `Successfully created ${result.shiftIds.length} shifts`,
    });

  } catch (error) {
    log.error('Schedule apply error:', error);
    return res.status(500).json({
      error: 'Failed to apply schedule',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

// ============================================================================
// AUTOMATED INVOICING
// ============================================================================

// Single invoice generation schema
const singleInvoiceGenerateSchema = z.object({
  clientId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Single payroll generation schema
const singlePayrollGenerateSchema = z.object({
  employeeId: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

/**
 * POST /api/automation/invoice/generate
 * Generate invoice for a specific client (single)
 */
automationRouter.post('/invoice/generate', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = singleInvoiceGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { clientId, startDate, endDate } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get client
    const client = await storage.getClient(clientId, (req.workspaceId || (req as any).user?.currentWorkspaceId));
    if (!client || client.workspaceId !== (req.workspaceId || (req as any).user?.currentWorkspaceId)) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get unbilled time entries for this client
    const timeEntries = await storage.getUnbilledTimeEntries((req.workspaceId || (req as any).user?.currentWorkspaceId), clientId);

    if (timeEntries.length === 0) {
      return res.status(400).json({
        error: 'No billable time found for this client in the specified period',
      });
    }

    // Generate invoice WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        featureKey: 'ai_invoice_generation',
        description: `Generated AI invoice for client ${clientId} (${startDate} to ${endDate})`,
        userId: req.user?.id,
      },
      async () => {
        return await automationEngine.generateInvoice(
          {
            actorId: req.user?.id,
            actorType: 'END_USER',
            actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
            workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
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
      }
    );

    // Handle insufficient credits
    if (!creditResult.success) {
      if (creditResult.insufficientCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: creditResult.error,
          required: 15, // AI invoicing cost
        });
      }
      return res.status(500).json({
        error: 'Invoice generation failed',
        message: creditResult.error,
      });
    }

    const result = creditResult.result!;

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId), { type: 'invoices_updated' });
    } catch (e: unknown) { log.warn('[Automation] Broadcast failed:', e.message); }

    const _wsId2 = req.workspaceId || (req as any).user?.currentWorkspaceId;
    platformEventBus.publish({
      type: 'invoice_created',
      category: 'automation',
      title: 'AI Invoice Generated',
      description: `AI Brain generated invoice — $${result.decision?.total || 0} — pending review`,
      workspaceId: _wsId2,
      userId: req.user?.id,
      metadata: { source: 'ai_automation', transactionId: result.transactionId, total: result.decision?.total, requiresApproval: result.decision?.requiresApproval },
      visibility: 'manager',
    }).catch((err: unknown) => {
      log.warn('[Automation] Invoice activity log notification failed (non-fatal):', sanitizeError(err));
    });

    return res.json({
      success: true,
      transactionId: result.transactionId,
      invoice: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.confidence,
      total: result.decision.total,
      anomalies: result.decision.anomalies,
      creditsDeducted: creditResult.creditsDeducted,
    });

  } catch (error) {
    log.error('Invoice generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate invoice',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

/**
 * POST /api/automation/invoice/anchor-close
 * Run anchor period close and generate ALL invoices (biweekly automation)
 */
automationRouter.post('/invoice/anchor-close', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = invoiceGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { anchorDate } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run anchor period invoicing
    const result = await automationEngine.runAnchorPeriodInvoicing(
      {
        actorId: req.user?.id,
        actorType: 'END_USER',
        actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        anchorDate: new Date(anchorDate),
      }
    );

    // Send completion notifications to org leaders
    if (result.invoices.length > 0) {
      try {
        const orgLeaders = await db.select()
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, (req.workspaceId || (req as any).user?.currentWorkspaceId)),
              sql`(${employees.workspaceRole} IN ('org_owner', 'co_owner', 'department_manager'))`
            )
          );
        
        const totalAmount = result.invoices.reduce((sum, inv) => sum + inv.total, 0);
        const needsReview = result.requiresApproval.length;
        
        for (const leader of orgLeaders) {
          if (leader.userId) {
            await createNotification({
              workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
              userId: leader.userId,
              type: 'system',
              title: 'Invoices Generated by AI Brain',
              message: `AI Brain generated ${result.invoices.length} invoice(s) totaling $${totalAmount.toFixed(2)}${needsReview > 0 ? `. ${needsReview} require review.` : '. All auto-approved.'}`,
              actionUrl: '/invoices',
              relatedEntityType: 'workspace',
              relatedEntityId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
              metadata: { 
                invoicesGenerated: result.invoices.length,
                totalAmount,
                needsReview,
                anchorDate,
              },
              createdBy: 'system-coaileague',
            });
          }
        }
        log.info(`   🔔 Notified ${orgLeaders.length} leader(s) about invoice generation`);
      } catch (notifError) {
        log.warn(`   ⚠️  Failed to send notifications:`, notifError);
      }
    }

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId), { type: 'invoices_updated' });
    } catch (e: unknown) { log.warn('[Automation] Broadcast failed:', e.message); }

    const _wsId3 = req.workspaceId || (req as any).user?.currentWorkspaceId;
    platformEventBus.publish({
      type: 'invoice_created',
      category: 'automation',
      title: 'AI Batch Invoices Generated',
      description: `AI Brain anchor-close generated ${result.invoices?.length || 0} invoice(s)`,
      workspaceId: _wsId3,
      userId: req.user?.id,
      metadata: { source: 'ai_automation_anchor', count: result.invoices?.length, requiresApproval: result.requiresApproval },
      visibility: 'manager',
    }).catch((err: unknown) => {
      log.warn('[Automation] Batch invoice activity log notification failed (non-fatal):', (err as any)?.message);
    });

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
    log.error('Anchor period invoicing error:', error);
    return res.status(500).json({
      error: 'Failed to run anchor period invoicing',
      message: error instanceof Error ? sanitizeError(error) : String(error),
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
automationRouter.post('/payroll/generate', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = singlePayrollGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { employeeId, startDate, endDate } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employee
    const employee = await storage.getEmployee(employeeId, (req.workspaceId || (req as any).user?.currentWorkspaceId));
    if (!employee || employee.workspaceId !== (req.workspaceId || (req as any).user?.currentWorkspaceId)) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get time entries for this employee in date range
    const timeEntries = await storage.getTimeEntriesByEmployeeAndDateRange(
      (req.workspaceId || (req as any).user?.currentWorkspaceId),
      employeeId,
      new Date(startDate),
      new Date(endDate)
    );

    if (timeEntries.length === 0) {
      return res.status(400).json({
        error: 'No time entries found for this employee in the specified period',
      });
    }

    // Generate payroll WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        featureKey: 'ai_payroll_processing',
        description: `Generated AI payroll for employee ${employeeId} (${startDate} to ${endDate})`,
        userId: req.user?.id,
      },
      async () => {
        return await automationEngine.generatePayroll(
          {
            actorId: req.user?.id,
            actorType: 'END_USER',
            actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
            workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
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
      }
    );

    // Handle insufficient credits
    if (!creditResult.success) {
      if (creditResult.insufficientCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: creditResult.error,
          required: 15, // AI payroll cost
        });
      }
      return res.status(500).json({
        error: 'Payroll generation failed',
        message: creditResult.error,
      });
    }

    const result = creditResult.result!;

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId), { type: 'payroll_updated' });
    } catch (e: unknown) { log.warn('[Automation] Broadcast failed:', e.message); }

    const _wsId4 = req.workspaceId || (req as any).user?.currentWorkspaceId;
    platformEventBus.publish({
      type: 'payroll_run_created',
      category: 'automation',
      title: 'AI Payroll Run Created',
      description: `AI Brain generated payroll run — $${result.decision?.netPay || 0} net — pending review`,
      workspaceId: _wsId4,
      userId: req.user?.id,
      metadata: { source: 'ai_automation', transactionId: result.transactionId, netPay: result.decision?.netPay, requiresApproval: result.decision?.requiresApproval },
      visibility: 'manager',
    }).catch((err: unknown) => {
      log.warn('[Automation] Payroll activity log notification failed (non-fatal):', (err as any)?.message);
    });

    return res.json({
      success: true,
      transactionId: result.transactionId,
      payroll: result.decision,
      requiresApproval: result.decision.requiresApproval,
      confidence: result.decision.confidence,
      netPay: result.decision.netPay,
      warnings: result.decision.warnings,
      creditsDeducted: creditResult.creditsDeducted,
    });

  } catch (error) {
    log.error('Payroll generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate payroll',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

/**
 * POST /api/automation/payroll/anchor-close
 * Run anchor period close and generate ALL payroll (biweekly automation)
 */
automationRouter.post('/payroll/anchor-close', requireAuth, async (req: any, res: Response) => {
  try {
    // Validate request body
    const validationResult = payrollGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { anchorDate } = validationResult.data;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run anchor period payroll
    const result = await automationEngine.runAnchorPeriodPayroll(
      {
        actorId: req.user?.id,
        actorType: 'END_USER',
        actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        anchorDate: new Date(anchorDate),
      }
    );

    // Send completion notifications to org leaders
    if (result.payrolls.length > 0) {
      try {
        const orgLeaders = await db.select()
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, (req.workspaceId || (req as any).user?.currentWorkspaceId)),
              sql`(${employees.workspaceRole} IN ('org_owner', 'co_owner', 'department_manager'))`
            )
          );
        
        const totalPayroll = result.payrolls.reduce((sum, p) => sum + p.netPay, 0);
        const needsReview = result.requiresApproval.length;
        
        for (const leader of orgLeaders) {
          if (leader.userId) {
            await createNotification({
              workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
              userId: leader.userId,
              type: 'system',
              title: 'Payroll Processed by AI Brain',
              message: `AI Brain processed payroll for ${result.payrolls.length} employee(s) totaling $${totalPayroll.toFixed(2)}${needsReview > 0 ? `. ${needsReview} require review.` : '. All auto-approved.'}`,
              actionUrl: '/payroll',
              relatedEntityType: 'workspace',
              relatedEntityId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
              metadata: { 
                payrollsProcessed: result.payrolls.length,
                totalPayroll,
                needsReview,
                anchorDate,
              },
              createdBy: 'system-coaileague',
            });
          }
        }
        log.info(`   🔔 Notified ${orgLeaders.length} leader(s) about payroll processing`);
      } catch (notifError) {
        log.warn(`   ⚠️  Failed to send notifications:`, notifError);
      }
    }

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId), { type: 'payroll_updated' });
    } catch (e: unknown) { log.warn('[Automation] Broadcast failed:', e.message); }

    const _wsId5 = req.workspaceId || (req as any).user?.currentWorkspaceId;
    platformEventBus.publish({
      type: 'payroll_run_created',
      category: 'automation',
      title: 'AI Batch Payroll Generated',
      description: `AI Brain anchor-close processed ${result.payrolls?.length || 0} payroll run(s)`,
      workspaceId: _wsId5,
      userId: req.user?.id,
      metadata: { source: 'ai_automation_anchor', count: result.payrolls?.length, requiresApproval: result.requiresApproval },
      visibility: 'manager',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

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
    log.error('Anchor period payroll error:', error);
    return res.status(500).json({
      error: 'Failed to run anchor period payroll',
      message: error instanceof Error ? sanitizeError(error) : String(error),
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
automationRouter.post('/migrate/schedule', requireAuth, async (req: any, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body;
    
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
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
        actorId: req.user?.id,
        actorType: 'END_USER',
        actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : undefined,
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
      {
        imageBase64,
        mimeType,
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
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
    log.error('Schedule migration error:', error);
    return res.status(500).json({
      error: 'Failed to extract schedule from image',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

/**
 * GET /api/automation/status
 * Get automation system health and recent activity
 */
automationRouter.get('/status', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get recent automation events from audit log
    const recentEvents = await storage.getAuditEvents({
      workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      actorType: 'AI_AGENT',
      limit: 100,
    });

    // Calculate stats for each automation type
    const schedulingEvents = recentEvents.filter(e => (e as any).eventType?.includes('(schedule as any)') || (e as any).eventType?.includes('shift'));
    const invoicingEvents = recentEvents.filter(e => (e as any).eventType?.includes('invoice'));
    const payrollEvents = recentEvents.filter(e => (e as any).eventType?.includes('payroll'));
    const complianceEvents = recentEvents.filter(e => (e as any).eventType?.includes('compliance'));
    
    const calcSuccessRate = (events: any[]) => {
      if (events.length === 0) return 0;
      const successful = events.filter(e => e.success !== false).length;
      return successful / events.length;
    };

    const getLastRun = (events: any[]) => {
      if (events.length === 0) return null;
      // Create copy before sorting to avoid mutating cached data
      const eventsCopy = [...events];
      const sorted = eventsCopy.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      return sorted[0]?.timestamp ? new Date(sorted[0].timestamp).toISOString() : null;
    };

    // Get issue count from last compliance scan metadata
    const getIssueCount = (events: any[]) => {
      if (events.length === 0) return 0;
      const eventsCopy = [...events];
      const sorted = eventsCopy.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      return sorted[0]?.metadata?.totalIssues || 0;
    };

    return res.json({
      scheduling: {
        enabled: true, // Always enabled for autonomous system
        lastRun: getLastRun(schedulingEvents),
        nextRun: null, // Could be calculated from workspace schedule settings
        successRate: calcSuccessRate(schedulingEvents),
      },
      invoicing: {
        enabled: true,
        lastRun: getLastRun(invoicingEvents),
        nextRun: null,
        successRate: calcSuccessRate(invoicingEvents),
      },
      payroll: {
        enabled: true,
        lastRun: getLastRun(payrollEvents),
        nextRun: null,
        successRate: calcSuccessRate(payrollEvents),
      },
      compliance: {
        enabled: true, // Now fully functional
        lastRun: getLastRun(complianceEvents),
        issuesDetected: getIssueCount(complianceEvents),
      },
    });

  } catch (error) {
    log.error('Automation status error:', error);
    return res.status(500).json({
      error: 'Failed to get automation status',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

// ============================================================================
// COMPLIANCE MONITORING AUTOMATION
// ============================================================================

/**
 * POST /api/automation/compliance/scan
 * Run comprehensive compliance scan and flag issues
 */
automationRouter.post('/compliance/scan', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run compliance scan WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        featureKey: 'ai_general', // Use general AI feature for now
        description: 'Compliance monitoring scan',
        userId: req.user?.id,
      },
      async () => {
        return await ComplianceMonitoringService.scanWorkspace((req.workspaceId || (req as any).user?.currentWorkspaceId));
      }
    );

    // Handle insufficient credits - MUST return error response
    if (!creditResult.success) {
      if (creditResult.insufficientCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: creditResult.error || 'Not enough credits to run compliance scan',
          required: 10, // Compliance scan cost
        });
      }
      // Other errors
      return res.status(500).json({
        error: 'Compliance scan failed',
        message: creditResult.error || 'Unknown error',
      });
    }

    const issues = creditResult.result!;
    const summary = ComplianceMonitoringService.getIssueSummary(issues);
    const grouped = ComplianceMonitoringService.groupIssuesByType(issues);

    // Create audit event for compliance scan
    await storage.createAuditEvent({
      workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      actorId: req.user?.id,
      actorType: 'AI_AGENT',
      actorName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : 'AI Brain',
      aggregateId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      aggregateType: 'workspace',
      eventType: 'compliance_scan_completed',
      payload: { 
        totalIssues: issues.length,
        summary,
        scannedAt: new Date().toISOString(),
      },
      metadata: {},
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    // Create notifications for critical issues
    if (summary.critical > 0) {
      await createNotification({
        workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
        userId: req.user?.id,
        title: `⚠️ ${summary.critical} Critical Compliance Issues Detected`,
        message: `Compliance scan found ${summary.critical} critical issues requiring immediate attention.`,
        type: 'issue_detected',
        metadata: { issueCount: summary.critical },
      });
    }

    // Return structured summary as promised on landing page
    return res.json({
      success: true,
      totalIssues: issues.length,
      summary,
      issues: grouped,
      scannedAt: new Date().toISOString(),
    });

  } catch (error) {
    log.error('Compliance scan error:', error);
    return res.status(500).json({
      error: 'Failed to run compliance scan',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

/**
 * GET /api/automation/compliance/recent
 * Get recent compliance issues for dashboard display
 */
automationRouter.get('/compliance/recent', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wsId = req.workspaceId || (req as any).user?.currentWorkspaceId;
    const recentScans = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.workspaceId, wsId),
        eq(auditLogs.rawAction, 'compliance_scan_completed'),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (recentScans.length === 0) {
      return res.json({
        hasData: false,
        lastScan: null,
        issues: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      });
    }

    const lastScan = recentScans[0];
    const metadata = lastScan.metadata as any;

    return res.json({
      hasData: true,
      lastScan: lastScan.createdAt,
      issues: [],
      summary: metadata?.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    });

  } catch (error) {
    log.error('Recent compliance fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch compliance data',
      message: error instanceof Error ? sanitizeError(error) : String(error),
    });
  }
});

// ============================================================================
// SHIFT MONITORING SERVICE
// ============================================================================

// RBAC helper for automation endpoints
const AUTOMATION_ADMIN_ROLES = ['org_owner', 'co_owner', 'root_admin', 'platform_admin', 'department_manager'];

/**
 * Check if user has automation admin permissions
 * Dynamically resolves workspace role to handle promoted users
 */
async function isAutomationAdmin(userId: string, workspaceId: string): Promise<boolean> {
  if (!userId || !workspaceId) return false;
  
  // Import resolveWorkspaceForUser dynamically to avoid circular deps
  const { resolveWorkspaceForUser } = await import('../rbac');
  
  // Resolve the user's actual role for this workspace (checks ownership + employee record)
  const { role } = await resolveWorkspaceForUser(userId, workspaceId);
  
  if (!role) return false;
  return AUTOMATION_ADMIN_ROLES.includes(role);
}

// Validation schemas for automation endpoints
const automationRequestSchema = z.object({
  feature: z.enum(['scheduling', 'invoicing', 'payroll', 'time_tracking', 'shift_monitoring', 'quickbooks_sync']),
  context: z.record(z.any()).optional(),
});

const photoValidationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  shiftId: z.string().optional(),
  photoType: z.enum(['clock_in', 'clock_out', 'site_check', 'incident', 'task_completion']).optional(),
  photoData: z.string().optional(),
});

/**
 * GET /api/automation/shift-monitoring/status
 * Get shift monitoring service status
 */
automationRouter.get('/shift-monitoring/status', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Requires org admin or owner role' });
    }

    const status = shiftMonitoringService.getStatus();
    return res.json(status);
  } catch (error) {
    log.error('Shift monitoring status error:', error);
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * POST /api/automation/shift-monitoring/start
 * Start shift monitoring service (platform admin only)
 */
automationRouter.post('/shift-monitoring/start', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Requires org admin or owner role' });
    }

    await shiftMonitoringService.start();
    return res.json({ success: true, message: 'Shift monitoring started' });
  } catch (error) {
    log.error('Shift monitoring start error:', error);
    return res.status(500).json({ error: 'Failed to start monitoring' });
  }
});

/**
 * POST /api/automation/shift-monitoring/stop
 * Stop shift monitoring service
 */
automationRouter.post('/shift-monitoring/stop', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Requires org admin or owner role' });
    }

    shiftMonitoringService.stop();
    return res.json({ success: true, message: 'Shift monitoring stopped' });
  } catch (error) {
    log.error('Shift monitoring stop error:', error);
    return res.status(500).json({ error: 'Failed to stop monitoring' });
  }
});

/**
 * POST /api/automation/shift-monitoring/run-cycle
 * Manually trigger a monitoring cycle
 */
automationRouter.post('/shift-monitoring/run-cycle', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Requires org admin or owner role' });
    }

    const result = await shiftMonitoringService.runMonitoringCycle();
    return res.json({ success: true, result });
  } catch (error) {
    log.error('Shift monitoring cycle error:', error);
    return res.status(500).json({ error: 'Failed to run monitoring cycle' });
  }
});

// ============================================================================
// LONE WORKER SAFETY TIMER
// ============================================================================

automationRouter.post('/lone-worker-safety/start', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) return res.status(403).json({ error: 'Requires org admin or owner role' });

    await loneWorkerSafetyService.start();
    return res.json({ success: true, message: 'Lone worker safety monitoring started' });
  } catch (error) {
    log.error('Lone worker safety start error:', error);
    return res.status(500).json({ error: 'Failed to start lone worker safety' });
  }
});

automationRouter.post('/lone-worker-safety/stop', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) return res.status(403).json({ error: 'Requires org admin or owner role' });

    loneWorkerSafetyService.stop();
    return res.json({ success: true, message: 'Lone worker safety monitoring stopped' });
  } catch (error) {
    log.error('Lone worker safety stop error:', error);
    return res.status(500).json({ error: 'Failed to stop lone worker safety' });
  }
});

automationRouter.get('/lone-worker-safety/status', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const status = loneWorkerSafetyService.getStatus();
    return res.json({ success: true, ...status });
  } catch (error) {
    log.error('Lone worker safety status error:', error);
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

automationRouter.post('/lone-worker-safety/acknowledge', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { checkId, employeeId } = req.body;
    if (!checkId || !employeeId) {
      return res.status(400).json({ error: 'checkId and employeeId are required' });
    }
    const result = await loneWorkerSafetyService.acknowledgeWelfareCheck(checkId, employeeId);
    return res.json({ success: result });
  } catch (error) {
    log.error('Lone worker ack error:', error);
    return res.status(500).json({ error: 'Failed to acknowledge welfare check' });
  }
});

automationRouter.post('/lone-worker-safety/resolve', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) return res.status(403).json({ error: 'Requires org admin or owner role' });

    const { checkId } = req.body;
    if (!checkId) return res.status(400).json({ error: 'checkId is required' });
    const result = loneWorkerSafetyService.resolveCheck(checkId);
    return res.json({ success: result });
  } catch (error) {
    log.error('Lone worker resolve error:', error);
    return res.status(500).json({ error: 'Failed to resolve check' });
  }
});

// ============================================================================
// TRINITY AUTOMATION TOGGLE
// ============================================================================

/**
 * PATCH /api/automation/trinity/settings
 * Update automation settings for workspace
 */
automationRouter.patch('/trinity/settings', async (req: any, res: Response) => {
  try {
    // Accept workspaceId from body for proper org isolation
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Dynamically check if user has admin permissions for this workspace
    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only org owners/admins can update automation settings' });
    }

    const settings = await trinityAutomationToggle.updateSettings(
      workspaceId,
      req.body,
      req.user?.id
    );
    return res.json(settings);
  } catch (error) {
    log.error('Trinity settings update error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/automation/trinity/request
 * Request Trinity automation for a feature
 */
automationRouter.post('/trinity/request', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = automationRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: fromZodError(validation.error).toString(),
      });
    }

    const { feature, context } = validation.data;

    const result = await trinityAutomationToggle.requestAutomation({
      workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      feature,
      requestedBy: req.user?.id,
      context: context || {},
    });

    return res.json(result);
  } catch (error) {
    log.error('Trinity automation request error:', error);
    return res.status(500).json({ error: 'Failed to request automation' });
  }
});

/**
 * POST /api/automation/trinity/approve/:requestId
 * Approve pending automation request
 */
automationRouter.post('/trinity/approve/:requestId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only org owners/admins can approve automation' });
    }

    const result = await trinityAutomationToggle.approveAutomation(
      req.params.requestId,
      req.user?.id
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity approval error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to approve' });
  }
});

/**
 * POST /api/automation/trinity/reject/:requestId
 * Reject pending automation request
 */
automationRouter.post('/trinity/reject/:requestId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only org owners/admins can reject automation' });
    }

    const result = await trinityAutomationToggle.rejectAutomation(
      req.params.requestId,
      req.user?.id,
      req.body.reason
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity rejection error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to reject' });
  }
});

/**
 * POST /api/automation/trinity/resume/:requestId
 * Resume a failed automation from its checkpoint.
 * Trinity analyzes saved state, skips completed steps, continues from the failed step.
 */
automationRouter.post('/trinity/resume/:requestId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const hasPermission = await isAutomationAdmin(req.user?.id, workspaceId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Only org owners/admins can resume automation' });
    }

    const result = await trinityAutomationToggle.resumeAutomation(
      req.params.requestId,
      req.user?.id,
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity resume error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to resume automation' });
  }
});

/**
 * GET /api/automation/trinity/checkpoint/:requestId
 * Get the checkpoint state and Trinity analysis for an automation request.
 */
automationRouter.get('/trinity/checkpoint/:requestId', async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const state = await trinityAutomationToggle.getCheckpointState(
      req.params.requestId,
      workspaceId,
    );

    return res.json(state);
  } catch (error: unknown) {
    log.error('Trinity checkpoint fetch error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch checkpoint' });
  }
});

/**
 * POST /api/automation/trinity/pause/:requestId
 * Pause a running or pending automation, saving its checkpoint state.
 */
automationRouter.post('/trinity/pause/:requestId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const workspaceRole = req.user?.workspaceRole || '';
    const isAuthorized = ['org_owner', 'co_owner', 'org_admin', 'manager'].includes(workspaceRole);
    if (!isAuthorized) return res.status(403).json({ error: 'Only org owners/admins/managers can pause automations' });

    const { reason } = req.body;
    const result = await trinityAutomationToggle.pauseExecution(
      req.params.requestId,
      req.user?.id,
      reason,
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity pause error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to pause automation' });
  }
});

/**
 * PATCH /api/automation/trinity/revise/:requestId
 * Submit a revised payload for a pending or paused automation.
 * Body: { revisedPayload: {...}, notes: "reason for revision" }
 */
automationRouter.patch('/trinity/revise/:requestId', async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const workspaceRole = req.user?.workspaceRole || '';
    const isAuthorized = ['org_owner', 'co_owner', 'org_admin', 'manager'].includes(workspaceRole);
    if (!isAuthorized) return res.status(403).json({ error: 'Only org owners/admins/managers can revise automation payloads' });

    const { revisedPayload, notes } = req.body;
    if (!revisedPayload || typeof revisedPayload !== 'object') {
      return res.status(400).json({ error: 'revisedPayload (object) is required' });
    }
    if (!notes || typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes (string) is required to explain the revision' });
    }

    const result = await trinityAutomationToggle.revisePayload(
      req.params.requestId,
      req.user?.id,
      revisedPayload,
      notes,
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity revise error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to revise payload' });
  }
});

/**
 * POST /api/automation/trinity/reanalyze/:requestId
 * Ask Trinity to re-analyze the staged payload for a pending/paused automation.
 * Returns the AI analysis text and persists it to the record.
 */
automationRouter.post('/trinity/reanalyze/:requestId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const workspaceRole = req.user?.workspaceRole || '';
    const isAuthorized = ['org_owner', 'co_owner', 'org_admin', 'manager'].includes(workspaceRole);
    if (!isAuthorized) return res.status(403).json({ error: 'Only org owners/admins/managers can request Trinity analysis' });

    const result = await trinityAutomationToggle.requestTrinityReanalysis(
      req.params.requestId,
      workspaceId,
      req.user?.id,
    );

    return res.json(result);
  } catch (error: unknown) {
    log.error('Trinity reanalyze error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to request Trinity analysis' });
  }
});

// ============================================================================
// PHOTO GEOFENCE VALIDATION
// ============================================================================

/**
 * POST /api/automation/photo/validate
 * Validate photo submission location
 */
automationRouter.post('/photo/validate', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = photoValidationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: fromZodError(validation.error).toString(),
      });
    }

    const { latitude, longitude, shiftId, photoType } = validation.data;

    const employee = await storage.getEmployeeByUserId(req.user?.id, (req.workspaceId || (req as any).user?.currentWorkspaceId));
    if (!employee) {
      return res.status(403).json({ error: 'Employee record not found' });
    }

    const result = await photoGeofenceService.validatePhotoSubmission({
      workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      employeeId: employee.id,
      shiftId,
      location: { latitude, longitude },
      photoType: photoType || 'site_check',
    });

    return res.json(result);
  } catch (error) {
    log.error('Photo validation error:', error);
    return res.status(500).json({ error: 'Failed to validate photo location' });
  }
});

/**
 * POST /api/automation/photo/submit
 * Submit photo with geofence validation
 */
automationRouter.post('/photo/submit', requireAuth, async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = photoValidationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: fromZodError(validation.error).toString(),
      });
    }

    const { latitude, longitude, shiftId, photoType, photoData } = validation.data;

    const employee = await storage.getEmployeeByUserId(req.user?.id, (req.workspaceId || (req as any).user?.currentWorkspaceId));
    if (!employee) {
      return res.status(403).json({ error: 'Employee record not found' });
    }

    const result = await photoGeofenceService.submitPhotoWithValidation({
      workspaceId: (req.workspaceId || (req as any).user?.currentWorkspaceId),
      employeeId: employee.id,
      shiftId,
      location: { latitude, longitude },
      photoType: photoType || 'site_check',
      photoData,
    });

    if (!result.success) {
      return res.status(403).json(result);
    }

    return res.json(result);
  } catch (error) {
    log.error('Photo submission error:', error);
    return res.status(500).json({ error: 'Failed to submit photo' });
  }
});

// ============================================================================
// QUICKBOOKS RECEIPTS (Database Persisted)
// ============================================================================

/**
 * GET /api/automation/quickbooks/receipts
 * Get recent QuickBooks sync receipts for workspace (from database)
 */
automationRouter.get('/quickbooks/receipts', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);
    const receipts = await quickbooksReceiptService.getRecentReceipts(
      (req.workspaceId || (req as any).user?.currentWorkspaceId),
      limit
    );

    return res.json({
      receipts,
      formattedReceipts: receipts.map(r => quickbooksReceiptService.formatReceiptForDisplay(r)),
    });
  } catch (error) {
    log.error('QuickBooks receipts error:', error);
    return res.status(500).json({ error: 'Failed to get receipts' });
  }
});

/**
 * GET /api/automation/quickbooks/receipts/:receiptId
 * Get specific QuickBooks sync receipt (from database with workspace isolation)
 */
automationRouter.get('/quickbooks/receipts/:receiptId', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const receipt = await quickbooksReceiptService.getReceipt(
      req.params.receiptId,
      (req.workspaceId || (req as any).user?.currentWorkspaceId)
    );
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    return res.json({
      receipt,
      formatted: quickbooksReceiptService.formatReceiptForDisplay(receipt),
    });
  } catch (error) {
    log.error('QuickBooks receipt error:', error);
    return res.status(500).json({ error: 'Failed to get receipt' });
  }
});

/**
 * GET /api/automation/quickbooks/stats
 * Get QuickBooks sync statistics for workspace
 */
automationRouter.get('/quickbooks/stats', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await quickbooksReceiptService.getSyncStats((req.workspaceId || (req as any).user?.currentWorkspaceId));
    return res.json(stats);
  } catch (error) {
    log.error('QuickBooks stats error:', error);
    return res.status(500).json({ error: 'Failed to get sync stats' });
  }
});

// ============================================================================
// TRINITY AUTOMATION SETTINGS & HISTORY (Database Persisted)
// ============================================================================

/**
 * GET /api/automation/trinity/settings
 * Get automation settings for workspace
 */
automationRouter.get('/trinity/settings', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const settings = await trinityAutomationToggle.getSettings((req.workspaceId || (req as any).user?.currentWorkspaceId));
    return res.json({ settings });
  } catch (error) {
    log.error('Trinity settings error:', error);
    return res.status(500).json({ error: 'Failed to get automation settings' });
  }
});

/**
 * GET /api/automation/trinity/history
 * Get automation request history for workspace
 */
automationRouter.get('/trinity/history', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const history = await trinityAutomationToggle.getAutomationHistory(
      (req.workspaceId || (req as any).user?.currentWorkspaceId),
      limit
    );

    return res.json({ history });
  } catch (error) {
    log.error('Trinity history error:', error);
    return res.status(500).json({ error: 'Failed to get automation history' });
  }
});

/**
 * GET /api/automation/trinity/pending
 * Get pending automation requests for workspace
 */
automationRouter.get('/trinity/pending', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pending = await trinityAutomationToggle.getAllPendingRequests(
      (req.workspaceId || (req as any).user?.currentWorkspaceId)
    );

    return res.json({ pending, count: pending.length });
  } catch (error) {
    log.error('Trinity pending error:', error);
    return res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

/**
 * GET /api/automation/trinity/receipts
 * Get automation receipts for workspace
 */
automationRouter.get('/trinity/receipts', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const receipts = await trinityAutomationToggle.getReceipts(
      (req.workspaceId || (req as any).user?.currentWorkspaceId),
      limit
    );

    return res.json({ receipts });
  } catch (error) {
    log.error('Trinity receipts error:', error);
    return res.status(500).json({ error: 'Failed to get automation receipts' });
  }
});

/**
 * GET /api/automation/trinity/requests/:requestId
 * Get specific automation request (with workspace isolation)
 */
automationRouter.get('/trinity/requests/:requestId', async (req: any, res: Response) => {
  try {
    if (!req.user || !(req.workspaceId || req.user?.currentWorkspaceId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const request = await trinityAutomationToggle.getPendingRequest(
      req.params.requestId,
      (req.workspaceId || (req as any).user?.currentWorkspaceId)
    );
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    return res.json({ request });
  } catch (error) {
    log.error('Trinity request error:', error);
    return res.status(500).json({ error: 'Failed to get automation request' });
  }
});

// ============================================================================
// AUTOMATION ROLLBACK ROUTES
// ============================================================================

automationRouter.get('/rollback/actions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const { automationRollbackService } = await import('../services/automationRollbackService');

    const entityType = req.query.entityType as string | undefined;
    const hoursBack = req.query.hoursBack ? parseInt(req.query.hoursBack as string) : 72;
    const limit = Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 50), 500);

    const actions = await automationRollbackService.getRecentRollbackableActions(workspaceId, {
      entityType,
      hoursBack,
      limit,
    });

    res.json({
      success: true,
      actions,
      total: actions.length,
      rollbackableCount: actions.filter((a) => a.canRollback).length,
    });
  } catch (error: unknown) {
    log.error('[AutomationRollback] List error:', error);
    res.status(500).json({ error: 'Failed to retrieve rollbackable actions' });
  }
});

automationRouter.post('/rollback/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: 'Authentication required' });

    const workspaceId = req.workspaceId || user.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const { hasManagerAccess } = await import('../rbac');
    const { employees: employeesTable } = await import('@shared/schema');
    const { eq: eqOp, and: andOp } = await import('drizzle-orm');
    const [emp] = await db
      .select({ workspaceRole: employeesTable.workspaceRole })
      .from(employeesTable)
      .where(andOp(eqOp(employeesTable.userId, user.id), eqOp(employeesTable.workspaceId, workspaceId)))
      .limit(1);
    const freshRole = emp?.workspaceRole || req.workspaceRole;
    if (!hasManagerAccess(freshRole)) {
      return res.status(403).json({ error: 'Manager access required to rollback automations' });
    }

    const schema = z.object({
      auditLogId: z.string().min(1),
    });

    const { auditLogId } = schema.parse(req.body);

    const { automationRollbackService } = await import('../services/automationRollbackService');

    const result = await automationRollbackService.rollbackAction(auditLogId, workspaceId, {
      userId: user.id,
      userEmail: user.email || 'unknown',
      userRole: freshRole || user.role || 'user',
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'auditLogId is required' });
    }
    log.error('[AutomationRollback] Execute error:', error);
    res.status(500).json({ error: 'Failed to execute rollback' });
  }
});

automationRouter.post('/rollback/batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: 'Authentication required' });

    const workspaceId = req.workspaceId || user.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const { hasManagerAccess } = await import('../rbac');
    const { employees: employeesTable } = await import('@shared/schema');
    const { eq: eqOp, and: andOp } = await import('drizzle-orm');
    const [emp] = await db
      .select({ workspaceRole: employeesTable.workspaceRole })
      .from(employeesTable)
      .where(andOp(eqOp(employeesTable.userId, user.id), eqOp(employeesTable.workspaceId, workspaceId)))
      .limit(1);
    const freshRole = emp?.workspaceRole || req.workspaceRole;
    if (!hasManagerAccess(freshRole)) {
      return res.status(403).json({ error: 'Manager access required to rollback automations' });
    }

    const schema = z.object({
      auditLogIds: z.array(z.string().min(1)).min(1).max(20),
    });

    const { auditLogIds } = schema.parse(req.body);

    const { automationRollbackService } = await import('../services/automationRollbackService');

    const results = await automationRollbackService.batchRollback(auditLogIds, workspaceId, {
      userId: user.id,
      userEmail: user.email || 'unknown',
      userRole: freshRole || user.role || 'user',
    });

    res.json({
      success: true,
      results,
      totalAttempted: results.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'auditLogIds array is required (max 20)' });
    }
    log.error('[AutomationRollback] Batch error:', error);
    res.status(500).json({ error: 'Failed to execute batch rollback' });
  }
});
