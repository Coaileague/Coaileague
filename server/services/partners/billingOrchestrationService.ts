import { db } from '../../db';
import { eq, and, desc, sql, gte, lte, isNull } from 'drizzle-orm';
import {
  partnerConnections,
  partnerDataMappings,
  partnerManualReviewQueue,
  partnerInvoiceIdempotency,
  invoiceLifecycleStates,
  billingPolicyProfiles,
  auditProofPacks,
  rateThrottleLogs,
  exceptionTriageQueue,
  clients,
  shifts,
  employees,
  workspaces,
  type BillingPolicyProfile,
  type ExceptionTriageQueue,
} from '@shared/schema';
import type { InferSelectModel } from 'drizzle-orm';
type InvoiceLifecycleState = InferSelectModel<typeof invoiceLifecycleStates>;
import { createHash } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('billingOrchestrationService');


type RiskSignal = 
  | 'MAPPING_AMBIGUOUS'
  | 'MAPPING_MISSING'
  | 'WOULD_CREATE_CUSTOMER'
  | 'AMOUNT_SPIKE'
  | 'RATE_MISMATCH'
  | 'MISSING_ITEM'
  | 'TOKEN_EXPIRED'
  | 'NEW_CLIENT';

type ErrorType =
  | 'auth_expired'
  | 'rate_limited'
  | 'mapping_missing'
  | 'validation'
  | 'duplicate_risk'
  | 'amount_spike'
  | 'network_error';

interface BillableFact {
  clientId: string;
  siteId?: string;
  itemKey?: string;
  qtyHours: number;
  rate: number;
  description: string;
  employeeIds: string[];
}

interface PolicyApplicationResult {
  billable: BillableFact[];
  payroll: { employeeId: string; regularHours: number; otHours: number; doubleTimeHours: number }[];
  proof: {
    rounding: string;
    overtimePolicy: string;
    breakPolicy: string;
  };
}

interface RiskGateResult {
  canAutoSend: boolean;
  riskSignals: RiskSignal[];
  requiresApproval: boolean;
  approvalReason?: string;
}

interface ThrottleDecision {
  granted: boolean;
  delayMs: number;
  retryAfter?: Date;
}

class IdentityReconcilerAgent {
  async reconcile(
    workspaceId: string,
    connectionId: string,
    requiredMappings: {
      customers?: string[];
      employees?: string[];
      items?: string[];
    }
  ): Promise<{
    ok: boolean;
    missing: { entityType: string; internalId: string }[];
    ambiguous: { entityType: string; internalId: string; candidates: any[] }[];
    stale: { entityType: string; internalId: string; reason: string }[];
  }> {
    const missing: { entityType: string; internalId: string }[] = [];
    const ambiguous: { entityType: string; internalId: string; candidates: any[] }[] = [];
    const stale: { entityType: string; internalId: string; reason: string }[] = [];

    const existingMappings = await db.select()
      .from(partnerDataMappings)
      .where(and(
        eq(partnerDataMappings.workspaceId, workspaceId),
        eq(partnerDataMappings.partnerConnectionId, connectionId)
      ));

    const mappingLookup = new Map(
      existingMappings.map(m => [`${m.entityType}:${m.coaileagueEntityId}`, m])
    );

    const pendingReviews = await db.select()
      .from(partnerManualReviewQueue)
      .where(and(
        eq(partnerManualReviewQueue.workspaceId, workspaceId),
        eq(partnerManualReviewQueue.partnerConnectionId, connectionId),
        eq(partnerManualReviewQueue.status, 'pending')
      ));

    const reviewLookup = new Map(
      pendingReviews.map(r => [`${r.entityType}:${r.coaileagueEntityId}`, r])
    );

    for (const customerId of requiredMappings.customers || []) {
      const key = `client:${customerId}`;
      const mapping = mappingLookup.get(key);
      const review = reviewLookup.get(key);

      if (review) {
        ambiguous.push({
          entityType: 'customer',
          internalId: customerId,
          candidates: review.candidateMatches as any[] || [],
        });
      } else if (!mapping) {
        missing.push({ entityType: 'customer', internalId: customerId });
      } else if (mapping.syncStatus === 'stale') {
        stale.push({
          entityType: 'customer',
          internalId: customerId,
          reason: 'Mapping marked stale by webhook update',
        });
      }
    }

    for (const employeeId of requiredMappings.employees || []) {
      const key = `employee:${employeeId}`;
      const mapping = mappingLookup.get(key);

      if (!mapping) {
        missing.push({ entityType: 'employee', internalId: employeeId });
      } else if (mapping.syncStatus === 'stale') {
        stale.push({
          entityType: 'employee',
          internalId: employeeId,
          reason: 'Mapping marked stale by webhook update',
        });
      }
    }

    for (const itemId of requiredMappings.items || []) {
      const key = `item:${itemId}`;
      const mapping = mappingLookup.get(key);
      const review = reviewLookup.get(key);

      if (review) {
        ambiguous.push({
          entityType: 'item',
          internalId: itemId,
          candidates: review.candidateMatches as any[] || [],
        });
      } else if (!mapping) {
        missing.push({ entityType: 'item', internalId: itemId });
      } else if (mapping.syncStatus === 'stale') {
        stale.push({
          entityType: 'item',
          internalId: itemId,
          reason: 'Item mapping marked stale by webhook update',
        });
      }
    }

    return {
      ok: missing.length === 0 && ambiguous.length === 0 && stale.length === 0,
      missing,
      ambiguous,
      stale,
    };
  }

  async refreshStaleMapping(
    workspaceId: string,
    connectionId: string,
    entityType: string,
    internalId: string
  ): Promise<boolean> {
    await db.update(partnerDataMappings)
      .set({ 
        syncStatus: 'active',
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(partnerDataMappings.workspaceId, workspaceId),
        eq(partnerDataMappings.partnerConnectionId, connectionId),
        eq(partnerDataMappings.entityType, entityType),
        eq(partnerDataMappings.coaileagueEntityId, internalId)
      ));

    return true;
  }
}

class IdempotencyGuardAgent {
  async check(
    workspaceId: string,
    realmId: string,
    workflowType: string,
    cycleKey: string,
    dedupeKey: string
  ): Promise<{
    shouldExecute: boolean;
    existingResult?: { invoiceId: string; docNumber: string; status: string };
  }> {
    const existing = await db.select()
      .from(partnerInvoiceIdempotency)
      .where(and(
        eq(partnerInvoiceIdempotency.workspaceId, workspaceId),
        eq(partnerInvoiceIdempotency.requestId, `${workflowType}:${realmId}:${cycleKey}:${dedupeKey}`)
      ))
      .limit(1);

    if (existing.length > 0 && existing[0].status === 'completed') {
      return {
        shouldExecute: false,
        existingResult: {
          invoiceId: existing[0].partnerInvoiceId || '',
          docNumber: existing[0].partnerInvoiceNumber || '',
          status: existing[0].status,
        },
      };
    }

    return { shouldExecute: true };
  }

  async record(
    workspaceId: string,
    realmId: string,
    workflowType: string,
    cycleKey: string,
    dedupeKey: string,
    result: { invoiceId: string; docNumber: string }
  ): Promise<void> {
    const requestId = `${workflowType}:${realmId}:${cycleKey}:${dedupeKey}`;

    const connections = await db.select().from(partnerConnections)
      .where(and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks')
      ))
      .limit(1);
    const connectionId = connections[0]?.id || 'unknown';

    await db.insert(partnerInvoiceIdempotency)
      .values({
        workspaceId,
        partnerConnectionId: connectionId,
        requestId,
        partnerInvoiceId: result.invoiceId,
        partnerInvoiceNumber: result.docNumber,
        status: 'completed',
      })
      .onConflictDoUpdate({
        target: [partnerInvoiceIdempotency.workspaceId, partnerInvoiceIdempotency.requestId],
        set: {
          status: 'completed',
          partnerInvoiceId: result.invoiceId,
          partnerInvoiceNumber: result.docNumber,
          updatedAt: new Date(),
        },
      });
  }
}

class PolicyRulesAgent {
  private roundHours(hours: number, rounding: string, direction: string): number {
    let increment: number;
    switch (rounding) {
      case '1_min': increment = 1 / 60; break;
      case '5_min': increment = 5 / 60; break;
      case '15_min': increment = 0.25; break;
      case '30_min': increment = 0.5; break;
      default: increment = 0.25;
    }

    switch (direction) {
      case 'up': return Math.ceil(hours / increment) * increment;
      case 'down': return Math.floor(hours / increment) * increment;
      default: return Math.round(hours / increment) * increment;
    }
  }

  async computeBillableHours(
    workspaceId: string,
    cycleKey: string,
    clientIds: string[]
  ): Promise<PolicyApplicationResult> {
    const billable: BillableFact[] = [];
    const payroll: { employeeId: string; regularHours: number; otHours: number; doubleTimeHours: number }[] = [];

    const policies = await db.select()
      .from(billingPolicyProfiles)
      .where(and(
        eq(billingPolicyProfiles.workspaceId, workspaceId),
        eq(billingPolicyProfiles.isActive, true)
      ));

    const defaultPolicy = policies.find(p => p.isDefault) || policies[0];

    const weekStart = new Date(cycleKey.replace('_week_end', ''));
    weekStart.setDate(weekStart.getDate() - 6);
    const weekEnd = new Date(cycleKey.replace('_week_end', ''));

    for (const clientId of clientIds) {
      const clientPolicy = policies.find(p => p.clientId === clientId) || defaultPolicy;
      
      const clientShifts = await db.select()
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.clientId, clientId),
          gte(shifts.date, weekStart.toISOString().split('T')[0]),
          lte(shifts.date, weekEnd.toISOString().split('T')[0])
        ));

      let totalHours = 0;
      const employeeIds = new Set<string>();

      for (const shift of clientShifts) {
        let shiftHours = shift.totalHours || 0;
        
        const breakRules = clientPolicy?.breakRules as { unpaidBreakMinutes?: number; autoDeductBreaks?: boolean } | null;
        if (breakRules?.autoDeductBreaks && shiftHours > 6) {
          shiftHours -= (breakRules.unpaidBreakMinutes || 30) / 60;
        }

        shiftHours = this.roundHours(
          shiftHours,
          clientPolicy?.billableRounding || '15_min',
          clientPolicy?.roundingDirection || 'nearest'
        );

        totalHours += shiftHours;
        if (shift.employeeId) employeeIds.add(shift.employeeId);
      }

      if (totalHours > 0) {
        billable.push({
          clientId,
          qtyHours: totalHours,
          rate: 0,
          description: `Services for week ending ${cycleKey.replace('_week_end', '')}`,
          employeeIds: Array.from(employeeIds),
        });
      }
    }

    return {
      billable,
      payroll,
      proof: {
        rounding: defaultPolicy?.billableRounding || '15_min',
        overtimePolicy: 'weekly_40',
        breakPolicy: 'auto_deduct_30min',
      },
    };
  }
}

class RiskGateAgent {
  async evaluate(
    workspaceId: string,
    cycleKey: string,
    clientId: string,
    invoiceTotal: number,
    mappingStatus: { ok: boolean; missing: any[]; ambiguous: any[] }
  ): Promise<RiskGateResult> {
    const riskSignals: RiskSignal[] = [];

    if (!mappingStatus.ok) {
      if (mappingStatus.missing.length > 0) {
        riskSignals.push('MAPPING_MISSING');
      }
      if (mappingStatus.ambiguous.length > 0) {
        riskSignals.push('MAPPING_AMBIGUOUS');
      }
    }

    const previousInvoices = await db.select()
      .from(invoiceLifecycleStates)
      .where(and(
        eq(invoiceLifecycleStates.workspaceId, workspaceId),
        eq(invoiceLifecycleStates.clientId, clientId)
      ))
      .orderBy(desc(invoiceLifecycleStates.createdAt))
      .limit(4);

    if (previousInvoices.length === 0) {
      riskSignals.push('NEW_CLIENT');
    } else {
      const avgTotal = previousInvoices.reduce((sum, inv) => sum + parseFloat(inv.invoiceTotal || '0'), 0) / previousInvoices.length;
      if (avgTotal > 0 && invoiceTotal > avgTotal * 1.4) {
        riskSignals.push('AMOUNT_SPIKE');
      }
    }

    const canAutoSend = riskSignals.length === 0;
    const requiresApproval = riskSignals.length > 0;

    return {
      canAutoSend,
      riskSignals,
      requiresApproval,
      approvalReason: requiresApproval
        ? `Risk signals detected: ${riskSignals.join(', ')}`
        : undefined,
    };
  }
}

class BillingStateManagerAgent {
  private validTransitions: Record<string, string[]> = {
    computed: ['composed', 'failed'],
    composed: ['ready_to_execute', 'failed'],
    ready_to_execute: ['draft_created', 'failed'],
    draft_created: ['approval_pending', 'sent', 'failed'],
    approval_pending: ['approved', 'cancelled'],
    approved: ['sent', 'failed'],
    sent: ['paid', 'failed'],
    paid: [],
    failed: ['computed'],
    cancelled: [],
  };

  async transition(
    workspaceId: string,
    cycleKey: string,
    clientId: string,
    newState: string,
    options?: { userId?: string; reason?: string; qboInvoiceId?: string; qboDocNumber?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const [lifecycle] = await db.select()
      .from(invoiceLifecycleStates)
      .where(and(
        eq(invoiceLifecycleStates.workspaceId, workspaceId),
        eq(invoiceLifecycleStates.cycleKey, cycleKey),
        eq(invoiceLifecycleStates.clientId, clientId)
      ))
      .limit(1);

    if (!lifecycle) {
      return { success: false, error: 'Lifecycle state not found' };
    }

    const currentState = lifecycle.currentState;
    const allowedTransitions = this.validTransitions[currentState] || [];

    if (!allowedTransitions.includes(newState)) {
      return {
        success: false,
        error: `Invalid transition from ${currentState} to ${newState}`,
      };
    }

    const stateHistory = (lifecycle.stateHistory as any[]) || [];
    stateHistory.push({
      from: currentState,
      to: newState,
      timestamp: new Date().toISOString(),
      changedBy: options?.userId,
      reason: options?.reason,
    });

    await db.update(invoiceLifecycleStates)
      .set({
        currentState: newState as any,
        previousState: currentState,
        stateChangedAt: new Date(),
        stateChangedBy: options?.userId,
        stateHistory,
        qboInvoiceId: options?.qboInvoiceId || lifecycle.qboInvoiceId,
        qboDocNumber: options?.qboDocNumber || lifecycle.qboDocNumber,
        updatedAt: new Date(),
      })
      .where(eq(invoiceLifecycleStates.id, lifecycle.id));

    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: 'Billing State Transition',
      description: `Invoice lifecycle for client ${clientId} transitioned from ${currentState} → ${newState}`,
      workspaceId,
      metadata: { action: 'billing.state_transition', cycleKey, clientId, fromState: currentState, toState: newState },
    }).catch((err) => log.warn('[billingOrchestrationService] Fire-and-forget failed:', err));

    return { success: true };
  }

  async getOrCreateLifecycle(
    workspaceId: string,
    cycleKey: string,
    clientId: string,
    dedupeKey: string,
    approvalMode: string = 'auto_send'
  ): Promise<InvoiceLifecycleState> {
    const [existing] = await db.select()
      .from(invoiceLifecycleStates)
      .where(and(
        eq(invoiceLifecycleStates.workspaceId, workspaceId),
        eq(invoiceLifecycleStates.cycleKey, cycleKey),
        eq(invoiceLifecycleStates.clientId, clientId)
      ))
      .limit(1);

    if (existing) return existing;

    const [created] = await db.insert(invoiceLifecycleStates)
      .values({
        workspaceId,
        cycleKey,
        clientId,
        dedupeKey,
        approvalMode,
        currentState: 'computed',
        stateHistory: [],
      })
      .returning();

    return created;
  }
}

class ThrottleControllerAgent {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private readonly maxTokens = 10;
  private readonly refillRate = 2;

  async acquireSlot(
    realmId: string,
    workspaceId: string,
    operation: string,
    priority: string = 'normal'
  ): Promise<ThrottleDecision> {
    const bucketKey = realmId;
    const now = Date.now();

    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(bucketKey, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    const granted = bucket.tokens >= 1;
    let delayMs = 0;

    if (granted) {
      bucket.tokens -= 1;
    } else {
      delayMs = Math.ceil((1 - bucket.tokens) / this.refillRate * 1000);
    }

    await db.insert(rateThrottleLogs)
      .values({
        realmId,
        workspaceId,
        operation,
        priority,
        wasThrottled: !granted,
        delayMs,
        currentBucketSize: Math.floor(bucket.tokens),
        maxBucketSize: this.maxTokens,
      });

    return { granted, delayMs };
  }

  async waitForSlot(
    realmId: string,
    workspaceId: string,
    operation: string,
    priority: string = 'normal'
  ): Promise<void> {
    let decision = await this.acquireSlot(realmId, workspaceId, operation, priority);
    
    while (!decision.granted) {
      await new Promise(resolve => setTimeout(resolve, decision.delayMs));
      decision = await this.acquireSlot(realmId, workspaceId, operation, priority);
    }
  }
}

class ExceptionTriageAgent {
  private readonly retryableErrors = ['rate_limited', 'network_error'];
  private readonly humanRequiredErrors = ['mapping_missing', 'auth_expired', 'validation'];

  async triage(
    workspaceId: string,
    realmId: string | undefined,
    error: Error,
    context: {
      sourceWorkflow?: string;
      sourceCycleKey?: string;
      sourceEntityType?: string;
      sourceEntityId?: string;
    }
  ): Promise<{
    errorType: ErrorType;
    recommendedAction: string;
    inboxItemId?: string;
  }> {
    const errorMessage = error.message.toLowerCase();
    let errorType: ErrorType = 'validation';
    let recommendedAction = 'manual_review';

    if (errorMessage.includes('unauthorized') || errorMessage.includes('token') || errorMessage.includes('401')) {
      errorType = 'auth_expired';
      recommendedAction = 'refresh_token';
    } else if (errorMessage.includes('rate') || errorMessage.includes('429') || errorMessage.includes('throttle')) {
      errorType = 'rate_limited';
      recommendedAction = 'retry_with_backoff';
    } else if (errorMessage.includes('mapping') || errorMessage.includes('not found')) {
      errorType = 'mapping_missing';
      recommendedAction = 'create_mapping';
    } else if (errorMessage.includes('duplicate')) {
      errorType = 'duplicate_risk';
      recommendedAction = 'verify_idempotency';
    } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
      errorType = 'network_error';
      recommendedAction = 'retry';
    }

    const [inboxItem] = await db.insert(exceptionTriageQueue)
      .values({
        workspaceId,
        realmId,
        errorType,
        errorMessage: error.message,
        errorContext: context,
        sourceWorkflow: context.sourceWorkflow,
        sourceCycleKey: context.sourceCycleKey,
        sourceEntityType: context.sourceEntityType,
        sourceEntityId: context.sourceEntityId,
        recommendedAction,
        status: this.humanRequiredErrors.includes(errorType) ? 'open' : 'auto_resolved',
        maxRetries: this.retryableErrors.includes(errorType) ? 3 : 0,
      })
      .returning();

    if (this.humanRequiredErrors.includes(errorType)) {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'Billing Exception: Human Review Required',
        description: `${errorType} requires human intervention. Recommended: ${recommendedAction}`,
        workspaceId,
        metadata: { action: 'exception.human_review_required', errorType, recommendedAction, inboxItemId: inboxItem.id },
      }).catch((err) => log.warn('[billingOrchestrationService] Fire-and-forget failed:', err));
    }

    return {
      errorType,
      recommendedAction,
      inboxItemId: inboxItem.id,
    };
  }

  async resolveItem(
    itemId: string,
    resolution: {
      method: string;
      userId?: string;
      notes?: string;
    }
  ): Promise<void> {
    await db.update(exceptionTriageQueue)
      .set({
        status: 'manual_resolved',
        resolutionMethod: resolution.method,
        resolvedBy: resolution.userId,
        resolvedAt: new Date(),
        resolutionNotes: resolution.notes,
        updatedAt: new Date(),
      })
      .where(eq(exceptionTriageQueue.id, itemId));
  }
}

class AuditPackAgent {
  async generate(
    workspaceId: string,
    cycleKey: string,
    clientId: string,
    billableFacts: BillableFact[],
    policyProof: { rounding: string; overtimePolicy: string; breakPolicy: string }
  ): Promise<{ packId: string; checksum: string }> {
    const shiftRefs = await db.select({
      id: shifts.id,
      date: shifts.date,
      employeeId: shifts.employeeId,
      totalHours: sql<number>`EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 3600`,
      siteId: shifts.siteId,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.clientId, clientId)
      ))
      .limit(1000);

    const packContents = {
      cycleKey,
      clientId,
      billableFacts,
      shiftReferences: shiftRefs,
      policyApplied: policyProof,
      generatedAt: new Date().toISOString(),
    };

    const checksum = createHash('sha256')
      .update(JSON.stringify(packContents))
      .digest('hex');

    const totalHours = billableFacts.reduce((sum, f) => sum + f.qtyHours, 0);
    const totalAmount = billableFacts.reduce((sum, f) => sum + (f.qtyHours * f.rate), 0);

    const [pack] = await db.insert(auditProofPacks)
      .values({
        workspaceId,
        cycleKey,
        clientId,
        packChecksum: checksum,
        totalHours: totalHours.toString(),
        totalAmount: totalAmount.toString(),
        shiftCount: shiftRefs.length,
        employeeCount: new Set(shiftRefs.map(s => s.employeeId)).size,
        billableFacts,
        shiftReferences: shiftRefs,
        policyApplied: policyProof,
      })
      .returning();

    return { packId: pack.id, checksum };
  }
}

class WeeklyInvoiceOrchestrator {
  private identityReconciler = new IdentityReconcilerAgent();
  private idempotencyGuard = new IdempotencyGuardAgent();
  private policyRules = new PolicyRulesAgent();
  private riskGate = new RiskGateAgent();
  private stateManager = new BillingStateManagerAgent();
  private throttleController = new ThrottleControllerAgent();
  private exceptionTriage = new ExceptionTriageAgent();
  private auditPack = new AuditPackAgent();

  async runWeeklyInvoice(
    workspaceId: string,
    cycleKey: string,
    userId?: string
  ): Promise<{
    success: boolean;
    invoicesCreated: number;
    invoicesPendingApproval: number;
    errors: string[];
  }> {
    let invoicesCreated = 0;
    let invoicesPendingApproval = 0;
    const errors: string[] = [];

    try {
      const [connection] = await db.select()
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        ))
        .limit(1);

      if (!connection) {
        return { success: false, invoicesCreated: 0, invoicesPendingApproval: 0, errors: ['No QuickBooks connection found'] };
      }

      const realmId = connection.realmId!;

      const activeClients = await db.select()
        .from(clients)
        .where(and(
          eq(clients.workspaceId, workspaceId),
          eq(clients.isActive, true)
        ));

      const clientIds = activeClients.map(c => c.id);

      const mappingStatus = await this.identityReconciler.reconcile(
        workspaceId,
        connection.id,
        { customers: clientIds }
      );

      const policyResult = await this.policyRules.computeBillableHours(
        workspaceId,
        cycleKey,
        clientIds
      );

      for (const billable of policyResult.billable) {
        try {
          const dedupeKey = createHash('sha256')
            .update(`${billable.clientId}:${billable.qtyHours}:${cycleKey}`)
            .digest('hex')
            .substring(0, 16);

          const idempotencyCheck = await this.idempotencyGuard.check(
            workspaceId,
            realmId,
            'weekly_invoice',
            cycleKey,
            dedupeKey
          );

          if (!idempotencyCheck.shouldExecute) {
            log.info(`[BillingOrchestrator] Skipping duplicate invoice for client ${billable.clientId}`);
            continue;
          }

          const lifecycle = await this.stateManager.getOrCreateLifecycle(
            workspaceId,
            cycleKey,
            billable.clientId,
            dedupeKey
          );

          const clientMappingStatus = await this.identityReconciler.reconcile(
            workspaceId,
            connection.id,
            { customers: [billable.clientId] }
          );

          const riskResult = await this.riskGate.evaluate(
            workspaceId,
            cycleKey,
            billable.clientId,
            billable.qtyHours * billable.rate,
            clientMappingStatus
          );

          if (!riskResult.canAutoSend) {
            await db.update(invoiceLifecycleStates)
              .set({
                currentState: 'approval_pending',
                riskSignals: riskResult.riskSignals,
                updatedAt: new Date(),
              })
              .where(eq(invoiceLifecycleStates.id, lifecycle.id));

            invoicesPendingApproval++;
            continue;
          }

          await this.auditPack.generate(
            workspaceId,
            cycleKey,
            billable.clientId,
            [billable],
            policyResult.proof
          );

          invoicesCreated++;

        } catch (error: any) {
          await this.exceptionTriage.triage(
            workspaceId,
            realmId,
            error,
            {
              sourceWorkflow: 'weekly_invoice',
              sourceCycleKey: cycleKey,
              sourceEntityType: 'client',
              sourceEntityId: billable.clientId,
            }
          );
          errors.push(`Client ${billable.clientId}: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }

      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'Weekly Invoice Run Complete',
        description: `${invoicesCreated} invoices created, ${invoicesPendingApproval} pending approval, ${errors.length} errors`,
        workspaceId,
        metadata: { action: 'billing.weekly_invoice_complete', cycleKey, invoicesCreated, invoicesPendingApproval, errorCount: errors.length },
      }).catch((err) => log.warn('[billingOrchestrationService] Fire-and-forget failed:', err));

      return {
        success: errors.length === 0,
        invoicesCreated,
        invoicesPendingApproval,
        errors,
      };

    } catch (error: any) {
      return {
        success: false,
        invoicesCreated,
        invoicesPendingApproval,
        errors: [(error instanceof Error ? error.message : String(error))],
      };
    }
  }
}

export const identityReconcilerAgent = new IdentityReconcilerAgent();
export const idempotencyGuardAgent = new IdempotencyGuardAgent();
export const policyRulesAgent = new PolicyRulesAgent();
export const riskGateAgent = new RiskGateAgent();
export const billingStateManagerAgent = new BillingStateManagerAgent();
export const throttleControllerAgent = new ThrottleControllerAgent();
export const exceptionTriageAgent = new ExceptionTriageAgent();
export const auditPackAgent = new AuditPackAgent();
export const weeklyInvoiceOrchestrator = new WeeklyInvoiceOrchestrator();

export function registerBillingOrchestrationActions() {
  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.run_weekly_invoice',
    name: 'Run Weekly Invoice Workflow',
    category: 'invoicing',
    description: 'Execute the weekly invoice orchestration workflow for a workspace',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; cycleKey: string; userId?: string }) => {
      return await weeklyInvoiceOrchestrator.runWeeklyInvoice(
        params.workspaceId,
        params.cycleKey,
        params.userId
      );
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.check_identity_mappings',
    name: 'Check Identity Mappings',
    category: 'invoicing',
    description: 'Verify QBO identity mappings are valid and not stale',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; connectionId: string; customers?: string[]; employees?: string[] }) => {
      return await identityReconcilerAgent.reconcile(
        params.workspaceId,
        params.connectionId,
        { customers: params.customers, employees: params.employees }
      );
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.evaluate_risk',
    name: 'Evaluate Invoice Risk',
    category: 'invoicing',
    description: 'Evaluate risk signals for an invoice to determine if auto-send or approval required',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; cycleKey: string; clientId: string; invoiceTotal: number; connectionId?: string }) => {
      let mappingStatus: { ok: boolean; missing: any[]; ambiguous: any[]; stale?: any[] } = { ok: true, missing: [], ambiguous: [] };
      
      if (params.connectionId) {
        const reconcileResult = await identityReconcilerAgent.reconcile(
          params.workspaceId,
          params.connectionId,
          { customers: [params.clientId] }
        );
        mappingStatus = {
          ok: reconcileResult.ok,
          missing: reconcileResult.missing,
          ambiguous: reconcileResult.ambiguous,
          stale: reconcileResult.stale,
        };
      }
      
      return await riskGateAgent.evaluate(
        params.workspaceId,
        params.cycleKey,
        params.clientId,
        params.invoiceTotal,
        mappingStatus
      );
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.transition_state',
    name: 'Transition Invoice State',
    category: 'invoicing',
    description: 'Transition an invoice through the lifecycle state machine',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; cycleKey: string; clientId: string; newState: string; userId?: string; reason?: string }) => {
      return await billingStateManagerAgent.transition(
        params.workspaceId,
        params.cycleKey,
        params.clientId,
        params.newState,
        { userId: params.userId, reason: params.reason }
      );
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.get_exception_queue',
    name: 'Get Exception Queue',
    category: 'invoicing',
    description: 'Get list of exceptions requiring review or auto-remediation',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; status?: string }) => {
      return await db.select()
        .from(exceptionTriageQueue)
        .where(and(
          eq(exceptionTriageQueue.workspaceId, params.workspaceId),
          params.status ? eq(exceptionTriageQueue.status, params.status) : sql`1=1`
        ))
        .orderBy(desc(exceptionTriageQueue.createdAt))
        .limit(50);
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.resolve_exception',
    name: 'Resolve Exception',
    category: 'invoicing',
    description: 'Mark an exception as resolved with resolution details',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { itemId: string; method: string; userId?: string; notes?: string }) => {
      await exceptionTriageAgent.resolveItem(params.itemId, {
        method: params.method,
        userId: params.userId,
        notes: params.notes,
      });
      return { success: true };
    },
  });

  (helpaiOrchestrator.registerAction as any)({
    actionId: 'billing.generate_audit_pack',
    name: 'Generate Audit Pack',
    category: 'invoicing',
    description: 'Generate an audit proof pack for an invoice for dispute resolution',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (params: { workspaceId: string; cycleKey: string; clientId: string }) => {
      const policyResult = await policyRulesAgent.computeBillableHours(
        params.workspaceId,
        params.cycleKey,
        [params.clientId]
      );
      return await auditPackAgent.generate(
        params.workspaceId,
        params.cycleKey,
        params.clientId,
        policyResult.billable,
        policyResult.proof
      );
    },
  });

  log.info('[BillingOrchestration] Registered 7 AI Brain billing orchestration actions');
}
