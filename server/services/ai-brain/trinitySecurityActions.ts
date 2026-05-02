/**
 * Trinity Security Actions — Phase 18D
 * =====================================
 * Trinity-callable actions for the security-admin surface:
 *   security.grant_phone_override   — break-glass phone override
 *   security.list_overrides         — list active overrides
 *   security.revoke_override        — revoke an override
 *   security.add_auditor_allowlist  — add a workspace allow-list entry
 *   security.lookup_caller_id       — Twilio Lookup risk score for a phone
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionHandler, ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinitySecurityActions');

const ok = (id: string, m: string, d: Record<string, unknown>, s: number): ActionResult =>
  ({ success: true, actionId: id, message: m, data: d, executionTimeMs: Date.now() - s });
const fail = (id: string, m: string, s: number): ActionResult =>
  ({ success: false, actionId: id, message: m, executionTimeMs: Date.now() - s });

const grantOverride: ActionHandler = {
  actionId: 'security.grant_phone_override',
  name: 'Grant Break-Glass Phone Override',
  category: 'security',
  description: 'Supervisor PIN-gated time-boxed override that lets an officer use SMS/voice from a non-listed phone (e.g., broken/replaced device). Default 24h, max 7 days.',
  requiredRoles: ['supervisor', 'manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    const { employeeId, fromPhone, supervisorEmployeeNumber, supervisorPin, hours, reason } = request.payload || {};
    const workspaceId = request.workspaceId;
    if (!workspaceId || !employeeId || !fromPhone || !supervisorEmployeeNumber || !supervisorPin) {
      return fail(request.actionId, 'Required: employeeId, fromPhone, supervisorEmployeeNumber, supervisorPin', start);
    }
    const { grantOverride } = await import('../trinityVoice/verificationOverrideService');
    const r = await grantOverride({ workspaceId, employeeId, fromPhone, supervisorEmployeeNumber, supervisorPin, hours, reason });
    return r.success ? ok(request.actionId, 'Override granted', r, start) : fail(request.actionId, r.reason || 'Failed', start);
  },
};

const listOverrides: ActionHandler = {
  actionId: 'security.list_overrides',
  name: 'List Active Phone Overrides',
  category: 'security',
  description: 'List all active break-glass phone overrides for the workspace.',
  requiredRoles: ['manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    if (!request.workspaceId) return fail(request.actionId, 'workspaceId required', start);
    const { listActiveOverrides } = await import('../trinityVoice/verificationOverrideService');
    const list = await listActiveOverrides(request.workspaceId);
    return ok(request.actionId, `${list.length} active override(s)`, list, start);
  },
};

const revokeOverride: ActionHandler = {
  actionId: 'security.revoke_override',
  name: 'Revoke a Phone Override',
  category: 'security',
  description: 'Immediately revoke a previously granted phone override.',
  requiredRoles: ['manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    const { id } = request.payload || {};
    if (!id) return fail(request.actionId, 'id required', start);
    const { revokeOverride } = await import('../trinityVoice/verificationOverrideService');
    const r = await revokeOverride(id, request.userId);
    return r.success ? ok(request.actionId, 'Revoked', { id }, start) : fail(request.actionId, 'Revoke failed', start);
  },
};

const addAuditorAllowlist: ActionHandler = {
  actionId: 'security.add_auditor_allowlist',
  name: 'Add Auditor to Workspace Allow-List',
  category: 'security',
  description: 'Whitelist a named regulatory contact email for this workspace so they can intake audits without matching the global regulatory-domain heuristic.',
  requiredRoles: ['org_owner', 'platform_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    const { email, fullName, agencyName, notes } = request.payload || {};
    if (!request.workspaceId || !email) return fail(request.actionId, 'workspaceId + email required', start);
    const { addAuditorAllowlist } = await import('../auditor/auditorAccessService');
    const r = await addAuditorAllowlist({ workspaceId: request.workspaceId, email, fullName, agencyName, notes, addedBy: request.userId });
    return r.success ? ok(request.actionId, 'Added', { email }, start) : fail(request.actionId, 'Add failed', start);
  },
};

const lookupCallerIdAction: ActionHandler = {
  actionId: 'security.lookup_caller_id',
  name: 'Caller-ID Risk Lookup',
  category: 'security',
  description: 'Run a Twilio Lookup v2 on a phone number and return the line-type risk classification. Cached for 7 days.',
  requiredRoles: ['supervisor', 'manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    const { phone } = request.payload || {};
    if (!phone) return fail(request.actionId, 'phone required', start);
    const { lookupCallerId } = await import('../trinityVoice/callerIdLookup');
    const r = await lookupCallerId(phone);
    return ok(request.actionId, `Risk=${r.risk}`, r, start);
  },
};

export function registerTrinitySecurityActions(): void {
  helpaiOrchestrator.registerAction(grantOverride);
  helpaiOrchestrator.registerAction(listOverrides);
  helpaiOrchestrator.registerAction(revokeOverride);
  helpaiOrchestrator.registerAction(addAuditorAllowlist);
  helpaiOrchestrator.registerAction(lookupCallerIdAction);
  log.info('[TrinitySecurityActions] Registered 5 actions');
}
