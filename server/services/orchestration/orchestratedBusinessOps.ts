import { automationOrchestration } from './automationOrchestration';
import { PayrollAutomationEngine } from '../payrollAutomation';
import { extractDocumentData } from '../documentExtraction';
import { platformEventBus } from '../platformEventBus';
import { executionPipeline, createHumanReviewTicket } from '../executionPipeline';
import { db } from '../../db';
import { payrollRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('orchestratedBusinessOps');


export const orchestratedPayroll = {
  async processPayroll(workspaceId: string, userId: string) {
    return automationOrchestration.executeAutomation(
      {
        domain: 'payroll',
        automationName: 'process-automated-payroll',
        automationType: 'background_process',
        workspaceId,
        userId,
        triggeredBy: 'api',
        billable: true,
        creditCost: 5,
        timeoutMs: 120000,
        payload: { workspaceId, userId },
      },
      async (ctx) => {
        const result = await PayrollAutomationEngine.processAutomatedPayroll(workspaceId, userId);
        return result;
      },
      {
        validate: async (ctx) => {
          if (!ctx.workspaceId) {
            return { valid: false, errors: ['Workspace ID is required for payroll processing'] };
          }
          return { valid: true };
        },
        notify: async (result, ctx) => {
          // DUAL-EMIT LAW: .emit() bypasses all Trinity subscribers.
          // Use canonical .publish() so trinityEventSubscriptions + automationTriggerService receive this event.
          platformEventBus.publish({
            type: 'payroll_run_processed',
            category: 'automation',
            title: 'Payroll Run Processed via Orchestration',
            description: `Payroll run ${result.payrollRunId} processed — ${result.totalEmployees} employees, net $${Number(result.totalNetPay ?? 0).toFixed(2)}`,
            workspaceId: ctx.workspaceId,
            metadata: {
              orchestrationId: ctx.orchestrationId,
              payrollRunId: result.payrollRunId,
              totalEmployees: result.totalEmployees,
              totalGrossPay: result.totalGrossPay,
              totalNetPay: result.totalNetPay,
              warningCount: result.warnings?.length ?? 0,
              source: 'orchestratedBusinessOps',
            },
          }).catch((err) => log.warn('[orchestratedBusinessOps] Fire-and-forget failed:', err));
        },
      }
    );
  },

  async approvePayroll(payrollRunId: string, approverId: string, timeEntryIds?: string[], workspaceId?: string) {
    // Resolve workspaceId from DB when not passed — never pollute Trinity event tracking with 'system'
    let resolvedWorkspaceId = workspaceId;
    if (!resolvedWorkspaceId) {
      try {
        const [run] = await db.select({ workspaceId: payrollRuns.workspaceId })
          .from(payrollRuns)
          .where(eq(payrollRuns.id, payrollRunId))
          .limit(1);
        resolvedWorkspaceId = run?.workspaceId ?? 'system';
      } catch {
        resolvedWorkspaceId = 'system';
      }
    }
    return automationOrchestration.executeAutomation(
      {
        domain: 'payroll',
        automationName: 'approve-payroll-run',
        automationType: 'background_process',
        workspaceId: resolvedWorkspaceId,
        userId: approverId,
        triggeredBy: 'api',
        payload: { payrollRunId, approverId },
      },
      async (ctx) => {
        await PayrollAutomationEngine.approvePayrollRun(payrollRunId, approverId, timeEntryIds);
        // DUAL-EMIT LAW: use platformEventBus.publish() (Trinity protocol) — NOT .emit() (Node EventEmitter).
        // .emit() bypasses all Trinity subscribers; .publish() routes to trinityEventSubscriptions + automationTriggerService.
        platformEventBus.publish({
          type: 'payroll_run_approved',
          category: 'automation',
          title: 'Payroll Run Approved',
          description: `Payroll run ${payrollRunId} approved by ${approverId} via orchestration layer`,
          workspaceId: resolvedWorkspaceId,
          metadata: {
            orchestrationId: ctx.orchestrationId,
            payrollRunId,
            approvedBy: approverId,
          },
          visibility: 'manager',
        }).catch((err) => log.warn('[orchestratedBusinessOps] Fire-and-forget failed:', err));
        return { payrollRunId, approved: true, approvedBy: approverId };
      }
    );
  },
};

export const orchestratedDocumentExtraction = {
  async extract(
    workspaceId: string,
    documentName: string,
    documentType: string,
    fileData: string,
    fileMimeType: string,
    userId?: string
  ) {
    return automationOrchestration.executeAutomation(
      {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        domain: 'document_processing',
        automationName: 'ai-document-extraction',
        automationType: 'document_processing',
        workspaceId,
        userId,
        triggeredBy: 'api',
        billable: true,
        creditCost: 3,
        timeoutMs: 60000,
        payload: { documentName, documentType, fileMimeType },
      },
      async (ctx) => {
        const result = await extractDocumentData(
          workspaceId,
          documentName,
          documentType,
          fileData,
          fileMimeType
        );
        return result;
      },
      {
        validate: async (ctx) => {
          if (!ctx.workspaceId) {
            return { valid: false, errors: ['Workspace ID required'] };
          }
          const validTypes = ['contract', 'invoice', 'employee_record', 'client_data', 'financial_statement', 'other'];
          if (!validTypes.includes(documentType)) {
            return { valid: false, errors: [`Invalid document type: ${documentType}`] };
          }
          return { valid: true };
        },
        notify: async (result, ctx) => {
          // DUAL-EMIT LAW: .emit() bypasses all Trinity subscribers.
          // Use canonical .publish() so trinityEventSubscriptions + automationTriggerService receive this event.
          platformEventBus.publish({
            type: 'automation_completed',
            category: 'automation',
            title: 'Document Extraction Complete',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            description: `Extracted ${documentType} "${documentName}" — ${Math.round((result.confidence || 0) * 100)}% confidence`,
            workspaceId: ctx.workspaceId,
            metadata: {
              orchestrationId: ctx.orchestrationId,
              documentName,
              documentType,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              confidence: result.confidence,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              status: result.status,
              source: 'documentExtraction',
            },
          }).catch((err) => log.warn('[orchestratedBusinessOps] Fire-and-forget failed:', err));
        },
      }
    );
  },
};

export async function executeWithEscalation<T>(
  operationName: string,
  workspaceId: string,
  userId: string,
  executor: () => Promise<T>,
  options?: {
    domain?: string;
    maxRetries?: number;
    billable?: boolean;
    creditCost?: number;
  }
): Promise<T> {
  const domain = (options?.domain || 'general') as any;
  const maxRetries = options?.maxRetries ?? 2;

  const result = await automationOrchestration.executeAutomation(
    {
      domain,
      automationName: operationName,
      automationType: 'background_process',
      workspaceId,
      userId,
      triggeredBy: 'api',
      billable: options?.billable,
      creditCost: options?.creditCost,
      maxRetries,
    },
    async () => executor()
  );

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  if (result.retryable) {
    log.warn(`[OrchestratedOps] ${operationName} failed (retryable: ${result.errorCode}), attempting retry...`);
    const retryResult = await automationOrchestration.executeAutomation(
      {
        domain,
        automationName: `${operationName}-retry`,
        automationType: 'background_process',
        workspaceId,
        userId,
        triggeredBy: 'system',
      },
      async () => executor()
    );

    if (retryResult.success && retryResult.data !== undefined) {
      return retryResult.data;
    }
  }

  const pipelineCtx = {
    executionId: result.orchestrationId || operationName,
    workspaceId,
    operationType: 'automation' as const,
    operationName,
    initiator: `user:${userId}`,
    initiatorType: 'system' as const,
    startTime: Date.now(),
    steps: [],
    payload: {},
    escalationHistory: [
      {
        tier: 'ai_retry' as const,
        timestamp: Date.now(),
        error: result.error || 'Unknown error',
        resolution: 'failed',
      },
    ],
  };

  const ticketId = await createHumanReviewTicket(
    // @ts-expect-error — TS migration: fix in refactoring sprint
    pipelineCtx,
    new Error(result.error || 'Operation failed after retry'),
    pipelineCtx.escalationHistory
  );

  log.error(`[OrchestratedOps] ${operationName} escalated to human review: ticket ${ticketId}`);
  throw new Error(`Operation ${operationName} failed and has been escalated for human review (ticket: ${ticketId})`);
}
