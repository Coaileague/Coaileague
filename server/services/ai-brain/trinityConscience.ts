/**
 * TRINITY CONSCIENCE MODULE
 * ==========================
 * Pre-execution conscience gate that evaluates every Trinity action against
 * 8 operational principles before the governance layer runs.
 *
 * Principle 1 — WORKSPACE_ISOLATION:   Actions must never access data outside their workspace.
 * Principle 2 — ROLE_AUTHORITY:         Financial/admin mutations require sufficient role.
 * Principle 3 — IRREVERSIBLE_CAUTION:  Bulk-delete/void/terminate operations require explicit intent.
 * Principle 4 — DATA_PRIVACY:           Mass PII export restricted to authorized roles.
 * Principle 5 — FINANCIAL_THRESHOLD:   Large financial operations flagged for confirmation.
 * Principle 6 — BOT_SCOPE:             Bot actors restricted to their designated categories.
 * Principle 7 — ACTIVE_WORKSPACE:      Mutating actions require an active (non-suspended) workspace.
 * Principle 8 — PUBLIC_SAFETY_BOUNDARY: Trinity/HelpAI never call 911, dispatch
 *                                       responders, or guarantee safety. A
 *                                       human supervisor is always required.
 *                                       (See publicSafetyGuard.ts for the
 *                                       language-layer enforcement.)
 */

import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { workspaces } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityConscience');

// ============================================================================
// TYPES
// ============================================================================

export type ConscienceVerdict = 'pass' | 'block' | 'flag';

export interface ConscienceResult {
  verdict: ConscienceVerdict;
  principle?: string;
  reason?: string;
  confirmationRequired?: boolean;
  confirmationPrompt?: string;
}

export interface ConscienceContext {
  actionId: string;
  workspaceId?: string;
  userId?: string;
  userRole?: string;
  payload?: Record<string, unknown>;
  callerType?: 'user' | 'bot' | 'automation';
  botName?: string;
}

const PASS: ConscienceResult = { verdict: 'pass' };

function block(principle: string, reason: string): ConscienceResult {
  return { verdict: 'block', principle, reason };
}

function flag(principle: string, reason: string, confirmationPrompt: string): ConscienceResult {
  return { verdict: 'flag', principle, reason, confirmationRequired: true, confirmationPrompt };
}

// ============================================================================
// PRINCIPLE 2 — ROLE AUTHORITY
// Financial and admin-level mutations require elevated roles.
// ============================================================================

const FINANCIAL_MUTATION_ACTIONS = new Set([
  'payroll.run_payroll',
  'payroll.execute_with_tracing',
  'payroll.execute_bulk',
  'billing.invoice_send',
  'billing.settings',
  'billing.set_workspace_settings',
  'billing.generate_invoice',
  'billing.create_invoice',
  'billing.run_weekly_invoice',
  'billing.run_weekly',
  'billing.run_weekly_billing',
  'billing.invoice_bulk_send',
  'billing.delete_invoice',
  'billing.void_invoice',
  'qb.sync_payroll',
  'qb.create_invoice',
]);

const ADMIN_MUTATION_ACTIONS = new Set([
  'uacp.assign_platform_role',
  'permissions.toggle_feature',
  'permissions.change_user_role',
  'permissions.reset_feature',
  'workspace.deactivate',
  'workspace.suspend',
  'session.revoke',
]);

const SUFFICIENT_FINANCIAL_ROLES = new Set([
  'org_owner', 'co_owner', 'root_admin',
  'owner',      // legacy alias
]);

const SUFFICIENT_ADMIN_ROLES = new Set([
  'org_owner', 'co_owner', 'root_admin', 'admin',
  'owner',
]);

// ============================================================================
// PRINCIPLE 3 — IRREVERSIBLE CAUTION
// ============================================================================

const IRREVERSIBLE_ACTIONS = new Set([
  'employees.terminate',
  'employees.bulk_terminate',
  'document.void',
  'billing.void_invoice',
  'billing.delete_invoice',
  'payroll.reverse_payroll',
  'workspace.purge_data',
]);

// ============================================================================
// PRINCIPLE 4 — DATA PRIVACY
// ============================================================================

const MASS_PII_ACTIONS = new Set([
  'employees.export_all',
  'employees.bulk_export',
  'document.export',
  'hr.export_sensitive_data',
]);

const SUFFICIENT_PRIVACY_ROLES = new Set([
  'org_owner', 'co_owner', 'root_admin', 'owner',
]);

// ============================================================================
// PRINCIPLE 5 — FINANCIAL THRESHOLD
// Payloads with dollar amounts above threshold are flagged.
// ============================================================================

const FINANCIAL_AMOUNT_THRESHOLD = 10_000; // $10,000

// ============================================================================
// PRINCIPLE 8 — PUBLIC SAFETY BOUNDARY
// Trinity / HelpAI never call 911, dispatch emergency responders, or
// guarantee anyone's safety. A licensed human supervisor is always required.
// This block enumerates action IDs that, by their semantics, would imply
// Trinity is acting as an emergency-services dispatcher. Any such action is
// REFUSED outright at the conscience layer — no flag, no confirmation, no
// queue. The matching language-layer enforcement lives in publicSafetyGuard.ts.
// Change only with written legal approval.
// ============================================================================

const PUBLIC_SAFETY_BLOCKED_ACTIONS = new Set([
  'safety.call_911',
  'safety.dispatch_911',
  'emergency.call_911',
  'emergency.dispatch',
  'emergency.dispatch_responders',
  'emergency.contact_police',
  'emergency.contact_fire',
  'emergency.contact_ems',
  'dispatch.911',
  'dispatch.police',
  'dispatch.fire',
  'dispatch.ems',
  'panic.call_911',
  'panic.dispatch',
  'safety.guarantee',
]);

// Action-ID prefix patterns that should also be refused. Catches any
// downstream action that uses one of these verbs even if not explicitly
// listed above (defense in depth — additions to the action surface should
// not silently bypass this principle).
const PUBLIC_SAFETY_BLOCKED_PATTERNS: RegExp[] = [
  /^(?:safety|emergency|dispatch|panic)\.(?:call_?911|dispatch_?911|contact_?911)/i,
  /\.guarantee_safety$/i,
];

function isPublicSafetyBoundaryViolation(actionId: string): boolean {
  if (PUBLIC_SAFETY_BLOCKED_ACTIONS.has(actionId)) return true;
  return PUBLIC_SAFETY_BLOCKED_PATTERNS.some((re) => re.test(actionId));
}

const PUBLIC_SAFETY_REFUSAL_REASON =
  'Trinity does not call 911, dispatch emergency responders, or guarantee ' +
  'anyone\'s safety — a human supervisor is always required. If anyone is ' +
  'in immediate danger, call 9-1-1 directly.';

// ============================================================================
// PRINCIPLE 6 — BOT SCOPE
// Bots are only authorized for their designated action categories.
// ============================================================================

const BOT_ALLOWED_CATEGORIES: Record<string, Set<string>> = {
  ClockBot:   new Set(['time_tracking', 'scheduling', 'employee_status', 'notify']),
  MeetingBot: new Set(['meetings', 'scheduling', 'notify', 'documents', 'reporting']),
  ReportBot:  new Set(['reporting', 'analytics', 'documents', 'notify']),
  HelpAI:     new Set(['support', 'employees', 'scheduling', 'notify', 'hr', 'documents', 'compliance', 'billing', 'payroll', 'analytics', 'time_tracking', 'invoicing']),
  CleanupBot: new Set(['diagnostics', 'security', 'maintenance', 'notify']),
};

// Action prefix → category mapping for bot scope check
function getActionCategory(actionId: string): string {
  const prefix = actionId.split('.')[0];
  const mapping: Record<string, string> = {
    payroll:       'payroll',
    billing:       'billing',
    invoicing:     'billing',
    scheduling:    'scheduling',
    shifts:        'scheduling',
    shift:         'scheduling',
    time_tracking: 'time_tracking',
    time:          'time_tracking',
    employees:     'employees',
    employee:      'employees',
    notify:        'notify',
    notifications: 'notify',
    reports:       'reporting',
    report:        'reporting',
    document:      'documents',
    documents:     'documents',
    hr:            'hr',
    compliance:    'compliance',
    security:      'security',
    session:       'security',
    analytics:     'analytics',
    diagnostics:   'diagnostics',
    meetings:      'meetings',
    support:       'support',
    uacp:          'admin',
    permissions:   'admin',
    qb:            'billing',
  };
  return mapping[prefix] || prefix;
}

// ============================================================================
// WORKSPACE STATUS CACHE (TTL 60s) — avoids hammering DB on every action
// ============================================================================

const _workspaceStatusCache = new Map<string, { status: string; fetchedAt: number }>();
const WS_CACHE_TTL_MS = 60_000;

async function getWorkspaceStatus(workspaceId: string): Promise<string> {
  const cached = _workspaceStatusCache.get(workspaceId);
  if (cached && Date.now() - cached.fetchedAt < WS_CACHE_TTL_MS) return cached.status;
  try {
    const [ws] = await db.select({ subscriptionStatus: workspaces.subscriptionStatus })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const status = ws?.subscriptionStatus ?? 'active';
    _workspaceStatusCache.set(workspaceId, { status, fetchedAt: Date.now() });
    return status;
  } catch {
    return 'active'; // fail-open for status
  }
}

// ============================================================================
// MAIN CONSCIENCE EVALUATOR
// ============================================================================

export async function evaluateConscience(ctx: ConscienceContext): Promise<ConscienceResult> {
  const { actionId, workspaceId, userRole, payload, callerType, botName } = ctx;

  // ── PRINCIPLE 8: PUBLIC SAFETY BOUNDARY ──────────────────────────────────
  // Hard refusal — runs FIRST. No role, no payload.confirmed flag, no caller
  // type can override. This is a categorical refusal, not a confirmation gate.
  if (isPublicSafetyBoundaryViolation(actionId)) {
    return block('PUBLIC_SAFETY_BOUNDARY', PUBLIC_SAFETY_REFUSAL_REASON);
  }

  // ── PRINCIPLE 1: WORKSPACE ISOLATION ──────────────────────────────────────
  // If the payload references a workspaceId that differs from the request workspace, block.
  if (workspaceId && payload?.workspaceId && payload.workspaceId !== workspaceId) {
    return block(
      'WORKSPACE_ISOLATION',
      `Action payload references workspace "${payload.workspaceId}" but the request workspace is "${workspaceId}". Cross-workspace access is forbidden.`
    );
  }
  if (workspaceId && payload?.targetWorkspaceId && payload.targetWorkspaceId !== workspaceId) {
    return block(
      'WORKSPACE_ISOLATION',
      `Cross-workspace target detected in payload. Trinity actions are scoped to a single workspace.`
    );
  }

  // ── PRINCIPLE 2: ROLE AUTHORITY ────────────────────────────────────────────
  // Financial mutations require owner/root_admin/co_owner.
  if (FINANCIAL_MUTATION_ACTIONS.has(actionId) && userRole && callerType === 'user') {
    if (!SUFFICIENT_FINANCIAL_ROLES.has(userRole)) {
      return block(
        'ROLE_AUTHORITY',
        `Action "${actionId}" requires owner, co_owner, or root_admin role. Current role: ${userRole}.`
      );
    }
  }
  // Admin mutations require admin+ roles.
  if (ADMIN_MUTATION_ACTIONS.has(actionId) && userRole && callerType === 'user') {
    if (!SUFFICIENT_ADMIN_ROLES.has(userRole)) {
      return block(
        'ROLE_AUTHORITY',
        `Action "${actionId}" requires administrator privileges. Current role: ${userRole}.`
      );
    }
  }

  // ── PRINCIPLE 3: IRREVERSIBLE CAUTION ─────────────────────────────────────
  if (IRREVERSIBLE_ACTIONS.has(actionId)) {
    const intentConfirmed = payload?.confirmed === true || payload?.intentConfirmed === true;
    if (!intentConfirmed) {
      return flag(
        'IRREVERSIBLE_CAUTION',
        `Action "${actionId}" is irreversible or destructive.`,
        `This action (${actionId}) cannot be undone. Please confirm your intent by passing payload.confirmed=true.`
      );
    }
  }

  // ── PRINCIPLE 4: DATA PRIVACY ─────────────────────────────────────────────
  if (MASS_PII_ACTIONS.has(actionId) && userRole) {
    if (!SUFFICIENT_PRIVACY_ROLES.has(userRole)) {
      return block(
        'DATA_PRIVACY',
        `Mass PII export action "${actionId}" requires owner or root_admin authorization.`
      );
    }
  }

  // ── PRINCIPLE 5: FINANCIAL THRESHOLD ──────────────────────────────────────
  if (payload) {
    const amount = payload.amount ?? payload.totalAmount ?? payload.grossAmount ?? payload.netAmount;
    if (typeof amount === 'number' && amount > FINANCIAL_AMOUNT_THRESHOLD) {
      const intentConfirmed = payload?.confirmed === true || payload?.intentConfirmed === true;
      if (!intentConfirmed) {
        return flag(
          'FINANCIAL_THRESHOLD',
          `Financial operation involves $${amount.toLocaleString()} which exceeds the $${FINANCIAL_AMOUNT_THRESHOLD.toLocaleString()} conscience threshold.`,
          `This operation involves $${amount.toLocaleString()}. To proceed, pass payload.confirmed=true.`
        );
      }
    }
  }

  // ── PRINCIPLE 6: BOT SCOPE ────────────────────────────────────────────────
  if (callerType === 'bot' && botName && BOT_ALLOWED_CATEGORIES[botName]) {
    const actionCategory = getActionCategory(actionId);
    const allowed = BOT_ALLOWED_CATEGORIES[botName];
    if (!allowed.has(actionCategory)) {
      return block(
        'BOT_SCOPE',
        `Bot "${botName}" is not authorized to execute category "${actionCategory}" actions. Allowed: ${[...allowed].join(', ')}.`
      );
    }
  }

  // ── PRINCIPLE 7: ACTIVE WORKSPACE ─────────────────────────────────────────
  // Read-only and query actions are allowed on suspended workspaces.
  // Mutating actions are blocked.
  const isQueryAction = actionId.includes('.query') || actionId.includes('.get_') ||
                        actionId.includes('.list') || actionId.includes('.check') ||
                        actionId.endsWith('.health') || actionId.endsWith('.status');
  if (workspaceId && !isQueryAction) {
    const wsStatus = await getWorkspaceStatus(workspaceId);
    if (wsStatus === 'suspended' || wsStatus === 'cancelled') {
      return block(
        'ACTIVE_WORKSPACE',
        `Workspace is ${wsStatus}. Mutating actions are blocked. Read-only queries are still permitted.`
      );
    }
  }

  return PASS;
}

// ============================================================================
// AUDIT LOG HELPER
// ============================================================================

export function logConscienceDecision(
  ctx: ConscienceContext,
  result: ConscienceResult
): void {
  if (result.verdict === 'pass') return;
  const emoji = result.verdict === 'block' ? 'BLOCK' : 'FLAG';
  log.warn(
    `[TrinityConscience] ${emoji} | action=${ctx.actionId} | principle=${result.principle} | reason=${result.reason} | role=${ctx.userRole || 'unknown'} | caller=${ctx.callerType || 'unknown'}`
  );
}
