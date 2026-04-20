/**
 * Trinity Action Logger — tracks every Trinity decision for audit trails
 *
 * Trinity is one agent. Internally her reasoning can take multiple compute
 * paths (orchestration, specialist, support); this logger records which
 * path she used for each action so operators can audit cost and confidence
 * without leaking the backend taxonomy to tenants.
 *
 * The `primaryAi`/`supportAi` fields are internal compute-path labels, not
 * separate agents. They will be renamed to `primaryPath`/`supportPath` in
 * a later phase once database history is migrated.
 */

import { db } from '../../../db';
import { createLogger } from '../../../lib/logger';
const log = createLogger('trinityActionLogger');


export interface AIActionContext {
  sessionId: string;
  workspaceId?: string;
  userId?: string;
  taskType?: string;
  task?: string;
  domain?: string;
}

export interface AICollaborationInfo {
  primaryAi: 'trinity' | 'claude';
  supportAi?: 'trinity' | 'claude';
  collaborationType?: 'consultation' | 'data_enrichment' | 'task_handoff' | 'verification' | 'joint_workflow';
  routingDecision?: string;
}

export interface AIActionMetrics {
  creditsUsed?: number;
  apiCostUsd?: number;
  tokensUsed?: number;
  durationMs?: number;
  confidenceScore?: number;
}

export interface AIVerificationInfo {
  result: 'approved' | 'rejected' | 'approved_with_modifications';
  notes?: string;
}

class AIActionLogger {
  async log(params: {
    actionType: string;
    context: AIActionContext;
    collaboration: AICollaborationInfo;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    contextProvided?: Record<string, any>;
    verification?: AIVerificationInfo;
    metrics?: AIActionMetrics;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const logEntry: InsertAiActionLog = {
        sessionId: params.context.sessionId,
        workspaceId: params.context.workspaceId || null,
        userId: params.context.userId || null,
        actionType: params.actionType,
        primaryAi: params.collaboration.primaryAi,
        supportAi: params.collaboration.supportAi || null,
        taskType: params.context.taskType || null,
        task: params.context.task || null,
        domain: params.context.domain || null,
        collaborationType: params.collaboration.collaborationType || null,
        routingDecision: params.collaboration.routingDecision || null,
        requestData: params.requestData || {},
        responseData: params.responseData || {},
        contextProvided: params.contextProvided || {},
        confidenceScore: params.metrics?.confidenceScore?.toString() || null,
        verificationResult: params.verification?.result || null,
        verificationNotes: params.verification?.notes || null,
        creditsUsed: params.metrics?.creditsUsed || 0,
        apiCostUsd: params.metrics?.apiCostUsd?.toString() || '0',
        tokensUsed: params.metrics?.tokensUsed || 0,
        durationMs: params.metrics?.durationMs || null,
        success: params.success !== false,
        errorMessage: params.errorMessage || null,
        metadata: params.metadata || {},
      };

      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(aiActionLogs).values(logEntry);
    } catch (error) {
      log.error('[AIActionLogger] Failed to log AI action:', error);
    }
  }

  async logTrinityAction(params: {
    actionType: string;
    context: AIActionContext;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    supportFromClaude?: boolean;
    collaborationType?: AICollaborationInfo['collaborationType'];
    routingDecision?: string;
    metrics?: AIActionMetrics;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    return this.log({
      ...params,
      collaboration: {
        primaryAi: 'trinity',
        supportAi: params.supportFromClaude ? 'claude' : undefined,
        collaborationType: params.collaborationType,
        routingDecision: params.routingDecision,
      },
    });
  }

  async logClaudeAction(params: {
    actionType: string;
    context: AIActionContext;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    supportFromTrinity?: boolean;
    collaborationType?: AICollaborationInfo['collaborationType'];
    routingDecision?: string;
    metrics?: AIActionMetrics;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    return this.log({
      ...params,
      collaboration: {
        primaryAi: 'claude',
        supportAi: params.supportFromTrinity ? 'trinity' : undefined,
        collaborationType: params.collaborationType,
        routingDecision: params.routingDecision,
      },
    });
  }

  async logCollaboration(params: {
    actionType: string;
    context: AIActionContext;
    primaryAi: 'trinity' | 'claude';
    supportAi: 'trinity' | 'claude';
    collaborationType: AICollaborationInfo['collaborationType'];
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    contextProvided?: Record<string, any>;
    routingDecision?: string;
    metrics?: AIActionMetrics;
    metadata?: Record<string, any>;
  }): Promise<void> {
    return this.log({
      ...params,
      collaboration: {
        primaryAi: params.primaryAi,
        supportAi: params.supportAi,
        collaborationType: params.collaborationType,
        routingDecision: params.routingDecision,
      },
    });
  }

  async logVerification(params: {
    context: AIActionContext;
    operationType: string;
    trinityConfidenceScore: number;
    verification: AIVerificationInfo;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
    metrics?: AIActionMetrics;
  }): Promise<void> {
    return this.log({
      actionType: params.verification.result === 'rejected' 
        ? 'claude_verification_rejected' 
        : 'claude_verification_approved',
      context: params.context,
      collaboration: {
        primaryAi: 'trinity',
        supportAi: 'claude',
        collaborationType: 'verification',
        routingDecision: `Confidence ${params.trinityConfidenceScore}% - Claude QA required`,
      },
      requestData: params.requestData,
      responseData: params.responseData,
      verification: params.verification,
      metrics: {
        ...params.metrics,
        confidenceScore: params.trinityConfidenceScore,
      },
    });
  }
}

export const aiActionLogger = new AIActionLogger();
