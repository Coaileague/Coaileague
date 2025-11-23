/**
 * AutoForce™ Core Automation Engine
 * 
 * Implements the three core automation workflows:
 * 1. AI Scheduling with confidence scoring and approval queue
 * 2. Automated Invoicing with anchor period close and Stripe integration
 * 3. Automated Payroll with anchor period close and Gusto integration
 * 
 * Features:
 * - Gemini 2.0 Flash integration with full audit trails
 * - Two-phase commit via Write-Ahead Logging
 * - Confidence scoring for human approval workflows
 * - Event sourcing for all AI decisions
 * - ID registry for all created entities
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { storage } from '../storage';
import { auditLogger, type AuditContext } from './audit-logger';
import { aiGuardRails, type AIRequestContext } from './aiGuardRails';
import type { Shift, Employee, Client, TimeEntry } from '@shared/schema';
import {
  scheduleDecisionSchema,
  invoiceDecisionSchema,
  payrollDecisionSchema,
  createFallbackScheduleDecision,
  createFallbackInvoiceDecision,
  createFallbackPayrollDecision,
  type ValidatedScheduleDecision,
  type ValidatedInvoiceDecision,
  type ValidatedPayrollDecision,
} from './automation-schemas';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

export interface GeminiResponse<T = any> {
  decision: T;
  confidence: number;
  reasoning: string;
  model: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
}

// Use ValidatedScheduleDecision from schemas instead
export type ScheduleDecision = ValidatedScheduleDecision;

export interface InvoiceDecision {
  clientId: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    timeEntryIds: string[];
  }>;
  subtotal: number;
  total: number;
  confidence: number;
  requiresApproval: boolean;
  anomalies: string[];
}

export interface PayrollDecision {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  totalPay: number;
  deductions: Record<string, number>;
  netPay: number;
  confidence: number;
  requiresApproval: boolean;
  warnings: string[];
}

export class AutomationEngine {
  
  /**
   * Helper to call Gemini with schema validation and fallback handling
   */
  private async callGemini<T>({
    prompt,
    context,
    eventType,
    aggregateId,
    aggregateType,
    schema,
    buildFallback,
    transactionId,
    minConfidence = 0.85,
  }: {
    prompt: string;
    context: AuditContext;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    schema: any;
    buildFallback: (details: { reason: string }) => T;
    transactionId?: string;
    minConfidence?: number;
  }): Promise<{
    decision: T;
    confidence: number;
    reasoning: string;
    model: string;
    validationStatus: 'success' | 'fallback';
    tokensUsed?: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Call Gemini API
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      
      // Extract usage metadata
      const usageMetadata = (response as any).usageMetadata;
      const tokensUsed = usageMetadata?.totalTokenCount || 0;
      const promptTokens = usageMetadata?.promptTokenCount || 0;
      const completionTokens = usageMetadata?.candidatesTokenCount || 0;
      
      // Parse and validate JSON response
      let decision: T;
      let validationStatus: 'success' | 'fallback' = 'success';
      let confidence = 0;
      let reasoning = 'AI decision';
      
      try {
        const parsed = JSON.parse(rawText);
        const validation = schema.safeParse(parsed);
        
        if (!validation.success) {
          // Validation failed - use fallback
          decision = buildFallback({ reason: `Schema validation failed: ${validation.error.message}` });
          validationStatus = 'fallback';
          confidence = 0;
          reasoning = 'Validation failed - manual review required';
          
          // Log validation failure
          await auditLogger.logEvent(context, {
            eventType: `${eventType}_validation_failed`,
            aggregateId,
            aggregateType,
            payload: {
              rawText: rawText.substring(0, 1000),
              validationErrors: validation.error.issues,
              transactionId,
            },
          });
        } else {
          decision = validation.data;
          confidence = (decision as any).confidence || (decision as any).overallConfidence || 0.9;
          reasoning = (decision as any).reasoning || 'AI decision';
        }
      } catch (parseError) {
        // JSON parse failed - use fallback
        decision = buildFallback({ reason: `JSON parse failed: ${parseError}` });
        validationStatus = 'fallback';
        confidence = 0;
        reasoning = 'Parse failed - manual review required';
        
        // Log parse failure
        await auditLogger.logEvent(context, {
          eventType: `${eventType}_parse_failed`,
          aggregateId,
          aggregateType,
          payload: {
            rawText: rawText.substring(0, 1000),
            error: parseError instanceof Error ? parseError.message : String(parseError),
            transactionId,
          },
        });
      }
      
      // Log the AI action with full audit trail
      await auditLogger.logEvent(context, {
        eventType: `AI_${eventType}`,
        aggregateId,
        aggregateType,
        payload: {
          prompt: prompt.substring(0, 500),
          decision,
          confidence,
          reasoning,
          model: 'gemini-2.0-flash-exp',
          tokensUsed,
          promptTokens,
          completionTokens,
          executionTimeMs: Date.now() - startTime,
          validationStatus,
          transactionId,
        },
      }, { generateHash: true, autoCommit: true });
      
      return {
        decision,
        confidence,
        reasoning,
        model: 'gemini-2.0-flash-exp',
        validationStatus,
        tokensUsed,
      };
      
    } catch (error) {
      // Gemini API call failed - use fallback
      const decision = buildFallback({ reason: `Gemini API failed: ${error}` });
      
      await auditLogger.logEvent(context, {
        eventType: `${eventType}_failed`,
        aggregateId,
        aggregateType,
        payload: {
          error: error instanceof Error ? error.message : String(error),
          prompt: prompt.substring(0, 500),
          transactionId,
        },
      });
      
      return {
        decision,
        confidence: 0,
        reasoning: 'API failed - manual review required',
        model: 'gemini-2.0-flash-exp',
        validationStatus: 'fallback',
      };
    }
  }

  // ============================================================================
  // 1. AI SCHEDULING AUTOMATION
  // ============================================================================

  /**
   * Generate optimized schedule using Gemini AI
   * Returns confidence score and approval requirement
   */
  async generateSchedule(
    context: AuditContext,
    params: {
      startDate: Date;
      endDate: Date;
      employees: Employee[];
      existingShifts: Shift[];
      requirements?: string;
    }
  ): Promise<{ transactionId: string; decision: ScheduleDecision; eventId: string }> {
    const transactionId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Empty data guard
    if (!params.employees || params.employees.length === 0) {
      const fallbackDecision = createFallbackScheduleDecision();
      return {
        transactionId,
        decision: fallbackDecision as ScheduleDecision,
        eventId: transactionId,
      };
    }
    
    // Use WAL for transaction safety
    return await auditLogger.executeWithWAL(
      context,
      {
        operationType: 'schedule_generation',
        entityType: 'schedule',
        entityId: transactionId,
        payload: {
          startDate: params.startDate.toISOString(),
          endDate: params.endDate.toISOString(),
          employeeCount: params.employees.length,
          existingShiftCount: params.existingShifts.length,
        },
      },
      async () => {
        // Build comprehensive prompt
        const prompt = `You are an expert workforce scheduling AI for AutoForce™. Generate an optimized schedule based on:

**Date Range:** ${params.startDate.toISOString()} to ${params.endDate.toISOString()}

**Available Employees:**
${params.employees.map(e => `- ${e.firstName} ${e.lastName} (ID: ${e.id}, Role: ${e.role || 'General'})`).join('\n')}

**Existing Shifts (to avoid conflicts):**
${params.existingShifts.map(s => `- Employee ${s.employeeId}: ${s.startTime} - ${s.endTime}`).join('\n')}

**Requirements:** ${params.requirements || 'Standard coverage'}

**Task:** Generate shifts that:
1. Maximize coverage while minimizing overtime
2. Respect employee skills and availability
3. Avoid scheduling conflicts
4. Follow FLSA overtime rules (>40 hrs/week = OT)
5. Balance workload fairly

Return ONLY valid JSON (no markdown):
{
  "shifts": [
    {
      "employeeId": "string",
      "clientId": "string (or null)",
      "startTime": "ISO 8601",
      "endTime": "ISO 8601",
      "role": "string",
      "confidence": 0.0-1.0,
      "reasoning": "why this assignment"
    }
  ],
  "conflicts": [
    {
      "type": "overtime|overlap|availability",
      "description": "what the issue is",
      "severity": "high|medium|low"
    }
  ],
  "overallConfidence": 0.0-1.0,
  "requiresApproval": boolean
}`;

        // Call Gemini with validation
        const response = await this.callGemini<ValidatedScheduleDecision>({
          prompt,
          context,
          eventType: 'schedule_generated',
          aggregateId: transactionId,
          aggregateType: 'schedule',
          schema: scheduleDecisionSchema,
          buildFallback: createFallbackScheduleDecision,
          transactionId,
        });

        // Register IDs for any new shifts (using transaction ID as base)
        const decision = response.decision;
        for (let i = 0; i < decision.shifts.length; i++) {
          const shiftId = `shift_${transactionId}_${i}`;
          await auditLogger.registerID(
            shiftId,
            'shift',
            context
          );
        }

        // Return decision with transaction ID
        return {
          transactionId,
          decision,
          eventId: transactionId,
        };
      }
    );
  }

  /**
   * Apply approved schedule to database
   */
  async applySchedule(
    context: AuditContext,
    transactionId: string,
    shifts: ScheduleDecision['shifts'],
    approvedBy?: string
  ): Promise<{ shiftIds: string[] }> {
    const shiftIds: string[] = [];

    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i];
      const shiftId = `shift_${transactionId}_${i}`;
      
      // Create shift in database
      const newShift = await storage.createShift({
        employeeId: shift.employeeId,
        clientId: shift.clientId || undefined,
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
        status: 'draft',
        workspaceId: context.workspaceId || '',
      });

      shiftIds.push(newShift.id);

      // Log shift creation
      await auditLogger.logEvent(
        context,
        {
          eventType: 'shift_created',
          aggregateId: newShift.id,
          aggregateType: 'shift',
          payload: {
            transactionId,
            aiGenerated: true,
            approvedBy,
            confidence: shift.confidence,
          },
        }
      );
    }

    return { shiftIds };
  }

  // ============================================================================
  // 2. AUTOMATED INVOICING
  // ============================================================================

  /**
   * Generate invoice for anchor period using Gemini AI
   */
  async generateInvoice(
    context: AuditContext,
    params: {
      clientId: string;
      startDate: Date;
      endDate: Date;
      timeEntries: TimeEntry[];
      client: Client;
    }
  ): Promise<{ transactionId: string; decision: InvoiceDecision; eventId: string }> {
    const transactionId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return await auditLogger.executeWithWAL(
      context,
      {
        operationType: 'invoice_generation',
        entityType: 'invoice',
        entityId: transactionId,
        payload: {
          clientId: params.clientId,
          startDate: params.startDate.toISOString(),
          endDate: params.endDate.toISOString(),
          timeEntryCount: params.timeEntries.length,
        },
      },
      async () => {
        // Calculate totals
        const totalHours = params.timeEntries.reduce((sum, te) => {
          const start = new Date(te.clockIn);
          const end = te.clockOut ? new Date(te.clockOut) : new Date();
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0);

        const billingRate = 75; // Default rate (client may not have this field)

        const prompt = `You are an invoicing AI for AutoForce™. Generate an invoice for client services:

**Client:** ${params.client.companyName || params.client.firstName || 'Unknown'}
**Period:** ${params.startDate.toISOString().split('T')[0]} to ${params.endDate.toISOString().split('T')[0]}
**Billing Rate:** $${billingRate}/hour

**Time Entries:**
${params.timeEntries.map(te => {
  const start = new Date(te.clockIn);
  const end = te.clockOut ? new Date(te.clockOut) : new Date();
  const hours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);
  return `- Employee ${te.employeeId}: ${hours} hours on ${start.toISOString().split('T')[0]}`;
}).join('\n')}

**Total Hours:** ${totalHours.toFixed(2)}

**Task:** Create invoice line items:
1. Group hours by service type/role if possible
2. Apply correct billing rates
3. Flag any anomalies (excessive hours, rate discrepancies)
4. Calculate totals
5. Determine if manual approval needed (>10% variance from expected)

Return ONLY valid JSON (no markdown):
{
  "clientId": "${params.clientId}",
  "lineItems": [
    {
      "description": "Service description",
      "quantity": hours,
      "rate": dollar amount,
      "amount": quantity * rate,
      "timeEntryIds": ["id1", "id2"]
    }
  ],
  "subtotal": sum of all amounts,
  "total": subtotal (add fees/taxes if needed),
  "confidence": 0.0-1.0,
  "requiresApproval": boolean,
  "anomalies": ["list any issues found"]
}`;

        const response = await this.callGemini<InvoiceDecision>({
          prompt,
          context,
          eventType: 'invoice_generated',
          aggregateId: transactionId,
          aggregateType: 'invoice',
          schema: invoiceDecisionSchema,
          buildFallback: () => createFallbackInvoiceDecision(params.clientId),
          transactionId,
        });

        // Register invoice ID
        const invoiceId = `invoice_${transactionId}`;
        await auditLogger.registerID(
          invoiceId,
          'invoice',
          context
        );

        return {
          transactionId,
          decision: response.decision,
          eventId: transactionId,
        };
      }
    );
  }

  /**
   * Run anchor period close and generate all invoices
   */
  async runAnchorPeriodInvoicing(
    context: AuditContext,
    params: {
      workspaceId: string;
      anchorDate: Date;
    }
  ): Promise<{ invoices: InvoiceDecision[]; requiresApproval: InvoiceDecision[] }> {
    // Calculate anchor period (biweekly)
    const endDate = params.anchorDate;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 14);

    // Get all clients for workspace
    const clients = await storage.getClientsByWorkspace(params.workspaceId);
    
    const invoices: InvoiceDecision[] = [];
    const requiresApproval: InvoiceDecision[] = [];

    // Generate invoice for each client
    for (const client of clients) {
      // Get time entries for this client in the anchor period from actual database
      const timeEntries = await db
        .select()
        .from(timeEntriesTable)
        .where(
          and(
            eq(timeEntriesTable.clientId, client.id),
            gte(timeEntriesTable.startTime, startDate),
            lte(timeEntriesTable.endTime, endDate),
            eq(timeEntriesTable.workspaceId, params.workspaceId)
          )
        );

      if (timeEntries.length === 0) {
        continue; // Skip clients with no billable time
      }

      const result = await this.generateInvoice(context, {
        clientId: client.id,
        startDate,
        endDate,
        timeEntries,
        client,
      });

      invoices.push(result.decision);

      if (result.decision.requiresApproval) {
        requiresApproval.push(result.decision);
      }
    }

    return { invoices, requiresApproval };
  }

  // ============================================================================
  // 3. AUTOMATED PAYROLL
  // ============================================================================

  /**
   * Generate payroll for employee using Gemini AI
   */
  async generatePayroll(
    context: AuditContext,
    params: {
      employeeId: string;
      startDate: Date;
      endDate: Date;
      timeEntries: TimeEntry[];
      employee: Employee;
    }
  ): Promise<{ transactionId: string; decision: PayrollDecision; eventId: string }> {
    const transactionId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return await auditLogger.executeWithWAL(
      context,
      {
        operationType: 'payroll_generation',
        entityType: 'payroll',
        entityId: transactionId,
        payload: {
          employeeId: params.employeeId,
          startDate: params.startDate.toISOString(),
          endDate: params.endDate.toISOString(),
          timeEntryCount: params.timeEntries.length,
        },
      },
      async () => {
        // Calculate total hours
        let regularHours = 0;
        let overtimeHours = 0;
        
        const totalHours = params.timeEntries.reduce((sum, te) => {
          const start = new Date(te.clockIn);
          const end = te.clockOut ? new Date(te.clockOut) : new Date();
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0);

        // Calculate OT (simple: >40 hrs/week)
        if (totalHours > 40) {
          regularHours = 40;
          overtimeHours = totalHours - 40;
        } else {
          regularHours = totalHours;
        }

        const hourlyRateStr = params.employee.hourlyRate || '15';
        const hourlyRate = typeof hourlyRateStr === 'string' ? parseFloat(hourlyRateStr) : hourlyRateStr;
        const otRate = hourlyRate * 1.5;

        const prompt = `You are a payroll processing AI for AutoForce™. Calculate payroll for an employee:

**Employee:** ${params.employee.firstName} ${params.employee.lastName}
**Period:** ${params.startDate.toISOString().split('T')[0]} to ${params.endDate.toISOString().split('T')[0]}
**Hourly Rate:** $${hourlyRate}
**OT Rate:** $${otRate}

**Time Entries:**
${params.timeEntries.map(te => {
  const start = new Date(te.clockIn);
  const end = te.clockOut ? new Date(te.clockOut) : new Date();
  const hours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);
  return `- ${hours} hours on ${start.toISOString().split('T')[0]}`;
}).join('\n')}

**Total Hours:** ${totalHours.toFixed(2)} (Regular: ${regularHours.toFixed(2)}, OT: ${overtimeHours.toFixed(2)})

**Task:** Calculate payroll:
1. Apply regular and OT rates
2. Calculate gross pay
3. Estimate deductions (FICA 7.65%, Federal ~15%)
4. Calculate net pay
5. Flag any warnings (excessive OT, rate changes, etc.)
6. Determine if manual approval needed

Return ONLY valid JSON (no markdown):
{
  "employeeId": "${params.employeeId}",
  "regularHours": ${regularHours.toFixed(2)},
  "overtimeHours": ${overtimeHours.toFixed(2)},
  "regularPay": regularHours * rate,
  "overtimePay": overtimeHours * otRate,
  "totalPay": regularPay + overtimePay,
  "deductions": {
    "fica": amount,
    "federal": amount,
    "state": amount
  },
  "netPay": totalPay - sum(deductions),
  "confidence": 0.0-1.0,
  "requiresApproval": boolean,
  "warnings": ["list any issues"]
}`;

        const response = await this.callGemini<PayrollDecision>({
          prompt,
          context,
          eventType: 'payroll_generated',
          aggregateId: transactionId,
          aggregateType: 'payroll',
          schema: payrollDecisionSchema,
          buildFallback: () => createFallbackPayrollDecision(params.employeeId),
          transactionId,
        });

        // Register payroll ID
        const payrollId = `payroll_${transactionId}`;
        await auditLogger.registerID(
          payrollId,
          'payroll',
          context
        );

        return {
          transactionId,
          decision: response.decision,
          eventId: transactionId,
        };
      }
    );
  }

  /**
   * Run anchor period close and generate all payroll
   */
  async runAnchorPeriodPayroll(
    context: AuditContext,
    params: {
      workspaceId: string;
      anchorDate: Date;
    }
  ): Promise<{ payrolls: PayrollDecision[]; requiresApproval: PayrollDecision[] }> {
    // Calculate anchor period (biweekly)
    const endDate = params.anchorDate;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 14);

    // Get all employees for workspace
    const employees = await storage.getEmployeesByWorkspace(params.workspaceId);
    
    const payrolls: PayrollDecision[] = [];
    const requiresApproval: PayrollDecision[] = [];

    // Generate payroll for each employee
    for (const employee of employees) {
      // Get time entries for this employee in the anchor period (stub for now)
      const timeEntries: TimeEntry[] = []; // TODO: Implement getTimeEntriesByEmployee

      if (timeEntries.length === 0) {
        continue; // Skip employees with no hours
      }

      const result = await this.generatePayroll(context, {
        employeeId: employee.id,
        startDate,
        endDate,
        timeEntries,
        employee,
      });

      payrolls.push(result.decision);

      if (result.decision.requiresApproval) {
        requiresApproval.push(result.decision);
      }
    }

    return { payrolls, requiresApproval };
  }

  // ============================================================================
  // GEMINI VISION FOR MIGRATION
  // ============================================================================

  /**
   * Extract schedule data from uploaded image/PDF using Gemini Vision
   */
  async extractScheduleFromImage(
    context: AuditContext,
    params: {
      imageBase64: string;
      mimeType: string;
      workspaceId: string;
    }
  ): Promise<{
    employees: Array<{ name: string; role?: string }>;
    shifts: Array<{
      employeeName: string;
      date: string;
      startTime: string;
      endTime: string;
      role?: string;
    }>;
    confidence: number;
    warnings: string[];
  }> {
    const transactionId = `migrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const prompt = `You are a data extraction AI for AutoForce™. Extract schedule information from this image.

**Task:** Analyze the schedule/timesheet image and extract:
1. All employee names
2. All shifts with dates and times
3. Roles/positions if visible

Return ONLY valid JSON (no markdown):
{
  "employees": [
    {
      "name": "Employee Name",
      "role": "Position/Role (if visible)"
    }
  ],
  "shifts": [
    {
      "employeeName": "Name matching employees array",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "role": "Position (if visible)"
    }
  ],
  "confidence": 0.0-1.0,
  "warnings": ["Any OCR errors, ambiguities, or issues"]
}`;

    try {
      // Call Gemini Vision API
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: params.imageBase64,
            mimeType: params.mimeType,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();
      const extracted = JSON.parse(text);

      // Log the migration action
      await auditLogger.logEvent(
        context,
        {
          eventType: 'schedule_migration_extracted',
          aggregateId: transactionId,
          aggregateType: 'migration',
          payload: {
            transactionId,
            employeeCount: extracted.employees.length,
            shiftCount: extracted.shifts.length,
            confidence: extracted.confidence,
            warnings: extracted.warnings,
          },
        }
      );

      return extracted;

    } catch (error) {
      await auditLogger.logEvent(
        context,
        {
          eventType: 'schedule_migration_failed',
          aggregateId: transactionId,
          aggregateType: 'migration',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        }
      );
      throw error;
    }
  }
}

// Export singleton instance
export const automationEngine = new AutomationEngine();
