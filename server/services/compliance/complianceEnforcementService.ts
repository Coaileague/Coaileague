/**
 * Compliance Enforcement Service
 * ================================
 * Core brain for the 14-day compliance window system.
 *
 * Rules enforced:
 * - Day 0: Window opens on org/officer account creation
 * - Day 11: Warning notification sent
 * - Day 13: Final warning notification sent
 * - Day 14: Account automatically frozen (cannot be overridden by owner/manager/automation)
 * - One-time appeal: Org owner / officer can appeal to extend to end of current month
 * - After appeal exhausted: Must go through HelpDesk with a support ticket
 * - Freeze lifted only by support staff with an open ticket reference
 */

import { db } from '../../db';
import {
  complianceWindows,
  accountFreezes,
  freezeAppeals,
  type ComplianceWindow,
  type AccountFreeze,
  type FreezeAppeal,
  type InsertComplianceWindow,
  type InsertAccountFreeze,
  type InsertFreezeAppeal,
} from '@shared/schema';
import { eq, and, lt, lte, isNull, isNotNull, or } from 'drizzle-orm';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { platformEventBus } from '../platformEventBus';
import { STATE_COMPLIANCE_CONFIGS, UNIVERSAL_FEDERAL_REQUIREMENTS } from './stateComplianceConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('complianceEnforcementService');


// Required document types per entity type
export const ORG_REQUIRED_DOCS = ['coi', 'state_license', 'guard_card'] as const;
export const OFFICER_REQUIRED_DOCS = ['guard_card', 'i9', 'w4'] as const;

export type EnforcementDocType = 'coi' | 'state_license' | 'guard_card' | 'armed_guard_card' | 'i9' | 'w4' | 'w9' | 'training_cert' | 'background_check' | 'other';

export interface ComplianceStatus {
  windowId: string;
  entityType: 'organization' | 'officer';
  entityId: string;
  daysRemaining: number;
  daysElapsed: number;
  windowDeadline: Date;
  isCompliant: boolean;
  isFrozen: boolean;
  frozenAt?: Date;
  appealUsed: boolean;
  appealDeadline?: Date;
  extensionDeadline?: Date;
  missingDocTypes: string[];
  approvedDocTypes: string[];
  phase: 'active' | 'warning_11' | 'warning_13' | 'frozen' | 'appeal_extension' | 'compliant';
  canAppeal: boolean;
  canSubmitHelpdesk: boolean;
}

export interface FreezeResult {
  success: boolean;
  freezeId?: string;
  message: string;
  alreadyFrozen?: boolean;
}

export interface AppealResult {
  success: boolean;
  appealId?: string;
  extensionDeadline?: Date;
  message: string;
  alreadyUsed?: boolean;
  outsideWindow?: boolean;
}

export interface LiftFreezeResult {
  success: boolean;
  message: string;
  requiresTicket?: boolean;
}

class ComplianceEnforcementService {

  // ── Window Initialization ──────────────────────────────────────────────

  async initializeWindow(params: {
    entityType: 'organization' | 'officer';
    entityId: string;
    workspaceId?: string;
    isContractor?: boolean;
  }): Promise<ComplianceWindow> {
    const { entityType, entityId, workspaceId, isContractor } = params;

    // Determine required docs based on entity type
    let requiredDocTypes: string[];
    if (entityType === 'organization') {
      requiredDocTypes = [...ORG_REQUIRED_DOCS];
    } else {
      requiredDocTypes = isContractor
        ? ['guard_card', 'i9', 'w9']
        : [...OFFICER_REQUIRED_DOCS];
    }

    const windowStartedAt = new Date();
    const windowDeadline = new Date(windowStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [window] = await db.insert(complianceWindows).values({
      entityType,
      entityId,
      workspaceId: workspaceId ?? null,
      windowStartedAt,
      windowDeadline,
      requiredDocTypes,
      submittedDocTypes: [],
      approvedDocTypes: [],
    } as any).returning();

    log.info(`[ComplianceEnforcement] Initialized ${entityType} window for ${entityId}, deadline: ${windowDeadline.toISOString()}`);
    return window;
  }

  // ── Status Check ───────────────────────────────────────────────────────

  async getComplianceStatus(entityType: 'organization' | 'officer', entityId: string): Promise<ComplianceStatus | null> {
    const [window] = await db.select()
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, entityType as any),
        eq(complianceWindows.entityId, entityId),
      ))
      .limit(1);

    if (!window) return null;

    const now = new Date();
    const deadline = window.appealUsed && window.extensionDeadline
      ? window.extensionDeadline
      : window.windowDeadline;

    const msRemaining = deadline.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
    const msElapsed = now.getTime() - window.windowStartedAt.getTime();
    const daysElapsed = Math.floor(msElapsed / (24 * 60 * 60 * 1000));

    const requiredDocs = (window.requiredDocTypes as string[]) || [];
    const approvedDocs = (window.approvedDocTypes as string[]) || [];
    const missingDocTypes = requiredDocs.filter(d => !approvedDocs.includes(d));

    let phase: ComplianceStatus['phase'] = 'active';
    if (window.isCompliant) {
      phase = 'compliant';
    } else if (window.isFrozen && window.appealUsed) {
      phase = 'appeal_extension';
    } else if (window.isFrozen) {
      phase = 'frozen';
    } else if (daysElapsed >= 13) {
      phase = 'warning_13';
    } else if (daysElapsed >= 11) {
      phase = 'warning_11';
    }

    // Can appeal: frozen, appeal not yet used, within current month
    const canAppeal = window.isFrozen && !window.appealUsed;

    // Can submit helpdesk: frozen and either appeal used or no appeal remaining
    const canSubmitHelpdesk = window.isFrozen && (window.appealUsed || !canAppeal);

    return {
      windowId: window.id,
      entityType,
      entityId,
      daysRemaining,
      daysElapsed,
      windowDeadline: window.appealUsed && window.extensionDeadline
        ? window.extensionDeadline
        : window.windowDeadline,
      isCompliant: window.isCompliant ?? false,
      isFrozen: window.isFrozen ?? false,
      frozenAt: window.frozenAt ?? undefined,
      appealUsed: window.appealUsed ?? false,
      appealDeadline: window.appealDeadline ?? undefined,
      extensionDeadline: window.extensionDeadline ?? undefined,
      missingDocTypes,
      approvedDocTypes: approvedDocs,
      phase,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      canAppeal,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      canSubmitHelpdesk,
    };
  }

  // ── Document Approval Recording ────────────────────────────────────────

  async recordDocumentApproved(entityType: 'organization' | 'officer', entityId: string, docType: string): Promise<{ isNowCompliant: boolean }> {
    const [window] = await db.select()
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, entityType as any),
        eq(complianceWindows.entityId, entityId),
      ))
      .limit(1);

    if (!window) return { isNowCompliant: false };

    const approved = [...((window.approvedDocTypes as string[]) || [])];
    const submitted = [...((window.submittedDocTypes as string[]) || [])];

    if (!approved.includes(docType)) approved.push(docType);
    if (!submitted.includes(docType)) submitted.push(docType);

    // Track per-doc approval date for expiry checking
    const approvalDates: Record<string, string> = { ...((window as any).docApprovalDates as Record<string, string> || {}) };
    approvalDates[docType] = new Date().toISOString();

    const required = (window.requiredDocTypes as string[]) || [];
    const isNowCompliant = required.every(d => approved.includes(d));

    await db.update(complianceWindows)
      .set({
        approvedDocTypes: approved,
        submittedDocTypes: submitted,
        isCompliant: isNowCompliant,
        isFrozen: isNowCompliant ? false : window.isFrozen, // auto-unfreeze if now compliant
        docApprovalDates: approvalDates,
        updatedAt: new Date(),
      } as any)
      .where(eq(complianceWindows.id, window.id));

    if (isNowCompliant) {
      log.info(`[ComplianceEnforcement] ${entityType} ${entityId} is now COMPLIANT — auto-unfreezing`);
      // Mark active freeze as lifted
      await db.update(accountFreezes)
        .set({
          status: 'lifted',
          liftedAt: new Date(),
          liftReason: 'All required documents approved — compliance achieved',
        } as any)
        .where(and(
          eq(accountFreezes.entityType, entityType as any),
          eq(accountFreezes.entityId, entityId),
          eq(accountFreezes.status, 'active'),
        ));
    }

    return { isNowCompliant };
  }

  // ── Auto-Freeze (called by cron at day 14) ────────────────────────────

  async autoFreezeAccount(entityType: 'organization' | 'officer', entityId: string, windowId: string): Promise<FreezeResult> {
    const [window] = await db.select()
      .from(complianceWindows)
      .where(eq(complianceWindows.id, windowId))
      .limit(1);

    if (!window) return { success: false, message: 'Compliance window not found' };
    if (window.isCompliant) return { success: false, message: 'Account is compliant — no freeze needed' };
    if (window.isFrozen) return { success: false, alreadyFrozen: true, message: 'Account is already frozen' };

    const required = (window.requiredDocTypes as string[]) || [];
    const approved = (window.approvedDocTypes as string[]) || [];
    const missingDocTypes = required.filter(d => !approved.includes(d));

    // Create freeze record
    const [freeze] = await db.insert(accountFreezes).values({
      entityType,
      entityId,
      workspaceId: window.workspaceId,
      complianceWindowId: windowId,
      phase: 'auto_14day',
      status: 'active',
      reason: `14-day compliance window expired. Missing documents: ${missingDocTypes.join(', ')}`,
      missingDocTypes,
      frozenAt: new Date(),
      frozenBySystem: true,
    } as any).returning();

    // Update window
    await db.update(complianceWindows)
      .set({
        isFrozen: true,
        frozenAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(complianceWindows.id, windowId));

    log.info(`[ComplianceEnforcement] AUTO-FROZEN ${entityType} ${entityId} — missing: ${missingDocTypes.join(', ')}`);
    return { success: true, freezeId: freeze.id, message: `Account frozen. Missing: ${missingDocTypes.join(', ')}` };
  }

  // ── Appeal Submission ─────────────────────────────────────────────────

  async submitAppeal(params: {
    entityType: 'organization' | 'officer';
    entityId: string;
    submittedBy: string;
    appealReason: string;
    workspaceId?: string;
  }): Promise<AppealResult> {
    const { entityType, entityId, submittedBy, appealReason, workspaceId } = params;

    const [window] = await db.select()
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, entityType as any),
        eq(complianceWindows.entityId, entityId),
      ))
      .limit(1);

    if (!window) return { success: false, message: 'No compliance window found for this entity' };

    // Cannot appeal if appeal already used (ever — not just this freeze)
    if (window.appealUsed) {
      return {
        success: false,
        alreadyUsed: true,
        message: 'Appeal has already been used for this account. Please open a HelpDesk ticket for manual review.',
      };
    }

    if (!window.isFrozen) {
      return { success: false, message: 'Account is not frozen — appeal not needed' };
    }

    // Extension deadline = end of current month
    const now = new Date();
    const extensionDeadline = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // last ms of current month

    // Get active freeze record
    const [activeFreeze] = await db.select()
      .from(accountFreezes)
      .where(and(
        eq(accountFreezes.entityType, entityType as any),
        eq(accountFreezes.entityId, entityId),
        eq(accountFreezes.status, 'active'),
      ))
      .limit(1);

    // Create appeal record
    const [appeal] = await db.insert(freezeAppeals).values({
      entityType,
      entityId,
      workspaceId: workspaceId ?? window.workspaceId,
      freezeId: activeFreeze?.id ?? null,
      complianceWindowId: window.id,
      submittedBy,
      appealReason,
      status: 'approved', // Auto-approved on submission (one-time grace)
      extensionDeadline,
      decidedAt: new Date(),
      decisionNotes: 'Automatically approved — one-time end-of-month extension granted',
    } as any).returning();

    // Update compliance window: mark appeal used, grant extension, unfreeze
    await db.update(complianceWindows)
      .set({
        appealUsed: true,
        appealSubmittedAt: now,
        appealGrantedAt: now,
        extensionDeadline,
        isFrozen: false, // Unfreezes account until extension deadline
        updatedAt: new Date(),
      } as any)
      .where(eq(complianceWindows.id, window.id));

    // Update freeze to pending_appeal status
    if (activeFreeze) {
      await db.update(accountFreezes)
        .set({ status: 'pending_appeal' } as any)
        .where(eq(accountFreezes.id, activeFreeze.id));
    }

    log.info(`[ComplianceEnforcement] Appeal GRANTED for ${entityType} ${entityId} — extension to ${extensionDeadline.toISOString()}`);

    return {
      success: true,
      appealId: appeal.id,
      extensionDeadline,
      message: `Appeal approved. Your account is active until ${extensionDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Submit your documents before then.`,
    };
  }

  // ── Support Staff Lift Freeze ─────────────────────────────────────────

  async liftFreeze(params: {
    entityType: 'organization' | 'officer';
    entityId: string;
    liftedBy: string;
    liftReason: string;
    relatedTicketId: string; // Required — must have an open HelpDesk ticket
  }): Promise<LiftFreezeResult> {
    const { entityType, entityId, liftedBy, liftReason, relatedTicketId } = params;

    if (!relatedTicketId) {
      return {
        success: false,
        requiresTicket: true,
        message: 'A HelpDesk ticket reference is required to lift a compliance freeze',
      };
    }

    // Update active freeze record
    const [updated] = await db.update(accountFreezes)
      .set({
        status: 'lifted',
        liftedAt: new Date(),
        liftedBy,
        liftReason,
        relatedTicketId,
      } as any)
      .where(and(
        eq(accountFreezes.entityType, entityType as any),
        eq(accountFreezes.entityId, entityId),
        eq(accountFreezes.status, 'active'),
      ))
      .returning();

    if (!updated) {
      return { success: false, message: 'No active freeze found for this entity' };
    }

    // Unfreeze the compliance window
    await db.update(complianceWindows)
      .set({ isFrozen: false, updatedAt: new Date() } as any)
      .where(and(
        eq(complianceWindows.entityType, entityType as any),
        eq(complianceWindows.entityId, entityId),
      ));

    log.info(`[ComplianceEnforcement] FREEZE LIFTED for ${entityType} ${entityId} by support staff ${liftedBy} (ticket: ${relatedTicketId})`);
    return { success: true, message: 'Compliance freeze lifted successfully' };
  }

  // ── Freeze Check (enforcement middleware) ─────────────────────────────

  async isEntityFrozen(entityType: 'organization' | 'officer', entityId: string): Promise<boolean> {
    const [window] = await db.select({ isFrozen: complianceWindows.isFrozen })
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, entityType as any),
        eq(complianceWindows.entityId, entityId),
      ))
      .limit(1);

    return window?.isFrozen ?? false;
  }

  // ── Cron Job Runners ──────────────────────────────────────────────────

  async runDailyComplianceCheck(): Promise<{ warned11: number; warned13: number; frozen: number; extensionExpired: number }> {
    const now = new Date();
    let warned11 = 0, warned13 = 0, frozen = 0, extensionExpired = 0;

    // Get all non-compliant, non-frozen windows
    const activeWindows = await db.select()
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.isCompliant, false),
        eq(complianceWindows.isFrozen, false),
      ));

    for (const win of activeWindows) {
      const msElapsed = now.getTime() - win.windowStartedAt.getTime();
      const daysElapsed = Math.floor(msElapsed / (24 * 60 * 60 * 1000));
      const deadline = win.appealUsed && win.extensionDeadline ? win.extensionDeadline : win.windowDeadline;

      // Check if extension deadline has passed
      if (win.appealUsed && win.extensionDeadline && now > win.extensionDeadline) {
        await this.autoFreezeAccount(win.entityType as any, win.entityId, win.id);
        extensionExpired++;
        continue;
      }

      // Check if 14-day deadline has passed
      if (now > win.windowDeadline && !win.appealUsed) {
        await this.autoFreezeAccount(win.entityType as any, win.entityId, win.id);
        frozen++;
        continue;
      }

      // Day 13 warning — FINAL WARNING: account freezes in 1 day
      if (daysElapsed >= 13 && !win.warning13DaySentAt) {
        await db.update(complianceWindows)
          .set({ warning13DaySentAt: now, updatedAt: now } as any)
          .where(eq(complianceWindows.id, win.id));
        warned13++;
        log.info(`[ComplianceEnforcement] Day-13 warning for ${win.entityType} ${win.entityId}`);
        try {
          await universalNotificationEngine.sendNotification({
            type: 'compliance_warning',
            title: 'FINAL WARNING: Compliance Deadline Tomorrow',
            message: `${win.entityType === 'officer' ? 'Officer' : 'Organization'} (${win.entityId}) has 1 day remaining to submit required compliance documents before account freeze. This is the final warning.`,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId: win.workspaceId,
            severity: 'critical',
            source: 'compliance_enforcement',
            skipFeatureCheck: true,
            metadata: { windowId: win.id, entityType: win.entityType, entityId: win.entityId, daysElapsed, warningDay: 13 },
          });
        } catch (notifyErr) {
          log.error('[ComplianceEnforcement] Failed to send day-13 notification:', notifyErr);
        }
      }

      // Day 11 warning — 3 days remaining
      else if (daysElapsed >= 11 && !win.warning11DaySentAt) {
        await db.update(complianceWindows)
          .set({ warning11DaySentAt: now, updatedAt: now } as any)
          .where(eq(complianceWindows.id, win.id));
        warned11++;
        log.info(`[ComplianceEnforcement] Day-11 warning for ${win.entityType} ${win.entityId}`);
        try {
          await universalNotificationEngine.sendNotification({
            type: 'compliance_warning',
            title: 'Compliance Warning: 3 Days Remaining',
            message: `${win.entityType === 'officer' ? 'Officer' : 'Organization'} (${win.entityId}) has 3 days to submit required compliance documents. Failure to comply will result in account freeze.`,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId: win.workspaceId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: 'high',
            source: 'compliance_enforcement',
            skipFeatureCheck: true,
            metadata: { windowId: win.id, entityType: win.entityType, entityId: win.entityId, daysElapsed, warningDay: 11 },
          });
        } catch (notifyErr) {
          log.error('[ComplianceEnforcement] Failed to send day-11 notification:', notifyErr);
        }
      }
    }

    // Also run document expiry checks
    const expiryResult = await this.checkDocumentExpiries();
    log.info(`[ComplianceEnforcement] Daily check complete — warned11:${warned11} warned13:${warned13} frozen:${frozen} extensionExpired:${extensionExpired} docsExpired:${expiryResult.expired}`);
    return { warned11, warned13, frozen, extensionExpired };
  }

  // ── Document Expiry Re-Trigger ─────────────────────────────────────────
  /**
   * Checks all compliant windows for documents that have exceeded their state-defined
   * expiry period. If a required doc has expired, removes it from approvedDocTypes and
   * marks the window non-compliant — triggering a fresh 14-day re-submission window.
   */
  async checkDocumentExpiries(): Promise<{ expired: number; windows: string[] }> {
    const now = new Date();
    let expired = 0;
    const affectedWindows: string[] = [];

    // All docs with approval date tracking
    const allWindows = await db.select().from(complianceWindows);

    // Build a flat map of all doc expiry periods from state configs + federal requirements
    const docExpiryMap: Record<string, number> = {};

    // Federal requirements
    for (const doc of UNIVERSAL_FEDERAL_REQUIREMENTS) {
      if (doc.expiryPeriodDays) {
        docExpiryMap[doc.id] = doc.expiryPeriodDays;
      }
    }

    // State-specific requirements (merge over federal)
    for (const stateConfig of Object.values(STATE_COMPLIANCE_CONFIGS)) {
      for (const doc of (stateConfig as any).requiredDocuments) {
        if (doc.expiryPeriodDays) {
          docExpiryMap[doc.id] = doc.expiryPeriodDays;
          // Also map to generic doc type if possible
          if (doc.id.includes('guard_card')) docExpiryMap['guard_card'] = doc.expiryPeriodDays;
          if (doc.id.includes('license')) docExpiryMap['state_license'] = Math.min(docExpiryMap['state_license'] || 99999, doc.expiryPeriodDays);
          if (doc.id.includes('coi')) docExpiryMap['coi'] = doc.expiryPeriodDays;
        }
      }
    }

    // Default expiry periods for standard doc types (in days)
    const DEFAULT_EXPIRY: Record<string, number> = {
      coi: 365,           // COI expires annually
      guard_card: 730,    // Guard card 2 years
      state_license: 730, // State license 2 years
      training_cert: 365, // Training cert annually
      background_check: 365, // Background check annually
      // i9, w4, w9 do not expire
    };

    for (const win of allWindows) {
      const approvedDocs = (win.approvedDocTypes as string[]) || [];
      const approvalDates = ((win as any).docApprovalDates as Record<string, string>) || {};

      if (approvedDocs.length === 0) continue;

      let removedAny = false;
      const updatedApproved = [...approvedDocs];

      for (const docType of approvedDocs) {
        const approvedAt = approvalDates[docType];
        if (!approvedAt) continue;

        const expiryDays = docExpiryMap[docType] ?? DEFAULT_EXPIRY[docType];
        if (!expiryDays) continue;

        const approvedDate = new Date(approvedAt);
        const expiresAt = new Date(approvedDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);

        if (now > expiresAt) {
          // Remove expired doc from approved list
          const idx = updatedApproved.indexOf(docType);
          if (idx !== -1) updatedApproved.splice(idx, 1);
          removedAny = true;
          log.info(`[ComplianceEnforcement] Doc EXPIRED: ${docType} for ${win.entityType} ${win.entityId} (approved ${approvedAt}, expired ${expiresAt.toISOString()})`);
        }
      }

      if (removedAny) {
        const required = (win.requiredDocTypes as string[]) || [];
        const isStillCompliant = required.every(d => updatedApproved.includes(d));

        await db.update(complianceWindows)
          .set({
            approvedDocTypes: updatedApproved,
            isCompliant: isStillCompliant,
            updatedAt: now,
          } as any)
          .where(eq(complianceWindows.id, win.id));

        expired++;
        affectedWindows.push(win.id);

        // ── Notify workspace manager + emit Trinity event ─────────────────
        const wsId = (win as any).workspaceId as string | undefined;
        if (wsId) {
          const expiredTypes = approvedDocs.filter(d => !updatedApproved.includes(d));
          universalNotificationEngine.sendNotification({
            workspaceId: wsId,
            recipientRole: 'manager',
            type: 'compliance_document_expired',
            priority: 'high',
            title: 'Compliance Document Expired',
            message: `Required document(s) expired for ${win.entityType} ${win.entityId}: ${expiredTypes.join(', ')}. Account is${isStillCompliant ? '' : ' no longer'} compliant. Immediate renewal required.`,
            metadata: { windowId: win.id, entityType: win.entityType, entityId: win.entityId, expiredDocTypes: expiredTypes },
          }).catch((e: unknown) => log.error('[ComplianceEnforcement] expiry notify failed:', e));

          platformEventBus.publish({
            type: 'compliance_document_expired',
            workspaceId: wsId,
            metadata: { windowId: win.id, entityType: win.entityType, entityId: win.entityId, expiredDocTypes: expiredTypes, isStillCompliant },
          });
        }
      }
    }

    return { expired, windows: affectedWindows };
  }

  // ── Trinity Document Analysis ─────────────────────────────────────────

  async analyzeCOI(documentText: string, workspaceId: string): Promise<{
    isValid: boolean;
    issuedDate?: Date;
    expiryDate?: Date;
    issuer?: string;
    coverageAmount?: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
    flags: string[];
  }> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await meteredGemini.generate({
        workspaceId,
        feature: 'ai_document_analysis',
        prompt: `Analyze this Certificate of Insurance document and extract key fields.

Document text:
${documentText.slice(0, 3000)}

Return a JSON object with:
- issuedDate: ISO date string (YYYY-MM-DD) or null
- expiryDate: ISO date string (YYYY-MM-DD) or null
- issuer: insurance company name or null
- coverageAmount: total coverage in dollars or null
- policyNumber: policy number or null
- isValid: boolean (true if dates are valid and not expired)
- issues: array of strings describing any problems found

Return ONLY valid JSON, no markdown.`,
        systemInstruction: 'You are a document analysis specialist. Extract insurance certificate data precisely. Return only JSON.',
        temperature: 0.1,
      });

      let parsed: any = {};
      try {
        parsed = JSON.parse(result.text || '{}');
      } catch {
        parsed = {};
      }

      const now = new Date();
      const expiryDate = parsed.expiryDate ? new Date(parsed.expiryDate) : undefined;
      const isExpired = expiryDate ? expiryDate < now : false;
      const isExpiringSoon = expiryDate ? (expiryDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000 : false;

      const flags: string[] = parsed.issues || [];
      if (isExpired) flags.push('COI_EXPIRED');
      if (isExpiringSoon && !isExpired) flags.push('COI_EXPIRING_SOON');

      return {
        isValid: !isExpired && (parsed.isValid !== false),
        issuedDate: parsed.issuedDate ? new Date(parsed.issuedDate) : undefined,
        expiryDate,
        issuer: parsed.issuer,
        coverageAmount: parsed.coverageAmount,
        isExpired,
        isExpiringSoon,
        flags,
      };
    } catch (err) {
      log.error('[ComplianceEnforcement] COI analysis failed:', err);
      return { isValid: false, isExpired: false, isExpiringSoon: false, flags: ['ANALYSIS_FAILED'] };
    }
  }

  async analyzeStateLicense(documentText: string, stateCode: string, workspaceId: string): Promise<{
    isValid: boolean;
    licenseNumber?: string;
    issuedDate?: Date;
    expiryDate?: Date;
    isExpired: boolean;
    isExpiringSoon: boolean;
    flags: string[];
  }> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await meteredGemini.generate({
        workspaceId,
        feature: 'ai_document_analysis',
        prompt: `Analyze this ${stateCode} state security license/certificate document.

Document text:
${documentText.slice(0, 3000)}

Return a JSON object with:
- licenseNumber: the license/certificate number or null
- issuedDate: ISO date string (YYYY-MM-DD) or null
- expiryDate: ISO date string (YYYY-MM-DD) or null
- issuingAuthority: the issuing state agency name or null
- isValid: boolean (true if dates are valid, license number present, not expired)
- issues: array of strings describing any problems

Return ONLY valid JSON, no markdown.`,
        systemInstruction: 'You analyze state security industry license documents. Return only JSON.',
        temperature: 0.1,
      });

      let parsed: any = {};
      try { parsed = JSON.parse(result.text || '{}'); } catch { parsed = {}; }

      const now = new Date();
      const expiryDate = parsed.expiryDate ? new Date(parsed.expiryDate) : undefined;
      const isExpired = expiryDate ? expiryDate < now : false;
      const isExpiringSoon = expiryDate ? (expiryDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000 : false;
      const flags: string[] = parsed.issues || [];
      if (isExpired) flags.push('LICENSE_EXPIRED');
      if (isExpiringSoon && !isExpired) flags.push('LICENSE_EXPIRING_SOON');

      return {
        isValid: !isExpired && !!parsed.licenseNumber && (parsed.isValid !== false),
        licenseNumber: parsed.licenseNumber,
        issuedDate: parsed.issuedDate ? new Date(parsed.issuedDate) : undefined,
        expiryDate,
        isExpired,
        isExpiringSoon,
        flags,
      };
    } catch (err) {
      log.error('[ComplianceEnforcement] State license analysis failed:', err);
      return { isValid: false, isExpired: false, isExpiringSoon: false, flags: ['ANALYSIS_FAILED'] };
    }
  }

  // ── End-of-Month Deadline Calculation ────────────────────────────────

  getEndOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  // ── Enforcement Middleware Check ───────────────────────────────────────

  /**
   * Used by scheduling/assignment API routes to block actions on frozen accounts.
   * Returns { allowed: boolean, reason?: string }
   */
  async checkAssignmentAllowed(params: {
    officerEntityId: string;
    orgWorkspaceId: string;
  }): Promise<{ allowed: boolean; reason?: string; officerFrozen?: boolean; orgFrozen?: boolean }> {
    const [officerFrozen, orgFrozen] = await Promise.all([
      this.isEntityFrozen('officer', params.officerEntityId),
      this.isEntityFrozen('organization', params.orgWorkspaceId),
    ]);

    if (orgFrozen) {
      return {
        allowed: false,
        orgFrozen: true,
        reason: 'Organization account is frozen due to incomplete compliance documentation. Please complete required documents or contact support.',
      };
    }

    if (officerFrozen) {
      return {
        allowed: false,
        officerFrozen: true,
        reason: 'Officer account is frozen due to incomplete compliance documentation. Please complete required documents or contact support.',
      };
    }

    return { allowed: true };
  }
}

export const complianceEnforcementService = new ComplianceEnforcementService();
