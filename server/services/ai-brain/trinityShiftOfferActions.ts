/**
 * Trinity Shift Offer & Outbound Actions — Phase 18B
 * ===================================================
 * Registers Trinity-callable actions for:
 *   - voice.send_shift_offers: Trinity texts available officers about an open shift.
 *   - voice.outbound_welfare_check: Trinity calls an officer for a pre-shift welfare check.
 *   - voice.outbound_call: Trinity makes a generic outbound call with a custom message.
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionHandler, ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityShiftOfferActions');

function ok(actionId: string, message: string, data: any, start: number): ActionResult {
  return { success: true, actionId, message, data, executionTimeMs: Date.now() - start };
}
function fail(actionId: string, message: string, start: number): ActionResult {
  return { success: false, actionId, message, executionTimeMs: Date.now() - start };
}

const sendShiftOffersAction: ActionHandler = {
  actionId: 'voice.send_shift_offers',
  name: 'Send Shift Offers via SMS',
  category: 'communication',
  description:
    'Trinity texts available qualified officers about an open shift. ' +
    'Officers reply YES/NO. First YES gets assigned, supervisor notified, others marked superseded.',
  requiredRoles: ['supervisor', 'manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { shiftId, location, date, startTime, endTime, hourlyRate, requiredLicense, maxOfficers } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId) return fail(request.actionId, 'workspaceId required', start);
      if (!shiftId || !location || !date || !startTime || !endTime) {
        return fail(request.actionId, 'Required fields: shiftId, location, date, startTime, endTime', start);
      }

      const { sendShiftOffers } = await import('../trinityVoice/trinityShiftOfferService');
      const result = await sendShiftOffers({
        shiftId, workspaceId, location, date, startTime, endTime, hourlyRate, requiredLicense, maxOfficers,
      });
      return ok(request.actionId, `Shift offers sent to ${result.offered} officers`, result, start);
    } catch (err: any) {
      return fail(request.actionId, `Failed to send shift offers: ${err.message}`, start);
    }
  },
};

const outboundWelfareCheckAction: ActionHandler = {
  actionId: 'voice.outbound_welfare_check',
  name: 'Trinity Outbound Welfare Check Call',
  category: 'communication',
  description:
    'Trinity calls an officer with a pre-shift welfare check. The officer can press 1 to confirm or 2 to request assistance.',
  requiredRoles: ['supervisor', 'manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { employeeId, baseUrl, shiftStartLabel, language } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId || !employeeId || !baseUrl) {
        return fail(request.actionId, 'Required fields: employeeId, baseUrl (workspaceId from context)', start);
      }
      const { callOfficerWelfareCheck } = await import('../trinityVoice/trinityOutboundService');
      const result = await callOfficerWelfareCheck({
        employeeId, workspaceId, baseUrl, shiftStartLabel, language,
      });
      if (!result.success) return fail(request.actionId, result.error || 'Call failed', start);
      return ok(request.actionId, 'Welfare check call placed', result, start);
    } catch (err: any) {
      return fail(request.actionId, `Failed to place welfare check: ${err.message}`, start);
    }
  },
};

const outboundCallAction: ActionHandler = {
  actionId: 'voice.outbound_call',
  name: 'Trinity Outbound Call',
  category: 'communication',
  description: 'Trinity makes a generic outbound call to a phone number with a custom spoken message.',
  requiredRoles: ['manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { toPhone, message, baseUrl, fromPhone, language } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId || !toPhone || !message || !baseUrl) {
        return fail(request.actionId, 'Required fields: toPhone, message, baseUrl', start);
      }
      const { makeOutboundCall } = await import('../trinityVoice/trinityOutboundService');
      const result = await makeOutboundCall({
        toPhone, message, baseUrl, fromPhone, workspaceId, language,
      });
      if (!result.success) return fail(request.actionId, result.error || 'Call failed', start);
      return ok(request.actionId, 'Outbound call placed', result, start);
    } catch (err: any) {
      return fail(request.actionId, `Failed to place outbound call: ${err.message}`, start);
    }
  },
};

export function registerShiftOfferAndOutboundActions(): void {
  helpaiOrchestrator.registerAction(sendShiftOffersAction);
  helpaiOrchestrator.registerAction(outboundWelfareCheckAction);
  helpaiOrchestrator.registerAction(outboundCallAction);
  log.info('[TrinityShiftOfferActions] Registered 3 actions: send_shift_offers, outbound_welfare_check, outbound_call');
}
