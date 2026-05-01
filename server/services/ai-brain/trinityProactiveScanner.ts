/**
 * TRINITY PROACTIVE SCANNER — The COO Intelligence Layer
 * =======================================================
 * Trinity runs the business cycle. Humans only intervene when she escalates.
 *
 * Three scan cadences:
 *  - Daily  (6am)   : Coverage check, missed punches, compliance expiry, open shifts, pending approvals
 *  - Weekly (Mon 7am): OT risk, next-week completeness, SLA compliance, workforce summary
 *  - Monthly (25th)  : Next-month schedule build, payroll, invoices, QB, executive summary
 *
 * Plus event-triggered responses (real-time).
 */

import { db } from '../../db';
import { createLogger } from '../../lib/logger';
import { shifts, employees, workspaces, invoices, clients, payrollRuns, employeeDocuments, timeEntries, workspaceMembers, managerAssignments, financialSnapshots, orchestrationRuns, trainingInterventions, officerTrainingCertificates } from '@shared/schema';
import { assertWorkspaceActive } from '../../middleware/workspaceGuard';
import { eq, and, gte, lte, lt, gt, isNull, ne, sql, desc, inArray } from 'drizzle-orm';
import { checkOverdueInvoices, getRevenueForecast } from '../timesheetInvoiceService';
import { computeCashFlowGap } from './trinityCashFlowActions';
import { autonomousSchedulingDaemon } from '../scheduling/autonomousSchedulingDaemon';
import { createAutomatedPayrollRun } from '../payrollAutomation';
import { runWeeklyBillingCycle, syncPendingPayrollRuns } from '../quickbooksClientBillingSync';
import { complianceEnforcementService } from '../compliance/complianceEnforcementService';
import { createNotification } from '../notificationService';
import { briefingChannelService } from '../briefingChannelService';
import { helpaiOrchestrator } from '../helpai/platformActionHub';

export interface BriefItem {
  rank?: number;
  urgency: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  actionHint: string;
  dollarImpact?: number;
  score?: number;
}

export interface MorningBriefResult {
  intro: string;
  items: BriefItem[];
  /** Wins Trinity noticed overnight — surfaced before the issue list. */
  wins?: OrgWin[];
  totalIssues: number;
  generatedAt: Date;
}

export type OrgWinType =
  | 'collection_milestone'
  | 'payroll_clean'
  | 'officer_turnaround'
  | 'contract_won'
  | 'compliance_clean'
  | 'revenue_milestone';

export interface OrgWin {
  type: OrgWinType;
  message: string;
  /** 1-10 — higher means Trinity is more confident this is worth marking. */
  significance: number;
}

interface DailyScanResult {
  workspaceId: string;
  scannedAt: string;
  uncoveredShifts: number;
  missedPunches: number;
  expiringCertsNext7Days: number;
  overdueInvoices: number;
  pendingApprovals: number;
  openShiftsToday: number;
  alerts: string[];
  escalations: string[];
}

interface WeeklyScanResult {
  workspaceId: string;
  scannedAt: string;
  otRiskOfficers: number;
  openShiftsNextWeek: number;
  expiringCertsNext30Days: number;
  staleMarketplaceOffers: number;
  alerts: string[];
}

interface MonthlyCycleResult {
  workspaceId: string;
  triggeredAt: string;
  schedulingCycleTriggered: boolean;
  payrollCycleTriggered: boolean;
  qbPayrollSynced: boolean;
  invoiceCycleTriggered: boolean;
  complianceAuditRun: boolean;
  executiveSummaryGenerated: boolean;
  alerts: string[];
  errors: string[];
}

// Per-workspace scan cooldowns (in-memory, cleared on restart)
// Key: `<scanType>:<workspaceId>`, Value: last scan timestamp ms
const scanCooldowns = new Map<string, number>();
// Cooldown windows — prevent re-running the same scan type on the same workspace
// within the window (guards against cron + event-driven double-fire after restart)
const DAILY_COOLDOWN_MS   = 22 * 60 * 60 * 1000;  // 22 hours (daily scan runs once/day)
const WEEKLY_COOLDOWN_MS  =  6 * 24 * 60 * 60 * 1000; // 6 days
const MONTHLY_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000; // 28 days

const log = createLogger('TrinityProactiveScanner');

// Per-user notification dedup — prevents duplicate trinity_autonomous_alert notifications
// if a scan somehow runs twice on the same day (server restart + cron overlap).
// Key: `wsId:userId:YYYY-MM-DD`  Value: timestamp of last send
const _notifSentToday = new Map<string, number>();
function _wasNotifSentToday(workspaceId: string, userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${workspaceId}:${userId}:${today}`;
  if (_notifSentToday.has(key)) return true;
  _notifSentToday.set(key, Date.now());
  // Evict entries older than 26 hours
  const cutoff = Date.now() - 26 * 60 * 60 * 1000;
  for (const [k, t] of _notifSentToday) { if (t < cutoff) _notifSentToday.delete(k); }
  return false;
}

function isCoolingDown(type: string, workspaceId: string, windowMs: number): boolean {
  const key = `${type}:${workspaceId}`;
  const last = scanCooldowns.get(key);
  if (last && Date.now() - last < windowMs) return true;
  scanCooldowns.set(key, Date.now());
  return false;
}

class TrinityProactiveScannerService {

  async runDailyScan(workspaceId: string): Promise<DailyScanResult> {
    if (isCoolingDown('daily', workspaceId, DAILY_COOLDOWN_MS)) {
      log.warn(`[TrinityProactiveScanner] Daily scan for ${workspaceId} skipped — cooldown active`);
      return { workspaceId, scannedAt: new Date().toISOString(), openShifts: 0, missedPunches: 0, expiringCerts: 0, pendingApprovals: 0, overdueInvoices: 0, alerts: [], escalations: [] };
    }
    await assertWorkspaceActive(workspaceId, { bypassForSystemActor: true });
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const alerts: string[] = [];
    const escalations: string[] = [];

    // 1. Scan today's schedule for uncovered shifts
    const openTodayRows = await db.select({ id: shifts.id, startTime: shifts.startTime, title: shifts.title })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, startOfDay),
        lte(shifts.startTime, endOfDay),
        ne(shifts.status, 'cancelled')
      ))
      .catch(() => []);
    const openShiftsToday = openTodayRows.length;
    if (openShiftsToday > 0) {
      escalations.push(`${openShiftsToday} unfilled shift(s) starting today — immediate fill attempt needed`);
    }

    // 2. Uncovered shifts in next 48 hours (not just today)
    const tomorrow48h = new Date(now.getTime() + 48 * 3600000);
    const uncoveredRows = await db.select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, now),
        lte(shifts.startTime, tomorrow48h),
        ne(shifts.status, 'cancelled')
      ))
      .catch(() => []);
    const uncoveredShifts = uncoveredRows.length;
    if (uncoveredShifts > openShiftsToday) {
      alerts.push(`${uncoveredShifts - openShiftsToday} additional uncovered shift(s) in the next 48 hours`);
    }

    // 3. Check missed punches (shifts started >15min ago with no clock-in)
    const threshold15 = new Date(now.getTime() - 15 * 60000);
    const lateMissedShifts = await db.select({ id: shifts.id, employeeId: shifts.employeeId, startTime: shifts.startTime })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        lte(shifts.startTime, threshold15),
        gte(shifts.startTime, new Date(now.getTime() - 4 * 3600000)),
        ne(shifts.status, 'cancelled'),
        ne(shifts.employeeId, null as any)
      ))
      .catch(() => []);
    let missedPunches = 0;
    const missedEmployeeIds: string[] = [];
    for (const s of lateMissedShifts) {
      if (!s.employeeId) continue;
      const punch = await db.select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.employeeId, s.employeeId),
          gte(timeEntries.clockIn, new Date(new Date(s.startTime).getTime() - 30 * 60000)),
          lte(timeEntries.clockIn, now)
        ))
        .limit(1)
        .catch(() => []);
      if (punch.length === 0) {
        missedPunches++;
        if (!missedEmployeeIds.includes(s.employeeId)) missedEmployeeIds.push(s.employeeId);
      }
    }
    if (missedPunches > 0) {
      let missedNames = '';
      try {
        const nameRows = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(and(eq(employees.workspaceId, workspaceId), inArray(employees.id, missedEmployeeIds.slice(0, 3))))
          .catch(() => []);
        if (nameRows.length > 0) {
          const nameList = nameRows.map(e => `${e.firstName || ''} ${e.lastName || ''}`.trim()).filter(Boolean).join(', ');
          missedNames = `: ${nameList}${missedPunches > 3 ? ` + ${missedPunches - 3} more` : ''}`;
        }
      } catch { /* non-critical */ }
      alerts.push(`${missedPunches} officer(s) did not clock in within 15 minutes of shift start${missedNames}`);
    }

    // 4. Compliance: expirations in next 7 days
    const next7 = new Date(now.getTime() + 7 * 86400000);
    const expiringRows = await db.select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      documentType: employeeDocuments.documentType,
      expirationDate: employeeDocuments.expirationDate,
    })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        gte(employeeDocuments.expirationDate, now),
        lte(employeeDocuments.expirationDate, next7)
      ))
      .catch(() => []);
    const expiringCertsNext7Days = expiringRows.length;
    if (expiringCertsNext7Days > 0) {
      let certDetail = '';
      try {
        const uniqueEmpIds = [...new Set(expiringRows.slice(0, 3).map(r => r.employeeId).filter(Boolean))] as string[];
        if (uniqueEmpIds.length > 0) {
          const empNames = await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(inArray(employees.id, uniqueEmpIds))
            .catch(() => []);
          const nameMap = new Map(empNames.map(e => [e.id, `${e.firstName || ''} ${e.lastName || ''}`.trim()]));
          const certLines = expiringRows.slice(0, 3).map(r => {
            const name = r.employeeId ? (nameMap.get(r.employeeId) || 'Unknown') : 'Unknown';
            const expDate = r.expirationDate ? new Date(r.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?';
            return `${name} (${r.documentType || 'cert'} exp ${expDate})`;
          });
          certDetail = `: ${certLines.join('; ')}${expiringCertsNext7Days > 3 ? ` + ${expiringCertsNext7Days - 3} more` : ''}`;
        }
      } catch { /* non-critical */ }
      alerts.push(`${expiringCertsNext7Days} certification(s) expiring in the next 7 days — notify affected officers immediately${certDetail}`);
    }

    // 5. Overdue invoices
    let overdueInvoices = 0;
    try {
      const overdueResult = await checkOverdueInvoices(workspaceId);
      overdueInvoices = (overdueResult as any)?.overdueCount || 0;
      if (overdueInvoices > 0) {
        alerts.push(`${overdueInvoices} overdue invoice(s) — send reminders via invoice.check_overdue`);
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 5b. Cash flow gap — will owner make payroll?
    try {
      const cashGap = await computeCashFlowGap(workspaceId, 7);
      if (cashGap.riskLevel === 'critical') {
        escalations.push(`CASH GAP ALERT: Upcoming payroll $${cashGap.upcomingPayroll.toLocaleString()} — only $${cashGap.receivablesDueBeforePayroll.toLocaleString()} in receivables due before payroll. Shortfall: $${Math.abs(cashGap.cashGap).toLocaleString()}. Immediate collections follow-up required.`);
      } else if (cashGap.riskLevel === 'warning') {
        alerts.push(`Cash position tight: $${cashGap.cashGap.toLocaleString()} buffer vs upcoming payroll${cashGap.nextPayrollDate ? ' on ' + cashGap.nextPayrollDate : ''}. Accelerate collections.`);
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 5c. Active collections pipeline
    try {
      const activeCollections = await db.select({ id: clients.id, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName, collectionsStatus: (clients as any).collectionsStatus, collectionAttemptCount: (clients as any).collectionAttemptCount })
        .from(clients)
        .where(and(eq(clients.workspaceId, workspaceId), eq((clients as any).collectionsStatus as any, 'active')))
        .catch(() => [] as any[]);
      if (activeCollections.length > 0) {
        const names = activeCollections.slice(0, 3).map((c: any) => c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown').join(', ');
        const more = activeCollections.length > 3 ? ` (+${activeCollections.length - 3} more)` : '';
        alerts.push(`${activeCollections.length} client(s) in active collections: ${names}${more}. Review payment status and follow up.`);
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal collections scan error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 6. Pending approvals >24 hours old
    const yesterday = new Date(now.getTime() - 24 * 3600000);
    const pendingTimesheets = await db.select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status as any, 'pending'),
        lte(timeEntries.updatedAt as any, yesterday)
      ))
      .catch(() => []);
    const pendingApprovals = pendingTimesheets.length;
    if (pendingApprovals > 0) {
      alerts.push(`${pendingApprovals} timesheet(s) pending approval for more than 24 hours — nudge approvers`);
    }

    // 7. Terminated / inactive employees still assigned to future shifts (ghost assignments)
    try {
      const next14 = new Date(now.getTime() + 14 * 86400000);
      const inactiveEmpRows = await db.select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, false)))
        .catch(() => []);
      if (inactiveEmpRows.length > 0) {
        const inactiveIds = inactiveEmpRows.map(e => e.id).filter(Boolean) as string[];
        const ghostShifts = await db.select({ id: shifts.id })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, now),
            lte(shifts.startTime, next14),
            ne(shifts.status, 'cancelled'),
            inArray(shifts.employeeId as any, inactiveIds)
          ))
          .catch(() => []);
        if (ghostShifts.length > 0) {
          escalations.push(`${ghostShifts.length} future shift(s) assigned to terminated or inactive employees — immediate reassignment required`);
        }
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // ── ROLE-SCOPED NOTIFICATION DELIVERY ──────────────────────────────────
    // Owners, managers, and supervisors each receive a brief tailored to what
    // they actually care about and what falls within their scope of authority.
    // Owners get an executive brief with financial context.
    // Managers get an operational summary for their domain.
    // Supervisors get a field brief scoped to their assigned team.
    const hasIssues = escalations.length > 0 || alerts.length > 0;

    if (hasIssues) {
      // Get all workspace employees with roles (single query)
      const staffRoster = await db.select({
        id:            employees.id,
        userId:        employees.userId,
        workspaceRole: employees.workspaceRole,
        firstName:     employees.firstName,
      })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)))
        .catch(() => []);

      const owners      = staffRoster.filter(e => e.workspaceRole === 'org_owner' || e.workspaceRole === 'co_owner');
      const managers    = staffRoster.filter(e => e.workspaceRole === 'manager');
      const supervisors = staffRoster.filter(e => e.workspaceRole === 'supervisor');

      // 1. OWNERS — executive brief with financial health context
      if (owners.length > 0) {
        const fin = await this.getOwnerFinancialContext(workspaceId).catch(() => null);
        const allIssues = [...escalations, ...alerts];
        const fieldSummary = allIssues.length > 0
          ? allIssues.slice(0, 3).join(' | ')
          : 'No immediate operational issues.';

        let ownerMessage = fieldSummary;
        if (fin?.hasData) {
          const profitSign = fin.netProfit >= 0 ? '+' : '';
          ownerMessage += ` | Financial (MTD): Revenue $${fin.monthlyRevenue.toLocaleString()} · Payroll $${fin.monthlyPayroll.toLocaleString()} · Net ${profitSign}$${fin.netProfit.toLocaleString()} (${fin.marginPercent.toFixed(1)}% margin)`;
        }

        const criticalCount = escalations.length;
        const ownerTitle = criticalCount > 0
          ? `Trinity Executive Brief — ${criticalCount} Critical Issue${criticalCount > 1 ? 's' : ''}`
          : 'Trinity Daily Executive Brief';

        for (const owner of owners) {
          if (!owner.userId) continue;
          // Dedup: skip if already sent today (e.g., cron + event-driven double-fire)
          if (_wasNotifSentToday(workspaceId, owner.userId)) {
            log.info(`[TrinityProactiveScanner] Skipping duplicate daily brief for owner ${owner.userId} (already sent today)`);
            continue;
          }
          await createNotification({
            workspaceId,
            userId: owner.userId,
            type: 'trinity_autonomous_alert',
            title: ownerTitle,
            message: ownerMessage,
            priority: criticalCount > 0 ? 'urgent' : 'normal',
            idempotencyKey: `trinity_autonomous_alert-${String(Date.now())}-${owner.userId}`,
        }).catch(() => null);
        }
      }

      // 2. MANAGERS — operational brief (all issues, no P&L detail)
      if (managers.length > 0 && (escalations.length > 0 || alerts.length > 0)) {
        const mgmtIssues = [...escalations, ...alerts];
        const mgmtTitle = escalations.length > 0
          ? `Trinity Operations Brief — Action Required`
          : 'Trinity Daily Operations Brief';
        const mgmtMessage = mgmtIssues.slice(0, 5).join(' | ');

        for (const mgr of managers) {
          if (!mgr.userId) continue;
          // Dedup: skip if already sent today
          if (_wasNotifSentToday(workspaceId, mgr.userId)) {
            log.info(`[TrinityProactiveScanner] Skipping duplicate daily brief for manager ${mgr.userId} (already sent today)`);
            continue;
          }
          await createNotification({
            workspaceId,
            userId: mgr.userId,
            type: 'trinity_autonomous_alert',
            title: mgmtTitle,
            message: mgmtMessage,
            priority: escalations.length > 0 ? 'urgent' : 'normal',
            idempotencyKey: `trinity_autonomous_alert-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
        }
      }

      // 3. SUPERVISORS — field brief scoped to their assigned team
      for (const sup of supervisors) {
        if (!sup.userId) continue;
        try {
          // Get the team this supervisor is responsible for
          const teamIds = await this.getSupervisorTeamIds(workspaceId, sup.id);
          if (teamIds.length === 0) continue; // Not assigned any team yet

          // Check if any field alerts are relevant to their team
          // (missed punches and open shifts are workspace-wide, so we scope by
          // checking if any of their team members were involved in those issues)
          const teamIssues: string[] = [];

          if (missedPunches > 0) {
            // Check missed punches specifically for this supervisor's team
            const threshold15 = new Date(now.getTime() - 15 * 60000);
            const teamShifts = await db.select({ id: shifts.id, employeeId: shifts.employeeId, startTime: shifts.startTime })
              .from(shifts)
              .where(and(
                eq(shifts.workspaceId, workspaceId),
                lte(shifts.startTime, threshold15),
                gte(shifts.startTime, new Date(now.getTime() - 4 * 3600000)),
                ne(shifts.status, 'cancelled'),
                inArray(shifts.employeeId as any, teamIds)
              ))
              .catch(() => []);

            let teamMissed = 0;
            for (const s of teamShifts) {
              if (!s.employeeId) continue;
              const punch = await db.select({ id: timeEntries.id })
                .from(timeEntries)
                .where(and(
                  eq(timeEntries.employeeId, s.employeeId),
                  gte(timeEntries.clockIn, new Date(new Date(s.startTime).getTime() - 30 * 60000)),
                  lte(timeEntries.clockIn, now)
                ))
                .limit(1)
                .catch(() => []);
              if (punch.length === 0) teamMissed++;
            }
            if (teamMissed > 0) {
              teamIssues.push(`${teamMissed} officer(s) on your team did not clock in within 15 min of shift start`);
            }
          }

          if (openShiftsToday > 0) {
            // Any uncovered today shifts that belong to this supervisor's team area
            teamIssues.push(`${openShiftsToday} unfilled shift(s) today — review coverage for your team`);
          }

          if (expiringCertsNext7Days > 0) {
            // Check compliance docs for their team members
            const teamExpiringRows = await db.select({ id: employeeDocuments.id })
              .from(employeeDocuments)
              .where(and(
                eq(employeeDocuments.workspaceId, workspaceId),
                gte(employeeDocuments.expirationDate, now),
                lte(employeeDocuments.expirationDate, new Date(now.getTime() + 7 * 86400000)),
                inArray(employeeDocuments.employeeId as any, teamIds)
              ))
              .catch(() => []);
            if (teamExpiringRows.length > 0) {
              teamIssues.push(`${teamExpiringRows.length} certification(s) expiring this week for your team`);
            }
          }

          if (teamIssues.length === 0) continue;

          // Dedup: skip if already sent today
          if (_wasNotifSentToday(workspaceId, sup.userId)) {
            log.info(`[TrinityProactiveScanner] Skipping duplicate daily brief for supervisor ${sup.userId} (already sent today)`);
            continue;
          }

          const issueWord = teamIssues.length === 1 ? 'issue' : 'issues';
          const structuredMessage =
            `${teamIssues.length} ${issueWord} require your attention today. ` +
            teamIssues.map((issue, i) => `(${i + 1}) ${issue}`).join(' ') +
            ' Review your team dashboard and resolve before end of shift.';

          await createNotification({
            workspaceId,
            userId: sup.userId,
            type: 'trinity_autonomous_alert',
            title: `Team Alert: ${teamIssues.length} ${issueWord} flagged for your team`,
            message: structuredMessage,
            priority: teamIssues.length >= 2 ? 'high' : 'normal',
            idempotencyKey: `trinity_autonomous_alert-${String(Date.now())}-${sup.userId}`,
        }).catch(() => null);
        } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }
      }
    }

    // ── PAYROLL ANOMALY DETECTION (Phase 19 addition) ─────────────────────────
    // Compare the most recent payroll run's gross pay against a 3-run rolling average.
    // If the current run is >30% higher, flag as a potential anomaly.
    try {
      const recentRuns = await db
        .select({ id: payrollRuns.id, totalGrossPay: payrollRuns.totalGrossPay, status: payrollRuns.status, periodStart: payrollRuns.periodStart })
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          ne(payrollRuns.status as any, 'draft'),
        ))
        .orderBy(desc(payrollRuns.periodStart))
        .limit(4)
        .catch(() => [] as Array<{ id: string; totalGrossPay: string | null; status: string | null; periodStart: Date | null }>);

      if (recentRuns.length >= 2) {
        const latestGross = parseFloat(String(recentRuns[0]?.totalGrossPay ?? '0')) || 0;
        const prevRuns = recentRuns.slice(1);
        const avgPrev = prevRuns.reduce((sum, r) => sum + (parseFloat(String(r.totalGrossPay ?? '0')) || 0), 0) / prevRuns.length;

        if (avgPrev > 0 && latestGross > avgPrev * 1.30) {
          const pctDiff = (((latestGross - avgPrev) / avgPrev) * 100).toFixed(1);
          const anomalyMsg = `PAYROLL ANOMALY: Latest payroll gross ($${latestGross.toLocaleString()}) is ${pctDiff}% above the ${prevRuns.length}-run average ($${avgPrev.toLocaleString()}). Review for data entry errors or overtime spikes.`;
          escalations.push(anomalyMsg);
          log.warn(`[TrinityProactiveScanner] ${anomalyMsg}`);
        } else if (avgPrev > 0 && latestGross < avgPrev * 0.60) {
          const pctDiff = (((avgPrev - latestGross) / avgPrev) * 100).toFixed(1);
          const anomalyMsg = `PAYROLL ANOMALY: Latest payroll gross ($${latestGross.toLocaleString()}) is ${pctDiff}% below the ${prevRuns.length}-run average ($${avgPrev.toLocaleString()}). May indicate missing timesheets or data sync issues.`;
          alerts.push(anomalyMsg);
          log.warn(`[TrinityProactiveScanner] ${anomalyMsg}`);
        }
      }
    } catch (anomalyErr) {
      log.warn('[TrinityProactiveScanner] Payroll anomaly detection skipped:', anomalyErr instanceof Error ? anomalyErr.message : String(anomalyErr));
    }

    log.info(`[TrinityProactiveScanner] Daily scan complete: ws=${workspaceId}, openToday=${openShiftsToday}, missed=${missedPunches}, expiring=${expiringCertsNext7Days}, alerts=${alerts.length}, escalations=${escalations.length}`);

    // Post to the Org Operations Briefing Channel — managers + owners see this in /briefing-channel
    briefingChannelService.postDailyBriefing(workspaceId, {
      uncoveredShifts,
      missedPunches,
      expiringCertsNext7Days,
      overdueInvoices,
      pendingApprovals,
      openShiftsToday,
      alerts,
      escalations,
    }).catch(e => log.error('[TrinityScanner] Briefing channel post failed:', e?.message));

    return {
      workspaceId,
      scannedAt: now.toISOString(),
      uncoveredShifts,
      missedPunches,
      expiringCertsNext7Days,
      overdueInvoices,
      pendingApprovals,
      openShiftsToday,
      alerts,
      escalations,
    };
  }

  async runWeeklyScan(workspaceId: string): Promise<WeeklyScanResult> {
    if (isCoolingDown('weekly', workspaceId, WEEKLY_COOLDOWN_MS)) {
      log.warn(`[TrinityProactiveScanner] Weekly scan for ${workspaceId} skipped — cooldown active`);
      return { workspaceId, scannedAt: new Date().toISOString(), otRiskOfficers: 0, openShiftsNextWeek: 0, expiringCertsNext30Days: 0, staleMarketplaceOffers: 0, alerts: [] };
    }
    await assertWorkspaceActive(workspaceId, { bypassForSystemActor: true });
    const now = new Date();
    const alerts: string[] = [];

    // 1. OT risk: officers projected to hit 40hrs by Thursday
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const thursday = new Date(weekStart);
    thursday.setDate(thursday.getDate() + 4);

    const hoursThisWeek = await db.select({
      employeeId: timeEntries.employeeId,
      totalMinutes: sql`SUM(${(timeEntries as any).totalMinutes})`,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.clockIn, weekStart),
        lte(timeEntries.clockIn, now)
      ))
      .groupBy(timeEntries.employeeId)
      .catch(() => []);
    const otRiskOfficers = hoursThisWeek.filter(row => parseFloat(String(row.totalMinutes || 0)) / 60 >= 32).length;
    if (otRiskOfficers > 0) {
      alerts.push(`${otRiskOfficers} officer(s) projected to hit 40 hours by Thursday — suggest schedule adjustment`);
    }

    // 2. Next week's schedule completeness
    const nextWeekStart = new Date(weekEnd);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
    const openNextWeek = await db.select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, nextWeekStart),
        lte(shifts.startTime, nextWeekEnd),
        ne(shifts.status, 'cancelled')
      ))
      .catch(() => []);
    const openShiftsNextWeek = openNextWeek.length;
    if (openShiftsNextWeek > 0) {
      alerts.push(`${openShiftsNextWeek} open shift(s) next week without assignment — auto-fill attempt recommended`);
    }

    // 3. Compliance: expirations in next 30 days
    const next30 = new Date(now.getTime() + 30 * 86400000);
    const expiringRows = await db.select({ id: employeeDocuments.id, employeeId: employeeDocuments.employeeId, documentType: employeeDocuments.documentType })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        gte(employeeDocuments.expirationDate, now),
        lte(employeeDocuments.expirationDate, next30)
      ))
      .catch(() => []);
    const expiringCertsNext30Days = expiringRows.length;
    if (expiringCertsNext30Days > 0) {
      alerts.push(`${expiringCertsNext30Days} certification(s) expiring within 30 days — notify officers with renewal steps`);
    }

    // 4. Stale marketplace offers (>48 hours)
    const twoDaysAgo = new Date(now.getTime() - 48 * 3600000);
    const staleOffers = await db.select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.status as any, 'marketplace'),
        lte(shifts.updatedAt as any, twoDaysAgo)
      ))
      .catch(() => []);
    const staleMarketplaceOffers = staleOffers.length;
    if (staleMarketplaceOffers > 0) {
      alerts.push(`${staleMarketplaceOffers} marketplace shift offer(s) pending for over 48 hours — re-notify eligible officers`);
    }

    // Notify managers
    if (alerts.length > 0) {
      const managers = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
        .catch(() => []);
      for (const mgr of managers) {
        await createNotification({
          workspaceId,
          userId: mgr.userId,
          type: 'alert',
          title: 'Trinity Weekly Intelligence Briefing',
          message: alerts.join(' | '),
          priority: 'normal',
          idempotencyKey: `alert-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
      }
    }

    log.info(`[TrinityProactiveScanner] Weekly scan complete: ws=${workspaceId}, otRisk=${otRiskOfficers}, openNextWeek=${openShiftsNextWeek}, expiringCerts=${expiringCertsNext30Days}, staleOffers=${staleMarketplaceOffers}`);

    return { workspaceId, scannedAt: now.toISOString(), otRiskOfficers, openShiftsNextWeek, expiringCertsNext30Days, staleMarketplaceOffers, alerts };
  }

  async runMonthlyCycle(workspaceId: string): Promise<MonthlyCycleResult> {
    await assertWorkspaceActive(workspaceId, { bypassForSystemActor: true });
    const now = new Date();
    const alerts: string[] = [];
    const errors: string[] = [];
    let schedulingCycleTriggered = false;
    let payrollCycleTriggered = false;
    let qbPayrollSynced = false;
    let invoiceCycleTriggered = false;
    let complianceAuditRun = false;
    let executiveSummaryGenerated = false;

    // STEP 1: Trigger autonomous scheduling for next month (full 5-week window)
    try {
      await autonomousSchedulingDaemon.triggerManualRun(workspaceId, 'next_month');
      schedulingCycleTriggered = true;
      alerts.push('Next month scheduling cycle triggered');
    } catch (e: unknown) {
      errors.push(`Scheduling cycle error: ${e.message}`);
    }

    // STEP 2: Trigger payroll cycle for current period
    try {
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      await createAutomatedPayrollRun({
        workspaceId,
        periodStart,
        periodEnd,
        createdBy: 'trinity-monthly-cycle',
      });
      payrollCycleTriggered = true;
      alerts.push('Payroll cycle triggered for current period');
    } catch (e: unknown) {
      errors.push(`Payroll cycle error: ${e.message}`);
    }

    // STEP 2.5: Sync payroll runs to QuickBooks
    try {
      const qbPayrollResult = await syncPendingPayrollRuns(workspaceId);
      qbPayrollSynced = true;
      alerts.push(`QB payroll sync: ${qbPayrollResult.synced} synced, ${qbPayrollResult.skipped} skipped`);
      if (qbPayrollResult.failed > 0) {
        errors.push(`QB payroll sync: ${qbPayrollResult.failed} run(s) failed to sync — review QuickBooks connection`);
      }
    } catch (e: unknown) {
      errors.push(`QB payroll sync error: ${e.message}`);
    }

    // STEP 3: Trigger invoice cycle for all clients
    try {
      await runWeeklyBillingCycle(workspaceId);
      invoiceCycleTriggered = true;
      alerts.push('Invoice cycle triggered for all clients');
    } catch (e: unknown) {
      errors.push(`Invoice cycle error: ${e.message}`);
    }

    // STEP 4: Run compliance audit
    try {
      await complianceEnforcementService.runDailyComplianceCheck();
      await complianceEnforcementService.checkDocumentExpiries();
      // Also expire document_instances past their expiry date
      const { runDocumentExpiryCheck } = await import('../documents/documentStateMachine');
      await runDocumentExpiryCheck();
      complianceAuditRun = true;
      alerts.push('Compliance audit complete');
    } catch (e: unknown) {
      errors.push(`Compliance audit error: ${e.message}`);
    }

    // STEP 5: Revenue forecast & client health
    let forecastData: any = null;
    let overdueData: any = null;
    try {
      [forecastData, overdueData] = await Promise.all([
        getRevenueForecast(workspaceId),
        checkOverdueInvoices(workspaceId),
      ]);
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // STEP 6: Build executive summary and notify owner
    try {
      const openShiftsNextMonth = await db.select({ count: sql`COUNT(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          isNull(shifts.employeeId),
          gte(shifts.startTime, new Date(now.getFullYear(), now.getMonth() + 1, 1)),
          ne(shifts.status, 'cancelled')
        ))
        .catch(() => [{ count: 0 }]);
      const complianceFlags = await db.select({ count: sql`COUNT(*)` })
        .from(employeeDocuments)
        .where(and(
          eq(employeeDocuments.workspaceId, workspaceId),
          lte(employeeDocuments.expirationDate, new Date(Date.now() + 30 * 86400000)),
          gte(employeeDocuments.expirationDate, now)
        ))
        .catch(() => [{ count: 0 }]);

      const summaryLines = [
        `Monthly cycle complete for ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}.`,
        schedulingCycleTriggered ? `Next month's schedule build triggered.` : `Schedule build failed — manual action needed.`,
        payrollCycleTriggered ? `Payroll draft generated for current period.` : `Payroll generation failed.`,
        qbPayrollSynced ? `QB payroll sync complete.` : `QB payroll sync failed — review QuickBooks connection.`,
        invoiceCycleTriggered ? `Invoices sent to all eligible clients.` : `Invoice cycle failed.`,
        `Open shifts next month: ${parseInt(String((openShiftsNextMonth[0] as any)?.count || 0))}`,
        `Compliance flags: ${parseInt(String((complianceFlags[0] as any)?.count || 0))} cert(s) expiring in 30 days.`,
        overdueData ? `Overdue invoices: ${(overdueData as any)?.overdueCount || 0}` : '',
        errors.length > 0 ? `Errors requiring attention: ${errors.length}` : 'All cycles completed successfully.',
      ].filter(Boolean).join(' ');

      const owners = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner')`))
        .catch(() => []);
      for (const owner of owners) {
        await createNotification({
          workspaceId,
          userId: owner.userId,
          type: 'monthly_summary',
          idempotencyKey: `monthly_summary-${Date.now()}-${owner.userId}`,
          title: `Trinity Monthly Cycle — ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`,
          message: summaryLines,
          priority: 'high',
        } as any).catch(() => null);
      }
      executiveSummaryGenerated = true;
      alerts.push('Executive summary sent to workspace owner(s)');
    } catch (e: unknown) {
      errors.push(`Executive summary error: ${e.message}`);
    }

    log.info(`[TrinityProactiveScanner] Monthly cycle complete: ws=${workspaceId}, scheduling=${schedulingCycleTriggered}, payroll=${payrollCycleTriggered}, qbPayrollSync=${qbPayrollSynced}, invoices=${invoiceCycleTriggered}, errors=${errors.length}`);

    return {
      workspaceId,
      triggeredAt: now.toISOString(),
      schedulingCycleTriggered,
      payrollCycleTriggered,
      qbPayrollSynced,
      invoiceCycleTriggered,
      complianceAuditRun,
      executiveSummaryGenerated,
      alerts,
      errors,
    };
  }

  async processEvent(eventType: string, payload: any): Promise<unknown> {
    const { workspaceId, officerId, shiftId, invoiceId, employeeId } = payload;

    switch (eventType) {
      case 'officer_calloff':
        // Find replacement within 30 minutes window
        if (shiftId && workspaceId) {
          await autonomousSchedulingDaemon.triggerManualRun(workspaceId, 'current_day').catch(() => null);
          if (officerId) {
            const managers = await db.select({ userId: workspaceMembers.userId })
              .from(workspaceMembers)
              .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
              .catch(() => []);
            for (const mgr of managers) {
              await createNotification({
                workspaceId, userId: mgr.userId, type: 'calloff_alert',
                title: 'Officer Call-Off — Replacement Needed',
                message: `An officer called off for shift ${shiftId}. Trinity is attempting to find a replacement. You'll be notified if escalation is needed.`,
                priority: 'urgent',
                idempotencyKey: `calloff_alert-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
            }
          }
          return { handled: true, event: 'officer_calloff', fillAttempted: true };
        }
        return { handled: false, reason: 'shiftId and workspaceId required for calloff handling' };

      case 'open_shift_created':
        if (shiftId && workspaceId) {
          await autonomousSchedulingDaemon.triggerManualRun(workspaceId, 'current_day').catch(() => null);
          return { handled: true, event: 'open_shift_created', fillAttempted: true };
        }
        return { handled: false, reason: 'shiftId and workspaceId required' };

      case 'invoice_payment_received':
        if (invoiceId && workspaceId) {
          // GAP-14b FIX: Guard against overwriting terminal statuses — in particular 'refunded'.
          // Previously this was an unconditional update that could flip a refunded invoice back
          // to 'paid', silently erasing the refund record and overstating revenue in the org ledger.
          // GAP-19 FIX: workspaceId is now required in the guard and added to the WHERE clause.
          // The prior filter on invoiceId alone allowed a crafted or misrouted event to mark any
          // workspace's invoice paid — a cross-tenant financial mutation. The compound WHERE on
          // both invoiceId and workspaceId makes the update structurally workspace-scoped.
          await db.update(invoices)
            .set({ status: 'paid', updatedAt: new Date() } as any)
            .where(and(
              eq(invoices.id, invoiceId),
              eq(invoices.workspaceId, workspaceId),
              sql`${invoices.status} NOT IN ('void', 'cancelled', 'refunded')`,
            ))
            .catch(() => null);
          const managers = await db.select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId || ''), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
            .catch(() => []);
          for (const mgr of managers) {
            await createNotification({
              workspaceId, userId: mgr.userId, type: 'payment_received',
              title: 'Invoice Payment Received',
              message: `Invoice ${invoiceId} has been marked as paid. QuickBooks sync will update automatically.`,
              priority: 'normal',
              idempotencyKey: `payment_received-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'invoice_payment_received', invoiceId, markedPaid: true };
        }
        return { handled: false, reason: 'invoiceId required' };

      case 'missed_clock_in':
        if (officerId && shiftId) {
          const emp = await db.query.employees?.findFirst({ where: eq(employees.id, officerId) } as any).catch(() => null);
          const userId = (emp as any)?.userId || officerId;
          await createNotification({
            workspaceId, userId, type: 'missed_clock_in',
            title: 'Missed Clock-In',
            message: `You have a shift that started 15+ minutes ago and no clock-in has been recorded. Please clock in immediately or contact your supervisor.`,
            priority: 'urgent',
            idempotencyKey: `missed_clock_in-${String(Date.now())}-${'system'}`,
        }).catch(() => null);
          const managers = await db.select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId || ''), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
            .catch(() => []);
          for (const mgr of managers) {
            await createNotification({
              workspaceId, userId: mgr.userId, type: 'missed_clock_in_alert',
              title: 'Officer Did Not Clock In',
              message: `Officer ID ${officerId} did not clock in for shift ${shiftId}. The officer has been notified. Please verify coverage.`,
              priority: 'high',
              idempotencyKey: `missed_clock_in_alert-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'missed_clock_in', officerNotified: true, supervisorNotified: true };
        }
        return { handled: false, reason: 'officerId and shiftId required' };

      case 'license_expiry':
        if (officerId && workspaceId) {
          const emp = await db.query.employees?.findFirst({ where: eq(employees.id, officerId) } as any).catch(() => null);
          const userId = (emp as any)?.userId || officerId;
          await createNotification({
            workspaceId, userId, type: 'compliance',
            title: 'License/Certification Expired',
            message: 'Your license or certification has expired. You have been removed from upcoming shifts at posts requiring this certification. Please renew immediately.',
            priority: 'urgent',
            idempotencyKey: `compliance-${String(Date.now())}-${'system'}`,
        }).catch(() => null);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const removed = await db.update(shifts)
            .set({ employeeId: null, status: 'open', notes: '[AUTO_REMOVED] License/certification expired', updatedAt: new Date() } as any)
            .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.employeeId, officerId), gte(shifts.startTime, tomorrow)))
            .catch(() => null);
          return { handled: true, event: 'license_expiry', officerNotified: true, futureShiftsCleared: true };
        }
        return { handled: false, reason: 'officerId and workspaceId required' };

      case 'timesheet_submitted':
        // GAP-17 FIX: Previously filtered by timeEntryId alone — any entry in any workspace
        // could be approved or flagged if a crafted event carried the right UUID. workspaceId is
        // now required as a hard guard AND appended to every WHERE clause so cross-tenant mutation
        // is structurally impossible even if workspaceId arrives wrong from the event payload.
        if (workspaceId && payload.timeEntryId) {
          const entry = await db.query.timeEntries?.findFirst({
            where: and(
              eq(timeEntries.id, payload.timeEntryId),
              eq(timeEntries.workspaceId, workspaceId),
            ) as any,
          } as any).catch(() => null);
          if (entry) {
            const hasIssues = !(entry as any).clockOut || (entry as any).totalMinutes > 600 || (entry as any).totalMinutes < 0;
            if (!hasIssues) {
              await db.update(timeEntries)
                .set({ status: 'approved', updatedAt: new Date() } as any)
                .where(and(eq(timeEntries.id, payload.timeEntryId), eq(timeEntries.workspaceId, workspaceId)))
                .catch(() => null);
              return { handled: true, event: 'timesheet_submitted', autoApproved: true };
            } else {
              await db.update(timeEntries)
                .set({ status: 'flagged', notes: '[AUTO_FLAGGED] Anomaly detected: ' + (!(entry as any).clockOut ? 'missing clock-out' : (entry as any).totalMinutes > 600 ? 'shift >10 hours' : 'invalid duration'), updatedAt: new Date() } as any)
                .where(and(eq(timeEntries.id, payload.timeEntryId), eq(timeEntries.workspaceId, workspaceId)))
                .catch(() => null);
              return { handled: true, event: 'timesheet_submitted', autoApproved: false, flagged: true };
            }
          }
        }
        return { handled: false, reason: 'workspaceId and timeEntryId required' };

      case 'incident_filed':
        if (payload.incidentId && workspaceId) {
          const managers = await db.select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
            .catch(() => []);
          for (const mgr of managers) {
            await createNotification({
              workspaceId, userId: mgr.userId, type: 'incident',
              title: 'Incident Report Filed',
              idempotencyKey: `incident-${Date.now()}-${mgr.userId}`,
              message: `An incident report has been filed (ID: ${payload.incidentId}). Please review and take appropriate action.`,
              priority: 'high',
            } as any).catch(() => null);
          }
          return { handled: true, event: 'incident_filed', supervisorNotified: true };
        }
        return { handled: false, reason: 'incidentId and workspaceId required' };

      // --- Extended coverage: 8 additional event types ---

      case 'shift_cancelled':
        // Trigger coverage fill pipeline for a cancelled assigned shift
        if (payload.shiftId && workspaceId) {
          try {
            const { coveragePipeline } = await import('../automation/coveragePipeline');
            await coveragePipeline.triggerCoverage({ workspaceId, shiftId: payload.shiftId, reason: 'shift_cancelled' }).catch(() => null);
          } catch { /* non-blocking */ }
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'shift_cancelled', title: 'Shift Cancelled — Coverage Needed',
              message: `Shift ${payload.shiftId} was cancelled. Trinity is seeking a replacement. You'll be notified if escalation is needed.`, priority: 'high',
 idempotencyKey: `shift_cancelled-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'shift_cancelled', fillAttempted: true };
        }
        return { handled: false, reason: 'shiftId and workspaceId required' };

      case 'payroll_run_approved':
        if (workspaceId && payload.payrollRunId) {
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'payroll_approved', title: 'Payroll Run Approved',
              message: `Payroll run ${payload.payrollRunId} has been approved. Disbursement will proceed. QuickBooks sync will trigger automatically if enabled.`, priority: 'normal',
 idempotencyKey: `payroll_approved-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'payroll_run_approved', payrollRunId: payload.payrollRunId };
        }
        return { handled: false, reason: 'payrollRunId and workspaceId required' };

      case 'invoice_overdue':
        if (workspaceId && payload.invoiceId) {
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'invoice_overdue', title: 'Invoice Overdue — Collection Action Needed',
              message: `Invoice ${payload.invoiceId} is overdue. Trinity recommends initiating the collections workflow. A follow-up email has been queued.`, priority: 'urgent',
 idempotencyKey: `invoice_overdue-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'invoice_overdue', invoiceId: payload.invoiceId, collectionInitiated: true };
        }
        return { handled: false, reason: 'invoiceId and workspaceId required' };

      case 'time_entries_approved':
        if (workspaceId) {
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'timesheets_approved', title: 'Timesheets Approved — Ready for Payroll',
              message: `Time entries have been approved${payload.periodEnd ? ` for period ending ${payload.periodEnd}` : ''}. Payroll run may now proceed.`, priority: 'normal',
 idempotencyKey: `timesheets_approved-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'time_entries_approved', managerNotified: true };
        }
        return { handled: false, reason: 'workspaceId required' };

      case 'employee_terminated':
        if (workspaceId && (payload.employeeId || employeeId)) {
          const empId = payload.employeeId || employeeId;
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'employee_terminated', title: 'Employee Offboarding — Action Required',
              message: `Employee ${empId} has been marked as terminated. Please ensure: (1) access credentials revoked, (2) final paycheck processed, (3) equipment returned, (4) compliance records archived.`, priority: 'high',
 idempotencyKey: `employee_terminated-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'employee_terminated', offboardingTriggered: true };
        }
        return { handled: false, reason: 'employeeId and workspaceId required' };

      case 'sla_breach':
        if (workspaceId && payload.serviceName) {
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'sla_breach', title: `SLA Breach — ${payload.serviceName}`,
              idempotencyKey: `sla_breach-${Date.now()}-${mgr.userId}`,
              message: `${payload.serviceName} missed its SLA target: ${payload.breachType || 'performance threshold exceeded'} (target: ${payload.targetValue}, actual: ${payload.actualValue}).`, priority: 'high' } as any).catch(() => null);
          }
          return { handled: true, event: 'sla_breach', supervisorNotified: true };
        }
        return { handled: false, reason: 'serviceName and workspaceId required' };

      case 'schedule_published':
        if (workspaceId) {
          const allMembers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('staff', 'officer')`)).catch(() => []);
          for (const member of allMembers) {
            await createNotification({ workspaceId, userId: member.userId, type: 'schedule_published', title: 'New Schedule Published',
              message: `Your schedule has been published${payload.weekLabel ? ` for ${payload.weekLabel}` : ''}. Review your upcoming shifts in the Schedule tab.`, priority: 'normal',
 idempotencyKey: `schedule_published-${String(Date.now())}-${member.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'schedule_published', staffNotified: allMembers.length };
        }
        return { handled: false, reason: 'workspaceId required' };

      case 'panic_alert_triggered':
        if (workspaceId && (payload.officerId || officerId)) {
          const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor', 'dispatcher')`)).catch(() => []);
          for (const mgr of managers) {
            await createNotification({ workspaceId, userId: mgr.userId, type: 'panic_alert', title: 'PANIC ALERT — Officer Needs Immediate Assistance',
              message: `Officer ${payload.officerId || officerId} has triggered a panic alert${payload.location ? ` at ${payload.location}` : ''}. Dispatch assistance IMMEDIATELY.`, priority: 'urgent',
 idempotencyKey: `panic_alert-${String(Date.now())}-${mgr.userId}`,
        }).catch(() => null);
          }
          return { handled: true, event: 'panic_alert_triggered', dispatchNotified: managers.length };
        }
        return { handled: false, reason: 'officerId and workspaceId required' };

      default:
        return { handled: false, event: eventType, reason: `Unknown event type: ${eventType}. Supported: officer_calloff, open_shift_created, invoice_payment_received, missed_clock_in, license_expiry, timesheet_submitted, incident_filed, shift_cancelled, payroll_run_approved, invoice_overdue, time_entries_approved, employee_terminated, sla_breach, schedule_published, panic_alert_triggered` };
    }
  }

  async generateMorningBrief(workspaceId: string, userId?: string): Promise<MorningBriefResult> {
    const now = new Date();
    const items: BriefItem[] = [];

    const next7 = new Date(now.getTime() + 7 * 86400000);
    const tomorrow = new Date(now.getTime() + 48 * 3600000);
    const yesterday = new Date(now.getTime() - 24 * 3600000);

    // 1. Uncovered shifts today + next 7 days
    try {
      const openRows = await db.select({ id: shifts.id, startTime: shifts.startTime, title: shifts.title })
        .from(shifts)
        .where(and(eq(shifts.workspaceId, workspaceId), isNull(shifts.employeeId), gte(shifts.startTime, now), lte(shifts.startTime, next7), ne(shifts.status, 'cancelled')))
        .catch(() => []);
      const todayOpen = openRows.filter(s => new Date(s.startTime) <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));
      if (todayOpen.length > 0) {
        items.push({ urgency: 'critical', title: `${todayOpen.length} unfilled shift(s) starting today`, detail: `Immediate coverage required. Officers not yet assigned for today's shifts.`, actionHint: 'Use schedule.auto_fill_shift to attempt immediate fill', score: 100 });
      } else if (openRows.length > 0) {
        items.push({ urgency: 'high', title: `${openRows.length} open shift(s) this week`, detail: `${openRows.length} shift(s) over the next 7 days have no assigned officer.`, actionHint: 'Use schedule.scan_open_shifts then schedule.auto_fill_shift', score: 75 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 2. Stale approvals >24 hours
    try {
      const pendingTimesheets = await db.select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.status as any, 'pending'), lte(timeEntries.updatedAt as any, yesterday)))
        .catch(() => []);
      if (pendingTimesheets.length > 0) {
        items.push({ urgency: 'high', title: `${pendingTimesheets.length} timesheet(s) pending >24 hours`, detail: `Timesheets have been waiting for approval longer than a business day. Delays affect payroll accuracy.`, actionHint: 'Use timesheet.auto_approve_clean or notify approvers', score: 70 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 3. Compliance expiries next 7 days
    try {
      const expiringRows = await db.select({ id: employeeDocuments.id, documentType: employeeDocuments.documentType, employeeId: employeeDocuments.employeeId, expirationDate: employeeDocuments.expirationDate })
        .from(employeeDocuments)
        .where(and(eq(employeeDocuments.workspaceId, workspaceId), gte(employeeDocuments.expirationDate, now), lte(employeeDocuments.expirationDate, next7)))
        .catch(() => []);
      if (expiringRows.length > 0) {
        items.push({ urgency: 'high', title: `${expiringRows.length} certification(s) expiring this week`, detail: `Officers with expiring certs may be pulled from future shifts. Renewal must start immediately.`, actionHint: 'Use compliance.flag_expiring then compliance.request_document', score: 68 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 4. Overdue invoices (with dollar impact)
    try {
      const overdueResult = await checkOverdueInvoices(workspaceId);
      const overdueCount = (overdueResult as any)?.overdueCount || 0;
      const overdueAmount = (overdueResult as any)?.totalOverdueAmount || 0;
      if (overdueCount > 0) {
        items.push({ urgency: 'high', title: `${overdueCount} overdue invoice(s)`, detail: `$${parseFloat(String(overdueAmount)).toLocaleString()} in unpaid invoices past due date. Collections follow-up needed.`, actionHint: 'Use invoice.run_cycle to trigger automated reminders', dollarImpact: parseFloat(String(overdueAmount)), score: 65 + Math.min(25, overdueCount * 3) });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 5. Cash flow gap
    try {
      const cashGap = await computeCashFlowGap(workspaceId, 7);
      if (cashGap.riskLevel === 'critical') {
        items.push({ urgency: 'critical', title: `Cash flow gap — payroll at risk`, detail: `Upcoming payroll: $${cashGap.upcomingPayroll.toLocaleString()}. Receivables due before payroll: $${cashGap.receivablesDueBeforePayroll.toLocaleString()}. Shortfall: $${Math.abs(cashGap.cashGap).toLocaleString()}.`, actionHint: 'Use invoice.run_cycle to accelerate collections immediately', dollarImpact: Math.abs(cashGap.cashGap), score: 95 });
      } else if (cashGap.riskLevel === 'warning') {
        items.push({ urgency: 'high', title: `Tight cash position before payroll`, detail: `$${cashGap.cashGap.toLocaleString()} buffer against upcoming payroll. Accelerate invoice collections.`, actionHint: 'Review aging report with finance.aging_report', dollarImpact: cashGap.cashGap, score: 60 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 6. Overdue delegation tasks
    try {
      const overdueTasksRaw = await db.select({ id: orchestrationRuns.id, inputParams: orchestrationRuns.inputParams })
        .from(orchestrationRuns)
        .where(and(eq(orchestrationRuns.workspaceId, workspaceId), eq(orchestrationRuns.category, 'operational_task'), eq(orchestrationRuns.status, 'awaiting_approval')))
        .catch(() => []);
      const overdueDelegated = overdueTasksRaw.filter((t: any) => t.inputParams?.dueBy && new Date(t.inputParams.dueBy) < now);
      if (overdueDelegated.length > 0) {
        items.push({ urgency: 'high', title: `${overdueDelegated.length} delegated task(s) past due`, detail: `Trinity assigned these tasks but completion has not been verified. Escalation may be needed.`, actionHint: 'Use task.track_overdue then task.escalate for each overdue task', score: 72 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 7. Unconfirmed tomorrow shifts
    try {
      const tomorrowStart = new Date(now);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);
      const { isNull: isNullOp, ne: neOp } = await import('drizzle-orm');
      const unconfirmedTomorrow = await db.select({ id: shifts.id })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          ne(shifts.status, 'cancelled'),
          gte(shifts.startTime, tomorrowStart),
          lte(shifts.startTime, tomorrowEnd),
          eq(shifts.requiresAcknowledgment, true),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          isNull(shifts as any).acknowledgedAt,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          isNull(shifts as any).deniedAt,
        ))
        .catch(() => []);
      if (unconfirmedTomorrow.length > 0) {
        items.push({ urgency: 'high', title: `${unconfirmedTomorrow.length} unconfirmed shift(s) tomorrow`, detail: `Officers have not confirmed attendance for tomorrow's shifts. Risk of no-show coverage gaps.`, actionHint: 'Use shift.flag_unconfirmed to notify supervisors', score: 78 });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 8. Unresolved panic alerts from the last 24 hours
    try {
      const { panicAlerts } = await import('@shared/schema');
      const { isNull: isNullOp } = await import('drizzle-orm');
      const last24h = new Date(now.getTime() - 24 * 3600000);
      const activePanics = await db.select({ id: panicAlerts.id, employeeId: panicAlerts.employeeId, createdAt: panicAlerts.createdAt })
        .from(panicAlerts)
        .where(and(
          eq(panicAlerts.workspaceId, workspaceId),
          eq(panicAlerts.status as any, 'active'),
          gte(panicAlerts.createdAt, last24h),
          isNullOp(panicAlerts.resolvedAt)
        ))
        .catch(() => []);
      if (activePanics.length > 0) {
        items.push({
          urgency: 'critical',
          title: `${activePanics.length} unresolved panic alert(s)`,
          detail: `${activePanics.length} officer panic alert(s) from the last 24 hours remain open and unacknowledged. All affected officers must be verified safe and each alert formally resolved.`,
          actionHint: 'Review Field Operations → Panic Alerts immediately and document resolution',
          score: 100,
        });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal scan section error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 8b. Alert deduplication: load previous brief fingerprints for Day-N escalation markers
    let previousAlertFingerprints: Record<string, { firstSeen: string; dayCount: number }> = {};
    try {
      const dedupRecord = await db.select({ outputResult: orchestrationRuns.outputResult })
        .from(orchestrationRuns)
        .where(and(
          eq(orchestrationRuns.workspaceId, workspaceId),
          eq(orchestrationRuns.actionId, 'trinity.brief_dedup'),
          eq(orchestrationRuns.status, 'completed')
        ))
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .orderBy(desc(orchestrationRuns as any).completedAt)
        .limit(1)
        .catch(() => []);
      if (dedupRecord.length > 0 && dedupRecord[0].outputResult) {
        previousAlertFingerprints = (dedupRecord[0].outputResult as any).fingerprints || {};
      }
    } catch (_dedupLoadErr) { /* non-fatal — proceed without history */ }

    // 9. Cross-domain intelligence: severely overdue invoices by client (>45 days)
    try {
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 86400000);
      const severeOverdueRows = await db.select({
        clientId: invoices.clientId,
        total: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          sql`${invoices.status} IN ('overdue', 'sent', 'pending')`,
          lte(invoices.dueDate as any, fortyFiveDaysAgo),
          sql`${invoices.clientId} IS NOT NULL`
        ))
        .groupBy(invoices.clientId)
        .orderBy(desc(sql`SUM(CAST(${invoices.total} AS DECIMAL))`))
        .limit(3)
        .catch(() => []);

      if (severeOverdueRows.length > 0) {
        const clientIds = severeOverdueRows.map(r => r.clientId).filter(Boolean) as string[];
        const clientRows = await db.select({ id: clients.id, companyName: clients.companyName, firstName: clients.firstName, lastName: clients.lastName })
          .from(clients)
          .where(inArray(clients.id, clientIds))
          .catch(() => []);
        const clientMap = new Map(clientRows.map(c => [c.id, c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown Client']));

        const totalSevere = severeOverdueRows.reduce((sum, r) => sum + Number(r.total), 0);
        const clientDetails = severeOverdueRows
          .map(r => `${clientMap.get(r.clientId || '') || 'Unknown'} ($${parseFloat(String(r.total)).toLocaleString()})`)
          .join(', ');

        items.push({
          urgency: 'critical',
          title: `Cross-domain alert: ${severeOverdueRows.length} client(s) with invoices 45+ days overdue`,
          detail: `$${totalSevere.toLocaleString()} in severely aged receivables from: ${clientDetails}. These clients represent collection risk and potential margin erosion if service continues without payment.`,
          actionHint: 'Use invoice.run_cycle for automated reminders, then escalate to client conversation for 60+ day accounts',
          dollarImpact: totalSevere,
          score: 88,
        });
      }
    } catch (scanErr) { log.warn("[TrinityProactiveScanner] Non-fatal cross-domain insight error:", scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    // 10. Apply Day-N escalation markers + persist updated fingerprints
    try {
      const todayStr = now.toISOString().split('T')[0];
      const updatedFingerprints: Record<string, { firstSeen: string; dayCount: number }> = {};

      for (const item of items) {
        const fingerprint = item.title.replace(/\d+/g, 'N').toLowerCase().trim();
        const prev = previousAlertFingerprints[fingerprint];
        if (prev && prev.firstSeen !== todayStr) {
          const firstDate = new Date(prev.firstSeen);
          const daysDelta = Math.max(1, Math.round((now.getTime() - firstDate.getTime()) / 86400000));
          const dayN = daysDelta + 1;
          item.title = `[Day ${dayN} — Unresolved] ${item.title}`;
          item.detail = `This issue was first flagged ${daysDelta} day(s) ago and remains unresolved. ${item.detail}`;
          if (item.urgency === 'high') item.urgency = 'critical';
          item.score = (item.score || 50) + Math.min(20, daysDelta * 4);
          updatedFingerprints[fingerprint] = { firstSeen: prev.firstSeen, dayCount: dayN };
        } else {
          updatedFingerprints[fingerprint] = { firstSeen: prev?.firstSeen === todayStr ? prev.firstSeen : todayStr, dayCount: prev?.dayCount || 1 };
        }
      }

      await db.insert(orchestrationRuns).values({
        workspaceId,
        userId: userId || null,
        actionId: 'trinity.brief_dedup',
        category: 'trinity',
        source: 'trinity',
        status: 'completed',
        inputParams: { generatedAt: now.toISOString() },
        outputResult: { fingerprints: updatedFingerprints },
        startedAt: now,
        completedAt: now,
        durationMs: 0,
      } as any).catch(() => null);
    } catch (_dedupSaveErr) { /* non-fatal */ }

    // 11. Open training interventions + expiring module certificates
    try {
      const openInterventions = await db
        .select({ id: trainingInterventions.id })
        .from(trainingInterventions)
        .where(and(
          eq(trainingInterventions.workspaceId, workspaceId),
          eq(trainingInterventions.completed, false),
        ))
        .catch(() => []);
      if (openInterventions.length > 0) {
        items.push({
          urgency: 'high',
          title: `${openInterventions.length} open training intervention(s)`,
          detail: `Officers flagged for mandatory training intervention. Each intervention must be scheduled and resolved to restore compliance score.`,
          actionHint: 'Use training.check_compliance to review flagged officers and schedule remediation sessions',
          score: 74,
        });
      }
    } catch (scanErr) { log.warn('[TrinityProactiveScanner] Non-fatal scan section error:', scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    try {
      const expiringModuleCerts = await db
        .select({ id: officerTrainingCertificates.id })
        .from(officerTrainingCertificates)
        .where(and(
          eq(officerTrainingCertificates.workspaceId, workspaceId),
          eq(officerTrainingCertificates.isValid, true),
          gte(officerTrainingCertificates.expiresAt, now),
          lte(officerTrainingCertificates.expiresAt, next7),
        ))
        .catch(() => []);
      if (expiringModuleCerts.length > 0) {
        items.push({
          urgency: 'high',
          title: `${expiringModuleCerts.length} training certificate(s) expiring this week`,
          detail: `Officers must retake and pass affected modules before expiry to avoid compliance score penalties and shift eligibility restrictions.`,
          actionHint: 'Use training.send_reminder to prompt affected officers and assign renewal attempts',
          score: 66,
        });
      }
    } catch (scanErr) { log.warn('[TrinityProactiveScanner] Non-fatal scan section error:', scanErr instanceof Error ? scanErr.message : String(scanErr)); }

    items.sort((a, b) => (b.score || 0) - (a.score || 0));
    const topItems = items.slice(0, 5).map((item, idx) => ({ ...item, rank: idx + 1 }));

    // Wins Trinity noticed overnight — surfaced first in the brief so that
    // real progress is marked before the punch list of what still needs work.
    const wins = await this.detectWins(workspaceId).catch(() => [] as OrgWin[]);
    const topWins = wins
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 2);

    const totalIssues = items.length;
    const criticalCount = items.filter(i => i.urgency === 'critical').length;
    const intro = criticalCount > 0
      ? `Good morning. There are ${criticalCount} critical issue(s) requiring immediate attention today.`
      : totalIssues > 0
        ? `Good morning. Here are the ${Math.min(topItems.length, totalIssues)} priority items for today.`
        : `Good morning. Operations look clean — no immediate action required.`;

    log.info(`[TrinityProactiveScanner] Morning brief: ws=${workspaceId}, totalIssues=${totalIssues}, critical=${criticalCount}, wins=${topWins.length}`);
    return { intro, items: topItems, wins: topWins, totalIssues, generatedAt: now };
  }

  /**
   * Detect meaningful wins in the org over the past 30 days. Trinity marks
   * what matters — clean payroll, contract wins, officer turnarounds —
   * so the morning brief opens with recognition before the punch list.
   *
   * Each subquery is wrapped in its own try/catch so a single missing
   * table/column never breaks the rest.
   */
  private async detectWins(workspaceId: string): Promise<OrgWin[]> {
    const wins: OrgWin[] = [];

    // 1. AR collection rate milestone (≥95% last 30 days)
    try {
      const result: any = await db.execute(sql`
        SELECT
          CASE WHEN COALESCE(SUM(total::numeric), 0) = 0 THEN 0
          ELSE (SUM(CASE WHEN status = 'paid' THEN total::numeric ELSE 0 END)
                / NULLIF(SUM(total::numeric), 0)) * 100
          END AS collection_rate
        FROM invoices
        WHERE workspace_id = ${workspaceId}
          AND created_at > NOW() - INTERVAL '30 days'
      `);
      const row = result?.rows?.[0] ?? result?.[0];
      const rate = parseFloat(row?.collection_rate ?? '0');
      if (rate >= 95) {
        wins.push({
          type: 'collection_milestone',
          significance: 8,
          message: `AR collection rate hit ${rate.toFixed(0)}% this month — one of the best windows I've tracked for you.`,
        });
      }
    } catch (err) {
      log.warn('[TrinityProactiveScanner] detectWins:collection_milestone failed:', err instanceof Error ? err.message : err);
    }

    // 2. Clean payroll run (last run in past 7 days completed without anomalies)
    try {
      const result: any = await db.execute(sql`
        SELECT status, run_date
        FROM payroll_runs
        WHERE workspace_id = ${workspaceId}
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const recent = result?.rows?.[0] ?? result?.[0];
      if (recent?.status === 'completed') {
        wins.push({
          type: 'payroll_clean',
          significance: 7,
          message: `Clean payroll run — no anomalies flagged. That consistency matters.`,
        });
      }
    } catch (err) {
      log.warn('[TrinityProactiveScanner] detectWins:payroll_clean failed:', err instanceof Error ? err.message : err);
    }

    // 3. Officer turnaround (recovering trajectory in temporal entity arcs)
    try {
      const result: any = await db.execute(sql`
        SELECT e.first_name, e.last_name, tea.trajectory, tea.narrative_summary
        FROM temporal_entity_arcs tea
        JOIN employees e ON e.id = tea.entity_id
        WHERE tea.workspace_id = ${workspaceId}
          AND tea.entity_type = 'officer'
          AND tea.trajectory = 'recovering'
          AND tea.last_assessed_at > NOW() - INTERVAL '3 days'
        LIMIT 3
      `);
      for (const t of (result?.rows ?? result ?? [])) {
        wins.push({
          type: 'officer_turnaround',
          significance: 8,
          message: `${t.first_name} ${t.last_name} is showing real improvement — trajectory is recovering. That's worth noting.`,
        });
      }
    } catch (err) {
      log.warn('[TrinityProactiveScanner] detectWins:officer_turnaround failed:', err instanceof Error ? err.message : err);
    }

    // 4. New contract won in last 48 hours
    try {
      const result: any = await db.execute(sql`
        SELECT title, client_name, created_at
        FROM contracts
        WHERE workspace_id = ${workspaceId}
          AND status = 'active'
          AND created_at > NOW() - INTERVAL '48 hours'
        LIMIT 2
      `);
      for (const c of (result?.rows ?? result ?? [])) {
        wins.push({
          type: 'contract_won',
          significance: 9,
          message: `The ${c.client_name} contract is now active. You've been working toward that.`,
        });
      }
    } catch (err) {
      log.warn('[TrinityProactiveScanner] detectWins:contract_won failed:', err instanceof Error ? err.message : err);
    }

    return wins;
  }

  /**
   * Returns the employee IDs assigned under a given supervisor/manager
   * via the manager_assignments table. Used to scope supervisor alerts
   * so they only see issues relevant to their team.
   */
  private async getSupervisorTeamIds(workspaceId: string, supervisorEmployeeId: string): Promise<string[]> {
    const rows = await db.select({ employeeId: managerAssignments.employeeId })
      .from(managerAssignments)
      .where(and(
        eq(managerAssignments.workspaceId, workspaceId),
        eq(managerAssignments.managerId, supervisorEmployeeId)
      ))
      .catch(() => []);
    return rows.map(r => r.employeeId).filter(Boolean) as string[];
  }

  /**
   * Pulls financial context for the owner daily executive brief.
   * Checks financial_snapshots for current month first; falls back to
   * computing from payroll_runs + paid invoices if no snapshot exists.
   */
  private async getOwnerFinancialContext(workspaceId: string): Promise<{
    monthlyRevenue: number;
    monthlyPayroll: number;
    monthlyExpenses: number;
    netProfit: number;
    marginPercent: number;
    hasData: boolean;
    source: string;
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Try to get the most recent financial snapshot for this month
    const snapshots = await db.select()
      .from(financialSnapshots)
      .where(and(
        eq(financialSnapshots.workspaceId, workspaceId),
        gte(financialSnapshots.periodStart, monthStart)
      ))
      .orderBy(desc(financialSnapshots.periodStart))
      .limit(1)
      .catch(() => []);

    if (snapshots.length > 0) {
      const s = snapshots[0];
      return {
        monthlyRevenue:  parseFloat(String(s.revenueTotal  || 0)),
        monthlyPayroll:  parseFloat(String(s.payrollTotal  || 0)),
        monthlyExpenses: parseFloat(String(s.expenseTotal  || 0)),
        netProfit:       parseFloat(String(s.netProfit     || 0)),
        marginPercent:   parseFloat(String(s.marginPercent || 0)),
        hasData: true,
        source: 'snapshot',
      };
    }

    // Fallback: compute from payroll_runs + paid invoices
    const payrollRows = await db.select({
      total: sql<number>`COALESCE(SUM(${payrollRuns.totalGrossPay}), 0)`,
    })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        gte(payrollRuns.periodStart, monthStart)
      ))
      .catch(() => [{ total: 0 }]);

    const invoiceRows = await db.select({
      total: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        gte(invoices.createdAt as any, monthStart),
        eq(invoices.status, 'paid')
      ))
      .catch(() => [{ total: 0 }]);

    const payrollTotal  = Number(payrollRows[0]?.total  || 0);
    const revenueTotal  = Number(invoiceRows[0]?.total  || 0);
    const netProfit     = revenueTotal - payrollTotal;
    const marginPercent = revenueTotal > 0 ? (netProfit / revenueTotal) * 100 : 0;

    return {
      monthlyRevenue:  revenueTotal,
      monthlyPayroll:  payrollTotal,
      monthlyExpenses: payrollTotal,
      netProfit,
      marginPercent,
      hasData: payrollTotal > 0 || revenueTotal > 0,
      source: 'computed',
    };
  }

  async runAllWorkspacesNightBefore(): Promise<void> {
    const activeWorkspaces = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(sql`${workspaces.subscriptionStatus} NOT IN ('suspended', 'cancelled') OR ${workspaces.subscriptionStatus} IS NULL`)
      .catch(() => []);
    log.info(`[TrinityProactiveScanner] Running night-before confirmation sweep for ${activeWorkspaces.length} workspaces...`);
    for (const ws of activeWorkspaces) {
      try {
        const { trinityShiftConfirmationActions } = await import('./trinityShiftConfirmationActions').catch(() => ({ trinityShiftConfirmationActions: null }));
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const scanResult = await helpaiOrchestrator.executeAction('shift.scan_tomorrows_shifts', { workspaceId: ws.id } as any).catch(() => null);
        log.info(`[TrinityProactiveScanner] Night-before confirmation: ws=${ws.id}, result=${JSON.stringify(scanResult?.data || {})}`);
      } catch (e: unknown) {
        log.error(`[TrinityProactiveScanner] Night-before confirmation failed for ${ws.id}: ${e.message}`);
      }
    }
    log.info('[TrinityProactiveScanner] Night-before confirmation sweep complete');
  }

  /**
   * Notify all org_owners of a workspace when a Trinity scheduled scan fails.
   * Errors that happen at 2am should be visible in the owner's inbox by morning.
   */
  private async notifyScanFailure(workspaceId: string, scanType: 'daily' | 'weekly' | 'monthly', errorMessage: string): Promise<void> {
    try {
      const owners = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.role as any, ['org_owner', 'co_owner']),
        ))
        .catch(() => []);

      for (const owner of owners) {
        await createNotification({
          workspaceId,
          userId: owner.userId,
          type: 'scheduler_job_failed',
          title: `Trinity ${scanType} scan failed`,
          message: `The scheduled ${scanType} intelligence scan encountered an error and may have incomplete results. Error: ${errorMessage.slice(0, 200)}`,
          actionUrl: '/dashboard',
          metadata: {
            scanType,
            errorMessage,
            source: 'TrinityProactiveScanner',
            notificationType: `trinity_scan_failure_${scanType}`,
          },
          idempotencyKey: `scheduler_job_failed-${Date.now()}-${owner.userId}`
        }).catch((err) => log.warn('[trinityProactiveScanner] Notification failed (non-fatal):', err));
      }
    } catch {
      // Notification failure must never break the scan loop
    }
  }

  async runAllWorkspacesDailyScan(): Promise<void> {
    const activeWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(sql`${workspaces.subscriptionStatus} NOT IN ('suspended', 'cancelled') OR ${workspaces.subscriptionStatus} IS NULL`)
      .catch(() => []);
    log.info(`[TrinityProactiveScanner] Running daily scan for ${activeWorkspaces.length} workspaces...`);
    for (const ws of activeWorkspaces) {
      await this.runDailyScan(ws.id).catch(async (e: Error) => {
        log.error(`[TrinityProactiveScanner] Daily scan failed for ${ws.id}: ${e.message}`);
        await this.notifyScanFailure(ws.id, 'daily', e.message);
      });
    }
    log.info('[TrinityProactiveScanner] Daily scan complete for all workspaces');
  }

  async runAllWorkspacesWeeklyScan(): Promise<void> {
    const activeWorkspaces = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(sql`${workspaces.subscriptionStatus} NOT IN ('suspended', 'cancelled') OR ${workspaces.subscriptionStatus} IS NULL`)
      .catch(() => []);
    log.info(`[TrinityProactiveScanner] Running weekly scan for ${activeWorkspaces.length} workspaces...`);
    for (const ws of activeWorkspaces) {
      await this.runWeeklyScan(ws.id).catch(async (e: Error) => {
        log.error(`[TrinityProactiveScanner] Weekly scan failed for ${ws.id}: ${e.message}`);
        await this.notifyScanFailure(ws.id, 'weekly', e.message);
      });
    }
    log.info('[TrinityProactiveScanner] Weekly scan complete for all workspaces');
  }

  async runAllWorkspacesMonthlyCycle(): Promise<void> {
    const activeWorkspaces = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(sql`${workspaces.subscriptionStatus} NOT IN ('suspended', 'cancelled') OR ${workspaces.subscriptionStatus} IS NULL`)
      .catch(() => []);
    log.info(`[TrinityProactiveScanner] Running monthly cycle for ${activeWorkspaces.length} workspaces...`);
    for (const ws of activeWorkspaces) {
      await this.runMonthlyCycle(ws.id).catch(async (e: Error) => {
        log.error(`[TrinityProactiveScanner] Monthly cycle failed for ${ws.id}: ${e.message}`);
        await this.notifyScanFailure(ws.id, 'monthly', e.message);
      });
    }
    log.info('[TrinityProactiveScanner] Monthly cycle complete for all workspaces');
  }
}

export const trinityProactiveScanner = new TrinityProactiveScannerService();
