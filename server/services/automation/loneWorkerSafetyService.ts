import { db } from '../../db';
import { timeEntries, employees, welfareChecks as welfareChecksTable } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';
import { fieldOpsConfigRegistry } from '@shared/config/fieldOperationsConfig';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { withDistributedLock, LOCK_KEYS } from '../distributedLock';

const log = createLogger('LoneWorkerSafety');

const WELFARE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CHECK_IN_DEADLINE_MS = 10 * 60 * 1000;
const ESCALATION_LEVELS = ['supervisor', 'manager', 'emergency'] as const;
const SERVICE_POLL_INTERVAL_MS = 2 * 60 * 1000;

type EscalationLevel = typeof ESCALATION_LEVELS[number];

interface WelfareCheck {
  id: string;
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  sentAt: Date;
  deadline: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  escalationLevel: EscalationLevel | null;
  escalatedAt: Date | null;
  resolved: boolean;
}

interface LoneWorkerSession {
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  startedAt: Date;
  lastCheckIn: Date;
  nextCheckDue: Date;
  activeWelfareCheck: WelfareCheck | null;
  missedChecks: number;
}

class LoneWorkerSafetyService {
  private static instance: LoneWorkerSafetyService;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private sessions = new Map<string, LoneWorkerSession>();
  private welfareChecks = new Map<string, WelfareCheck>();
  private lastRunTime: Date | null = null;
  private stats = {
    totalChecksSent: 0,
    totalAcknowledged: 0,
    totalEscalations: 0,
    activeSessions: 0,
  };

  private constructor() {}

  static getInstance(): LoneWorkerSafetyService {
    if (!this.instance) {
      this.instance = new LoneWorkerSafetyService();
    }
    return this.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.info('Already running');
      return;
    }

    log.info('Starting lone worker safety monitoring...');
    this.isRunning = true;

    // Reload any open welfare checks from DB before first cycle
    // so checks that were active before a server restart are not lost
    await this.loadActiveChecksFromDb();

    await this.runCycle();

    this.intervalId = setInterval(async () => {
      try {
        await withDistributedLock(LOCK_KEYS.LONE_WORKER_SAFETY, 'LoneWorkerSafety', () => this.runCycle());
      } catch (error: any) {
        log.error('Monitoring cycle failed (will retry)', { error: error?.message });
      }
    }, SERVICE_POLL_INTERVAL_MS);

    log.info('Service started — monitoring lone workers (distributed lock: LONE_WORKER_SAFETY)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    log.info('Stopped');
  }

  getStatus() {
    return {
      running: this.isRunning,
      lastRun: this.lastRunTime,
      stats: { ...this.stats, activeSessions: this.sessions.size },
      activeSessions: Array.from(this.sessions.values()).map((s) => ({
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        shiftId: s.shiftId,
        nextCheckDue: s.nextCheckDue,
        missedChecks: s.missedChecks,
        hasActiveCheck: !!s.activeWelfareCheck,
      })),
    };
  }

  async startForEmployee(
    employeeId: string,
    workspaceId: string,
    timeEntryId: string,
  ): Promise<void> {
    const config = fieldOpsConfigRegistry.getConfig(workspaceId);
    if (!config?.presenceMonitoring?.enabled) return;

    const existingSessionKey = this.findSessionKeyByEmployee(employeeId);
    if (existingSessionKey) return;

    const [employee] = await db.select({
      firstName: employees.firstName,
      lastName: employees.lastName,
    }).from(employees).where(
      and(
        eq(employees.id, employeeId),
        eq(employees.workspaceId, workspaceId),
      )
    ).limit(1);
    if (!employee) return;

    const employeeName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Officer';
    const now = new Date();
    const sessionKey = `${employeeId}:${timeEntryId}`;

    this.sessions.set(sessionKey, {
      workspaceId,
      employeeId,
      employeeName,
      shiftId: timeEntryId,
      startedAt: now,
      lastCheckIn: now,
      nextCheckDue: new Date(now.getTime() + WELFARE_CHECK_INTERVAL_MS),
      activeWelfareCheck: null,
      missedChecks: 0,
    });

    log.info(`[LoneWorker] Started monitoring employeeId=${employeeId}`);
  }

  async stopForEmployee(employeeId: string, workspaceId: string): Promise<void> {
    const sessionKey = this.findSessionKeyByEmployee(employeeId);
    if (sessionKey) {
      this.sessions.delete(sessionKey);
    }

    for (const [checkId, check] of this.welfareChecks.entries()) {
      if (check.employeeId !== employeeId || check.workspaceId !== workspaceId) continue;
      check.resolved = true;
      check.acknowledged = true;
      check.acknowledgedAt = new Date();
      await this.persistCheck(check);
      this.welfareChecks.delete(checkId);
    }

    log.info(`[LoneWorker] Stopped monitoring employeeId=${employeeId}`);
  }

  // ─── DB persistence helpers ───────────────────────────────────────────────

  /**
   * On startup, reload all open (unresolved) welfare checks from the DB into
   * the in-memory map. This survives server restarts without losing state.
   */
  private async loadActiveChecksFromDb(): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(welfareChecksTable)
        .where(eq(welfareChecksTable.resolved, false));

      for (const row of rows) {
        const check: WelfareCheck = {
          id: row.id,
          workspaceId: row.workspaceId,
          employeeId: row.employeeId,
          employeeName: row.employeeName || '',
          shiftId: row.shiftId || '',
          sentAt: row.sentAt,
          deadline: row.deadline,
          acknowledged: row.acknowledged ?? false,
          acknowledgedAt: row.acknowledgedAt ?? null,
          escalationLevel: (row.escalationLevel as EscalationLevel | null) ?? null,
          escalatedAt: row.escalatedAt ?? null,
          resolved: row.resolved ?? false,
        };
        this.welfareChecks.set(check.id, check);
      }

      log.info('Loaded active welfare checks from DB', { count: rows.length });
    } catch (error: any) {
      log.error('Failed to load active welfare checks from DB', { error: error?.message });
    }
  }

  private async persistCheck(check: WelfareCheck): Promise<void> {
    try {
      await db
        .insert(welfareChecksTable)
        .values({
          id: check.id,
          workspaceId: check.workspaceId,
          employeeId: check.employeeId,
          employeeName: check.employeeName,
          shiftId: check.shiftId,
          sentAt: check.sentAt,
          deadline: check.deadline,
          acknowledged: check.acknowledged,
          acknowledgedAt: check.acknowledgedAt,
          escalationLevel: check.escalationLevel,
          escalatedAt: check.escalatedAt,
          resolved: check.resolved,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: welfareChecksTable.id,
          set: {
            acknowledged: check.acknowledged,
            acknowledgedAt: check.acknowledgedAt,
            escalationLevel: check.escalationLevel,
            escalatedAt: check.escalatedAt,
            resolved: check.resolved,
            resolvedAt: check.resolved ? new Date() : undefined,
            updatedAt: new Date(),
          },
        });
    } catch (error: any) {
      log.error('Failed to persist welfare check', { checkId: check.id, error: error?.message });
    }
  }

  // ─── Core cycle ───────────────────────────────────────────────────────────

  private async runCycle(): Promise<void> {
    const now = new Date();
    this.lastRunTime = now;

    await this.detectLoneWorkers(now);
    await this.processScheduledChecks(now);
    await this.processEscalations(now);
    this.cleanupResolvedSessions();
  }

  private async detectLoneWorkers(now: Date): Promise<void> {
    try {
      const windowStart = new Date(now.getTime() - 60 * 60 * 1000);

      const activeEntries = await db
        .select({
          timeEntry: timeEntries,
          employee: employees,
        })
        .from(timeEntries)
        .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
        .where(
          and(
            gte(timeEntries.clockIn, windowStart),
            eq(employees.isActive, true)
          )
        );

      const siteWorkerCounts = new Map<string, string[]>();
      for (const { timeEntry } of activeEntries) {
        const siteKey = `${timeEntry.workspaceId}:${timeEntry.siteId || 'unknown'}`;
        if (!siteWorkerCounts.has(siteKey)) {
          siteWorkerCounts.set(siteKey, []);
        }
        siteWorkerCounts.get(siteKey)!.push(timeEntry.employeeId);
      }

      for (const { timeEntry, employee } of activeEntries) {
        const siteKey = `${timeEntry.workspaceId}:${timeEntry.siteId || 'unknown'}`;
        const workersAtSite = siteWorkerCounts.get(siteKey) || [];
        const sessionKey = `${timeEntry.employeeId}:${timeEntry.shiftId || timeEntry.id}`;

        if (workersAtSite.length <= 1 && !this.sessions.has(sessionKey)) {
          // Recover any in-progress welfare check for this employee (e.g. from before restart)
          const existingCheck = this.findOpenCheckByEmployee(timeEntry.employeeId);

          const session: LoneWorkerSession = {
            workspaceId: timeEntry.workspaceId,
            employeeId: timeEntry.employeeId,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            shiftId: timeEntry.shiftId || timeEntry.id.toString(),
            startedAt: now,
            lastCheckIn: now,
            nextCheckDue: existingCheck
              ? existingCheck.deadline  // use existing deadline so it isn't reset
              : new Date(now.getTime() + WELFARE_CHECK_INTERVAL_MS),
            activeWelfareCheck: existingCheck ?? null,
            missedChecks: 0,
          };
          this.sessions.set(sessionKey, session);
          log.info('Lone worker detected', {
            employee: session.employeeName,
            site: timeEntry.siteId,
            restoredCheck: !!existingCheck,
          });
        } else if (workersAtSite.length > 1 && this.sessions.has(sessionKey)) {
          this.sessions.delete(sessionKey);
        }
      }
    } catch (error: any) {
      log.error('Failed to detect lone workers', { error: error?.message });
    }
  }

  private async processScheduledChecks(now: Date): Promise<void> {
    for (const [sessionKey, session] of this.sessions) {
      if (session.activeWelfareCheck && !session.activeWelfareCheck.acknowledged) {
        continue;
      }

      if (now >= session.nextCheckDue) {
        await this.sendWelfareCheck(sessionKey, session, now);
      }
    }
  }

  private async sendWelfareCheck(
    sessionKey: string,
    session: LoneWorkerSession,
    now: Date
  ): Promise<void> {
    const checkId = `wc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const deadline = new Date(now.getTime() + CHECK_IN_DEADLINE_MS);

    const check: WelfareCheck = {
      id: checkId,
      workspaceId: session.workspaceId,
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      shiftId: session.shiftId,
      sentAt: now,
      deadline,
      acknowledged: false,
      acknowledgedAt: null,
      escalationLevel: null,
      escalatedAt: null,
      resolved: false,
    };

    session.activeWelfareCheck = check;
    session.nextCheckDue = new Date(now.getTime() + WELFARE_CHECK_INTERVAL_MS);
    this.welfareChecks.set(checkId, check);
    this.stats.totalChecksSent++;

    // Persist to DB so the check survives server restarts
    await this.persistCheck(check);

    broadcastToWorkspace(session.workspaceId, {
      type: 'lone_worker_welfare_check',
      checkId,
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      shiftId: session.shiftId,
      deadline: deadline.toISOString(),
      message: 'Safety check-in required. Please confirm you are safe.',
    });

    log.info('Welfare check sent', {
      checkId,
      employee: session.employeeName,
      deadline: deadline.toISOString(),
    });
  }

  async acknowledgeWelfareCheck(checkId: string, employeeId: string): Promise<boolean> {
    const check = this.welfareChecks.get(checkId);
    if (!check) {
      // Attempt to load from DB in case this arrived on a fresh instance
      try {
        const [row] = await db
          .select()
          .from(welfareChecksTable)
          .where(eq(welfareChecksTable.id, checkId))
          .limit(1);
        if (!row) {
          log.warn('Unknown welfare check', { checkId });
          return false;
        }
        if (row.employeeId !== employeeId) {
          log.warn('Employee mismatch for welfare check (DB lookup)', { checkId, employeeId });
          return false;
        }
        if (row.acknowledged) return true;
        // Reconstruct in-memory object and fall through
        const reconstructed: WelfareCheck = {
          id: row.id,
          workspaceId: row.workspaceId,
          employeeId: row.employeeId,
          employeeName: row.employeeName || '',
          shiftId: row.shiftId || '',
          sentAt: row.sentAt,
          deadline: row.deadline,
          acknowledged: row.acknowledged ?? false,
          acknowledgedAt: row.acknowledgedAt ?? null,
          escalationLevel: (row.escalationLevel as EscalationLevel | null) ?? null,
          escalatedAt: row.escalatedAt ?? null,
          resolved: row.resolved ?? false,
        };
        this.welfareChecks.set(checkId, reconstructed);
        return this.acknowledgeWelfareCheck(checkId, employeeId);
      } catch (err: any) {
        log.error('DB lookup failed for welfare check', { checkId, error: err?.message });
        return false;
      }
    }

    if (check.employeeId !== employeeId) {
      log.warn('Employee mismatch for welfare check', { checkId, employeeId });
      return false;
    }

    if (check.acknowledged) {
      return true;
    }

    const now = new Date();
    check.acknowledged = true;
    check.acknowledgedAt = now;
    check.resolved = true;
    this.stats.totalAcknowledged++;

    // Persist acknowledgement to DB
    await this.persistCheck(check);

    const sessionKey = this.findSessionKeyByEmployee(employeeId);
    if (sessionKey) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.lastCheckIn = now;
        session.activeWelfareCheck = null;
        session.missedChecks = 0;
      }
    }

    broadcastToWorkspace(check.workspaceId, {
      type: 'lone_worker_check_acknowledged',
      checkId,
      employeeId: check.employeeId,
      employeeName: check.employeeName,
      acknowledgedAt: now.toISOString(),
    });

    log.info('Welfare check acknowledged', {
      checkId,
      employee: check.employeeName,
    });

    return true;
  }

  private async processEscalations(now: Date): Promise<void> {
    for (const [checkId, check] of this.welfareChecks) {
      if (check.acknowledged || check.resolved) continue;
      if (now < check.deadline) continue;

      const currentLevel = check.escalationLevel;
      let nextLevel: EscalationLevel;

      if (!currentLevel) {
        nextLevel = 'supervisor';
      } else if (currentLevel === 'supervisor') {
        nextLevel = 'manager';
      } else if (currentLevel === 'manager') {
        nextLevel = 'emergency';
      } else {
        continue;
      }

      await this.escalate(check, nextLevel, now);

      if (nextLevel !== 'emergency') {
        check.deadline = new Date(now.getTime() + CHECK_IN_DEADLINE_MS);
        // Persist updated deadline to DB
        await this.persistCheck(check);
      }
    }
  }

  private async escalate(
    check: WelfareCheck,
    level: EscalationLevel,
    now: Date
  ): Promise<void> {
    check.escalationLevel = level;
    check.escalatedAt = now;
    this.stats.totalEscalations++;

    // Persist escalation to DB immediately
    await this.persistCheck(check);

    const sessionKey = this.findSessionKeyByEmployee(check.employeeId);
    if (sessionKey) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.missedChecks++;
      }
    }

    const severityMap: Record<EscalationLevel, 'warning' | 'critical'> = {
      supervisor: 'warning',
      manager: 'critical',
      emergency: 'critical',
    };

    const messageMap: Record<EscalationLevel, string> = {
      supervisor: `Lone worker ${check.employeeName} has not responded to welfare check. Supervisor notified.`,
      manager: `ESCALATION: ${check.employeeName} still unresponsive after supervisor notification. Manager alerted.`,
      emergency: `EMERGENCY: ${check.employeeName} has not responded to multiple welfare checks. Immediate attention required.`,
    };

    broadcastToWorkspace(check.workspaceId, {
      type: 'lone_worker_escalation',
      checkId: check.id,
      employeeId: check.employeeId,
      employeeName: check.employeeName,
      escalationLevel: level,
      severity: severityMap[level],
      message: messageMap[level],
      timestamp: now.toISOString(),
    });

    try {
      // ROUTING POLICY: Lone worker escalation uses tiered role targeting.
      // supervisor level → supervisors and managers only (NOT owners)
      // manager level    → managers only (NOT owners)
      // emergency level  → all roles including owners (genuine emergency)
      const targetRoles: string[] = level === 'emergency'
        ? ['org_owner', 'co_owner', 'manager', 'supervisor', 'department_manager']
        : level === 'manager'
          ? ['manager', 'department_manager']
          : ['supervisor', 'manager', 'department_manager'];

      const recipients = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, check.workspaceId),
            (employees as any).workspaceRole
          )
        );

      const filteredRecipients = recipients.filter(r =>
        r.workspaceRole && targetRoles.includes(r.workspaceRole)
      );

      for (const recipient of filteredRecipients) {
        if (recipient.userId) {
          await universalNotificationEngine.sendNotification({
            workspaceId: check.workspaceId,
            userId: recipient.userId,
            type: 'issue_detected',
            title: `Lone Worker Alert: ${check.employeeName}`,
            message: messageMap[level],
            severity: severityMap[level],
            metadata: {
              checkId: check.id,
              employeeId: check.employeeId,
              employeeName: check.employeeName,
              escalationLevel: level,
              source: 'lone_worker_safety_service',
            },
          });
        }
      }
    } catch (error: any) {
      log.error('Failed to notify for escalation', { error: error?.message });
    }

    log.warn('Welfare check escalated via UNE', {
      checkId: check.id,
      employee: check.employeeName,
      level,
    });
  }

  resolveCheck(checkId: string): boolean {
    const check = this.welfareChecks.get(checkId);
    if (!check) return false;

    check.resolved = true;
    check.acknowledged = true;
    check.acknowledgedAt = new Date();

    // Persist resolution to DB (fire-and-forget, non-blocking)
    this.persistCheck(check).catch(err =>
      log.error('Failed to persist resolve', { checkId, error: err?.message })
    );

    const sessionKey = this.findSessionKeyByEmployee(check.employeeId);
    if (sessionKey) {
      const session = this.sessions.get(sessionKey);
      if (session) {
        session.activeWelfareCheck = null;
        session.missedChecks = 0;
      }
    }

    broadcastToWorkspace(check.workspaceId, {
      type: 'lone_worker_check_resolved',
      checkId: check.id,
      employeeId: check.employeeId,
      employeeName: check.employeeName,
      resolvedAt: new Date().toISOString(),
    });

    return true;
  }

  endSession(employeeId: string): boolean {
    const sessionKey = this.findSessionKeyByEmployee(employeeId);
    if (!sessionKey) return false;

    const session = this.sessions.get(sessionKey);
    if (session?.activeWelfareCheck) {
      const check = session.activeWelfareCheck;
      check.resolved = true;
      this.persistCheck(check).catch(err =>
        log.error('Failed to persist end-session resolve', { checkId: check.id, error: err?.message })
      );
      this.welfareChecks.delete(check.id);
    }
    this.sessions.delete(sessionKey);
    return true;
  }

  private findSessionKeyByEmployee(employeeId: string): string | undefined {
    for (const [key, session] of this.sessions) {
      if (session.employeeId === employeeId) return key;
    }
    return undefined;
  }

  private findOpenCheckByEmployee(employeeId: string): WelfareCheck | null {
    for (const check of this.welfareChecks.values()) {
      if (check.employeeId === employeeId && !check.resolved) {
        return check;
      }
    }
    return null;
  }

  private cleanupResolvedSessions(): void {
    const staleThreshold = Date.now() - 12 * 60 * 60 * 1000;
    for (const [id, check] of this.welfareChecks) {
      if (check.resolved && check.sentAt.getTime() < staleThreshold) {
        this.welfareChecks.delete(id);
      }
    }
  }
}

export const loneWorkerSafetyService = LoneWorkerSafetyService.getInstance();
