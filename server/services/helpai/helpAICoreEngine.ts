/**
 * HelpAI Core Engine — Phase 4
 * ==============================
 * Two-layer context resolver, priority classifier, cognitive layer router,
 * language detection + session lock, faith sensitivity detector,
 * status broadcast vocabulary, emergency protocol, SLA tracking.
 *
 * Additive only — extends existing helpAIBotService and helpAIOrchestrator.
 * Never rewrites or replaces. Never claims to be human.
 */

import { db } from '../../db';
import {
  helpaiConversations,
  helpaiMessages,
  helpaiSlaLog,
  helpaiFaqGaps,
  helpaiProactiveAlerts,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { createLogger } from '../../lib/logger';
const log = createLogger('helpAICoreEngine');


// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type HelpAILayer = 'platform' | 'workspace';
export type ConversationPriority = 'critical' | 'high' | 'normal' | 'low';
export type CognitiveLayers = 'claude' | 'gpt' | 'gemini';
export type FaithSensitivityState = 'receptive' | 'neutral' | 'careful';
export type SessionLanguage = 'en' | 'es';
export type ConversationStatus = 'active' | 'resolved' | 'escalated' | 'handed_off' | 'closed';

export interface MessageContext {
  originType: 'platform_dm' | 'workspace_channel' | 'workspace_dm' | 'client_portal';
  userPlatformRole?: string;
  userWorkspaceRole?: string;
  channelWorkspaceId?: string;
  userId?: string;
}

export interface ConversationContext {
  conversationId: string;
  workspaceId: string | null;
  layer: HelpAILayer;
  language: SessionLanguage;
  faithSensitivityState: FaithSensitivityState;
  priority: ConversationPriority;
  status: ConversationStatus;
  humanHandoffActive: boolean;
}

export interface HelpAITask {
  type: string;
  input_type?: string[];
  requires_deliberation?: boolean;
  ethical_weight?: boolean;
  safety_flag?: boolean;
  override_model?: CognitiveLayers;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-A: TWO-LAYER CONTEXT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_ROLES = ['support_agent', 'sysop', 'root_admin', 'platform_admin', 'platform_staff'];

export function resolveHelpAILayer(context: MessageContext): {
  layer: HelpAILayer;
  workspaceId: string | null;
} {
  if (
    context.originType === 'platform_dm' &&
    context.userPlatformRole &&
    PLATFORM_ROLES.includes(context.userPlatformRole.toLowerCase())
  ) {
    return { layer: 'platform', workspaceId: null };
  }

  if (
    context.originType === 'workspace_channel' ||
    context.originType === 'client_portal'
  ) {
    return {
      layer: 'workspace',
      workspaceId: context.channelWorkspaceId || null,
    };
  }

  if (context.originType === 'workspace_dm') {
    const isOrgOwnerOrAdmin =
      context.userWorkspaceRole &&
      ['owner', 'admin', 'org_owner', 'org_admin'].includes(
        context.userWorkspaceRole.toLowerCase()
      );
    return {
      layer: 'workspace',
      workspaceId: isOrgOwnerOrAdmin ? context.channelWorkspaceId || null : null,
    };
  }

  return { layer: 'workspace', workspaceId: context.channelWorkspaceId || null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-B: PRIORITY CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────

const CRITICAL_PATTERNS_EN = [
  /\b(gun|weapon|knife|armed|shooting|shot|stabbed?|attack(ing|ed)?|robbery|robbing|hostage)\b/i,
  /\b(help\s+me|emergency|danger|threat|under\s+attack)\b/i,
  /\b(medical|ambulance|fire|911|injured|bleeding|unconscious|not\s+breathing)\b/i,
  /\b(panic|duress|distress|sos|mayday)\b/i,
  /\b(intruder|trespasser|suspicious\s+person|active\s+incident)\b/i,
];

const CRITICAL_PATTERNS_ES = [
  /\b(pistola|arma|cuchillo|armado|disparos?|ataque|robo|rehén)\b/i,
  /\b(ayuda|emergencia|peligro|amenaza|bajo\s+ataque)\b/i,
  /\b(médico|ambulancia|incendio|herido|sangre|inconsciente|no\s+respira)\b/i,
  /\b(pánico|angustia|socorro|auxilio)\b/i,
  /\b(intruso|sospechoso|incidente\s+activo)\b/i,
];

const HIGH_PATTERNS = [
  /\b(cancel\s+(contract|service|account)|terminate\s+service)\b/i,
  /\b(license\s*(expired?|expires?|expiring))\b/i,
  /\b(misconduct|complaint|violation|lawsuit|attorney|legal\s+action)\b/i,
  /\b(payment\s+(dispute|failed|refused))\b/i,
  /\b(sla\s+breach|service\s+failure|system\s+(down|failure|error))\b/i,
];

const LOW_PATTERNS = [
  /\b(how\s+(do|can|should)\s+i|what\s+is|where\s+(is|can)|when\s+(is|does))\b/i,
  /\b(info|information|status\s+of|check\s+(on|my))\b/i,
];

export function classifyMessagePriority(
  message: string,
  _context?: Partial<ConversationContext>
): ConversationPriority {
  const text = message.toLowerCase();

  for (const pattern of CRITICAL_PATTERNS_EN) {
    if (pattern.test(text)) return 'critical';
  }
  for (const pattern of CRITICAL_PATTERNS_ES) {
    if (pattern.test(text)) return 'critical';
  }

  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(text)) return 'high';
  }

  for (const pattern of LOW_PATTERNS) {
    if (pattern.test(text)) return 'low';
  }

  return 'normal';
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-C: COGNITIVE LAYER ROUTER (HelpAI-specific)
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_INPUT_TYPES = ['image', 'document_scan', 'pattern_analysis', 'large_dataset'];
const DELIBERATION_TYPES = [
  'conduct_enforcement', 'liability_assessment', 'applicant_disqualification',
  'distress_response', 'safety_response', 'ethical_judgment',
];

export function selectHelpAICognitiveLayer(task: HelpAITask): CognitiveLayers {
  if (task.override_model) return task.override_model;

  if (
    task.requires_deliberation ||
    task.ethical_weight ||
    task.safety_flag ||
    (task.input_type && task.input_type.some(t => DELIBERATION_TYPES.includes(t)))
  ) {
    return 'claude';
  }

  if (
    task.input_type &&
    task.input_type.some(t => IMAGE_INPUT_TYPES.includes(t))
  ) {
    return 'gemini';
  }

  return 'gpt';
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-D: LANGUAGE DETECTION + SESSION LOCK
// ─────────────────────────────────────────────────────────────────────────────

const SPANISH_SIGNALS = [
  /\b(hola|gracias|por\s+favor|necesito|ayuda|puedo|quiero|tengo|es|son|están|cómo|cuándo|dónde|qué|no\s+sé|sí|buenas)\b/i,
  /[áéíóúüñ¡¿]/,
];

export function detectSessionLanguage(firstMessage: string): SessionLanguage {
  for (const pattern of SPANISH_SIGNALS) {
    if (pattern.test(firstMessage)) return 'es';
  }
  return 'en';
}

export async function updateConversationLanguage(
  conversationId: string,
  newLanguage: SessionLanguage
): Promise<void> {
  await db
    .update(helpaiConversations)
    .set({ language: newLanguage, updatedAt: new Date() })
    .where(eq(helpaiConversations.id, conversationId));
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-E: FAITH SENSITIVITY DETECTOR
// ─────────────────────────────────────────────────────────────────────────────

const RECEPTIVE_SIGNALS = [
  /\b(god|lord|jesus|prayer|praying|church|blessing|blessed|faith|amen|thank\s*god|praise|scripture|bible)\b/i,
  /\b(dios|señor|jesús|oración|rezando|iglesia|bendición|bendecido|fe|amén|gracias\s+a\s+dios|escritura|biblia)\b/i,
];

const CAREFUL_SIGNALS = [
  /\b(no\s+(religious|religion|faith|god|church|spiritual|prayer)|secular|keep\s+it\s+professional|not\s+religious)\b/i,
  /\b(sin\s+(religión|dios|iglesia|espiritual)|secular|profesional\s+por\s+favor)\b/i,
];

export function detectFaithSensitivity(message: string): FaithSensitivityState | null {
  for (const pattern of CAREFUL_SIGNALS) {
    if (pattern.test(message)) return 'careful';
  }
  for (const pattern of RECEPTIVE_SIGNALS) {
    if (pattern.test(message)) return 'receptive';
  }
  return null;
}

export async function updateFaithSensitivityState(
  conversationId: string,
  state: FaithSensitivityState
): Promise<void> {
  await db
    .update(helpaiConversations)
    .set({ faithSensitivityState: state, updatedAt: new Date() })
    .where(eq(helpaiConversations.id, conversationId));
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4-F: STATUS BROADCAST VOCABULARY
// ─────────────────────────────────────────────────────────────────────────────

export const HELPAI_STATUS_VOCABULARY = [
  'Looking into this...',
  'Pulling that up...',
  'Working on it...',
  'One moment...',
  'Checking records...',
  'On it...',
  'Let me get that for you...',
  'Reviewing now...',
  'Almost there...',
];

export const TRINITY_STATUS_VOCABULARY = [
  'Analyzing...',
  'Thinking...',
  'Deliberating...',
  'Processing...',
  'Reviewing...',
  'Evaluating...',
  'Assessing...',
  'Working...',
];

let _lastHelpAIStatus = '';
let _lastTrinityStatus = '';

export function getNextHelpAIStatus(): string {
  const pool = HELPAI_STATUS_VOCABULARY.filter(s => s !== _lastHelpAIStatus);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  _lastHelpAIStatus = chosen;
  return chosen;
}

export function getNextTrinityStatus(): string {
  const pool = TRINITY_STATUS_VOCABULARY.filter(s => s !== _lastTrinityStatus);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  _lastTrinityStatus = chosen;
  return chosen;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7: EMERGENCY PROTOCOL — Hard-coded behavior tree, never varies
// ─────────────────────────────────────────────────────────────────────────────

export interface EmergencyContext {
  conversationId: string;
  workspaceId: string | null;
  userId?: string;
  channelId?: string;
  language: SessionLanguage;
  messageContent: string;
}

export async function triggerEmergencyProtocol(ctx: EmergencyContext): Promise<{
  immediateAck: string;
  commandBusAlertId: string | null;
}> {
  const ack =
    ctx.language === 'es'
      ? 'Te escucho. Estoy consiguiendo ayuda ahora mismo. Quédate conmigo.'
      : 'I hear you. I\'m getting help right now. Stay with me.';

  let commandBusAlertId: string | null = null;

  try {
    const { trinityHelpaiCommandBus } = await import('./trinityHelpaiCommandBus');
    const busEntry = await trinityHelpaiCommandBus.send({
      workspaceId: ctx.workspaceId,
      direction: 'helpai_to_trinity',
      messageType: 'alert',
      priority: 'critical',
      payload: {
        type: 'alert',
        alert_type: 'safety_flag',
        severity: 'immediate',
        description: `CRITICAL SAFETY FLAG — conversation ${ctx.conversationId}: ${ctx.messageContent.slice(0, 200)}`,
        source_thread: 'emergency_protocol',
        workspace_id: ctx.workspaceId,
        conversation_id: ctx.conversationId,
        language: ctx.language,
      },
    });
    commandBusAlertId = busEntry?.id || null;
  } catch (err) {
    log.error('[HelpAI:Emergency] Command bus alert failed:', err);
  }

  try {
    if (ctx.workspaceId) {
      await universalNotificationEngine.sendNotification({
        workspaceId: ctx.workspaceId,
        idempotencyKey: `notif:emergency:${ctx.conversationId}:safety_flag`,
          type: 'emergency',
        title: 'CRITICAL: HelpAI Safety Flag',
        message: `Emergency protocol triggered in conversation ${ctx.conversationId}. Immediate attention required.`,
        severity: 'critical',
        actionUrl: `/helpdesk?conversation=${ctx.conversationId}`,
        source: 'helpai_emergency',
      } as any);
    }
  } catch (err) {
    log.error('[HelpAI:Emergency] Notification failed:', err);
  }

  log.info(`[HelpAI:Emergency] Protocol triggered — conversation: ${ctx.conversationId}`);

  return { immediateAck: ack, commandBusAlertId };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9: SLA TRACKING
// ─────────────────────────────────────────────────────────────────────────────

const SLA_FIRST_RESPONSE_SECONDS = 60;
const SLA_RESOLUTION_MINUTES = 5;

export async function recordSlaFirstResponse(
  conversationId: string,
  workspaceId: string | null,
  layer: HelpAILayer,
  channelType: string,
  firstResponseAt: Date,
  conversationCreatedAt: Date
): Promise<void> {
  const elapsedSeconds = Math.round(
    (firstResponseAt.getTime() - conversationCreatedAt.getTime()) / 1000
  );
  const met = elapsedSeconds <= SLA_FIRST_RESPONSE_SECONDS;

  try {
    await db.insert(helpaiSlaLog).values({
      workspaceId: workspaceId || undefined,
      conversationId,
      layer,
      channelType,
      firstResponseSeconds: elapsedSeconds,
      firstResponseMet: met,
      resolutionMet: false,
    });

    await db
      .update(helpaiConversations)
      .set({
        slaFirstResponseAt: firstResponseAt,
        slaFirstResponseMet: met,
        updatedAt: new Date(),
      })
      .where(eq(helpaiConversations.id, conversationId));
  } catch (err) {
    log.error('[HelpAI:SLA] Failed to record first response:', err);
  }
}

export async function recordSlaResolution(
  conversationId: string,
  resolvedAt: Date,
  conversationCreatedAt: Date
): Promise<void> {
  const elapsedMinutes = Math.round(
    (resolvedAt.getTime() - conversationCreatedAt.getTime()) / 60000
  );
  const met = elapsedMinutes <= SLA_RESOLUTION_MINUTES;
  const missedReason = met
    ? undefined
    : `Resolution took ${elapsedMinutes} minutes (target: ${SLA_RESOLUTION_MINUTES})`;

  try {
    const existing = await db
      .select()
      .from(helpaiSlaLog)
      .where(eq(helpaiSlaLog.conversationId, conversationId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(helpaiSlaLog)
        .set({
          resolutionMinutes: elapsedMinutes,
          resolutionMet: met,
          missedReason: missedReason || null,
        })
        .where(eq(helpaiSlaLog.conversationId, conversationId));
    } else {
      await db.insert(helpaiSlaLog).values({
        conversationId,
        layer: 'workspace',
        firstResponseMet: true,
        resolutionMinutes: elapsedMinutes,
        resolutionMet: met,
        missedReason: missedReason || null,
      });
    }

    await db
      .update(helpaiConversations)
      .set({
        slaResolvedAt: resolvedAt,
        slaResolutionMet: met,
        updatedAt: new Date(),
      })
      .where(eq(helpaiConversations.id, conversationId));
  } catch (err) {
    log.error('[HelpAI:SLA] Failed to record resolution:', err);
  }
}

export async function collectSatisfactionFeedback(
  conversationId: string,
  response: string
): Promise<void> {
  try {
    await db
      .update(helpaiConversations)
      .set({ satisfactionResponse: response, updatedAt: new Date() })
      .where(eq(helpaiConversations.id, conversationId));
  } catch (err) {
    log.error('[HelpAI:SLA] Failed to record satisfaction:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION CRUD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function createHelpAIConversation(params: {
  workspaceId: string | null;
  layer: HelpAILayer;
  channelType: string;
  channelId?: string;
  initiatedByRole?: string;
  language?: SessionLanguage;
  priority?: ConversationPriority;
}): Promise<typeof helpaiConversations.$inferSelect> {
  const [conv] = await db
    .insert(helpaiConversations)
    .values({
      workspaceId: params.workspaceId || undefined,
      layer: params.layer,
      channelType: params.channelType,
      channelId: params.channelId,
      initiatedByRole: params.initiatedByRole,
      language: params.language || 'en',
      priority: params.priority || 'normal',
      faithSensitivityState: 'neutral',
      status: 'active',
    })
    .returning();
  return conv;
}

export async function recordHelpAIMessage(params: {
  conversationId: string;
  workspaceId?: string;
  sender: 'helpai' | 'user' | 'trinity' | 'system';
  content: string;
  language?: SessionLanguage;
  cognitiveLayerUsed?: CognitiveLayers;
  priorityClassification?: ConversationPriority;
  statusBroadcast?: string;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
}): Promise<void> {
  try {
    await db.insert(helpaiMessages).values({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      sender: params.sender,
      content: params.content,
      language: params.language || 'en',
      cognitiveLayerUsed: params.cognitiveLayerUsed,
      priorityClassification: params.priorityClassification || 'normal',
      statusBroadcast: params.statusBroadcast,
      processingStartedAt: params.processingStartedAt,
      processingCompletedAt: params.processingCompletedAt,
    });
  } catch (err) {
    log.error('[HelpAI:Message] Failed to record message:', err);
  }
}

export async function flagFaqGap(params: {
  workspaceId?: string;
  questionReceived: string;
  language: SessionLanguage;
  wasAnswered: boolean;
  resolutionType?: string;
}): Promise<void> {
  try {
    await db.insert(helpaiFaqGaps).values({
      workspaceId: params.workspaceId,
      questionReceived: params.questionReceived,
      language: params.language,
      wasAnswered: params.wasAnswered,
      resolutionType: params.resolutionType,
      flaggedForFaqCreation: !params.wasAnswered,
    });
  } catch (err) {
    log.error('[HelpAI:FAQ] Failed to flag gap:', err);
  }
}

export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  await db
    .update(helpaiConversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(helpaiConversations.id, conversationId));
}

export async function setHumanHandoff(
  conversationId: string,
  active: boolean,
  handoffTo?: string
): Promise<void> {
  await db
    .update(helpaiConversations)
    .set({
      humanHandoffActive: active,
      handoffTo: handoffTo || null,
      status: active ? 'handed_off' : 'active',
      updatedAt: new Date(),
    })
    .where(eq(helpaiConversations.id, conversationId));
}

export const helpAICoreEngine = {
  resolveHelpAILayer,
  classifyMessagePriority,
  selectHelpAICognitiveLayer,
  detectSessionLanguage,
  updateConversationLanguage,
  detectFaithSensitivity,
  updateFaithSensitivityState,
  getNextHelpAIStatus,
  getNextTrinityStatus,
  triggerEmergencyProtocol,
  recordSlaFirstResponse,
  recordSlaResolution,
  collectSatisfactionFeedback,
  createHelpAIConversation,
  recordHelpAIMessage,
  flagFaqGap,
  updateConversationStatus,
  setHumanHandoff,
};
