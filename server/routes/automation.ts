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
import { fromZodError } from 'zod-validation-error';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createNotification } from '../services/notificationService';
import { withCredits } from '../services/billing/creditWrapper';

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
automationRouter.post('/schedule/generate', async (req: any, res: Response) => {
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
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employees for workspace
    const employees = await storage.getEmployeesByWorkspace(req.workspace.id);
    
    // Get existing shifts in date range to avoid conflicts
    const existingShifts = await storage.getShiftsByWorkspace(
      req.workspace.id,
      new Date(startDate),
      new Date(endDate)
    );

    // Call automation engine WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: req.workspace.id,
        featureKey: 'ai_scheduling',
        description: `Generated AI schedule from ${startDate} to ${endDate}`,
        userId: req.user.id,
      },
      async () => {
        return await automationEngine.generateSchedule(
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
    // Validate request body
    const validationResult = scheduleApplySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { transactionId, shifts } = validationResult.data;
    
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
automationRouter.post('/invoice/generate', async (req: any, res: Response) => {
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
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get client
    const client = await storage.getClient(clientId, req.workspace.id);
    if (!client || client.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get unbilled time entries for this client
    const timeEntries = await storage.getUnbilledTimeEntries(req.workspace.id, clientId);

    if (timeEntries.length === 0) {
      return res.status(400).json({
        error: 'No billable time found for this client in the specified period',
      });
    }

    // Generate invoice WITH CREDIT DEDUCTION
    const creditResult = await withCredits(
      {
        workspaceId: req.workspace.id,
        featureKey: 'ai_invoice_generation',
        description: `Generated AI invoice for client ${clientId} (${startDate} to ${endDate})`,
        userId: req.user.id,
      },
      async () => {
        return await automationEngine.generateInvoice(
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
    // Validate request body
    const validationResult = invoiceGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { anchorDate } = validationResult.data;
    
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

    // Send completion notifications to org leaders
    if (result.invoices.length > 0) {
      try {
        const orgLeaders = await db.select()
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, req.workspace.id),
              sql`(${employees.workspaceRole} IN ('org_owner', 'org_admin', 'department_manager'))`
            )
          );
        
        const totalAmount = result.invoices.reduce((sum, inv) => sum + inv.total, 0);
        const needsReview = result.requiresApproval.length;
        
        for (const leader of orgLeaders) {
          if (leader.userId) {
            await createNotification({
              workspaceId: req.workspace.id,
              userId: leader.userId,
              type: 'system',
              title: 'Invoices Generated by AI Brain',
              message: `AI Brain generated ${result.invoices.length} invoice(s) totaling $${totalAmount.toFixed(2)}${needsReview > 0 ? `. ${needsReview} require review.` : '. All auto-approved.'}`,
              actionUrl: '/invoices',
              relatedEntityType: 'workspace',
              relatedEntityId: req.workspace.id,
              metadata: { 
                invoicesGenerated: result.invoices.length,
                totalAmount,
                needsReview,
                anchorDate,
              },
              createdBy: 'system-autoforce',
            });
          }
        }
        console.log(`   🔔 Notified ${orgLeaders.length} leader(s) about invoice generation`);
      } catch (notifError) {
        console.warn(`   ⚠️  Failed to send notifications:`, notifError);
      }
    }

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
    // Validate request body
    const validationResult = singlePayrollGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { employeeId, startDate, endDate } = validationResult.data;
    
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get employee
    const employee = await storage.getEmployee(employeeId, req.workspace.id);
    if (!employee || employee.workspaceId !== req.workspace.id) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get time entries for this employee in date range
    const timeEntries = await storage.getTimeEntriesByEmployeeAndDateRange(
      req.workspace.id,
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
        workspaceId: req.workspace.id,
        featureKey: 'ai_payroll_processing',
        description: `Generated AI payroll for employee ${employeeId} (${startDate} to ${endDate})`,
        userId: req.user.id,
      },
      async () => {
        return await automationEngine.generatePayroll(
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
    // Validate request body
    const validationResult = payrollGenerateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }
    
    const { anchorDate } = validationResult.data;
    
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

    // Send completion notifications to org leaders
    if (result.payrolls.length > 0) {
      try {
        const orgLeaders = await db.select()
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, req.workspace.id),
              sql`(${employees.workspaceRole} IN ('org_owner', 'org_admin', 'department_manager'))`
            )
          );
        
        const totalPayroll = result.payrolls.reduce((sum, p) => sum + p.netPay, 0);
        const needsReview = result.requiresApproval.length;
        
        for (const leader of orgLeaders) {
          if (leader.userId) {
            await createNotification({
              workspaceId: req.workspace.id,
              userId: leader.userId,
              type: 'system',
              title: 'Payroll Processed by AI Brain',
              message: `AI Brain processed payroll for ${result.payrolls.length} employee(s) totaling $${totalPayroll.toFixed(2)}${needsReview > 0 ? `. ${needsReview} require review.` : '. All auto-approved.'}`,
              actionUrl: '/payroll',
              relatedEntityType: 'workspace',
              relatedEntityId: req.workspace.id,
              metadata: { 
                payrollsProcessed: result.payrolls.length,
                totalPayroll,
                needsReview,
                anchorDate,
              },
              createdBy: 'system-autoforce',
            });
          }
        }
        console.log(`   🔔 Notified ${orgLeaders.length} leader(s) about payroll processing`);
      } catch (notifError) {
        console.warn(`   ⚠️  Failed to send notifications:`, notifError);
      }
    }

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
