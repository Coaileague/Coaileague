import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';
const log = createLogger('dataAttribution');

export interface AttributionContext {
  workspaceId: string | null;
  actorId: string | null;
  actorType: 'user' | 'bot' | 'system' | 'cron' | 'trinity';
  actorBot?: string | null;
  actorRole?: string | null;
  actorIp?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      attribution?: AttributionContext;
    }
  }
}

const GLOBAL_TABLES = new Set([
  'workspaces', 'subscription_tiers', 'system_config', 'platform_roles',
  'ai_models', 'ai_skill_registry', 'ai_component_registry', 'ai_component_tags',
  'ai_capability_links', 'ai_fallback_chains', 'ai_global_patterns', 'ai_solution_library',
  'ai_subagent_definitions', 'ai_task_types', 'ai_model_health',
  'compliance_states', 'compliance_requirements', 'compliance_state_requirements',
  'compliance_document_types', 'credit_packs', 'exchange_rates', 'feature_updates',
  'industry_service_templates', 'integration_marketplace', 'labor_law_rules',
  'platform_change_events', 'platform_credit_pool', 'platform_scan_snapshots',
  'processed_stripe_events', 'subscription_line_items', 'addon_features',
  'holiday_mascot_decor', 'holiday_mascot_history', 'mascot_motion_profiles',
  'motd_messages', 'promotional_banners', 'users',
  'auth_sessions', 'auth_tokens', 'sessions',
  'error_events', 'error_occurrences', 'backup_records',
  'key_rotation_history', 'service_control_states',
  'durable_job_queue', 'workflow_artifacts', 'id_sequences',
]);

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function dataAttributionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const user = req.user;
  const workspaceId = req.workspaceId || req.body?.workspaceId || req.query?.workspaceId || null;

  if (user?.id) {
    const userId = user.id;
    req.attribution = {
      workspaceId,
      actorId: userId,
      actorType: 'user',
      actorBot: null,
      actorRole: req.workspaceRole || req.workspaceRole || user.role || null,
      actorIp: getClientIp(req),
    };
  } else {
    req.attribution = {
      workspaceId,
      actorId: null,
      actorType: 'system',
      actorBot: null,
      actorRole: null,
      actorIp: getClientIp(req),
    };
  }

  next();
}

export function enforceAttribution(
  tableName: string,
  data: Record<string, unknown>,
  context: AttributionContext
): Record<string, unknown> {
  const enriched = { ...data };

  if (!GLOBAL_TABLES.has(tableName)) {
    const wsId = enriched.workspace_id || enriched.workspaceId || context.workspaceId;
    if (!wsId) {
      log.warn(`[DataAttribution] Insert into ${tableName} without workspace_id — context actor: ${context.actorType}/${context.actorId}`);
    }
    if (wsId) {
      enriched.workspace_id = wsId;
      enriched.workspaceId = wsId;
    }
  }

  if (context.actorType === 'user' && context.actorId) {
    enriched.created_by = enriched.created_by || context.actorId;
    enriched.created_by_type = enriched.created_by_type || 'user';
  } else if (context.actorType === 'bot') {
    enriched.created_by = null;
    enriched.created_by_type = 'bot';
    enriched.created_by_bot = context.actorBot || null;
  } else if (context.actorType === 'trinity') {
    enriched.created_by = null;
    enriched.created_by_type = 'trinity';
  } else if (context.actorType === 'cron') {
    enriched.created_by = null;
    enriched.created_by_type = 'cron';
  } else if (context.actorType === 'system') {
    enriched.created_by = null;
    enriched.created_by_type = 'system';
  }

  enriched.created_at = enriched.created_at || new Date();
  enriched.updated_at = new Date();

  return enriched;
}

export function enforceUpdateAttribution(
  data: Record<string, unknown>,
  context: AttributionContext
): Record<string, unknown> {
  const enriched = { ...data };
  enriched.updated_at = new Date();

  if (context.actorType === 'user' && context.actorId) {
    enriched.updated_by = context.actorId;
    enriched.updated_by_type = 'user';
  } else if (context.actorType === 'bot') {
    enriched.updated_by = null;
    enriched.updated_by_type = 'bot';
  } else {
    enriched.updated_by_type = context.actorType;
  }

  return enriched;
}

export function createBotContext(
  botName: string,
  workspaceId: string
): AttributionContext {
  return {
    workspaceId,
    actorId: null,
    actorType: 'bot',
    actorBot: botName,
    actorRole: 'bot',
    actorIp: 'internal',
  };
}

export function createSystemContext(workspaceId: string): AttributionContext {
  return {
    workspaceId,
    actorId: null,
    actorType: 'system',
    actorBot: null,
    actorRole: 'system',
    actorIp: 'internal',
  };
}

export function createTrinityContext(workspaceId: string): AttributionContext {
  return {
    workspaceId,
    actorId: null,
    actorType: 'trinity',
    actorBot: null,
    actorRole: 'trinity',
    actorIp: 'internal',
  };
}

export { GLOBAL_TABLES };
