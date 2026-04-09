/**
 * TRINITY ANTERIOR CINGULATE CORTEX (ACC) SERVICE
 * =================================================
 * Real-time conflict detection and error signaling — the missing structural
 * organ that gives Trinity genuine judgment rather than just execution.
 *
 * Biological analog: The anterior cingulate cortex detects when something
 * unexpected happens — a prediction error, a conflict between what was
 * expected and what occurred. It fires immediately, mid-execution, before
 * the output reaches consciousness. This allows the prefrontal cortex to
 * intervene before a bad decision is delivered.
 *
 * Trinity's ACC does the same across six conflict categories:
 * 1. Memory Contradiction — current action conflicts with connectome state
 * 2. Decision Contradiction — current action contradicts a recent decision
 * 3. Values Violation — action would violate Trinity's core values
 * 4. Trust Tier Violation — lower trust tier attempting higher-tier action
 * 5. Prediction Divergence — real-world data diverges from active predictions
 * 6. Execution Anomaly — execution deviating from expected resource/time baseline
 *
 * The ACC does not fix problems. It signals that a problem exists —
 * immediately, mid-execution — so the global workspace can decide whether
 * to pause, redirect, or override the execution.
 *
 * ONLY ACC-CLEARED ACTIONS REACH THE GLOBAL WORKSPACE.
 */

import { db, pool } from '../../db';
import { trinityAccLogs } from '@shared/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { broadcastToGlobalWorkspace } from './trinityConnectomeService';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { typedPool, typedQuery } from '../../lib/typedSql';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityACCService');

// ============================================================================
// TYPES
// ============================================================================

export type ConflictCategory =
  | 1  // Memory Contradiction
  | 2  // Decision Contradiction
  | 3  // Values Violation
  | 4  // Trust Tier Violation
  | 5  // Prediction Divergence
  | 6; // Execution Anomaly

export type ConflictSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

export interface AccConflictSignal {
  conflictId: string;
  detectedAt: Date;
  conflictCategory: ConflictCategory;
  conflictSeverity: ConflictSeverity;
  executionId: string;
  workspaceId?: string;
  entitiesInvolved: string[];
  expectedState: Record<string, any>;
  actualState: Record<string, any>;
  contradictionDescription: string;
  recommendedResolution: string;
  autoBlocked: boolean;
  requiresHumanReview: boolean;
  thalamicSignalId?: string;
}

export interface AccClearance {
  cleared: boolean;
  conflict?: AccConflictSignal;
  resolution?: string;
}

// What the ACC checks against when inspecting an intended action
export interface IntendedAction {
  executionId: string;
  actionType: string;
  actionId?: string;
  workspaceId?: string;
  userId?: string;
  trustTier?: string;
  requiredTrustTier?: string;
  entitiesInvolved?: string[];
  intendedOutput?: string;         // The text/message Trinity is about to deliver
  actionPayload?: Record<string, any>;
  expectedDurationMs?: number;     // From RL history
  actualDurationMs?: number;       // Current elapsed
  expectedTokenCount?: number;     // From RL history
  actualTokenCount?: number;       // Current consumption
  thalamicSignalId?: string;
  contextSnapshot?: Record<string, any>;
}

// ============================================================================
// TRUST TIER HIERARCHY — numeric rank for comparison
// ============================================================================

const TRUST_TIER_RANK: Record<string, number> = {
  owner: 100,
  operations_manager: 80,
  supervisor: 60,
  officer: 40,
  client: 30,
  system: 50,
  external: 10,
  trinity_self: 5,
};

// ============================================================================
// VALUES ANCHOR — the non-negotiable ethical core checked on every output
// ============================================================================

const DIGNITY_VIOLATION_PATTERNS = [
  /\b(lazy|incompetent|stupid|useless|worthless|idiot|fired)\b/i,
  /\byou (always|never) (mess up|fail|screw)\b/i,
  /\bshame on\b/i,
  /\bpunish(ment|ed)?\b.*\bofficer\b/i,
  /\bwrite[-\s]up\b.*\bimmediately\b/i,
];

const HONESTY_VIOLATION_PATTERNS = [
  /\b(guarantee|promise|definitely will|100%)\b/i,
];

const LEGAL_VIOLATION_KEYWORDS = [
  'overtime without pay',
  'off the books',
  'skip breaks',
  'no lunch',
  'under the table',
  'falsify',
  'backdate',
  'manipulate records',
  'hide from audit',
];

// ============================================================================
// ACC SERVICE CLASS
// ============================================================================

class TrinityACCService {
  // In-memory active execution tracking for anomaly detection
  private activeExecutions: Map<string, { startedAt: number; expectedDurationMs?: number }> = new Map();

  // ============================================================================
  // PRIMARY CHECK — call this before delivering any action to global workspace
  // ============================================================================

  /**
   * Run all six conflict checks against an intended action.
   * Returns AccClearance — cleared:true means proceed, cleared:false means halted.
   */
  async check(action: IntendedAction): Promise<AccClearance> {
    // Register execution for anomaly tracking
    this.activeExecutions.set(action.executionId, {
      startedAt: Date.now(),
      expectedDurationMs: action.expectedDurationMs,
    });

    // Run all six conflict checks in parallel
    const [
      memoryConflict,
      decisionConflict,
      valuesViolation,
      trustViolation,
      predictionDivergence,
      executionAnomaly,
    ] = await Promise.allSettled([
      this.checkMemoryContradiction(action),
      this.checkDecisionContradiction(action),
      this.checkValuesViolation(action),
      this.checkTrustTierViolation(action),
      this.checkPredictionDivergence(action),
      this.checkExecutionAnomaly(action),
    ]);

    // Evaluate results — process from highest severity to lowest
    const conflicts: AccConflictSignal[] = [];

    for (const result of [memoryConflict, decisionConflict, valuesViolation, trustViolation, predictionDivergence, executionAnomaly]) {
      if (result.status === 'fulfilled' && result.value) {
        conflicts.push(result.value);
      }
    }

    if (conflicts.length === 0) {
      // All clear — complete the execution timing record
      this.activeExecutions.delete(action.executionId);
      return { cleared: true };
    }

    // Sort: BLOCKING first, then WARNING, then INFO
    conflicts.sort((a, b) => {
      const rank = { BLOCKING: 3, WARNING: 2, INFO: 1 };
      return rank[b.conflictSeverity] - rank[a.conflictSeverity];
    });

    const worst = conflicts[0];

    // Handle each conflict asynchronously (non-blocking for INFO/WARNING)
    for (const conflict of conflicts) {
      await this.handleConflict(conflict, action);
    }

    if (worst.conflictSeverity === 'BLOCKING') {
      this.activeExecutions.delete(action.executionId);
      return {
        cleared: false,
        conflict: worst,
        resolution: worst.recommendedResolution,
      };
    }

    // WARNING or INFO — cleared but flagged
    this.activeExecutions.delete(action.executionId);
    return {
      cleared: true,
      conflict: worst,
    };
  }

  // ============================================================================
  // CATEGORY 1 — MEMORY CONTRADICTION
  // ============================================================================

  private async checkMemoryContradiction(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      if (!action.workspaceId || !action.entitiesInvolved?.length) return null;

      const payload = action.actionPayload || {};
      const payloadStr = JSON.stringify(payload).toLowerCase();

      // Check for armed post assignments against expired license
      if (action.actionType.toLowerCase().includes('assign') && payloadStr.includes('armed')) {
        const officerId = action.entitiesInvolved[0];
        if (officerId) {
          const conflict = await this.checkArmedLicenseValidity(officerId, action);
          if (conflict) return conflict;
        }
      }

      // Check for actions referencing a terminated employee
      if (action.entitiesInvolved?.length && payload.employeeId) {
        const terminated = await this.isEmployeeTerminated(payload.employeeId, action.workspaceId);
        if (terminated) {
          return this.buildConflict(action, 1, 'BLOCKING', {
            expected: { employeeStatus: 'active' },
            actual: { employeeStatus: 'terminated' },
            description: `Action references employee ${payload.employeeId} who has been terminated. Proceeding would create an invalid record.`,
            resolution: 'Verify employee status before proceeding. If re-hire is intended, use the rehire workflow.',
          });
        }
      }

      return null;
    } catch {
      return null; // ACC checks must never crash the pipeline
    }
  }

  private async checkArmedLicenseValidity(officerId: string, action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      // Converted to Drizzle ORM: LEFT JOIN → leftJoin
      const result = await db.select({
        id: (await import('@shared/schema')).employees.id,
        firstName: (await import('@shared/schema')).employees.firstName,
        lastName: (await import('@shared/schema')).employees.lastName,
        expirationDate: (await import('@shared/schema')).complianceDocuments.expirationDate,
        status: (await import('@shared/schema')).complianceDocuments.status,
        documentType: (await import('@shared/schema')).complianceDocuments.documentTypeId
      })
      .from((await import('@shared/schema')).employees)
      .leftJoin((await import('@shared/schema')).complianceDocuments, and(
        eq((await import('@shared/schema')).complianceDocuments.employeeId, (await import('@shared/schema')).employees.id),
        inArray((await import('@shared/schema')).complianceDocuments.documentTypeId, ['armed_license', 'guard_card', 'firearms_license']),
        eq((await import('@shared/schema')).complianceDocuments.workspaceId, action.workspaceId!)
      ))
      .where(eq((await import('@shared/schema')).employees.id, officerId))
      .limit(1);

      const emp = result[0] as any;
      if (!emp) return null;

      const today = new Date();
      if (emp.expiration_date && new Date(emp.expiration_date) < today) {
        return this.buildConflict(action, 1, 'BLOCKING', {
          expected: { licenseStatus: 'active', licenseExpiry: 'future date' },
          actual: { licenseStatus: 'expired', licenseExpiry: emp.expiration_date },
          description: `Officer ${emp.first_name} ${emp.last_name} has an expired armed license (expired ${emp.expiration_date}). Assigning to an armed post would violate compliance requirements.`,
          resolution: `Renew officer's armed license before assigning to armed post. Document type: ${emp.document_type || 'armed_license'}.`,
        });
      }

      return null;
    } catch {
      return null;
    }
  }

  private async isEmployeeTerminated(employeeId: string, workspaceId: string): Promise<boolean> {
    try {
      // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
      const [row] = await typedQuery(`
        SELECT status FROM employees
        WHERE id = $1 AND workspace_id = $2 LIMIT 1
      ` as any, [employeeId, workspaceId]);
      return (row as any)?.status === 'terminated' || (row as any)?.status === 'inactive';
    } catch {
      return false;
    }
  }

  // ============================================================================
  // CATEGORY 2 — DECISION CONTRADICTION
  // ============================================================================

  private async checkDecisionContradiction(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      if (!action.workspaceId || !action.entitiesInvolved?.length) return null;

      // Query audit log for recent decisions involving these entities
      const entityId = action.entitiesInvolved[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // CATEGORY C — Raw SQL retained: ILIKE | Tables: system_audit_logs | Verified: 2026-03-23
      const [recentDecision] = await typedQuery(`
        SELECT action_type, metadata, created_at
        FROM system_audit_logs
        WHERE workspace_id = $1
          AND created_at > $2
          AND (
            metadata::text ILIKE $3
            OR action_type = $4
          )
        ORDER BY created_at DESC
        LIMIT 1
      ` as any, [
        action.workspaceId,
        yesterday.toISOString(),
        `%${entityId}%`,
        action.actionType,
      ]);

      if (!recentDecision) return null;

      const rd = recentDecision as any;
      const meta = typeof rd.metadata === 'string' ? JSON.parse(rd.metadata) : (rd.metadata || {});

      // Check for semantic contradiction — e.g., previously flagged as high-risk, now sending auto-confirmation
      if (meta.riskFlag === 'high' && action.actionType.toLowerCase().includes('confirm')) {
        return this.buildConflict(action, 2, 'WARNING', {
          expected: { priorRiskFlag: 'none' },
          actual: { priorRiskFlag: 'high', flaggedAt: rd.created_at },
          description: `Entity ${entityId} was flagged as high-risk in the last 24 hours. Sending an automated confirmation without re-evaluation may be premature.`,
          resolution: 'Review the risk flag before proceeding with automated confirmation. Escalate to supervisor if flag is unresolved.',
        });
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // CATEGORY 3 — VALUES VIOLATION
  // ============================================================================

  private async checkValuesViolation(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      const output = action.intendedOutput || '';
      if (!output) return null;

      // Check for dignity violations — shaming or punitive tone
      for (const pattern of DIGNITY_VIOLATION_PATTERNS) {
        if (pattern.test(output)) {
          return this.buildConflict(action, 3, 'BLOCKING', {
            expected: { tone: 'respectful and dignified' },
            actual: { tone: 'potentially shaming or punitive', matchedPattern: pattern.source },
            description: `Intended output may violate Trinity's Dignity value. The message appears to use shaming or punitive language toward an officer or employee.`,
            resolution: 'Reframe the message with respectful, accountability-without-shame language. Focus on the behavior and its impact, not the person\'s character.',
          });
        }
      }

      // Check for legal compliance violations
      const lowerOutput = output.toLowerCase();
      for (const keyword of LEGAL_VIOLATION_KEYWORDS) {
        if (lowerOutput.includes(keyword)) {
          return this.buildConflict(action, 3, 'BLOCKING', {
            expected: { legalCompliance: 'maintained' },
            actual: { potentialViolation: keyword },
            description: `Intended output contains language that may violate labor law or compliance requirements: "${keyword}". This conflicts with Trinity's legal compliance value.`,
            resolution: 'Remove or rephrase content involving the flagged term. Consult the compliance knowledge base for the correct approach.',
          });
        }
      }

      // Check for honesty violations — stating guarantees about uncertain outcomes
      if (action.actionType.toLowerCase().includes('forecast') || action.actionType.toLowerCase().includes('predict')) {
        for (const pattern of HONESTY_VIOLATION_PATTERNS) {
          if (pattern.test(output)) {
            return this.buildConflict(action, 3, 'WARNING', {
              expected: { certaintyLevel: 'appropriately hedged' },
              actual: { certaintyLevel: 'overstated (guarantee/100% language)' },
              description: 'Intended output uses absolute certainty language ("guarantee", "definitely will", "100%") for a prediction or forecast. This conflicts with Trinity\'s Honesty value.',
              resolution: 'Replace absolute certainty language with appropriately hedged phrasing: "based on current patterns", "projected", "likely".',
            });
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // CATEGORY 4 — TRUST TIER VIOLATION
  // ============================================================================

  private async checkTrustTierViolation(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      const requestingTier = action.trustTier || 'officer';
      const requiredTier = action.requiredTrustTier;
      if (!requiredTier) return null;

      const requestingRank = TRUST_TIER_RANK[requestingTier] || 0;
      const requiredRank = TRUST_TIER_RANK[requiredTier] || 0;

      if (requestingRank < requiredRank) {
        return this.buildConflict(action, 4, 'BLOCKING', {
          expected: { minimumTrustTier: requiredTier, minimumRank: requiredRank },
          actual: { requestingTier, requestingRank },
          description: `Action "${action.actionType}" requires trust tier "${requiredTier}" (rank ${requiredRank}), but the requesting party has trust tier "${requestingTier}" (rank ${requestingRank}). This action cannot be executed without proper authorization.`,
          resolution: `Escalate to a ${requiredTier} or higher to authorize this action. The requesting party does not have sufficient authority.`,
        });
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // CATEGORY 5 — PREDICTION DIVERGENCE
  // ============================================================================

  private async checkPredictionDivergence(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      if (!action.workspaceId || !action.entitiesInvolved?.length) return null;

      const payload = action.actionPayload || {};

      // Check if actual clock-in contradicts a calloff prediction
      if (action.actionType.toLowerCase().includes('clock_in') && payload.officerId) {
        // Converted to Drizzle ORM: INTERVAL → sql fragment
      const prediction = await db.select({ metadata: (await import('@shared/schema')).systemAuditLogs.metadata })
        .from((await import('@shared/schema')).systemAuditLogs)
        .where(and(
          eq((await import('@shared/schema')).systemAuditLogs.workspaceId, action.workspaceId),
          eq((await import('@shared/schema')).systemAuditLogs.actorType, 'calloff_predicted'),
          sql`${(await import('@shared/schema')).systemAuditLogs.metadata}::text ILIKE ${`%${payload.officerId}%`}`,
          sql`${(await import('@shared/schema')).systemAuditLogs.createdAt} > NOW() - INTERVAL '12 hours'`
        ))
        .limit(1);

      if (prediction.length > 0) {
        return this.buildConflict(action, 5, 'INFO', {
          expected: { officerStatus: 'calloff predicted', confidence: '70%+' },
          actual: { officerStatus: 'clocked in' },
          description: `Trinity predicted Officer ${payload.officerId} would call off, but they have just clocked in. Updating calloff prediction model.`,
          resolution: 'Auto-update: recalibrate calloff prediction model for this officer. Good outcome — officer showed up.',
        });
      }
    }

    // Check for incident after quiet-night prediction
    if (action.actionType.toLowerCase().includes('incident') && payload.siteId) {
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const quietPrediction = await db.select({ metadata: (await import('@shared/schema')).systemAuditLogs.metadata })
        .from((await import('@shared/schema')).systemAuditLogs)
        .where(and(
          eq((await import('@shared/schema')).systemAuditLogs.workspaceId, action.workspaceId),
          eq((await import('@shared/schema')).systemAuditLogs.actorType, 'site_risk_predicted_low'),
          sql`${(await import('@shared/schema')).systemAuditLogs.metadata}::text ILIKE ${`%${payload.siteId}%`}`,
          sql`${(await import('@shared/schema')).systemAuditLogs.createdAt} > NOW() - INTERVAL '24 hours'`
        ))
        .limit(1);

      if (quietPrediction.length > 0) {
        return this.buildConflict(action, 5, 'WARNING', {
          expected: { siteRisk: 'low', prediction: 'quiet night' },
          actual: { siteRisk: 'incident occurred' },
          description: `Trinity predicted low risk for site ${payload.siteId} tonight, but an incident has just been filed. Site risk score requires immediate recalibration.`,
          resolution: 'Recalibrate site risk model immediately. Increase risk score for this site. Alert operations manager.',
        });
      }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // CATEGORY 6 — EXECUTION ANOMALY
  // ============================================================================

  private async checkExecutionAnomaly(action: IntendedAction): Promise<AccConflictSignal | null> {
    try {
      const execution = this.activeExecutions.get(action.executionId);
      if (!execution) return null;

      const actualDurationMs = action.actualDurationMs || (Date.now() - execution.startedAt);
      const expectedDurationMs = action.expectedDurationMs || execution.expectedDurationMs;

      // Time anomaly — taking 2x longer than expected
      if (expectedDurationMs && actualDurationMs > expectedDurationMs * 2) {
        return this.buildConflict(action, 6, 'WARNING', {
          expected: { durationMs: expectedDurationMs, label: 'normal execution time' },
          actual: { durationMs: actualDurationMs, multiplier: (actualDurationMs / expectedDurationMs).toFixed(1) + 'x' },
          description: `Action "${action.actionType}" is taking ${actualDurationMs}ms — ${(actualDurationMs / expectedDurationMs).toFixed(1)}x the expected ${expectedDurationMs}ms. This may indicate a performance regression or dependency failure.`,
          resolution: 'Monitor and continue — do not cancel. If this pattern repeats over 3 executions, flag for infrastructure review.',
        });
      }

      // Token consumption anomaly — consuming 5x expected tokens
      if (action.expectedTokenCount && action.actualTokenCount) {
        const ratio = action.actualTokenCount / action.expectedTokenCount;
        if (ratio > 5) {
          return this.buildConflict(action, 6, 'WARNING', {
            expected: { tokenCount: action.expectedTokenCount },
            actual: { tokenCount: action.actualTokenCount, multiplier: ratio.toFixed(1) + 'x' },
            description: `Action "${action.actionType}" consumed ${action.actualTokenCount} tokens — ${ratio.toFixed(1)}x the expected ${action.expectedTokenCount}. This may indicate prompt inflation or an unexpected complexity spike.`,
            resolution: 'Review action payload for unintended expansion. Check for memory context bleed from previous sessions.',
          });
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // CONFLICT BUILDER — standardizes conflict signal construction
  // ============================================================================

  private buildConflict(
    action: IntendedAction,
    category: ConflictCategory,
    severity: ConflictSeverity,
    details: {
      expected: Record<string, any>;
      actual: Record<string, any>;
      description: string;
      resolution: string;
    },
  ): AccConflictSignal {
    return {
      conflictId: crypto.randomUUID(),
      detectedAt: new Date(),
      conflictCategory: category,
      conflictSeverity: severity,
      executionId: action.executionId,
      workspaceId: action.workspaceId,
      entitiesInvolved: action.entitiesInvolved || [],
      expectedState: details.expected,
      actualState: details.actual,
      contradictionDescription: details.description,
      recommendedResolution: details.resolution,
      autoBlocked: severity === 'BLOCKING',
      requiresHumanReview: severity === 'BLOCKING',
      thalamicSignalId: action.thalamicSignalId,
    };
  }

  // ============================================================================
  // CONFLICT HANDLER — persists, broadcasts, notifies
  // ============================================================================

  private async handleConflict(conflict: AccConflictSignal, action: IntendedAction): Promise<void> {
    // 1. Persist to trinity_acc_log
    await this.persistConflict(conflict);

    // 2. Broadcast to global workspace based on severity
    if (conflict.conflictSeverity === 'BLOCKING') {
      // BLOCKING: send as highest priority to global workspace
      try {
        broadcastToGlobalWorkspace('PREFRONTAL_CORTEX', 'acc_blocking_conflict', {
          conflictId: conflict.conflictId,
          category: conflict.conflictCategory,
          severity: conflict.conflictSeverity,
          executionId: conflict.executionId,
          workspaceId: conflict.workspaceId,
          description: conflict.contradictionDescription,
          resolution: conflict.recommendedResolution,
          autoBlocked: true,
        });
      } catch {
        // Non-fatal
      }

      // Notify via platform event bus — workspace managers will receive this
      if (conflict.workspaceId) {
        try {
          await platformEventBus.publish({
            type: 'trinity_action_blocked',
            workspaceId: conflict.workspaceId,
            data: {
              conflictId: conflict.conflictId,
              category: conflict.conflictCategory,
              severity: conflict.conflictSeverity,
              description: conflict.contradictionDescription.slice(0, 200),
              resolution: conflict.recommendedResolution,
              requiresHumanReview: true,
              source: 'acc_service',
            },
          });
        } catch {
          // Non-fatal
        }
      }

    } else if (conflict.conflictSeverity === 'WARNING') {
      // WARNING: broadcast at elevated priority, allow execution to continue
      try {
        broadcastToGlobalWorkspace('PREFRONTAL_CORTEX', 'acc_warning_conflict', {
          conflictId: conflict.conflictId,
          category: conflict.conflictCategory,
          severity: conflict.conflictSeverity,
          executionId: conflict.executionId,
          description: conflict.contradictionDescription,
        });
      } catch {
        // Non-fatal
      }
    }
    // INFO: log-only — no broadcast, no notification
  }

  // ============================================================================
  // PERSISTENCE — writes to trinity_acc_log
  // ============================================================================

  private async persistConflict(conflict: AccConflictSignal): Promise<void> {
    try {
      await db.insert(trinityAccLogs).values({
        conflictId: conflict.conflictId,
        detectedAt: conflict.detectedAt,
        conflictCategory: conflict.conflictCategory,
        conflictSeverity: conflict.conflictSeverity,
        executionId: conflict.executionId,
        workspaceId: conflict.workspaceId,
        entitiesInvolved: conflict.entitiesInvolved,
        expectedState: conflict.expectedState,
        actualState: conflict.actualState,
        contradictionDescription: conflict.contradictionDescription,
        recommendedResolution: conflict.recommendedResolution,
        autoBlocked: conflict.autoBlocked,
        requiresHumanReview: conflict.requiresHumanReview,
        thalamicSignalId: conflict.thalamicSignalId,
      });
    } catch {
      // ACC persistence must never crash the execution pipeline
    }
  }

  // ============================================================================
  // HUMAN RESOLUTION — called when a manager resolves an open conflict
  // ============================================================================

  async resolveConflict(
    conflictId: string,
    resolverId: string,
    notes: string,
    outcome: string,
  ): Promise<void> {
    try {
      // Converted to Drizzle ORM
      await db.update(trinityAccLogs)
        .set({
          resolvedAt: sql`now()`,
          humanResolverId: resolverId,
          humanResolutionNotes: notes,
          outcome,
          resolutionMethod: 'human_review',
          requiresHumanReview: false,
        })
        .where(eq(trinityAccLogs.conflictId, conflictId));
    } catch {
      // Non-fatal
    }
  }

  // ============================================================================
  // DASHBOARD DATA — for owner ACC panel
  // ============================================================================

  async getDashboardStats(workspaceId: string): Promise<{
    todayTotal: number;
    byCategory: Record<number, number>;
    bySeverity: Record<string, number>;
    autoResolved: number;
    humanRequired: number;
    openUnresolved: { conflictId: string; category: number; severity: string; description: string; detectedAt: Date }[];
    mostCommonCategory: number | null;
    resolutionAccuracy: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: trinity_acc_log | Verified: 2026-03-23
      const result = await typedPool(`
        SELECT
          conflict_category,
          conflict_severity,
          auto_blocked,
          auto_resolved,
          requires_human_review,
          resolved_at,
          conflict_id,
          contradiction_description,
          detected_at
        FROM trinity_acc_log
        WHERE workspace_id = $1
          AND detected_at >= $2
        ORDER BY detected_at DESC
      `, [workspaceId, today.toISOString()]);

      const allRows = (result as any[]) || [];

      const byCategory: Record<number, number> = {};
      const bySeverity: Record<string, number> = {};
      let autoResolved = 0;
      let humanRequired = 0;
      const openUnresolved: any[] = [];

      for (const row of allRows) {
        byCategory[row.conflict_category] = (byCategory[row.conflict_category] || 0) + 1;
        bySeverity[row.conflict_severity] = (bySeverity[row.conflict_severity] || 0) + 1;
        if (row.auto_resolved) autoResolved++;
        if (row.requires_human_review && !row.resolved_at) {
          humanRequired++;
          openUnresolved.push({
            conflictId: row.conflict_id,
            category: row.conflict_category,
            severity: row.conflict_severity,
            description: row.contradiction_description,
            detectedAt: row.detected_at,
          });
        }
      }

      const mostCommonCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0];
      const totalResolved = allRows.filter(r => r.resolved_at).length;
      const resolutionAccuracy = allRows.length > 0 ? Math.round((totalResolved / allRows.length) * 100) : 100;

      return {
        todayTotal: allRows.length,
        byCategory,
        bySeverity,
        autoResolved,
        humanRequired,
        openUnresolved: openUnresolved.slice(0, 20),
        mostCommonCategory: mostCommonCategory ? parseInt(mostCommonCategory) : null,
        resolutionAccuracy,
      };
    } catch {
      return {
        todayTotal: 0,
        byCategory: {},
        bySeverity: {},
        autoResolved: 0,
        humanRequired: 0,
        openUnresolved: [],
        mostCommonCategory: null,
        resolutionAccuracy: 100,
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const trinityACC = new TrinityACCService();

// Category labels for display
export const ACC_CATEGORY_LABELS: Record<ConflictCategory, string> = {
  1: 'Memory Contradiction',
  2: 'Decision Contradiction',
  3: 'Values Violation',
  4: 'Trust Tier Violation',
  5: 'Prediction Divergence',
  6: 'Execution Anomaly',
};
