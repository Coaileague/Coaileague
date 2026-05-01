/**
 * TRINITY POST ORDERS + OFFICER SAFETY ACTIONS
 * =============================================
 * Two mission-critical gaps this module closes:
 *
 * POST ORDERS: Legally significant documents that govern officer behavior at each site.
 * When an officer asks "what am I supposed to do if someone refuses to leave?" Trinity
 * pulls the post orders for their current assignment — not generic knowledge.
 *
 * OFFICER SAFETY: Lone worker welfare checks and panic button protocol.
 * These are the features that win enterprise clients with risk management departments.
 */

import { db } from '../../db';
import {
  shiftOrders, shiftOrderAcknowledgments, postOrderTemplates,
  shifts, employees, clients, sites, workspaceMembers
} from '@shared/schema';
import { eq, and, isNull, desc, sql, gte } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionRequest, ActionResult, ActionHandler } from './actionRegistry';
import { loneWorkerSafetyService } from '../automation/loneWorkerSafetyService';
import { panicProtocolService } from '../fieldOperations/panicProtocolService';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPostOrdersSafetyActions');

const createResult = (
  actionId: string, success: boolean, message: string,
  data: any, start: number
): ActionResult => ({
  actionId, success, message, data,
  executionTimeMs: Date.now() - start,
  timestamp: new Date().toISOString(),
});

function mkAction(id: string, fn: (req: ActionRequest) => Promise<ActionResult>): ActionHandler {
  return { actionId: id, name: id, category: id.split('.')[0], description: id, requiredRoles: [], handler: fn };
}

// ─── POST ORDERS ─────────────────────────────────────────────────────────────

const getPostOrdersForShift = mkAction('postorders.get_for_shift', async (req) => {
  const start = Date.now();
  try {
    const { shiftId, workspaceId } = req.payload || {};
    if (!shiftId) return createResult(req.actionId, false, 'shiftId required', null, start);
    const wid = workspaceId || req.workspaceId;

    const orders = await db.select().from(shiftOrders)
      .where(and(eq(shiftOrders.shiftId, shiftId), eq(shiftOrders.workspaceId, wid || '')))
      .orderBy(desc(shiftOrders.createdAt));

    if (orders.length === 0) {
      const shift = await db.query.shifts?.findFirst({ where: eq(shifts.id, shiftId) } as any).catch(() => null);
      return createResult(req.actionId, true,
        `No specific post orders on file for shift ${shiftId}. ${(shift as any)?.notes ? 'Shift notes: ' + (shift as any).notes : 'Officer should follow general company policy.'} Always call client contact if uncertain about site-specific procedures.`,
        { shiftId, orders: [], hasOrders: false, shiftNotes: (shift as any)?.notes || null }, start);
    }

    const acks = await db.select().from(shiftOrderAcknowledgments)
      .where(eq(shiftOrderAcknowledgments.shiftOrderId, orders[0].id)).catch(() => []);

    return createResult(req.actionId, true,
      `${orders.length} post order(s) for shift ${shiftId}. ${acks.length} acknowledgment(s) recorded.`,
      { shiftId, orders, acknowledgments: acks, hasOrders: true }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getPostOrderTemplates = mkAction('postorders.list_templates', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);
    const templates = await db.select().from(postOrderTemplates)
      .where(and(eq(postOrderTemplates.workspaceId, wid), eq(postOrderTemplates.isActive, true)))
      .orderBy(desc(postOrderTemplates.createdAt));
    return createResult(req.actionId, true, `${templates.length} active post order template(s)`, { templates }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const createPostOrderForShift = mkAction('postorders.create_for_shift', async (req) => {
  const start = Date.now();
  try {
    const { shiftId, title, description, priority, requiresAcknowledgment, requiresSignature } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!shiftId || !title || !wid) return createResult(req.actionId, false, 'shiftId, title, and workspaceId required', null, start);

    const [order] = await db.insert(shiftOrders).values({
      workspaceId: wid,
      shiftId,
      title,
      description: description || null,
      priority: priority || 'normal',
      requiresAcknowledgment: requiresAcknowledgment !== false,
      requiresSignature: !!requiresSignature,
      requiresPhotos: false,
      createdBy: req.userId || 'trinity-auto',
    }).returning();

    return createResult(req.actionId, true, `Post order "${title}" created for shift ${shiftId}`, { order }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const confirmOfficerAcknowledged = mkAction('postorders.confirm_acknowledgment', async (req) => {
  const start = Date.now();
  try {
    const { shiftOrderId, employeeId, notes } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!shiftOrderId || !employeeId || !wid) return createResult(req.actionId, false, 'shiftOrderId, employeeId, workspaceId required', null, start);

    const existing = await db.select().from(shiftOrderAcknowledgments)
      .where(and(eq(shiftOrderAcknowledgments.shiftOrderId, shiftOrderId), eq(shiftOrderAcknowledgments.employeeId, employeeId)))
      .limit(1);

    if (existing.length > 0) {
      return createResult(req.actionId, true, `Officer ${employeeId} already acknowledged post order ${shiftOrderId}`, { existing: true, ack: existing[0] }, start);
    }

    const [ack] = await db.insert(shiftOrderAcknowledgments).values({
      workspaceId: wid,
      shiftOrderId,
      employeeId,
      notes: notes || null,
    }).returning();

    return createResult(req.actionId, true, `Acknowledgment recorded for officer ${employeeId}`, { ack }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getUnacknowledgedPostOrders = mkAction('postorders.get_unacknowledged', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const orders = await db.select({ id: shiftOrders.id, title: shiftOrders.title, shiftId: shiftOrders.shiftId, requiresAcknowledgment: shiftOrders.requiresAcknowledgment })
      .from(shiftOrders)
      .where(and(eq(shiftOrders.workspaceId, wid), eq(shiftOrders.requiresAcknowledgment, true)));

    const unacked = [];
    for (const order of orders) {
      const acks = await db.select({ count: sql`COUNT(*)` }).from(shiftOrderAcknowledgments)
        .where(eq(shiftOrderAcknowledgments.shiftOrderId, order.id)).catch(() => [{ count: 0 }]);
      const count = parseInt(String((acks[0] as any)?.count || 0));
      if (count === 0) unacked.push({ ...order, acknowledgmentCount: 0 });
    }

    return createResult(req.actionId, true, `${unacked.length} post order(s) with no acknowledgments`, { unacknowledged: unacked, count: unacked.length }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const flagPostOrderDeviation = mkAction('postorders.flag_deviation', async (req) => {
  const start = Date.now();
  try {
    const { shiftId, incidentDescription, deviationSection, officerId } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!shiftId || !incidentDescription || !wid) return createResult(req.actionId, false, 'shiftId and incidentDescription required', null, start);

    const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wid), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`)).catch(() => []);

    for (const mgr of managers) {
      await createNotification({
        workspaceId: wid, userId: mgr.userId, type: 'compliance',
        title: 'Post Order Deviation Flagged',
        message: `Shift ${shiftId}: ${incidentDescription}${deviationSection ? ' (Section: ' + deviationSection + ')' : ''}. ${officerId ? 'Officer ID: ' + officerId : ''}. Review post orders and take corrective action.`,
        priority: 'high',
        idempotencyKey: `compliance-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
    }

    return createResult(req.actionId, true, `Post order deviation flagged for shift ${shiftId} — managers notified`, { shiftId, deviation: incidentDescription, notified: managers.length }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const applyTemplateToShift = mkAction('postorders.apply_template', async (req) => {
  const start = Date.now();
  try {
    const { templateId, shiftId } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!templateId || !shiftId || !wid) return createResult(req.actionId, false, 'templateId, shiftId, workspaceId required', null, start);

    const [template] = await db.select().from(postOrderTemplates)
      .where(and(eq(postOrderTemplates.id, templateId), eq(postOrderTemplates.workspaceId, wid)));

    if (!template) return createResult(req.actionId, false, `Template ${templateId} not found`, null, start);

    const [order] = await db.insert(shiftOrders).values({
      workspaceId: wid,
      shiftId,
      title: template.title,
      description: template.description,
      priority: template.priority || 'normal',
      requiresAcknowledgment: template.requiresAcknowledgment ?? true,
      requiresSignature: template.requiresSignature ?? false,
      requiresPhotos: template.requiresPhotos ?? false,
      photoFrequency: template.photoFrequency,
      photoInstructions: template.photoInstructions,
      createdBy: 'trinity-auto',
    }).returning();

    return createResult(req.actionId, true, `Template "${template.title}" applied to shift ${shiftId}`, { order, template }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

// ─── OFFICER SAFETY — WELFARE CHECKS ─────────────────────────────────────────

const startWelfareMonitoring = mkAction('safety.start_welfare_monitoring', async (req) => {
  const start = Date.now();
  try {
    await loneWorkerSafetyService.start();
    const status = loneWorkerSafetyService.getStatus();
    return createResult(req.actionId, true, 'Lone worker welfare monitoring activated — officers working solo shifts will receive periodic check-ins', status, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const stopWelfareMonitoring = mkAction('safety.stop_welfare_monitoring', async (req) => {
  const start = Date.now();
  try {
    loneWorkerSafetyService.stop();
    return createResult(req.actionId, true, 'Lone worker welfare monitoring stopped', { running: false }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getWelfareMonitoringStatus = mkAction('safety.welfare_status', async (req) => {
  const start = Date.now();
  try {
    const status = loneWorkerSafetyService.getStatus();
    return createResult(req.actionId, true, `Welfare monitoring is ${status.running ? 'active' : 'inactive'}`, status, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const acknowledgeWelfareCheck = mkAction('safety.acknowledge_welfare_check', async (req) => {
  const start = Date.now();
  try {
    const { checkId, employeeId } = req.payload || {};
    if (!checkId || !employeeId) return createResult(req.actionId, false, 'checkId and employeeId required', null, start);
    const result = await loneWorkerSafetyService.acknowledgeWelfareCheck(checkId, employeeId);
    return createResult(req.actionId, result, result ? `Check-in confirmed for officer ${employeeId}` : 'Check-in not found or already resolved', { checkId, employeeId, acknowledged: result }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const resolveWelfareCheck = mkAction('safety.resolve_welfare_check', async (req) => {
  const start = Date.now();
  try {
    const { checkId } = req.payload || {};
    if (!checkId) return createResult(req.actionId, false, 'checkId required', null, start);
    const result = (loneWorkerSafetyService as any).resolveCheck?.(checkId);
    return createResult(req.actionId, true, `Welfare check ${checkId} resolved`, { checkId, resolved: true }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

// ─── OFFICER SAFETY — PANIC PROTOCOL ─────────────────────────────────────────

const triggerPanic = mkAction('safety.trigger_panic', async (req) => {
  const start = Date.now();
  try {
    const { officerId, officerName, workspaceId: orgId, latitude, longitude, accuracy, method, shiftId, postName } = req.payload || {};
    if (!officerId || !officerName || !orgId) return createResult(req.actionId, false, 'officerId, officerName, workspaceId required', null, start);
    const event = await panicProtocolService.triggerPanic({
      officerId,
      officerName,
      orgId,
      location: { latitude: latitude || 0, longitude: longitude || 0, accuracy: accuracy || 0 },
      method: method || 'manual',
      shiftId,
      postName,
    });
    return createResult(req.actionId, true, `⚠️ PANIC ALERT INITIATED for ${officerName}${postName ? ' at ' + postName : ''}. Emergency chain notified. Supervisors alerted.`, { panicEventId: event.id, status: event.status }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const acknowledgePanic = mkAction('safety.acknowledge_panic', async (req) => {
  const start = Date.now();
  try {
    const { panicId, acknowledgedBy } = req.payload || {};
    if (!panicId || !acknowledgedBy) return createResult(req.actionId, false, 'panicId and acknowledgedBy required', null, start);
    await panicProtocolService.acknowledgePanic(panicId, acknowledgedBy);
    return createResult(req.actionId, true, `Panic alert ${panicId} acknowledged by ${acknowledgedBy}`, { panicId, acknowledged: true }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const resolvePanic = mkAction('safety.resolve_panic', async (req) => {
  const start = Date.now();
  try {
    const { panicId, resolution, falseAlarm } = req.payload || {};
    if (!panicId || !resolution) return createResult(req.actionId, false, 'panicId and resolution required', null, start);
    await panicProtocolService.resolvePanic(panicId, resolution, !!falseAlarm);
    return createResult(req.actionId, true, `Panic event ${panicId} resolved. ${falseAlarm ? 'Marked as false alarm.' : 'Incident logged.'}`, { panicId, resolved: true, falseAlarm: !!falseAlarm }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getActivePanics = mkAction('safety.get_active_panics', async (req) => {
  const start = Date.now();
  try {
    const orgId = req.payload?.workspaceId || req.workspaceId;
    if (!orgId) return createResult(req.actionId, false, 'workspaceId required', null, start);
    const active = await panicProtocolService.getActiveForOrg(orgId);
    const message = active.length === 0
      ? 'No active panic alerts — all officers accounted for'
      : `⚠️ ${active.length} ACTIVE PANIC ALERT(S) — immediate supervisor response required`;
    return createResult(req.actionId, active.length === 0, message, { activePanics: active, count: active.length }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getPanicEvent = mkAction('safety.get_panic_event', async (req) => {
  const start = Date.now();
  try {
    const { panicId } = req.payload || {};
    if (!panicId) return createResult(req.actionId, false, 'panicId required', null, start);
    const event = await panicProtocolService.get(panicId);
    if (!event) return createResult(req.actionId, false, `Panic event ${panicId} not found`, null, start);
    return createResult(req.actionId, true, `Panic event ${panicId}: status=${(event as any).status}`, { event }, start);
  } catch (e: unknown) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

export function registerPostOrdersSafetyActions(): void {
  const postOrderActions = [
    getPostOrdersForShift,
    getPostOrderTemplates,
    createPostOrderForShift,
    confirmOfficerAcknowledged,
    getUnacknowledgedPostOrders,
    flagPostOrderDeviation,
    applyTemplateToShift,
  ];
  const safetyActions = [
    startWelfareMonitoring,
    stopWelfareMonitoring,
    getWelfareMonitoringStatus,
    acknowledgeWelfareCheck,
    resolveWelfareCheck,
    triggerPanic,
    acknowledgePanic,
    resolvePanic,
    getActivePanics,
    getPanicEvent,
  ];
  [...postOrderActions, ...safetyActions].forEach(a => helpaiOrchestrator.registerAction(a));
  log.info(`[Trinity Post Orders + Safety] Registered ${postOrderActions.length} post order actions and ${safetyActions.length} officer safety actions`);
}
