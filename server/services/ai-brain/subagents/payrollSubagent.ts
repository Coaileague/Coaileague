/**
 * PAYROLL SUBAGENT - Fortune 500-Grade Financial Processing
 * ==========================================================
 * Immutable, Traceable, and Highly Available payroll processing with:
 * 
 * - Circuit Breaker: Graceful degradation during service failures
 * - Distributed Tracing: Unique trace IDs for every calculation request
 * - Idempotency: Prevents duplicate payments on retry scenarios
 * - Data Isolation: Separate validation from execution paths
 * - Audit Trail: Complete traceability for compliance
 */

import { db } from '../../../db';
import { 
  payrollRuns, 
  payrollEntries,
  timeEntries,
  employees,
  idempotencyKeys
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import { meteredGemini } from '../../billing/meteredGeminiClient';
import { tokenManager, TOKEN_COSTS } from '../../billing/tokenManager';
import { enhancedLLMJudge } from '../llmJudgeEnhanced';
import { trinityActionReasoner } from '../trinityActionReasoner';
import { platformEventBus } from '../../platformEventBus';
import { broadcastToWorkspace } from '../../../websocket';
import { auditLogger } from '../../audit-logger';
import { logActionAudit } from '../actionAuditLogger';
import crypto from 'crypto';
import { typedQuery } from '../../../lib/typedSql';
import { workspaces } from '@shared/schema';

import { createLogger } from '../../../lib/logger';
import { withDistributedLock, LOCK_KEYS } from '../../distributedLock';
const log = createLogger('PayrollSubagent');

// Phase 17C: workspace-scoped lock key derived from PAYROLL_AUTO_CLOSE base.
// 32-bit-stable hash of workspaceId offset by the base key keeps lock keys
// inside the safe int range while ensuring two workspaces never collide.
function payrollLockKeyFor(workspaceId: string): number {
  let h = 0;
  for (let i = 0; i < workspaceId.length; i++) {
    h = (h * 31 + workspaceId.charCodeAt(i)) | 0;
  }
  // shift into high range to avoid collision with reserved LOCK_KEYS values
  return (LOCK_KEYS.PAYROLL_AUTO_CLOSE * 100000) + (Math.abs(h) % 100000);
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: 'closed' | 'open' | 'half-open';
  nextRetry: Date | null;
}

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  metadata: Record<string, any>;
}

interface PayrollExecutionResult {
  success: boolean;
  traceId: string;
  payrollRunId?: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  processingTimeMs: number;
  retryCount: number;
  idempotencyKey: string;
  issues: PayrollIssue[];
  auditLog: AuditEntry[];
}

interface PayrollIssue {
  severity: 'critical' | 'warning' | 'info';
  type: 'validation' | 'calculation' | 'compliance' | 'integration';
  description: string;
  employeeId?: string;
  resolution?: string;
}

interface AuditEntry {
  timestamp: Date;
  traceId: string;
  spanId: string;
  action: string;
  status: 'started' | 'completed' | 'failed';
  details: Record<string, any>;
  durationMs?: number;
}

interface RetryStrategy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: 'closed',
    nextRetry: null,
  };
  
  private readonly failureThreshold = 5;
  private readonly recoveryTimeMs = 30000; // 30 seconds
  private readonly halfOpenMaxTests = 3;
  private halfOpenTests = 0;

  isOpen(): boolean {
    if (this.state.state === 'open') {
      if (this.state.nextRetry && new Date() >= this.state.nextRetry) {
        this.state.state = 'half-open';
        this.halfOpenTests = 0;
        log.info('[PayrollSubagent] Circuit breaker entering half-open state');
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    if (this.state.state === 'half-open') {
      this.halfOpenTests++;
      if (this.halfOpenTests >= this.halfOpenMaxTests) {
        this.state.state = 'closed';
        this.state.failures = 0;
        log.info('[PayrollSubagent] Circuit breaker closed after successful recovery');
      }
    } else {
      this.state.failures = 0;
    }
  }

  recordFailure(error: Error): void {
    this.state.failures++;
    this.state.lastFailure = new Date();
    
    if (this.state.state === 'half-open') {
      this.state.state = 'open';
      this.state.nextRetry = new Date(Date.now() + this.recoveryTimeMs);
      log.info(`[PayrollSubagent] Circuit breaker reopened after half-open failure: ${error.message}`);
    } else if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'open';
      this.state.nextRetry = new Date(Date.now() + this.recoveryTimeMs);
      log.info(`[PayrollSubagent] Circuit breaker opened after ${this.state.failures} failures`);
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

// ============================================================================
// DISTRIBUTED TRACING IMPLEMENTATION
// ============================================================================

class DistributedTracer {
  private traces: Map<string, TraceContext> = new Map();
  private auditLog: AuditEntry[] = [];

  startTrace(operation: string, metadata: Record<string, any> = {}): TraceContext {
    const traceId = `prl-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const spanId = crypto.randomBytes(4).toString('hex');
    
    const context: TraceContext = {
      traceId,
      spanId,
      operation,
      startTime: Date.now(),
      metadata,
    };
    
    this.traces.set(traceId, context);
    this.logAudit(traceId, spanId, operation, 'started', metadata);
    
    log.info(`[PayrollSubagent] Trace started: ${traceId} - ${operation}`);
    return context;
  }

  startSpan(parentContext: TraceContext, operation: string): TraceContext {
    const spanId = crypto.randomBytes(4).toString('hex');
    
    const context: TraceContext = {
      traceId: parentContext.traceId,
      spanId,
      parentSpanId: parentContext.spanId,
      operation,
      startTime: Date.now(),
      metadata: {},
    };
    
    this.logAudit(context.traceId, spanId, operation, 'started', { parentSpan: parentContext.spanId });
    return context;
  }

  endSpan(context: TraceContext, status: 'completed' | 'failed', details: Record<string, any> = {}): void {
    const duration = Date.now() - context.startTime;
    this.logAudit(context.traceId, context.spanId, context.operation, status, { ...details, durationMs: duration });
    
    if (status === 'completed') {
      log.info(`[PayrollSubagent] Span completed: ${context.spanId} - ${context.operation} (${duration}ms)`);
    } else {
      log.info(`[PayrollSubagent] Span failed: ${context.spanId} - ${context.operation} (${duration}ms)`);
    }
  }

  endTrace(context: TraceContext, status: 'completed' | 'failed', details: Record<string, any> = {}): void {
    const duration = Date.now() - context.startTime;
    this.logAudit(context.traceId, context.spanId, context.operation, status, { ...details, totalDurationMs: duration });
    this.traces.delete(context.traceId);
    
    log.info(`[PayrollSubagent] Trace ${status}: ${context.traceId} (${duration}ms)`);
  }

  private logAudit(traceId: string, spanId: string, action: string, status: 'started' | 'completed' | 'failed', details: Record<string, any>): void {
    this.auditLog.push({
      timestamp: new Date(),
      traceId,
      spanId,
      action,
      status,
      details,
      durationMs: details.durationMs,
    });

    // Keep last 1000 entries in memory
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    // Phase 17C: persist terminal-state spans to canonical audit_logs
    // (CLAUDE.md Section L). 'started' rows are skipped to keep durable
    // log volume bounded.
    if (status !== 'started' && action.startsWith('payroll.')) {
      const wsId = (details as any)?.workspaceId ?? null;
      void logActionAudit({
        actionId: action,
        workspaceId: wsId,
        entityType: 'payroll_run',
        entityId: (details as any)?.payrollRunId ?? null,
        success: status === 'completed',
        message: `subagent.${action}.${status}`,
        payload: { traceId, spanId, ...details },
        errorMessage: status === 'failed' ? ((details as any)?.error ?? null) : null,
        durationMs: typeof details.durationMs === 'number' ? details.durationMs : undefined,
      });
    }
  }

  getAuditLog(traceId?: string): AuditEntry[] {
    if (traceId) {
      return this.auditLog.filter(e => e.traceId === traceId);
    }
    return [...this.auditLog];
  }
}

// ============================================================================
// PAYROLL SUBAGENT SERVICE
// ============================================================================

class PayrollSubagentService {
  private static instance: PayrollSubagentService;
  private circuitBreaker = new CircuitBreaker();
  private tracer = new DistributedTracer();
  private retryStrategy: RetryStrategy = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };

  static getInstance(): PayrollSubagentService {
    if (!PayrollSubagentService.instance) {
      PayrollSubagentService.instance = new PayrollSubagentService();
    }
    return PayrollSubagentService.instance;
  }

  // ---------------------------------------------------------------------------
  // IDEMPOTENT PAYROLL EXECUTION
  // ---------------------------------------------------------------------------
  async executePayroll(
    workspaceId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
    options: {
      validateOnly?: boolean;
      forceReprocess?: boolean;
      employeeIds?: string[];
    } = {}
  ): Promise<PayrollExecutionResult> {
    // Generate idempotency key
    const idempotencyKey = this.generateIdempotencyKey(workspaceId, payPeriodStart, payPeriodEnd);
    
    // Check for existing execution
    if (!options.forceReprocess) {
      const existing = await this.checkIdempotency(idempotencyKey);
      if (existing) {
        log.info(`[PayrollSubagent] Returning cached result for idempotency key: ${idempotencyKey}`);
        return existing;
      }
    }

    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      const state = this.circuitBreaker.getState();
      throw new Error(`Payroll service temporarily unavailable. Circuit breaker open until ${state.nextRetry?.toISOString()}`);
    }

    // === TRINITY PRE-EXECUTION REASONING (T005) ===
    // Trinity evaluates the payroll scope BEFORE any credits are charged or
    // calculations begin. If Trinity blocks, we stop here without spending resources.
    // W2/1099 awareness is built into the reasoning prompt via trinityActionReasoner.
    try {
      const prePayrollReasoning = await trinityActionReasoner.reason({
        domain: 'payroll_execute',
        workspaceId,
        actionSummary: `Execute payroll: period ${payPeriodStart.toISOString().slice(0, 10)} – ${payPeriodEnd.toISOString().slice(0, 10)}${options.validateOnly ? ' (validate only)' : ''}${options.forceReprocess ? ' (force reprocess)' : ''}`,
        payload: {
          periodStart: payPeriodStart.toISOString(),
          periodEnd: payPeriodEnd.toISOString(),
          validateOnly: options.validateOnly,
          forceReprocess: options.forceReprocess,
          employeeCount: options.employeeIds?.length || 0,
        },
      });

      log.info(`[PayrollSubagent] Trinity pre-execution: ${prePayrollReasoning.decision.toUpperCase()} (confidence: ${(prePayrollReasoning.confidence * 100).toFixed(0)}%) — ${prePayrollReasoning.reasoning}`);

      if (prePayrollReasoning.laborLawFlags.length > 0) {
        log.warn(`[PayrollSubagent] Trinity labor law flags:`, prePayrollReasoning.laborLawFlags);
      }

      if (prePayrollReasoning.decision === 'block') {
        const blockResult: PayrollExecutionResult = {
          success: false,
          traceId: `trinity-blocked-${Date.now()}`,
          payrollRunId: undefined,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
          employeeCount: 0,
          processingTimeMs: 0,
          retryCount: 0,
          idempotencyKey,
          issues: [{
            severity: 'critical',
            type: 'compliance',
            description: `Trinity blocked payroll execution: ${prePayrollReasoning.blockReason || prePayrollReasoning.reasoning}`,
            resolution: prePayrollReasoning.recommendations.join('; ') || 'Review payroll scope before re-running',
          }],
          auditLog: [],
        };
        return blockResult;
      }
    } catch (reasonErr) {
      log.warn(`[PayrollSubagent] Trinity pre-execution reasoning failed (non-blocking):`, reasonErr instanceof Error ? reasonErr.message : 'unknown');
    }
    // === END PRE-EXECUTION REASONING ===

    // Start distributed trace
    const trace = this.tracer.startTrace('payroll.execute', {
      workspaceId,
      payPeriodStart: payPeriodStart.toISOString(),
      payPeriodEnd: payPeriodEnd.toISOString(),
      idempotencyKey,
    });

    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | null = null;

    const sessionFee = TOKEN_COSTS['payroll_session_fee'] || 35;
    try {
      await tokenManager.recordUsage({
        workspaceId,
        userId: 'payroll-subagent',
        featureKey: 'payroll_session_fee',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: 'Payroll Processing Fee',
        description: `Payroll session ${trace.traceId.substring(0, 16)} — processing fee (calculation, validation, compliance checks)`,
      });
      log.info(`[PayrollSubagent] Session fee charged: ${sessionFee} credits for workspace ${workspaceId}`);
    } catch (feeErr: any) {
      log.error(`[PayrollSubagent] Session fee deduction failed for workspace ${workspaceId}:`, feeErr.message);
      this.tracer.endTrace(trace, 'failed', { error: 'billing_failed', message: feeErr.message });
      return {
        success: false,
        payrollRunId: `billing-failed-${Date.now()}`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        summary: { totalEmployees: 0, processedCount: 0, failedCount: 0, totalGrossPay: '0', totalNetPay: '0', totalDeductions: '0', totalTaxes: '0' },
        employees: [],
        errors: [{ employeeId: 'billing', error: `Insufficient credits or billing error: ${feeErr.message}` }],
        metadata: { startTime: new Date().toISOString(), endTime: new Date().toISOString(), processingTimeMs: 0, retryCount: 0 },
      };
    }

    const lockKey = payrollLockKeyFor(workspaceId);

    while (retryCount <= this.retryStrategy.maxRetries) {
      try {
        // Phase 17C: workspace-scoped advisory lock prevents concurrent payroll
        // cycles for the same tenant from racing on time-entry snapshots.
        const lockedResult = await withDistributedLock(
          lockKey,
          `payroll-execute:${workspaceId}`,
          () => this.executePayrollInternal(trace, workspaceId, payPeriodStart, payPeriodEnd, options),
        );

        if (lockedResult === null) {
          // Another payroll cycle for this workspace is in flight. Surface a
          // typed result rather than silently retrying, so the caller can
          // re-poll the in-flight idempotency key instead.
          this.tracer.endTrace(trace, 'failed', { error: 'concurrent_payroll_in_flight' });
          return {
            success: false,
            traceId: trace.traceId,
            totalGross: 0,
            totalDeductions: 0,
            totalNet: 0,
            employeeCount: 0,
            processingTimeMs: Date.now() - startTime,
            retryCount,
            idempotencyKey,
            issues: [{
              severity: 'critical',
              type: 'integration',
              description: 'Another payroll cycle is currently executing for this workspace. Wait for it to complete and re-check the idempotency key.',
            }],
            auditLog: this.tracer.getAuditLog(trace.traceId),
          };
        }

        const result = lockedResult;

        this.circuitBreaker.recordSuccess();
        this.tracer.endTrace(trace, 'completed', { success: true });

        // Store idempotency result
        await this.storeIdempotencyResult(idempotencyKey, result);

        // === TRINITY POST-RUN REFLECTION (T005) ===
        // Record Trinity's reflection after the payroll run completes.
        // This closes the perceive→deliberate→decide→execute→reflect loop.
        try {
          const criticalIssues = result.issues.filter(i => i.severity === 'critical').length;
          await trinityActionReasoner.reflect(
            { domain: 'payroll_execute', workspaceId },
            {
              success: result.success,
              score: criticalIssues === 0 ? 0.9 : criticalIssues < 3 ? 0.6 : 0.3,
              summary: `Payroll completed: $${result.totalGross.toFixed(2)} gross, ${result.employeeCount} employees, ${result.issues.length} issues (${criticalIssues} critical)`,
            }
          );
        } catch { /* Non-blocking */ }
        // === END POST-RUN REFLECTION ===

        // PER-EMPLOYEE OCCURRENCE FEE — fires once per employee processed per payroll run.
        // Mirrors payroll bureau SaaS pricing (ADP/Gusto/Paychex charge $3-15/employee/run).
        // Our rate of 8 cr ($0.08/employee) is 40-180× cheaper than traditional bureaus.
        // Non-blocking: payroll is complete; billing failure is logged, not fatal.
        if (result.success && result.employeeCount > 0) {
          try {
            const perEmpRate = TOKEN_COSTS['per_payroll_employee'] || 8;
            const totalPerEmp = result.employeeCount * perEmpRate;
            await tokenManager.recordUsage({
              workspaceId,
              featureKey: 'per_payroll_employee',
              // @ts-expect-error — TS migration: fix in refactoring sprint
              featureName: 'Per-Employee Payroll Processing',
              description: `Payroll run ${trace.traceId.substring(0, 16)} — ${result.employeeCount} employees × ${perEmpRate}cr/employee = ${totalPerEmp}cr (total gross: $${result.totalGross.toFixed(2)})`,
              quantity: result.employeeCount,
            });
            log.info(`[PayrollSubagent] Per-employee fee charged: ${totalPerEmp}cr (${result.employeeCount} × ${perEmpRate}cr) for workspace ${workspaceId}`);
          } catch (empErr: any) {
            log.warn(`[PayrollSubagent] Per-employee billing error (non-blocking):`, empErr.message);
          }
        }

        return {
          ...result,
          traceId: trace.traceId,
          processingTimeMs: Date.now() - startTime,
          retryCount,
          idempotencyKey,
          auditLog: this.tracer.getAuditLog(trace.traceId),
        };

      } catch (error: any) {
        lastError = error;
        retryCount++;
        
        log.info(`[PayrollSubagent] Attempt ${retryCount} failed: ${(error instanceof Error ? error.message : String(error))}`);

        if (retryCount <= this.retryStrategy.maxRetries) {
          const delay = Math.min(
            this.retryStrategy.baseDelayMs * Math.pow(this.retryStrategy.backoffMultiplier, retryCount - 1),
            this.retryStrategy.maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.circuitBreaker.recordFailure(lastError!);
    this.tracer.endTrace(trace, 'failed', { error: lastError?.message });

    return {
      success: false,
      traceId: trace.traceId,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      employeeCount: 0,
      processingTimeMs: Date.now() - startTime,
      retryCount,
      idempotencyKey,
      issues: [{
        severity: 'critical',
        type: 'integration',
        description: `Payroll execution failed after ${retryCount} retries: ${lastError?.message}`,
      }],
      auditLog: this.tracer.getAuditLog(trace.traceId),
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL EXECUTION (with tracing)
  // ---------------------------------------------------------------------------
  private async executePayrollInternal(
    parentTrace: TraceContext,
    workspaceId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
    options: { validateOnly?: boolean; employeeIds?: string[] }
  ): Promise<Omit<PayrollExecutionResult, 'traceId' | 'processingTimeMs' | 'retryCount' | 'idempotencyKey' | 'auditLog'>> {
    const issues: PayrollIssue[] = [];

    // Step 1: Fetch employee data
    const fetchSpan = this.tracer.startSpan(parentTrace, 'payroll.fetch_employees');
    const employeeData = await this.fetchEmployeeData(workspaceId, options.employeeIds);
    this.tracer.endSpan(fetchSpan, 'completed', { employeeCount: employeeData.length });

    // Step 2: Fetch time entries
    const timeSpan = this.tracer.startSpan(parentTrace, 'payroll.fetch_time_entries');
    const timeData = await this.fetchTimeEntries(workspaceId, payPeriodStart, payPeriodEnd, options.employeeIds);
    this.tracer.endSpan(timeSpan, 'completed', { entryCount: timeData.length });

    // Step 2.5: Fetch workspace state for tax calculations
    const [workspaceRecord] = await db
      .select({ primaryOperatingState: workspaces.primaryOperatingState, taxJurisdiction: workspaces.taxJurisdiction })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const workspaceState = workspaceRecord?.primaryOperatingState
      || workspaceRecord?.taxJurisdiction?.toUpperCase().replace(/^US-/, '').slice(0, 2)
      || 'TX';

    // Step 3: Calculate payroll for each employee
    const calcSpan = this.tracer.startSpan(parentTrace, 'payroll.calculate');
    const { calculatePayrollTaxes } = await import('../../billing/payrollTaxService');
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    // Fetch YTD Social Security already withheld this calendar year (for SS wage-base cap)
    const calendarYearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const ytdSSByEmployee = new Map<string, number>();
    if (employeeData.length > 0) {
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: payroll_entries | Verified: 2026-03-23
      const ytdSSRows = await typedQuery(
        sql`SELECT employee_id, COALESCE(SUM(social_security), 0)::float AS ytd_ss
            FROM payroll_entries
            WHERE workspace_id = ${workspaceId}
              AND employee_id = ANY(ARRAY[${sql.join(employeeData.map(e => sql`${e.id}`), sql`, `)}])
              AND created_at >= ${calendarYearStart}
            GROUP BY employee_id`
      );
      for (const r of ytdSSRows as any[]) {
        ytdSSByEmployee.set(r.employee_id as string, parseFloat(r.ytd_ss as string) || 0);
      }
    }

    const calculations = employeeData.map(emp => {
      const empTimeEntries = timeData.filter(t => t.employeeId === emp.id);
      const hours = empTimeEntries.reduce((sum, t) => sum + (parseFloat(t.totalHours?.toString() || '0')), 0);
      // Use actual employee hourly rate - log warning if missing
      const rate = parseFloat(emp.hourlyRate?.toString() || '0');
      if (!emp.hourlyRate || rate === 0) {
        log.warn(`[PayrollSubagent] Employee ${emp.id} has no hourly rate configured - cannot calculate pay`);
      }

      const gross = hours * rate;

      // Real tax withholding — 2024 IRS Percentage Method + FICA
      let federalWithholding = 0;
      let socialSecurity = 0;
      let medicare = 0;
      let stateWithholding = 0;
      let totalEmployeeTax = 0;

      if (gross > 0) {
        try {
          const wsState = workspaceState;
          const taxes = calculatePayrollTaxes({
            grossWage: gross,
            state: wsState,
            payPeriod: 'biweekly',
            filingStatus: 'single',
            ytdSocialSecurity: ytdSSByEmployee.get(emp.id) ?? 0,
          });
          federalWithholding = taxes.federalWithholding;
          socialSecurity = taxes.socialSecurity;
          medicare = taxes.medicare;
          stateWithholding = taxes.stateWithholding;
          totalEmployeeTax = taxes.totalDeductions;
        } catch (taxErr: any) {
          log.warn(`[PayrollSubagent] Tax calc error for employee ${emp.id}, using 22% estimate: ${taxErr.message}`);
          totalEmployeeTax = gross * 0.22;
        }
      }

      const deductions = totalEmployeeTax;
      const net = gross - deductions;

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      // Validate
      if (hours === 0 && emp.workerType === 'employee') {
        issues.push({
          severity: 'warning',
          type: 'validation',
          description: `No hours recorded for full-time employee`,
          employeeId: emp.id,
          resolution: 'Review timesheet entries',
        });
      }

      if (hours > 80) {
        issues.push({
          severity: 'critical',
          type: 'compliance',
          description: `Excessive hours (${hours.toFixed(1)}h) may violate labor laws`,
          employeeId: emp.id,
          resolution: 'Verify overtime approval and compliance',
        });
      }

      return {
        employeeId: emp.id, hours, gross, deductions, net,
        taxBreakdown: { federalWithholding, socialSecurity, medicare, stateWithholding },
      };
    });

    this.tracer.endSpan(calcSpan, 'completed', { 
      totalGross, 
      totalDeductions, 
      totalNet,
      issueCount: issues.length,
    });

    // Step 4: LLM Judge Risk Evaluation (Safety Gate)
    const riskSpan = this.tracer.startSpan(parentTrace, 'payroll.llm_judge_evaluation');
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const warningIssues = issues.filter(i => i.severity === 'warning');
    const overtimePercent = employeeData.length > 0 
      ? (calculations.filter(c => c.hours > 40).length / employeeData.length) * 100 
      : 0;

    try {
      await enhancedLLMJudge.initialize();
      const riskEvaluation = await enhancedLLMJudge.evaluateRisk({
        subjectId: `payroll-${workspaceId}-${payPeriodStart.toISOString()}`,
        subjectType: 'workflow',
        content: {
          totalAmount: totalGross,
          employeeCount: employeeData.length,
          criticalIssues: criticalIssues.length,
          warningIssues: warningIssues.length,
          overtimePercent: overtimePercent.toFixed(1),
        },
        context: {
          payPeriodStart: payPeriodStart.toISOString(),
          payPeriodEnd: payPeriodEnd.toISOString(),
          anomaliesDetected: criticalIssues.map(i => i.description),
        },
        workspaceId,
        affectsFinancials: true,
        isDestructive: false,
        domain: 'payroll',
        actionType: 'payroll.process',
      });

      this.tracer.endSpan(riskSpan, 'completed', {
        riskScore: riskEvaluation.riskScore,
        verdict: riskEvaluation.verdict,
        approved: riskEvaluation.verdict === 'approved',
      });

      // Audit log the LLM Judge decision
      await auditLogger.logEvent(
        {
          actorId: 'trinity-llm-judge',
          actorType: 'AI_AGENT',
          actorName: 'Trinity LLM Judge',
          workspaceId,
        },
        {
          eventType: 'llm_judge.payroll_evaluation',
          aggregateId: `payroll-${workspaceId}-${payPeriodStart.toISOString()}`,
          aggregateType: 'payroll_run',
          payload: {
            verdict: riskEvaluation.verdict,
            riskScore: riskEvaluation.riskScore,
            riskLevel: riskEvaluation.riskLevel,
            confidenceScore: riskEvaluation.confidenceScore,
            totalGross,
            employeeCount: employeeData.length,
            criticalIssues: criticalIssues.length,
            reasoning: riskEvaluation.reasoning,
            recommendations: riskEvaluation.recommendations,
          },
        },
        { generateHash: true }
      ).catch(err => log.error('[PayrollSubagent] Audit log failed:', (err instanceof Error ? err.message : String(err))));

      // Block execution if risk is too high
      if (riskEvaluation.verdict === 'blocked' || riskEvaluation.verdict === 'rejected') {
        log.info(`[PayrollSubagent] LLM Judge BLOCKED payroll: ${riskEvaluation.reasoning}`);
        
        // Emit escalation event
        platformEventBus.publish({
          type: 'payroll_escalation',
          category: 'payroll',
          title: 'Payroll Blocked — Risk Too High',
          description: riskEvaluation.reasoning || 'LLM Judge blocked payroll run due to high risk score.',
          workspaceId,
          metadata: {
            riskScore: riskEvaluation.riskScore,
            recommendations: riskEvaluation.recommendations,
            requiresApproval: true,
          },
          visibility: 'manager',
        }).catch((err) => log.warn('[payrollSubagent] Fire-and-forget failed:', err));

        return {
          success: false,
          totalGross,
          totalDeductions,
          totalNet,
          employeeCount: employeeData.length,
          issues: [{
            severity: 'critical',
            type: 'compliance',
            description: `LLM Judge blocked execution: ${riskEvaluation.reasoning}`,
            resolution: riskEvaluation.recommendations.join('; '),
          }, ...issues],
        };
      }

      // Log approval for audit trail
      if (riskEvaluation.verdict === 'needs_review') {
        log.info(`[PayrollSubagent] LLM Judge flagged for review but proceeding: ${riskEvaluation.reasoning}`);
        issues.push({
          severity: 'warning',
          type: 'validation',
          description: `LLM Judge flagged: ${riskEvaluation.reasoning}`,
          resolution: 'Proceeding with caution - admin review recommended',
        });
      }
    } catch (riskError: any) {
      log.error('[PayrollSubagent] LLM Judge evaluation failed, proceeding with caution:', riskError.message);
      this.tracer.endSpan(riskSpan, 'failed', { error: riskError.message });
    }

    // Step 5: Create payroll run (if not validate only and approved by LLM Judge)
    if (!options.validateOnly) {
      const createSpan = this.tracer.startSpan(parentTrace, 'payroll.create_run');
      
      try {
        const [payrollRun] = await db.insert(payrollRuns).values({
          workspaceId,
          periodStart: payPeriodStart,
          periodEnd: payPeriodEnd,
          totalGrossPay: totalGross.toFixed(2),
          totalTaxes: totalDeductions.toFixed(2),
          totalNetPay: totalNet.toFixed(2),
          status: 'pending',
        }).returning();

        this.tracer.endSpan(createSpan, 'completed', { payrollRunId: payrollRun.id });

        broadcastToWorkspace(workspaceId, { type: 'payroll_updated', action: 'payroll_run_created', payrollRunId: payrollRun.id });
        platformEventBus.publish({
          type: 'payroll_run_created',
          category: 'payroll',
          title: 'Payroll Run Created by Trinity',
          description: `Trinity AI created payroll run — gross $${totalGross.toFixed(2)}, net $${totalNet.toFixed(2)} — status: pending`,
          workspaceId,
          metadata: { payrollRunId: payrollRun.id, totalGross, totalNet, totalDeductions, status: 'pending', source: 'payroll_subagent' },
          visibility: 'manager',
        }).catch((err) => log.warn('[payrollSubagent] Fire-and-forget failed:', err));
      } catch (error: any) {
        this.tracer.endSpan(createSpan, 'failed', { error: (error instanceof Error ? error.message : String(error)) });
        throw error;
      }
    }

    return {
      success: issues.filter(i => i.severity === 'critical').length === 0,
      totalGross,
      totalDeductions,
      totalNet,
      employeeCount: employeeData.length,
      issues,
    };
  }

  // ---------------------------------------------------------------------------
  // ANOMALY DETECTION (AI-powered)
  // ---------------------------------------------------------------------------
  async detectAnomalies(
    workspaceId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date
  ): Promise<{
    anomalies: Array<{
      type: string;
      severity: 'high' | 'medium' | 'low';
      description: string;
      affectedEmployees: string[];
      suggestedAction: string;
    }>;
    aiInsights: string;
  }> {
    const trace = this.tracer.startTrace('payroll.detect_anomalies', { workspaceId });

    try {
      // Fetch current and historical data
      const [currentData, historicalRuns] = await Promise.all([
        this.fetchTimeEntries(workspaceId, payPeriodStart, payPeriodEnd),
        this.fetchHistoricalPayrollRuns(workspaceId, 6),
      ]);

      const anomalies: Array<{
        type: string;
        severity: 'high' | 'medium' | 'low';
        description: string;
        affectedEmployees: string[];
        suggestedAction: string;
      }> = [];

      // Detect sudden hour spikes
      const hoursByEmployee = new Map<string, number>();
      for (const entry of currentData) {
        const hours = parseFloat(entry.totalHours?.toString() || '0');
        hoursByEmployee.set(entry.employeeId, (hoursByEmployee.get(entry.employeeId) || 0) + hours);
      }

      // Check for overtime anomalies
      for (const [empId, hours] of hoursByEmployee) {
        if (hours > 50) {
          anomalies.push({
            type: 'excessive_overtime',
            severity: 'high',
            description: `${hours.toFixed(1)} hours detected - significantly over 40h standard`,
            affectedEmployees: [empId],
            suggestedAction: 'Review overtime authorization and consider workload redistribution',
          });
        }
      }

      // Check for historical variance
      if (historicalRuns.length > 0) {
        const avgHistoricalGross = historicalRuns.reduce((sum, r) =>
          sum + parseFloat(r.totalGrossPay?.toString() || '0'), 0) / historicalRuns.length;

        // Calculate estimated gross using actual employee rates from database
        let currentEstimatedGross = 0;
        for (const [empId, hours] of hoursByEmployee) {
          const empData = await this.fetchEmployeeData(workspaceId, [empId]);
          const emp = empData[0];
          const rate = parseFloat(emp?.hourlyRate?.toString() || '0');
          if (rate > 0) {
            currentEstimatedGross += hours * rate;
          } else {
            log.warn(`[PayrollSubagent] Employee ${empId} missing rate in anomaly detection - skipping`);
          }
        }
        const variance = avgHistoricalGross > 0
          ? ((currentEstimatedGross - avgHistoricalGross) / avgHistoricalGross) * 100
          : 0;

        if (Math.abs(variance) > 20) {
          anomalies.push({
            type: 'gross_variance',
            severity: variance > 30 ? 'high' : 'medium',
            description: `${variance.toFixed(1)}% ${variance > 0 ? 'increase' : 'decrease'} from historical average`,
            affectedEmployees: [],
            suggestedAction: 'Review staffing changes, overtime, or rate adjustments',
          });
        }
      }

      // Generate AI insights
      const aiInsights = await this.generateAnomalyInsights(workspaceId, anomalies, hoursByEmployee.size);

      this.tracer.endTrace(trace, 'completed', { anomalyCount: anomalies.length });

      return { anomalies, aiInsights };

    } catch (error: any) {
      this.tracer.endTrace(trace, 'failed', { error: (error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------------------------------

  private generateIdempotencyKey(workspaceId: string, start: Date, end: Date): string {
    const data = `${workspaceId}-${start.toISOString()}-${end.toISOString()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  private async checkIdempotency(key: string): Promise<PayrollExecutionResult | null> {
    try {
      const [existing] = await db.select()
        .from(idempotencyKeys)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .where(eq(idempotencyKeys.key, key))
        .limit(1);

      if (existing && existing.resultId) {
        return existing.resultId as unknown as PayrollExecutionResult;
      }
    } catch (error) {
      // Idempotency check failed, proceed with new execution
    }
    return null;
  }

  private async storeIdempotencyResult(key: string, result: any): Promise<void> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(idempotencyKeys).values({
        workspaceId: 'system',
        key,
        result,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }).onConflictDoUpdate({
        target: (idempotencyKeys as any).key,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        set: { result, updatedAt: new Date() },
      });
    } catch (error) {
      log.error('[PayrollSubagent] Failed to store idempotency result:', error);
    }
  }

  private async fetchEmployeeData(workspaceId: string, employeeIds?: string[]) {
    let query = db.select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));

    return await query;
  }

  private async fetchTimeEntries(workspaceId: string, start: Date, end: Date, employeeIds?: string[]) {
    return await db.select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.clockIn, start),
        lte(timeEntries.clockIn, end)
      ));
  }

  private async fetchHistoricalPayrollRuns(workspaceId: string, count: number) {
    return await db.select()
      .from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, workspaceId))
      .orderBy(desc(payrollRuns.periodEnd))
      .limit(count);
  }

  private async generateAnomalyInsights(workspaceId: string, anomalies: any[], employeeCount: number): Promise<string> {
    if (anomalies.length === 0) {
      return 'No significant anomalies detected. Payroll appears consistent with historical patterns.';
    }

    try {
      const prompt = `Analyze these payroll anomalies and provide actionable insights:
${anomalies.map(a => `- [${a.severity.toUpperCase()}] ${a.type}: ${a.description}`).join('\n')}

Provide 2-3 sentences of executive-level insights and recommended actions.`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'payroll_anomaly_insights',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 300,
        metadata: { anomalyCount: anomalies.length, employeeCount }
      });
      
      if (result.success) {
        return result.text;
      }
      return `${anomalies.length} anomalies detected. Review high-severity items before processing payroll.`;
    } catch (error) {
      return `${anomalies.length} anomalies detected. Review high-severity items before processing payroll.`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public accessors
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  getAuditLog(traceId?: string): AuditEntry[] {
    return this.tracer.getAuditLog(traceId);
  }
}

export const payrollSubagent = PayrollSubagentService.getInstance();
