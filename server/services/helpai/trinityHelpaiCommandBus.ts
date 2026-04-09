/**
 * Trinity-HelpAI Command Bus — Phase 6
 * ======================================
 * Bidirectional structured command protocol between Trinity and HelpAI.
 * Every message is a typed structured payload — not a chat interface.
 * Uses trinity_helpai_command_bus table (Phase 3).
 *
 * Graceful degradation: if Trinity is unreachable for 30s, HelpAI enters
 * Limited Autonomous Mode. Queues escalations and retries every 60s.
 */

import { db } from '../../db';
import { trinityHelpaiCommandBus as commandBusTable } from '@shared/schema';
import { eq, and, desc, asc, lt, sql } from 'drizzle-orm';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityHelpaiCommandBus');


export type CommandBusDirection = 'helpai_to_trinity' | 'trinity_to_helpai';

export type CommandBusMessageType =
  | 'escalation'
  | 'report'
  | 'request'
  | 'alert'
  | 'acknowledgment'
  | 'assignment'
  | 'instruction'
  | 'authorization'
  | 'agent_result'
  | 'broadcast_order';

export type CommandBusPriority = 'critical' | 'high' | 'normal' | 'low';
export type CommandBusStatus = 'sent' | 'received' | 'processed' | 'failed' | 'pending';

export interface EscalationPayload {
  type: 'escalation';
  priority: CommandBusPriority;
  source_channel_type: string;
  issue_summary: string;
  affected_entity_type: string;
  affected_entity_id: string;
  context_payload: Record<string, unknown>;
  helpai_attempted: string[];
  recommended_action: string;
  workspace_id: string | null;
  conversation_id: string;
  language: 'en' | 'es';
}

export interface ReportPayload {
  type: 'report';
  report_type:
    | 'interaction_complete'
    | 'document_filed'
    | 'violation_logged'
    | 'task_complete'
    | 'sla_missed';
  summary: string;
  outcome: 'resolved' | 'escalated' | 'pending';
  related_entity: Record<string, unknown>;
  workspace_id: string | null;
  conversation_id: string;
}

export interface RequestPayload {
  type: 'request';
  request_type:
    | 'spawn_agent'
    | 'platform_data'
    | 'authorization'
    | 'clarification'
    | 'cognitive_consult';
  details: string;
  input_payload: Record<string, unknown>;
  workspace_id: string | null;
  conversation_id: string;
}

export interface AlertPayload {
  type: 'alert';
  alert_type:
    | 'safety_flag'
    | 'pattern_detected'
    | 'system_anomaly'
    | 'sentiment_threshold'
    | 'sla_breach'
    | 'proactive_signal';
  description: string;
  severity: 'immediate' | 'watch' | 'informational';
  source_thread: string;
  workspace_id: string | null;
  conversation_id?: string;
  language?: 'en' | 'es';
}

type CommandPayload = EscalationPayload | ReportPayload | RequestPayload | AlertPayload | Record<string, unknown>;

interface SendCommandParams {
  workspaceId?: string | null;
  direction: CommandBusDirection;
  messageType: CommandBusMessageType;
  priority: CommandBusPriority;
  payload: CommandPayload;
}

// Graceful degradation state
let _trinityReachable = true;
let _lastTrinityCheck = Date.now();
const TRINITY_TIMEOUT_MS = 30_000;
const RETRY_INTERVAL_MS = 60_000;

class TrinityHelpAICommandBus {
  private retryTimer: NodeJS.Timeout | null = null;

  async send(params: SendCommandParams): Promise<typeof commandBusTable.$inferSelect | null> {
    try {
      const [entry] = await db
        .insert(commandBusTable)
        .values({
          workspaceId: params.workspaceId || undefined,
          direction: params.direction,
          messageType: params.messageType,
          priority: params.priority,
          payload: params.payload as Record<string, unknown>,
          status: 'sent',
        })
        .returning();

      if (params.priority === 'critical') {
        this.processCriticalItem(entry).catch(err =>
          log.error('[CommandBus] Critical item processing failed:', err)
        );
      }

      return entry;
    } catch (err) {
      log.error('[CommandBus] Failed to send:', err);
      return null;
    }
  }

  async markReceived(id: string): Promise<void> {
    await db
      .update(commandBusTable)
      .set({ status: 'received' })
      .where(eq(commandBusTable.id, id));
  }

  async markProcessed(id: string): Promise<void> {
    await db
      .update(commandBusTable)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(commandBusTable.id, id));
  }

  async markFailed(id: string): Promise<void> {
    await db
      .update(commandBusTable)
      .set({ status: 'failed' })
      .where(eq(commandBusTable.id, id));
  }

  async getPendingForTrinity(): Promise<typeof commandBusTable.$inferSelect[]> {
    return db
      .select()
      .from(commandBusTable)
      .where(
        and(
          eq(commandBusTable.direction, 'helpai_to_trinity'),
          eq(commandBusTable.status, 'sent')
        )
      )
      .orderBy(asc(commandBusTable.createdAt))
      .limit(50);
  }

  async getPendingForHelpAI(): Promise<typeof commandBusTable.$inferSelect[]> {
    return db
      .select()
      .from(commandBusTable)
      .where(
        and(
          eq(commandBusTable.direction, 'trinity_to_helpai'),
          eq(commandBusTable.status, 'sent')
        )
      )
      .orderBy(asc(commandBusTable.createdAt))
      .limit(50);
  }

  // GRACEFUL DEGRADATION — Limited Autonomous Mode
  enterLimitedAutonomousMode(): void {
    _trinityReachable = false;
    log.warn('[CommandBus] Trinity unreachable — HelpAI entering Limited Autonomous Mode');

    if (!this.retryTimer) {
      this.retryTimer = setInterval(async () => {
        await this.retryTrinityConnection();
      }, RETRY_INTERVAL_MS);
    }
  }

  exitLimitedAutonomousMode(): void {
    _trinityReachable = true;
    log.info('[CommandBus] Trinity reconnected — resuming normal operation');
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.processPendingQueue().catch(err =>
      log.error('[CommandBus] Queue processing failed on reconnect:', err)
    );
  }

  isTrinityReachable(): boolean {
    return _trinityReachable;
  }

  private async retryTrinityConnection(): Promise<void> {
    try {
      const pending = await this.getPendingForTrinity();
      if (pending.length > 0) {
        const criticalItems = pending.filter(
          (p) => p.priority === 'critical'
        );
        if (criticalItems.length > 0) {
          for (const item of criticalItems.slice(0, 3)) {
            const payload = item.payload as AlertPayload;
            if (payload?.workspace_id) {
              await universalNotificationEngine.sendNotification({
                workspaceId: payload.workspace_id,
                type: 'emergency',
                title: 'HelpAI: Critical Item Pending — Trinity Offline',
                message: `Critical command bus item requires immediate attention: ${(payload as unknown as EscalationPayload).issue_summary || payload.description || 'Review queued items'}`,
                severity: 'critical',
                source: 'helpai_command_bus',
              } as any);
            }
          }
        }
      }
      this.exitLimitedAutonomousMode();
    } catch (_err) {
      // Trinity still unreachable, keep retrying
    }
  }

  private async processPendingQueue(): Promise<void> {
    const pending = await this.getPendingForTrinity();
    const priorityOrder: CommandBusPriority[] = ['critical', 'high', 'normal', 'low'];

    const sorted = pending.sort(
      (a, b) =>
        priorityOrder.indexOf(a.priority as CommandBusPriority) -
        priorityOrder.indexOf(b.priority as CommandBusPriority)
    );

    for (const item of sorted) {
      await this.markReceived(item.id);
    }

    log.info(`[CommandBus] Processed ${sorted.length} queued items after Trinity reconnect`);
  }

  private async processCriticalItem(
    item: typeof commandBusTable.$inferSelect
  ): Promise<void> {
    const payload = item.payload as AlertPayload | EscalationPayload;
    const workspaceId = (payload as any)?.workspace_id;

    if (workspaceId) {
      await universalNotificationEngine.sendNotification({
        workspaceId,
        type: 'emergency',
        title: 'CRITICAL: HelpAI Command Bus Alert',
        message: (payload as EscalationPayload).issue_summary ||
          (payload as AlertPayload).description ||
          'Critical item on command bus — immediate review required',
        severity: 'critical',
        source: 'helpai_command_bus',
      } as any);
    }

    await this.markReceived(item.id);
  }

  async sendEscalation(escalation: Omit<EscalationPayload, 'type'>): Promise<void> {
    await this.send({
      workspaceId: escalation.workspace_id,
      direction: 'helpai_to_trinity',
      messageType: 'escalation',
      priority: escalation.priority,
      payload: { type: 'escalation', ...escalation },
    });
  }

  async sendReport(report: Omit<ReportPayload, 'type'>): Promise<void> {
    await this.send({
      workspaceId: report.workspace_id,
      direction: 'helpai_to_trinity',
      messageType: 'report',
      priority: 'normal',
      payload: { type: 'report', ...report },
    });
  }

  async sendAlert(alert: Omit<AlertPayload, 'type'>): Promise<void> {
    const priority: CommandBusPriority =
      alert.severity === 'immediate' ? 'critical' :
      alert.severity === 'watch' ? 'high' : 'normal';

    await this.send({
      workspaceId: (alert as any).workspace_id,
      direction: 'helpai_to_trinity',
      messageType: 'alert',
      priority,
      payload: { type: 'alert', ...alert },
    });
  }

  async sendRequest(request: Omit<RequestPayload, 'type'>): Promise<void> {
    await this.send({
      workspaceId: request.workspace_id,
      direction: 'helpai_to_trinity',
      messageType: 'request',
      priority: 'normal',
      payload: { type: 'request', ...request },
    });
  }

  /**
   * Report a completed voice call back to Trinity via the command bus.
   * Called by VoiceOrchestrator after AI resolution or human escalation.
   * Trinity uses this for cross-channel awareness and pattern detection.
   */
  async reportVoiceCallOutcome(opts: {
    workspaceId: string;
    callSid: string;
    callerNumber: string;
    durationSeconds: number;
    outcome: 'ai_resolved' | 'escalated' | 'abandoned' | 'voicemail';
    aiAttempted: boolean;
    transcriptSummary?: string;
    extensionHandled?: string;
  }): Promise<void> {
    await this.send({
      workspaceId: opts.workspaceId,
      direction: 'helpai_to_trinity',
      messageType: 'report',
      priority: opts.outcome === 'escalated' ? 'high' : 'normal',
      payload: {
        type: 'report',
        report_type: 'interaction_complete',
        summary: `Voice call from ${opts.callerNumber} — outcome: ${opts.outcome}${opts.extensionHandled ? ` (extension: ${opts.extensionHandled})` : ''}. Duration: ${opts.durationSeconds}s.${opts.transcriptSummary ? ` Summary: ${opts.transcriptSummary}` : ''}`,
        outcome: opts.outcome === 'ai_resolved' ? 'resolved' : opts.outcome === 'escalated' ? 'escalated' : 'pending',
        related_entity: {
          channel: 'voice',
          call_sid: opts.callSid,
          caller_number: opts.callerNumber,
          duration_seconds: opts.durationSeconds,
          ai_attempted: opts.aiAttempted,
          extension: opts.extensionHandled,
        },
        workspace_id: opts.workspaceId,
        conversation_id: opts.callSid,
      },
    });
    log.info(`[CommandBus] Voice call outcome reported: ${opts.outcome} — ${opts.callSid}`);
  }

  /**
   * HelpAI requests a knowledge lookup from Trinity.
   * Trinity will queue the lookup and push an instruction back via the command bus.
   */
  async requestKnowledgeLookup(opts: {
    query: string;
    workspaceId: string;
    conversationId: string;
    stateCode?: string;
    category?: string;
  }): Promise<void> {
    await this.send({
      workspaceId: opts.workspaceId,
      direction: 'helpai_to_trinity',
      messageType: 'request',
      priority: 'high',
      payload: {
        type: 'request',
        request_type: 'platform_data',
        details: `Knowledge lookup requested for query: "${opts.query}"${opts.stateCode ? ` (state: ${opts.stateCode})` : ''}${opts.category ? ` (category: ${opts.category})` : ''}`,
        input_payload: {
          query: opts.query,
          state_code: opts.stateCode,
          category: opts.category,
          channel: 'helpai_session',
        },
        workspace_id: opts.workspaceId,
        conversation_id: opts.conversationId,
      },
    });
  }

  /**
   * Broadcast cross-channel awareness — tells Trinity that a user is active
   * across multiple channels simultaneously (chat + email, or chat + voice).
   * Trinity uses this for unified omnichannel intelligence.
   */
  async broadcastCrossChannelActivity(opts: {
    workspaceId: string;
    userId: string;
    activeChannels: Array<'email' | 'voice' | 'chat' | 'chatdock'>;
    currentChannel: 'email' | 'voice' | 'chat' | 'chatdock';
    conversationId: string;
  }): Promise<void> {
    if (opts.activeChannels.length <= 1) return; // Only broadcast if multi-channel

    await this.send({
      workspaceId: opts.workspaceId,
      direction: 'helpai_to_trinity',
      messageType: 'alert',
      priority: 'normal',
      payload: {
        type: 'alert',
        alert_type: 'pattern_detected',
        description: `User ${opts.userId} is active across ${opts.activeChannels.join(', ')} simultaneously. Current active channel: ${opts.currentChannel}.`,
        severity: 'informational',
        source_thread: opts.currentChannel,
        workspace_id: opts.workspaceId,
        conversation_id: opts.conversationId,
      },
    });
  }
}

export const trinityHelpaiCommandBus = new TrinityHelpAICommandBus();
