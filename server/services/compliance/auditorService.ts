/**
 * Auditor Service
 * ===============
 * Handles all regulatory auditor portal operations:
 * - State-scoped org search and compliance dashboard
 * - Audit session creation, action logging, PDF summary
 * - Document requests with status tracking
 * - Findings (violations, fines, conditions)
 * - Scheduled follow-up calls
 */

import { db } from '../../db';
import {
  auditorAccounts,
  auditSessions,
  auditorDocumentRequests,
  auditFindings,
  auditorFollowups,
  workspaces,
  complianceWindows,
  accountFreezes,
  type AuditorAccount,
  type AuditSession,
  type AuditorDocumentRequest,
  type AuditFinding,
  type AuditorFollowup,
  type InsertAuditSession,
  type InsertAuditFinding,
  type InsertAuditorFollowup,
} from '@shared/schema';
import { eq, and, desc, ilike } from 'drizzle-orm';

export interface AuditorOrgSummary {
  workspaceId: string;
  orgName: string;
  stateCode: string;
  licenseNumber?: string;
  complianceStatus: 'compliant' | 'pending' | 'frozen' | 'expired';
  missingDocs: string[];
  lastAuditDate?: Date;
  isFrozen: boolean;
}

export interface AuditSessionAction {
  action: string;
  timestamp: string;
  details?: Record<string, any>;
}

class AuditorService {

  // ── Org Search (state-scoped) ─────────────────────────────────────────

  async searchOrgsForAuditor(auditorId: string, searchQuery?: string): Promise<AuditorOrgSummary[]> {
    const [auditor] = await db.select()
      .from(auditorAccounts)
      .where(and(eq(auditorAccounts.id, auditorId), eq(auditorAccounts.isActive, true)))
      .limit(1);

    if (!auditor) throw new Error('Auditor not found or inactive');

    // Get all workspaces matching auditor's state scope
    // We join with compliance_windows to get compliance status
    const rows = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      licenseNumber: workspaces.licenseNumber,
      isFrozen: complianceWindows.isFrozen,
      isCompliant: complianceWindows.isCompliant,
      missingDocs: complianceWindows.requiredDocTypes,
      approvedDocs: complianceWindows.approvedDocTypes,
      frozenAt: complianceWindows.frozenAt,
    }).from(workspaces)
      .leftJoin(complianceWindows, and(
        eq(complianceWindows.workspaceId, workspaces.id),
        eq(complianceWindows.entityType, 'organization'),
      ))
      .limit(100);

    // Filter rows to only include workspaces scoped to the auditor's state.
    // Convention: security guard license numbers begin with the ISO state code,
    // e.g. "CA-XXXX" or "CA12345". Workspaces without a licenseNumber are excluded
    // from the auditor view (they cannot be verified).
    const statePrefix = auditor.stateCode.toUpperCase();
    const scopedRows = rows.filter(row => {
      if (!row.licenseNumber) return false;
      const licUpper = row.licenseNumber.toUpperCase();
      return licUpper.startsWith(statePrefix + '-') || licUpper.startsWith(statePrefix);
    });

    const results: AuditorOrgSummary[] = scopedRows.map(row => {
      const required = (row.missingDocs as string[]) || [];
      const approved = (row.approvedDocs as string[]) || [];
      const missing = required.filter(d => !approved.includes(d));

      let status: AuditorOrgSummary['complianceStatus'] = 'pending';
      if (row.isCompliant) status = 'compliant';
      else if (row.isFrozen) status = 'frozen';

      return {
        workspaceId: row.id,
        orgName: row.name ?? 'Unknown',
        stateCode: auditor.stateCode,
        licenseNumber: row.licenseNumber ?? undefined,
        complianceStatus: status,
        missingDocs: missing,
        isFrozen: row.isFrozen ?? false,
      };
    });

    if (searchQuery) {
      return results.filter(r =>
        r.orgName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.licenseNumber?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return results;
  }

  // ── Audit Session Management ──────────────────────────────────────────

  async startAuditSession(params: {
    auditorId: string;
    workspaceId: string;
    sessionLabel?: string;
  }): Promise<AuditSession> {
    const [auditor] = await db.select({ stateCode: auditorAccounts.stateCode })
      .from(auditorAccounts)
      .where(eq(auditorAccounts.id, params.auditorId))
      .limit(1);

    if (!auditor) throw new Error('Auditor not found');

    const [session] = await db.insert(auditSessions).values({
      auditorId: params.auditorId,
      workspaceId: params.workspaceId,
      sessionLabel: params.sessionLabel ?? `Audit Session — ${new Date().toLocaleDateString()}`,
      stateCode: auditor.stateCode,
      actionsLog: [],
      overallOutcome: 'in_progress',
    } as any).returning();

    await this.logSessionAction(session.id, {
      action: 'session_started',
      details: { auditorId: params.auditorId, workspaceId: params.workspaceId },
    });

    return session;
  }

  async logSessionAction(sessionId: string, action: Omit<AuditSessionAction, 'timestamp'>): Promise<void> {
    const [session] = await db.select({ actionsLog: auditSessions.actionsLog })
      .from(auditSessions)
      .where(eq(auditSessions.id, sessionId))
      .limit(1);

    if (!session) return;

    const log = (session.actionsLog as AuditSessionAction[]) || [];
    log.push({ ...action, timestamp: new Date().toISOString() });

    await db.update(auditSessions)
      .set({ actionsLog: log, updatedAt: new Date() } as any)
      .where(eq(auditSessions.id, sessionId));
  }

  async completeAuditSession(sessionId: string, params: {
    overallOutcome: 'passed' | 'passed_with_conditions' | 'failed';
    summaryNotes: string;
    totalFineAmount?: number;
  }): Promise<AuditSession> {
    const [session] = await db.update(auditSessions)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        overallOutcome: params.overallOutcome,
        summaryNotes: params.summaryNotes,
        totalFineAmount: params.totalFineAmount ?? 0,
        updatedAt: new Date(),
      } as any)
      .where(eq(auditSessions.id, sessionId))
      .returning();

    await this.logSessionAction(sessionId, {
      action: 'session_completed',
      details: { outcome: params.overallOutcome, fines: params.totalFineAmount },
    });

    return session;
  }

  async getAuditSession(sessionId: string): Promise<AuditSession | null> {
    const [session] = await db.select()
      .from(auditSessions)
      .where(eq(auditSessions.id, sessionId))
      .limit(1);
    return session ?? null;
  }

  async getAuditorSessions(auditorId: string, limit = 50): Promise<AuditSession[]> {
    return db.select()
      .from(auditSessions)
      .where(eq(auditSessions.auditorId, auditorId))
      .orderBy(desc(auditSessions.startedAt))
      .limit(limit);
  }

  async getWorkspaceSessions(workspaceId: string, limit = 50): Promise<AuditSession[]> {
    return db.select()
      .from(auditSessions)
      .where(eq(auditSessions.workspaceId, workspaceId))
      .orderBy(desc(auditSessions.startedAt))
      .limit(limit);
  }

  // ── Document Requests ─────────────────────────────────────────────────

  async createDocumentRequest(params: {
    auditSessionId: string;
    auditorId: string;
    workspaceId: string;
    requestedDocType: string;
    requestNotes?: string;
    daysToSubmit?: number;
  }): Promise<AuditorDocumentRequest> {
    const dueDate = params.daysToSubmit
      ? new Date(Date.now() + params.daysToSubmit * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // default 14 days

    const [request] = await db.insert(auditorDocumentRequests).values({
      auditSessionId: params.auditSessionId,
      auditorId: params.auditorId,
      workspaceId: params.workspaceId,
      requestedDocType: params.requestedDocType as any,
      requestNotes: params.requestNotes,
      dueDate,
      status: 'requested',
    } as any).returning();

    // Increment requests counter on session
    await db.update(auditSessions)
      .set({ requestsMade: db.select().from(auditSessions).where(eq(auditSessions.id, params.auditSessionId)) } as any)
      .where(eq(auditSessions.id, params.auditSessionId));

    await this.logSessionAction(params.auditSessionId, {
      action: 'document_requested',
      details: { docType: params.requestedDocType, dueDate: dueDate.toISOString() },
    });

    return request;
  }

  async resolveDocumentRequest(requestId: string, params: {
    status: 'passed' | 'passed_with_conditions' | 'failed';
    outcomeNotes?: string;
    conditions?: string;
  }): Promise<AuditorDocumentRequest> {
    const [updated] = await db.update(auditorDocumentRequests)
      .set({
        status: params.status as any,
        reviewedAt: new Date(),
        outcomeNotes: params.outcomeNotes,
        conditions: params.conditions,
      } as any)
      .where(eq(auditorDocumentRequests.id, requestId))
      .returning();
    return updated;
  }

  async getSessionDocumentRequests(auditSessionId: string): Promise<AuditorDocumentRequest[]> {
    return db.select()
      .from(auditorDocumentRequests)
      .where(eq(auditorDocumentRequests.auditSessionId, auditSessionId))
      .orderBy(desc(auditorDocumentRequests.requestedAt));
  }

  // ── Findings ──────────────────────────────────────────────────────────

  async addFinding(params: InsertAuditFinding): Promise<AuditFinding> {
    const [finding] = await db.insert(auditFindings).values(params as any).returning();

    if (params.auditSessionId) {
      await this.logSessionAction(params.auditSessionId, {
        action: 'finding_added',
        details: { type: params.findingType, title: params.title, fineAmount: params.fineAmount },
      });

      // Update session total fine amount
      if ((params.fineAmount ?? 0) > 0) {
        const [session] = await db.select({ totalFineAmount: auditSessions.totalFineAmount })
          .from(auditSessions)
          .where(eq(auditSessions.id, params.auditSessionId))
          .limit(1);

        await db.update(auditSessions)
          .set({ totalFineAmount: (session?.totalFineAmount ?? 0) + (params.fineAmount ?? 0) } as any)
          .where(eq(auditSessions.id, params.auditSessionId));
      }
    }

    return finding;
  }

  async getSessionFindings(auditSessionId: string): Promise<AuditFinding[]> {
    return db.select()
      .from(auditFindings)
      .where(eq(auditFindings.auditSessionId, auditSessionId))
      .orderBy(desc(auditFindings.createdAt));
  }

  // ── Follow-up Scheduling ──────────────────────────────────────────────

  async scheduleFollowup(params: InsertAuditorFollowup): Promise<AuditorFollowup> {
    const [followup] = await db.insert(auditorFollowups).values(params as any).returning();

    if (params.auditSessionId) {
      await this.logSessionAction(params.auditSessionId, {
        action: 'followup_scheduled',
        details: {
          type: params.followupType,
          scheduledFor: params.scheduledFor,
          contact: params.contactName,
        },
      });
    }

    return followup;
  }

  async completeFollowup(followupId: string, outcome: string): Promise<AuditorFollowup> {
    const [updated] = await db.update(auditorFollowups)
      .set({ isCompleted: true, completedAt: new Date(), outcome, updatedAt: new Date() } as any)
      .where(eq(auditorFollowups.id, followupId))
      .returning();
    return updated;
  }

  async getSessionFollowups(auditSessionId: string): Promise<AuditorFollowup[]> {
    return db.select()
      .from(auditorFollowups)
      .where(eq(auditorFollowups.auditSessionId, auditSessionId))
      .orderBy(auditorFollowups.scheduledFor);
  }

  // ── Audit Session Summary (for PDF/download) ──────────────────────────

  async generateSessionSummary(sessionId: string): Promise<{
    session: AuditSession;
    requests: AuditorDocumentRequest[];
    findings: AuditFinding[];
    followups: AuditorFollowup[];
    summary: string;
  }> {
    const [session, requests, findings, followups] = await Promise.all([
      this.getAuditSession(sessionId),
      this.getSessionDocumentRequests(sessionId),
      this.getSessionFindings(sessionId),
      this.getSessionFollowups(sessionId),
    ]);

    if (!session) throw new Error('Audit session not found');

    const totalFines = findings
      .filter(f => f.findingType === 'fine')
      .reduce((sum, f) => sum + (f.fineAmount ?? 0), 0);

    const violations = findings.filter(f => f.findingType === 'violation').length;
    const warnings = findings.filter(f => f.findingType === 'warning').length;
    const conditions = findings.filter(f => f.findingType === 'condition').length;

    const summary = [
      `AUDIT SESSION SUMMARY`,
      `Session: ${session.sessionLabel}`,
      `Date: ${session.startedAt?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `State: ${session.stateCode}`,
      `Outcome: ${(session.overallOutcome ?? 'in_progress').toUpperCase().replace(/_/g, ' ')}`,
      ``,
      `DOCUMENT REQUESTS: ${requests.length}`,
      ...requests.map(r => `  • ${r.requestedDocType.replace(/_/g, ' ').toUpperCase()} — ${r.status.replace(/_/g, ' ')}`),
      ``,
      `FINDINGS: ${findings.length} total`,
      `  Violations: ${violations} | Warnings: ${warnings} | Conditions: ${conditions}`,
      ...(totalFines > 0 ? [`  Total Fines: $${(totalFines / 100).toFixed(2)}`] : []),
      ...findings.map(f => `  [${f.findingType.toUpperCase()}] ${f.title} — ${f.severity} severity`),
      ``,
      `FOLLOW-UPS SCHEDULED: ${followups.length}`,
      ...followups.map(f => `  • ${f.followupType} with ${f.contactName ?? 'TBD'} on ${new Date(f.scheduledFor).toLocaleDateString()}`),
      ``,
      session.summaryNotes ? `NOTES:\n${session.summaryNotes}` : '',
    ].join('\n').trim();

    return { session, requests, findings, followups, summary };
  }

  // ── Auditor Auth Helpers ──────────────────────────────────────────────

  async getAuditorByEmail(email: string): Promise<AuditorAccount | null> {
    const [auditor] = await db.select()
      .from(auditorAccounts)
      .where(and(eq(auditorAccounts.email, email), eq(auditorAccounts.isActive, true)))
      .limit(1);
    return auditor ?? null;
  }

  async updateLastLogin(auditorId: string): Promise<void> {
    await db.update(auditorAccounts)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(auditorAccounts.id, auditorId));
  }
}

export const auditorService = new AuditorService();
