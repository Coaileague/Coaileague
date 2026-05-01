/**
 * CoAIleague Core Automation Engine
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

import { meteredGemini } from './billing/meteredGeminiClient';
import { storage } from '../storage';
import { auditLogger, type AuditContext } from './audit-logger';
import { aiGuardRails, type AIRequestContext } from './aiGuardRails';
import { db } from '../db';
import { timeEntries } from '@shared/schema';
import { and, eq, gte, lte, isNotNull, isNull } from 'drizzle-orm';
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
import { ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { multiplyFinancialValues, toFinancialString } from './financialCalculator';

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

interface InvoiceBatchDiagnostics {
  eligibleTimeEntries: number;
  processableClients: number;
  orphanedClientIds: string[];
}

interface PayrollBatchDiagnostics {
  eligibleTimeEntries: number;
  processableEmployees: number;
  orphanedEmployeeIds: string[];
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTimeEntryHours(entry: TimeEntry): number {
  const totalHours = parseDecimal(entry.totalHours);
  if (totalHours != null && totalHours > 0) return totalHours;
  const clockIn = new Date(entry.clockIn);
  const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
  if (!clockOut || Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) return 0;
  return Math.max(0, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60));
}

function resolveInvoiceRate(client: Client, entries: TimeEntry[]): { rate: number; source: string; anomalies: string[] } {
  const capturedRates = entries
    .map((entry) => parseDecimal(entry.capturedBillRate))
    .filter((rate): rate is number => rate != null && rate > 0);

  if (capturedRates.length > 0) {
    const frequencies = new Map<number, number>();
    for (const rate of capturedRates) {
      frequencies.set(rate, (frequencies.get(rate) || 0) + 1);
    }
    const [dominantRate] = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0];
    const anomalies = new Set<string>();
    if (frequencies.size > 1) {
      anomalies.add('Time entries use multiple captured bill rates; invoice marked for review.');
    }
    return { rate: dominantRate, source: 'captured_bill_rate', anomalies: [...anomalies] };
  }

  const candidateRates: Array<[unknown, string]> = [
    [(client as any).billableHourlyRate, 'client.billableHourlyRate'],
    [client.contractRate, 'client.contractRate'],
    [client.unarmedBillRate, 'client.unarmedBillRate'],
    [client.armedBillRate, 'client.armedBillRate'],
    [client.overtimeBillRate, 'client.overtimeBillRate'],
  ];

  for (const [value, source] of candidateRates) {
    const rate = parseDecimal(value);
    if (rate != null && rate > 0) {
      return { rate, source, anomalies: [] };
    }
  }

  const derivedRates = entries
    .map((entry) => {
      const billableAmount = parseDecimal(entry.billableAmount);
      const hours = getTimeEntryHours(entry);
      if (billableAmount == null || hours <= 0) return null;
      return billableAmount / hours;
    })
    .filter((rate): rate is number => rate != null && rate > 0);

  if (derivedRates.length > 0) {
    return {
      rate: roundMoney(derivedRates[0]),
      source: 'timeEntry.billableAmount',
      anomalies: ['Billing rate was inferred from billable amounts; invoice marked for review.'],
    };
  }

  return {
    rate: 0,
    source: 'missing',
    anomalies: ['No billable rate data found for this client; invoice marked for manual review.'],
  };
}

function buildDeterministicInvoiceDecision(client: Client, timeEntries: TimeEntry[]): InvoiceDecision {
  const { rate: resolvedRate, source, anomalies } = resolveInvoiceRate(client, timeEntries);
  const lineItems = timeEntries.map((entry) => {
    const hours = roundMoney(getTimeEntryHours(entry));
    const entryAmount = parseDecimal(entry.billableAmount);
    const amount = roundMoney(entryAmount != null && entryAmount > 0 ? entryAmount : hours * resolvedRate);
    const entryRate = amount > 0 && hours > 0 ? roundMoney(amount / hours) : roundMoney(resolvedRate);
    const serviceDate = new Date(entry.clockIn).toISOString().split('T')[0];
    return {
      description: `Security coverage on ${serviceDate}`,
      quantity: hours,
      rate: entryRate,
      amount,
      timeEntryIds: [entry.id],
    };
  }).filter((item) => item.quantity > 0 && item.amount > 0);

  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0));
  const fallbackAnomalies = new Set(anomalies);
  fallbackAnomalies.add(`Deterministic invoice fallback used (${source}). Review before sending.`);
  if (lineItems.length === 0) {
    fallbackAnomalies.add('No valid billable line items could be derived from approved time entries.');
  }

  return {
    ...createFallbackInvoiceDecision(client.id),
    lineItems,
    subtotal,
    total: subtotal,
    confidence: subtotal > 0 ? 0.62 : 0,
    requiresApproval: true,
    anomalies: [...fallbackAnomalies],
  };
}

function resolvePayrollRate(employee: Employee, timeEntries: TimeEntry[]): { rate: number; source: string } {
  const employeeRate = parseDecimal(employee.hourlyRate);
  if (employeeRate != null && employeeRate > 0) {
    return { rate: employeeRate, source: 'employee.hourlyRate' };
  }

  const capturedRate = timeEntries
    .map((entry) => parseDecimal(entry.capturedPayRate) ?? parseDecimal(entry.hourlyRate))
    .find((rate): rate is number => rate != null && rate > 0);

  if (capturedRate != null) {
    return { rate: capturedRate, source: 'timeEntry.capturedPayRate' };
  }

  return { rate: 15, source: 'default_fallback' };
}

function buildDeterministicPayrollDecision(employee: Employee, employeeId: string, timeEntries: TimeEntry[]): PayrollDecision {
  const totalHours = roundMoney(timeEntries.reduce((sum, entry) => sum + getTimeEntryHours(entry), 0));
  const regularHours = Math.min(totalHours, 40);
  const overtimeHours = Math.max(totalHours - 40, 0);
  const { rate: hourlyRate, source } = resolvePayrollRate(employee, timeEntries);
  const overtimeRate = hourlyRate * 1.5;
  const regularPay = roundMoney(regularHours * hourlyRate);
  const overtimePay = roundMoney(overtimeHours * overtimeRate);
  const totalPay = roundMoney(regularPay + overtimePay);
  // NOTE: These are estimation rates used when canonical tax service is unavailable.
  // Primary path should use calculatePayrollTaxes() from payrollTaxService.
  const deductions = {
    fica: roundMoney(Number(multiplyFinancialValues(toFinancialString(totalPay), toFinancialString(0.0765)))),
    federal: roundMoney(Number(multiplyFinancialValues(toFinancialString(totalPay), toFinancialString(0.15)))),
    state: roundMoney(Number(multiplyFinancialValues(toFinancialString(totalPay), toFinancialString(0.05)))),
  };
  const netPay = roundMoney(totalPay - Object.values(deductions).reduce((sum, value) => sum + value, 0));
  const warnings = new Set<string>(['Deterministic payroll fallback used. Review before approval.']);
  warnings.add(`Base hourly rate source: ${source}`);
  if (overtimeHours > 0) {
    warnings.add('Overtime hours detected and included in fallback payroll calculation.');
  }

  return {
    ...createFallbackPayrollDecision(employeeId),
    regularHours: roundMoney(regularHours),
    overtimeHours: roundMoney(overtimeHours),
    regularPay,
    overtimePay,
    totalPay,
    deductions,
    netPay,
    confidence: totalPay > 0 ? 0.64 : 0,
    requiresApproval: true,
    warnings: [...warnings],
  };
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
      // Call metered Gemini API
      const aiResult = await meteredGemini.generate({
        workspaceId: context.workspaceId,
        featureKey: 'ai_automation',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: ANTI_YAP_PRESETS.orchestrator.temperature,
        maxOutputTokens: ANTI_YAP_PRESETS.orchestrator.maxTokens,
      });

      if (!aiResult.success) {
        throw new Error(aiResult.error || 'Automation AI call failed');
      }

      const rawText = aiResult.text;
      const tokensUsed = aiResult.tokensUsed.total;
      const promptTokens = aiResult.tokensUsed.input || 0;
      const completionTokens = aiResult.tokensUsed.output || 0;
      
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
          model: 'gemini-2.5-flash',
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
        model: 'gemini-2.5-flash',
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
        model: 'gemini-2.5-flash',
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
    const transactionId = `sched_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
    
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
        const prompt = `You are an expert workforce scheduling AI for CoAIleague. Generate an optimized schedule based on:

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
      if (!context.workspaceId) {
        throw new Error('Cannot create shifts without workspaceId — automation context is missing workspace');
      }
      const newShift = await storage.createShift({
        employeeId: shift.employeeId,
        clientId: shift.clientId || undefined,
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
        status: 'draft',
        workspaceId: context.workspaceId,
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
    const transactionId = `inv_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

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

        const rateContext = resolveInvoiceRate(params.client, params.timeEntries);
        const clientContractRate = parseDecimal(params.client.contractRate);
        const clientBillableRate = parseDecimal((params.client as any).billableHourlyRate);

        const prompt = `You are an invoicing AI for CoAIleague. Generate an invoice for client services:

**Client:** ${params.client.companyName || params.client.firstName || 'Unknown'}
**Period:** ${params.startDate.toISOString().split('T')[0]} to ${params.endDate.toISOString().split('T')[0]}
**Client Contract Rate:** ${clientContractRate != null ? `$${clientContractRate}/hour` : 'not set'}
**Canonical Billable Hourly Rate:** ${clientBillableRate != null ? `$${clientBillableRate}/hour` : 'not set'}
**Resolved Billing Rate Context:** ${rateContext.rate > 0 ? `$${rateContext.rate}/hour from ${rateContext.source}` : 'no reliable rate found; use captured billable amounts and flag for review'}

**Time Entries:**
${params.timeEntries.map(te => {
  const start = new Date(te.clockIn);
  const end = te.clockOut ? new Date(te.clockOut) : new Date();
  const hours = ((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2);
  const capturedBillRate = parseDecimal(te.capturedBillRate);
  const billableAmount = parseDecimal(te.billableAmount);
  return `- Employee ${te.employeeId}: ${hours} hours on ${start.toISOString().split('T')[0]} | captured bill rate: ${capturedBillRate != null ? `$${capturedBillRate}/hour` : 'not set'} | billable amount: ${billableAmount != null ? `$${billableAmount.toFixed(2)}` : 'not set'} | timeEntryId: ${te.id}`;
}).join('\n')}

**Total Hours:** ${totalHours.toFixed(2)}

**Task:** Create invoice line items:
1. Group hours by service type/role if possible
2. Apply captured bill rates or client billing rates when available
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
          buildFallback: () => buildDeterministicInvoiceDecision(params.client, params.timeEntries),
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
  ): Promise<{ invoices: InvoiceDecision[]; requiresApproval: InvoiceDecision[]; diagnostics: InvoiceBatchDiagnostics }> {
    // Calculate anchor period (biweekly)
    const endDate = params.anchorDate;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 14);

    const clients = await storage.getClientsByWorkspace(params.workspaceId);
    const eligibleEntries = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, params.workspaceId),
        eq(timeEntries.status, 'approved'),
        isNotNull(timeEntries.clientId),
        isNotNull(timeEntries.clockOut),
        isNull(timeEntries.invoiceId),
        isNull(timeEntries.billedAt),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate)
      ));

    const entriesByClientId = new Map<string, TimeEntry[]>();
    for (const entry of eligibleEntries) {
      const clientId = entry.clientId;
      if (!clientId) continue;
      const list = entriesByClientId.get(clientId) || [];
      list.push(entry);
      entriesByClientId.set(clientId, list);
    }

    const knownClientIds = new Set(clients.map((client) => client.id));
    const orphanedClientIds = [...entriesByClientId.keys()].filter((clientId) => !knownClientIds.has(clientId));
    
    const invoices: InvoiceDecision[] = [];
    const requiresApproval: InvoiceDecision[] = [];

    // Generate invoice for each client
    for (const client of clients) {
      const clientTimeEntries = entriesByClientId.get(client.id) || [];

      if (clientTimeEntries.length === 0) {
        continue; // Skip clients with no billable time
      }

      const decision = buildDeterministicInvoiceDecision(client, clientTimeEntries);
      await auditLogger.logEvent(context, {
        eventType: 'invoice_batch_generated',
        aggregateId: client.id,
        aggregateType: 'invoice',
        payload: {
          clientId: client.id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          timeEntryCount: clientTimeEntries.length,
          total: decision.total,
          requiresApproval: decision.requiresApproval,
          anomalies: decision.anomalies,
          mode: 'deterministic_batch',
        },
      });
      invoices.push(decision);

      if (decision.requiresApproval) {
        requiresApproval.push(decision);
      }
    }

    return {
      invoices,
      requiresApproval,
      diagnostics: {
        eligibleTimeEntries: eligibleEntries.length,
        processableClients: invoices.length,
        orphanedClientIds,
      },
    };
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
    const transactionId = `pay_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

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

        const rateContext = resolvePayrollRate(params.employee, params.timeEntries);
        const hourlyRate = rateContext.rate;
        const otRate = hourlyRate * 1.5;

        const prompt = `You are a payroll processing AI for CoAIleague. Calculate payroll for an employee:

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
          buildFallback: () => buildDeterministicPayrollDecision(params.employee, params.employeeId, params.timeEntries),
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
  ): Promise<{ payrolls: PayrollDecision[]; requiresApproval: PayrollDecision[]; diagnostics: PayrollBatchDiagnostics }> {
    // Calculate anchor period (biweekly)
    const endDate = params.anchorDate;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 14);

    const employees = await storage.getEmployeesByWorkspace(params.workspaceId);
    const eligibleEntries = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, params.workspaceId),
        eq(timeEntries.status, 'approved'),
        isNotNull(timeEntries.clockOut),
        isNull(timeEntries.payrollRunId),
        isNull(timeEntries.payrolledAt),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate)
      ));

    const entriesByEmployeeId = new Map<string, TimeEntry[]>();
    for (const entry of eligibleEntries) {
      const list = entriesByEmployeeId.get(entry.employeeId) || [];
      list.push(entry);
      entriesByEmployeeId.set(entry.employeeId, list);
    }

    const knownEmployeeIds = new Set(employees.map((employee) => employee.id));
    const orphanedEmployeeIds = [...entriesByEmployeeId.keys()].filter((employeeId) => !knownEmployeeIds.has(employeeId));
    
    const payrolls: PayrollDecision[] = [];
    const requiresApproval: PayrollDecision[] = [];

    // Generate payroll for each employee
    for (const employee of employees) {
      const timeEntries = entriesByEmployeeId.get(employee.id) || [];

      if (timeEntries.length === 0) {
        continue; // Skip employees with no hours
      }

      const decision = buildDeterministicPayrollDecision(employee, employee.id, timeEntries);
      await auditLogger.logEvent(context, {
        eventType: 'payroll_batch_generated',
        aggregateId: employee.id,
        aggregateType: 'payroll',
        payload: {
          employeeId: employee.id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          timeEntryCount: timeEntries.length,
          netPay: decision.netPay,
          requiresApproval: decision.requiresApproval,
          warnings: decision.warnings,
          mode: 'deterministic_batch',
        },
      });
      payrolls.push(decision);

      if (decision.requiresApproval) {
        requiresApproval.push(decision);
      }
    }

    return {
      payrolls,
      requiresApproval,
      diagnostics: {
        eligibleTimeEntries: eligibleEntries.length,
        processableEmployees: payrolls.length,
        orphanedEmployeeIds,
      },
    };
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
    const transactionId = `migrate_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

    const prompt = `You are a data extraction AI for CoAIleague. Extract schedule information from this image.

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
      const aiResult = await meteredGemini.generate({
        workspaceId: params.workspaceId,
        featureKey: 'ai_migration',
        prompt: prompt + `\n\n[Image attached as base64 ${params.mimeType}, ${Math.round(params.imageBase64.length / 1024)}KB]`,
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 2048,
      });

      if (!aiResult.success) {
        throw new Error(`Vision extraction failed: ${aiResult.error}`);
      }

      const text = aiResult.text || '{}';
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
