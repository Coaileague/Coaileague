import { createLogger } from '../lib/logger';
const log = createLogger('enumTypes');
export const ACTOR_TYPES = {
  END_USER: 'END_USER',
  SUPPORT_STAFF: 'SUPPORT_STAFF',
  AI_AGENT: 'AI_AGENT',
  SYSTEM: 'SYSTEM',
} as const;

export type ActorType = typeof ACTOR_TYPES[keyof typeof ACTOR_TYPES];

export function normalizeActorType(value: string): ActorType {
  const mapping: Record<string, ActorType> = {
    'system': ACTOR_TYPES.SYSTEM,
    'user': ACTOR_TYPES.END_USER,
    'end_user': ACTOR_TYPES.END_USER,
    'enduser': ACTOR_TYPES.END_USER,
    'admin': ACTOR_TYPES.SUPPORT_STAFF,
    'support': ACTOR_TYPES.SUPPORT_STAFF,
    'support_staff': ACTOR_TYPES.SUPPORT_STAFF,
    'staff': ACTOR_TYPES.SUPPORT_STAFF,
    'ai': ACTOR_TYPES.AI_AGENT,
    'ai_agent': ACTOR_TYPES.AI_AGENT,
    'bot': ACTOR_TYPES.AI_AGENT,
    'webhook': ACTOR_TYPES.SYSTEM,
    'automation': ACTOR_TYPES.SYSTEM,
    'cron': ACTOR_TYPES.SYSTEM,
    'END_USER': ACTOR_TYPES.END_USER,
    'SUPPORT_STAFF': ACTOR_TYPES.SUPPORT_STAFF,
    'AI_AGENT': ACTOR_TYPES.AI_AGENT,
    'SYSTEM': ACTOR_TYPES.SYSTEM,
  };

  const normalized = mapping[value] || mapping[value.toLowerCase()];

  if (!normalized) {
    log.warn(`[EnumTypes] Unknown actor type: ${value}, defaulting to SYSTEM`);
    return ACTOR_TYPES.SYSTEM;
  }

  return normalized;
}

export function isValidActorType(value: string): value is ActorType {
  return Object.values(ACTOR_TYPES).includes(value as ActorType);
}

export const ENTITY_TYPES = {
  HUMAN: 'human',
  BOT: 'bot',
  SUBAGENT: 'subagent',
  AUTOMATION: 'automation',
  EXTERNAL_INTEGRATION: 'external_integration',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

export function normalizeEntityType(value: string): EntityType {
  const mapping: Record<string, EntityType> = {
    'human': ENTITY_TYPES.HUMAN,
    'user': ENTITY_TYPES.HUMAN,
    'person': ENTITY_TYPES.HUMAN,
    'bot': ENTITY_TYPES.BOT,
    'ai': ENTITY_TYPES.BOT,
    'subagent': ENTITY_TYPES.SUBAGENT,
    'sub_agent': ENTITY_TYPES.SUBAGENT,
    'automation': ENTITY_TYPES.AUTOMATION,
    'auto': ENTITY_TYPES.AUTOMATION,
    'cron': ENTITY_TYPES.AUTOMATION,
    'external_integration': ENTITY_TYPES.EXTERNAL_INTEGRATION,
    'external': ENTITY_TYPES.EXTERNAL_INTEGRATION,
    'integration': ENTITY_TYPES.EXTERNAL_INTEGRATION,
    'webhook': ENTITY_TYPES.EXTERNAL_INTEGRATION,
  };

  return mapping[value.toLowerCase()] || ENTITY_TYPES.HUMAN;
}

export const AI_BRAIN_ACTOR_TYPES = {
  TRINITY: 'trinity',
  END_USER: 'end_user',
  SUPPORT: 'support',
  AUTOMATION: 'automation',
  SYSTEM: 'system',
} as const;

export type AiBrainActorType = typeof AI_BRAIN_ACTOR_TYPES[keyof typeof AI_BRAIN_ACTOR_TYPES];

export function normalizeAiBrainActorType(value: string): AiBrainActorType {
  const mapping: Record<string, AiBrainActorType> = {
    'trinity': AI_BRAIN_ACTOR_TYPES.TRINITY,
    'end_user': AI_BRAIN_ACTOR_TYPES.END_USER,
    'user': AI_BRAIN_ACTOR_TYPES.END_USER,
    'support': AI_BRAIN_ACTOR_TYPES.SUPPORT,
    'admin': AI_BRAIN_ACTOR_TYPES.SUPPORT,
    'staff': AI_BRAIN_ACTOR_TYPES.SUPPORT,
    'automation': AI_BRAIN_ACTOR_TYPES.AUTOMATION,
    'bot': AI_BRAIN_ACTOR_TYPES.AUTOMATION,
    'system': AI_BRAIN_ACTOR_TYPES.SYSTEM,
    'webhook': AI_BRAIN_ACTOR_TYPES.SYSTEM,
    'cron': AI_BRAIN_ACTOR_TYPES.SYSTEM,
  };

  return mapping[value.toLowerCase()] || AI_BRAIN_ACTOR_TYPES.SYSTEM;
}

export function isValidAiBrainActorType(value: string): value is AiBrainActorType {
  return Object.values(AI_BRAIN_ACTOR_TYPES).includes(value as AiBrainActorType);
}

export const EVENT_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
} as const;

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS];

export function normalizeEventStatus(value: string): EventStatus {
  const mapping: Record<string, EventStatus> = {
    'pending': EVENT_STATUS.PENDING,
    'in_progress': EVENT_STATUS.IN_PROGRESS,
    'processing': EVENT_STATUS.IN_PROGRESS,
    'completed': EVENT_STATUS.COMPLETED,
    'committed': EVENT_STATUS.COMPLETED,
    'done': EVENT_STATUS.COMPLETED,
    'success': EVENT_STATUS.COMPLETED,
    'failed': EVENT_STATUS.FAILED,
    'error': EVENT_STATUS.FAILED,
    'rolled_back': EVENT_STATUS.ROLLED_BACK,
    'rollback': EVENT_STATUS.ROLLED_BACK,
    'reverted': EVENT_STATUS.ROLLED_BACK,
  };

  return mapping[value.toLowerCase()] || EVENT_STATUS.PENDING;
}
