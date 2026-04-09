/**
 * TRINITY ORG INTELLIGENCE SERVICE
 * ==================================
 * Per-org autonomous learning engine that gives Trinity deep understanding of each
 * organization's operations, habits, cycles, and patterns.
 *
 * Capabilities:
 * 1. ORG PATTERN LEARNING: Detects and stores payroll cycles, scheduling patterns,
 *    common issues, and operational rhythms per workspace
 * 2. AUTONOMOUS BOT DELEGATION: Trinity proactively delegates tasks to system bots
 *    based on detected patterns and incoming signals — not just user requests
 * 3. BOT RESULT TRACKING: Tracks delegated bot tasks, receives callbacks, iterates
 *    on failures, and reports results back to sessions
 * 4. ISSUE RESOLUTION PIPELINE: 7-step autonomous resolution (detect→analyze→delegate→
 *    execute→verify→iterate→close) with escalation to humans when needed
 * 5. CROSS-SESSION LEARNING: Org insights persist across sessions and inform future
 *    autonomous decisions
 *
 * ISOLATION:
 * - Every piece of data is scoped to a workspaceId
 * - No cross-org data access is permitted
 * - orgDataPrivacyGuard validates all data requests
 */

import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { helpAIOrchestrator, type BotSummonRequest } from '../helpai/helpAIOrchestrator';
import {
  workspaces,
  employees,
  shifts,
  timeEntries,
  invoices,
  invoicePayments,
  payrollRuns,
  payrollEntries,
  helpaiSessions,
  helpaiActionLog,
  workspaceMembers,
  trinityConversationSessions,
  trinityConversationTurns,
  clients,
  clientBillingSettings,
} from '@shared/schema';
import { eq, and, desc, gte, sql, count, lt, isNotNull, inArray } from 'drizzle-orm';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityOrgIntelligenceService');

export interface OrgPattern {
  workspaceId: string;
  patternType: OrgPatternType;
  patternKey: string;
  value: Record<string, any>;
  confidence: number;
  learnedAt: Date;
  lastConfirmedAt: Date;
  lastDecayedAt?: Date;
  occurrences: number;
}

export type OrgPatternType =
  | 'payroll_cycle'
  | 'scheduling_rhythm'
  | 'common_issue'
  | 'peak_hours'
  | 'staffing_gap'
  | 'invoice_cycle'
  | 'escalation_pattern'
  | 'bot_usage'
  | 'user_behavior'
  | 'employee_habit'
  | 'management_preference'
  | 'report_insight'
  | 'conversation_learning'
  | 'billing_config_change'
  | 'payroll_config_change'
  | 'client_rate_change'
  | 'bonus_pattern'
  | 'tax_filing_reminder';

export interface BotDelegationTask {
  id: string;
  sessionId: string;
  workspaceId: string;
  userId?: string;
  botName: BotSummonRequest['botName'];
  command: string;
  instructions: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  result?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  parentTaskId?: string;
}

export interface IssueResolution {
  id: string;
  workspaceId: string;
  sessionId?: string;
  issueType: string;
  description: string;
  phase: 'detect' | 'analyze' | 'delegate' | 'execute' | 'verify' | 'iterate' | 'close';
  delegatedTo?: string;
  taskId?: string;
  resolution?: string;
  resolved: boolean;
  escalated: boolean;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ImprovementSuggestion {
  id: string;
  workspaceId: string;
  category: 'staffing' | 'scheduling' | 'financial' | 'compliance' | 'performance' | 'operational' | 'training';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  basedOnPatterns: string[];
  createdAt: Date;
  surfacedAt?: Date;
  dismissedAt?: Date;
}

class TrinityOrgIntelligenceService {
  private orgPatterns: Map<string, OrgPattern[]> = new Map();
  private activeTasks: Map<string, BotDelegationTask> = new Map();
  private activeResolutions: Map<string, IssueResolution> = new Map();
  private learningCooldown: Map<string, number> = new Map();
  private improvementSuggestions: Map<string, ImprovementSuggestion[]> = new Map();
  private hierarchyCache: Map<string, { context: string; fetchedAt: number }> = new Map();
  private static HIERARCHY_CACHE_TTL = 5 * 60 * 1000;
  private static HIERARCHY_CACHE_MAX = 50;

  constructor() {
    this.subscribeToEvents();
    log.info('[TrinityOrgIntel] Org Intelligence Service initialized');
  }

  private subscribeToEvents() {
    platformEventBus.subscribe('bot_command_executed' as any, {
      name: 'TrinityOrgIntel-BotResult',
      handler: async (event) => {
        await this.handleBotResult(event.metadata || {});
      },
    });

    platformEventBus.subscribe('schedule_published' as any, {
      name: 'TrinityOrgIntel-SchedulePublished',
      handler: async (event) => {
        if (event.workspaceId) {
          await this.learnSchedulingPattern(event.workspaceId, event.metadata || {});
        }
      },
    });

    platformEventBus.subscribe('automation_completed', {
      name: 'TrinityOrgIntel-PayrollCompleted',
      handler: async (event) => {
        if (event.metadata?.type === 'payroll' && event.workspaceId) {
          await this.learnPayrollCycle(event.workspaceId, event.metadata || {});
        }
      },
    });
  }

  // --------------------------------------------------------------------------
  // ORG PATTERN LEARNING
  // --------------------------------------------------------------------------

  async learnOrgPatterns(workspaceId: string): Promise<OrgPattern[]> {
    const cooldownKey = `learn:${workspaceId}`;
    const lastLearn = this.learningCooldown.get(cooldownKey);
    if (lastLearn && Date.now() - lastLearn < 300_000) {
      return this.orgPatterns.get(workspaceId) || [];
    }
    this.learningCooldown.set(cooldownKey, Date.now());

    const patterns: OrgPattern[] = [];
    const now = new Date();

    try {
      const payrollPattern = await this.detectPayrollCycle(workspaceId);
      if (payrollPattern) patterns.push(payrollPattern);

      const schedulePattern = await this.detectSchedulingRhythm(workspaceId);
      if (schedulePattern) patterns.push(schedulePattern);

      const peakPattern = await this.detectPeakHours(workspaceId);
      if (peakPattern) patterns.push(peakPattern);

      const issuePatterns = await this.detectCommonIssues(workspaceId);
      patterns.push(...issuePatterns);

      const invoicePattern = await this.detectInvoiceCycle(workspaceId);
      if (invoicePattern) patterns.push(invoicePattern);

      const employeeHabits = await this.detectEmployeeHabits(workspaceId);
      patterns.push(...employeeHabits);

      const managementPatterns = await this.detectManagementPatterns(workspaceId);
      patterns.push(...managementPatterns);

      const reportInsights = await this.learnFromReports(workspaceId);
      patterns.push(...reportInsights);

      const conversationLearnings = await this.learnFromConversations(workspaceId);
      patterns.push(...conversationLearnings);

      const financialConfigPatterns = await this.detectFinancialConfigPatterns(workspaceId);
      patterns.push(...financialConfigPatterns);

      const taxReminders = this.generateTaxFilingReminders(workspaceId);
      patterns.push(...taxReminders);

      this.orgPatterns.set(workspaceId, patterns);
      log.info(`[TrinityOrgIntel] Learned ${patterns.length} patterns for workspace ${workspaceId}`);

      return patterns;
    } catch (err: any) {
      log.error(`[TrinityOrgIntel] Pattern learning failed for ${workspaceId}:`, (err instanceof Error ? err.message : String(err)));
      return this.orgPatterns.get(workspaceId) || [];
    }
  }

  private async detectPayrollCycle(workspaceId: string): Promise<OrgPattern | null> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const runs = await db.select({
        createdAt: payrollRuns.createdAt,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
      })
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.createdAt, thirtyDaysAgo)
        ))
        .orderBy(desc(payrollRuns.createdAt))
        .limit(10);

      if (runs.length < 2) return null;

      const intervals: number[] = [];
      for (let i = 1; i < runs.length; i++) {
        const diff = new Date(runs[i - 1].createdAt!).getTime() - new Date(runs[i].createdAt!).getTime();
        intervals.push(Math.round(diff / (24 * 60 * 60 * 1000)));
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      let cycleType = 'unknown';
      if (avgInterval >= 12 && avgInterval <= 16) cycleType = 'biweekly';
      else if (avgInterval >= 6 && avgInterval <= 8) cycleType = 'weekly';
      else if (avgInterval >= 28 && avgInterval <= 32) cycleType = 'monthly';
      else if (avgInterval >= 13 && avgInterval <= 17) cycleType = 'semi-monthly';

      return {
        workspaceId,
        patternType: 'payroll_cycle',
        patternKey: 'payroll_frequency',
        value: {
          cycleType,
          avgIntervalDays: Math.round(avgInterval),
          recentRunCount: runs.length,
          lastRunDate: runs[0]?.createdAt,
        },
        confidence: cycleType !== 'unknown' ? 0.85 : 0.5,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: runs.length,
      };
    } catch { return null; }
  }

  private async detectSchedulingRhythm(workspaceId: string): Promise<OrgPattern | null> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentShifts = await db.select({
        cnt: count(),
      })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, sevenDaysAgo)
        ));

      const totalShifts = Number(recentShifts[0]?.cnt || 0);

      const [empCount] = await db.select({ cnt: count() })
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.status, 'active')
        ));

      const activeEmployees = Number(empCount?.cnt || 0);
      const shiftsPerEmployee = activeEmployees > 0 ? totalShifts / activeEmployees : 0;

      return {
        workspaceId,
        patternType: 'scheduling_rhythm',
        patternKey: 'weekly_scheduling',
        value: {
          weeklyShiftCount: totalShifts,
          activeEmployees,
          avgShiftsPerEmployee: Math.round(shiftsPerEmployee * 10) / 10,
          schedulingDensity: totalShifts > 50 ? 'heavy' : totalShifts > 20 ? 'moderate' : 'light',
        },
        confidence: totalShifts > 5 ? 0.8 : 0.4,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: totalShifts,
      };
    } catch { return null; }
  }

  private async detectPeakHours(workspaceId: string): Promise<OrgPattern | null> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const entries = await db.select({
        clockIn: timeEntries.clockIn,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, thirtyDaysAgo)
        ))
        .limit(500);

      if (entries.length < 10) return null;

      const hourBuckets = new Array(24).fill(0);
      for (const entry of entries) {
        if (entry.clockIn) {
          const hour = new Date(entry.clockIn).getHours();
          hourBuckets[hour]++;
        }
      }

      const maxHour = hourBuckets.indexOf(Math.max(...hourBuckets));
      const peakRange = [Math.max(0, maxHour - 1), Math.min(23, maxHour + 1)];

      return {
        workspaceId,
        patternType: 'peak_hours',
        patternKey: 'clock_in_peak',
        value: {
          peakHour: maxHour,
          peakRange,
          distribution: hourBuckets,
          sampleSize: entries.length,
        },
        confidence: entries.length > 50 ? 0.9 : 0.6,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: entries.length,
      };
    } catch { return null; }
  }

  private async detectCommonIssues(workspaceId: string): Promise<OrgPattern[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sessions = await db.select({
        subject: (helpaiSessions as any).subject,
        wasResolved: helpaiSessions.wasResolved,
        wasEscalated: helpaiSessions.wasEscalated,
      })
        .from(helpaiSessions)
        .where(and(
          eq(helpaiSessions.workspaceId, workspaceId),
          gte(helpaiSessions.createdAt, thirtyDaysAgo)
        ))
        .limit(200);

      const issueCounts: Record<string, { total: number; resolved: number; escalated: number }> = {};
      for (const s of sessions) {
        const key = (s.subject || 'general').toLowerCase().substring(0, 50);
        if (!issueCounts[key]) issueCounts[key] = { total: 0, resolved: 0, escalated: 0 };
        issueCounts[key].total++;
        if (s.wasResolved) issueCounts[key].resolved++;
        if (s.wasEscalated) issueCounts[key].escalated++;
      }

      return Object.entries(issueCounts)
        .filter(([_, v]) => v.total >= 3)
        .map(([issue, stats]) => ({
          workspaceId,
          patternType: 'common_issue' as OrgPatternType,
          patternKey: `issue:${issue}`,
          value: {
            issue,
            totalOccurrences: stats.total,
            resolvedCount: stats.resolved,
            escalatedCount: stats.escalated,
            resolutionRate: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0,
          },
          confidence: stats.total >= 5 ? 0.85 : 0.6,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: stats.total,
        }));
    } catch { return []; }
  }

  private async detectInvoiceCycle(workspaceId: string): Promise<OrgPattern | null> {
    try {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const recentInvoices = await db.select({
        createdAt: invoices.createdAt,
        status: invoices.status,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.createdAt, sixtyDaysAgo)
        ))
        .orderBy(desc(invoices.createdAt))
        .limit(20);

      if (recentInvoices.length < 2) return null;

      const intervals: number[] = [];
      for (let i = 1; i < recentInvoices.length; i++) {
        const diff = new Date(recentInvoices[i - 1].createdAt!).getTime() - new Date(recentInvoices[i].createdAt!).getTime();
        intervals.push(Math.round(diff / (24 * 60 * 60 * 1000)));
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      return {
        workspaceId,
        patternType: 'invoice_cycle',
        patternKey: 'invoice_frequency',
        value: {
          avgIntervalDays: Math.round(avgInterval),
          recentCount: recentInvoices.length,
          lastInvoiceDate: recentInvoices[0]?.createdAt,
        },
        confidence: recentInvoices.length >= 5 ? 0.8 : 0.5,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: recentInvoices.length,
      };
    } catch { return null; }
  }

  async detectEmployeeHabits(workspaceId: string): Promise<OrgPattern[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const entries = await db.select({
        employeeId: timeEntries.employeeId,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        shiftId: timeEntries.shiftId,
        totalHours: timeEntries.totalHours,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, thirtyDaysAgo)
        ))
        .limit(1000);

      if (entries.length < 5) return [];

      const employeeData: Record<string, {
        clockIns: number[];
        totalEntries: number;
        entriesWithClockOut: number;
        totalHoursWorked: number;
        shiftIds: (string | null)[];
      }> = {};

      for (const entry of entries) {
        const empId = entry.employeeId;
        if (!employeeData[empId]) {
          employeeData[empId] = { clockIns: [], totalEntries: 0, entriesWithClockOut: 0, totalHoursWorked: 0, shiftIds: [] };
        }
        const d = employeeData[empId];
        d.totalEntries++;
        if (entry.clockIn) {
          d.clockIns.push(new Date(entry.clockIn).getHours() + new Date(entry.clockIn).getMinutes() / 60);
        }
        if (entry.clockOut) d.entriesWithClockOut++;
        if (entry.totalHours) d.totalHoursWorked += parseFloat(String(entry.totalHours));
        d.shiftIds.push(entry.shiftId);
      }

      const assignedShiftIds = entries.map(e => e.shiftId).filter(Boolean) as string[];
      let shiftData: Record<string, { startHour: number }> = {};
      if (assignedShiftIds.length > 0) {
        const shiftRows = await db.select({
          id: shifts.id,
          startTime: shifts.startTime,
          employeeId: shifts.employeeId,
          status: shifts.status,
        })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, thirtyDaysAgo)
          ))
          .limit(1000);

        for (const s of shiftRows) {
          if (s.startTime) {
            shiftData[s.id] = { startHour: new Date(s.startTime).getHours() + new Date(s.startTime).getMinutes() / 60 };
          }
        }
      }

      const patterns: OrgPattern[] = [];

      for (const [empId, data] of Object.entries(employeeData)) {
        if (data.totalEntries < 3) continue;

        const avgClockInHour = data.clockIns.length > 0
          ? data.clockIns.reduce((a, b) => a + b, 0) / data.clockIns.length
          : null;

        let lateArrivals = 0;
        for (const entry of entries.filter(e => e.employeeId === empId)) {
          if (entry.shiftId && entry.clockIn && shiftData[entry.shiftId]) {
            const clockInHour = new Date(entry.clockIn).getHours() + new Date(entry.clockIn).getMinutes() / 60;
            const shiftStartHour = shiftData[entry.shiftId].startHour;
            if (clockInHour > shiftStartHour + 0.25) {
              lateArrivals++;
            }
          }
        }

        const lateRate = data.totalEntries > 0 ? Math.round((lateArrivals / data.totalEntries) * 100) : 0;
        const avgHoursPerEntry = data.totalEntries > 0 ? Math.round((data.totalHoursWorked / data.totalEntries) * 10) / 10 : 0;
        const completionRate = data.totalEntries > 0 ? Math.round((data.entriesWithClockOut / data.totalEntries) * 100) : 0;

        let reliability = 'reliable';
        if (lateRate > 30 || completionRate < 70) reliability = 'needs_attention';
        else if (lateRate > 15 || completionRate < 85) reliability = 'moderate';

        patterns.push({
          workspaceId,
          patternType: 'employee_habit',
          patternKey: `employee_habit:${empId}`,
          value: {
            employeeId: empId,
            avgClockInHour: avgClockInHour ? Math.round(avgClockInHour * 100) / 100 : null,
            lateArrivals,
            lateRate,
            completionRate,
            avgHoursPerEntry,
            totalEntries: data.totalEntries,
            reliability,
          },
          confidence: data.totalEntries >= 10 ? 0.9 : data.totalEntries >= 5 ? 0.7 : 0.5,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: data.totalEntries,
        });
      }

      return patterns;
    } catch { return []; }
  }

  async detectManagementPatterns(workspaceId: string): Promise<OrgPattern[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const managerMembers = await db.select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
      })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.status, 'active')
        ))
        .limit(50);

      const managerIds = managerMembers
        .filter(m => m.role === 'org_owner' || m.role === 'co_owner' || m.role === 'manager' || m.role === 'supervisor')
        .map(m => m.userId);

      if (managerIds.length === 0) return [];

      const sessions = await db.select({
        userId: trinityConversationSessions.userId,
        mode: trinityConversationSessions.mode,
        messageCount: trinityConversationSessions.messageCount,
        title: trinityConversationSessions.title,
        summary: trinityConversationSessions.summary,
        startedAt: trinityConversationSessions.startedAt,
        lastActivityAt: trinityConversationSessions.lastActivityAt,
      })
        .from(trinityConversationSessions)
        .where(and(
          eq(trinityConversationSessions.workspaceId, workspaceId),
          gte(trinityConversationSessions.createdAt, thirtyDaysAgo)
        ))
        .orderBy(desc(trinityConversationSessions.createdAt))
        .limit(200);

      const patterns: OrgPattern[] = [];

      for (const managerId of managerIds) {
        const mgrSessions = sessions.filter(s => s.userId === managerId);
        if (mgrSessions.length < 2) continue;

        const activityHours: number[] = [];
        const topicsDiscussed: string[] = [];
        let totalMessages = 0;
        let businessSessions = 0;

        for (const s of mgrSessions) {
          if (s.startedAt) {
            activityHours.push(new Date(s.startedAt).getHours());
          }
          if (s.messageCount) totalMessages += s.messageCount;
          if (s.mode === 'business') businessSessions++;
          if (s.title) topicsDiscussed.push(s.title);
          if (s.summary) topicsDiscussed.push(s.summary);
        }

        const hourBuckets = new Array(24).fill(0);
        for (const h of activityHours) hourBuckets[h]++;
        const preferredHour = hourBuckets.indexOf(Math.max(...hourBuckets));

        const topicKeywords: Record<string, number> = {};
        const keywordPatterns = ['schedule', 'payroll', 'employee', 'shift', 'report', 'billing', 'invoice', 'overtime', 'compliance', 'training', 'performance', 'callout', 'no-show', 'budget', 'client'];
        for (const topic of topicsDiscussed) {
          const lower = (topic || '').toLowerCase();
          for (const kw of keywordPatterns) {
            if (lower.includes(kw)) {
              topicKeywords[kw] = (topicKeywords[kw] || 0) + 1;
            }
          }
        }

        const topInterests = Object.entries(topicKeywords)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([k]) => k);

        patterns.push({
          workspaceId,
          patternType: 'management_preference',
          patternKey: `mgr_pref:${managerId}`,
          value: {
            userId: managerId,
            preferredActiveHour: preferredHour,
            totalSessions: mgrSessions.length,
            totalMessages,
            businessSessionRatio: mgrSessions.length > 0 ? Math.round((businessSessions / mgrSessions.length) * 100) : 0,
            topInterests,
            avgMessagesPerSession: mgrSessions.length > 0 ? Math.round(totalMessages / mgrSessions.length) : 0,
          },
          confidence: mgrSessions.length >= 10 ? 0.9 : mgrSessions.length >= 5 ? 0.7 : 0.5,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: mgrSessions.length,
        });
      }

      return patterns;
    } catch { return []; }
  }

  async learnFromReports(workspaceId: string): Promise<OrgPattern[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const sessions = await db.select({
        issueCategory: helpaiSessions.issueCategory,
        issueSummary: helpaiSessions.issueSummary,
        resolution: helpaiSessions.resolution,
        wasResolved: helpaiSessions.wasResolved,
        wasEscalated: helpaiSessions.wasEscalated,
        satisfactionScore: helpaiSessions.satisfactionScore,
        totalDurationMs: helpaiSessions.totalDurationMs,
      })
        .from(helpaiSessions)
        .where(and(
          eq(helpaiSessions.workspaceId, workspaceId),
          gte(helpaiSessions.createdAt, thirtyDaysAgo)
        ))
        .limit(300);

      if (sessions.length < 3) return [];

      const categoryStats: Record<string, {
        count: number;
        resolved: number;
        escalated: number;
        totalSatisfaction: number;
        satisfactionCount: number;
        summaries: string[];
        avgDurationMs: number;
        totalDuration: number;
      }> = {};

      for (const s of sessions) {
        const cat = (s.issueCategory || 'uncategorized').toLowerCase();
        if (!categoryStats[cat]) {
          categoryStats[cat] = { count: 0, resolved: 0, escalated: 0, totalSatisfaction: 0, satisfactionCount: 0, summaries: [], avgDurationMs: 0, totalDuration: 0 };
        }
        const stats = categoryStats[cat];
        stats.count++;
        if (s.wasResolved) stats.resolved++;
        if (s.wasEscalated) stats.escalated++;
        if (s.satisfactionScore) {
          stats.totalSatisfaction += s.satisfactionScore;
          stats.satisfactionCount++;
        }
        if (s.totalDurationMs) stats.totalDuration += s.totalDurationMs;
        if (s.issueSummary) stats.summaries.push(s.issueSummary.substring(0, 100));
      }

      const patterns: OrgPattern[] = [];

      for (const [category, stats] of Object.entries(categoryStats)) {
        if (stats.count < 2) continue;

        const themeWords: Record<string, number> = {};
        for (const summary of stats.summaries) {
          const words = summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          for (const word of words) {
            themeWords[word] = (themeWords[word] || 0) + 1;
          }
        }
        const recurringThemes = Object.entries(themeWords)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([w]) => w);

        patterns.push({
          workspaceId,
          patternType: 'report_insight',
          patternKey: `report:${category}`,
          value: {
            category,
            totalReports: stats.count,
            resolutionRate: Math.round((stats.resolved / stats.count) * 100),
            escalationRate: Math.round((stats.escalated / stats.count) * 100),
            avgSatisfaction: stats.satisfactionCount > 0 ? Math.round((stats.totalSatisfaction / stats.satisfactionCount) * 10) / 10 : null,
            avgDurationMinutes: stats.count > 0 ? Math.round(stats.totalDuration / stats.count / 60000) : 0,
            recurringThemes,
          },
          confidence: stats.count >= 5 ? 0.85 : 0.6,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: stats.count,
        });
      }

      return patterns;
    } catch { return []; }
  }

  async learnFromConversations(workspaceId: string): Promise<OrgPattern[]> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const recentSessions = await db.select({
        id: trinityConversationSessions.id,
        userId: trinityConversationSessions.userId,
        mode: trinityConversationSessions.mode,
        title: trinityConversationSessions.title,
        summary: trinityConversationSessions.summary,
        messageCount: trinityConversationSessions.messageCount,
        metadata: trinityConversationSessions.metadata,
      })
        .from(trinityConversationSessions)
        .where(and(
          eq(trinityConversationSessions.workspaceId, workspaceId),
          gte(trinityConversationSessions.createdAt, thirtyDaysAgo)
        ))
        .orderBy(desc(trinityConversationSessions.createdAt))
        .limit(100);

      if (recentSessions.length < 3) return [];

      const sessionIds = recentSessions.map(s => s.id);

      const turns = await db.select({
        sessionId: trinityConversationTurns.sessionId,
        role: trinityConversationTurns.role,
        content: trinityConversationTurns.content,
        toolCalls: trinityConversationTurns.toolCalls,
      })
        .from(trinityConversationTurns)
        .where(and(
          inArray(trinityConversationTurns.sessionId, sessionIds),
          gte(trinityConversationTurns.createdAt, thirtyDaysAgo)
        ))
        .limit(500);

      const relevantTurns = turns;

      const questionKeywords: Record<string, number> = {};
      const decisionTopics: Record<string, number> = {};
      const concerns: Record<string, number> = {};
      let toolUsageCount = 0;
      const toolsUsed: Record<string, number> = {};

      const worryWords = ['worried', 'concern', 'problem', 'issue', 'struggling', 'help', 'urgent', 'critical', 'failing', 'behind', 'late', 'short', 'shortage', 'missing', 'error', 'wrong'];
      const decisionWords = ['decide', 'approve', 'deny', 'hire', 'fire', 'terminate', 'promote', 'raise', 'schedule', 'assign', 'change', 'update', 'cancel', 'add', 'remove'];

      for (const turn of relevantTurns) {
        if (turn.role === 'user' && turn.content) {
          const lower = turn.content.toLowerCase();

          for (const w of worryWords) {
            if (lower.includes(w)) {
              concerns[w] = (concerns[w] || 0) + 1;
            }
          }

          for (const w of decisionWords) {
            if (lower.includes(w)) {
              decisionTopics[w] = (decisionTopics[w] || 0) + 1;
            }
          }

          if (lower.includes('?')) {
            const questionTypes = ['how', 'why', 'when', 'what', 'who', 'where', 'can', 'should', 'will'];
            for (const qt of questionTypes) {
              if (lower.includes(qt)) {
                questionKeywords[qt] = (questionKeywords[qt] || 0) + 1;
              }
            }
          }
        }

        if (turn.toolCalls && Array.isArray(turn.toolCalls)) {
          for (const tc of turn.toolCalls as any[]) {
            toolUsageCount++;
            const toolName = tc.name || tc.function?.name || 'unknown';
            toolsUsed[toolName] = (toolsUsed[toolName] || 0) + 1;
          }
        }
      }

      const patterns: OrgPattern[] = [];

      const topConcerns = Object.entries(concerns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ topic: k, mentions: v }));

      const topDecisions = Object.entries(decisionTopics)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ action: k, mentions: v }));

      const topQuestions = Object.entries(questionKeywords)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ type: k, count: v }));

      const topTools = Object.entries(toolsUsed)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => ({ tool: k, count: v }));

      patterns.push({
        workspaceId,
        patternType: 'conversation_learning',
        patternKey: 'conversation_analysis',
        value: {
          totalSessionsAnalyzed: recentSessions.length,
          totalTurnsAnalyzed: relevantTurns.length,
          topConcerns,
          topDecisions,
          topQuestionTypes: topQuestions,
          toolUsageCount,
          topToolsUsed: topTools,
          businessModeRatio: recentSessions.length > 0
            ? Math.round((recentSessions.filter(s => s.mode === 'business').length / recentSessions.length) * 100)
            : 0,
        },
        confidence: recentSessions.length >= 10 ? 0.85 : 0.6,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: recentSessions.length,
      });

      return patterns;
    } catch { return []; }
  }

  private async detectFinancialConfigPatterns(workspaceId: string): Promise<OrgPattern[]> {
    const patterns: OrgPattern[] = [];
    try {
      // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
      const wsResult = await typedQuery(sql`
        SELECT payroll_schedule, payroll_day_of_week, payroll_day_of_month, payroll_cutoff_day
        FROM workspaces WHERE id = ${workspaceId} LIMIT 1
      `);
      const wsPayroll = wsResult[0] as any;

      if (wsPayroll) {
        patterns.push({
          workspaceId,
          patternType: 'payroll_config_change',
          patternKey: 'payroll_configuration',
          value: {
            payrollCycle: wsPayroll.payroll_schedule || 'bi_weekly',
            payrollDayOfWeek: wsPayroll.payroll_day_of_week ?? 5,
            payrollDayOfMonth: wsPayroll.payroll_day_of_month,
            payrollCutoffDays: wsPayroll.payroll_cutoff_day ?? 2,
            configured: true,
          },
          confidence: 0.95,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: 1,
        });
      }

      const clientBillingConfigs = await db.select({
        clientId: clientBillingSettings.clientId,
        billingCycle: clientBillingSettings.billingCycle,
        paymentTerms: clientBillingSettings.paymentTerms,
        defaultBillRate: clientBillingSettings.defaultBillRate,
      })
        .from(clientBillingSettings)
        .innerJoin(clients, eq(clientBillingSettings.clientId, clients.id))
        .where(eq(clients.workspaceId, workspaceId));

      if (clientBillingConfigs.length > 0) {
        const cycleCounts: Record<string, number> = {};
        const termCounts: Record<string, number> = {};
        for (const cfg of clientBillingConfigs) {
          const cycle = cfg.billingCycle || 'monthly';
          const terms = cfg.paymentTerms || 'net_30';
          cycleCounts[cycle] = (cycleCounts[cycle] || 0) + 1;
          termCounts[terms] = (termCounts[terms] || 0) + 1;
        }

        const dominantCycle = Object.entries(cycleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'monthly';
        const dominantTerms = Object.entries(termCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'net_30';

        patterns.push({
          workspaceId,
          patternType: 'billing_config_change',
          patternKey: 'client_billing_patterns',
          value: {
            clientCount: clientBillingConfigs.length,
            dominantBillingCycle: dominantCycle,
            dominantPaymentTerms: dominantTerms,
            cycleCounts,
            termCounts,
          },
          confidence: clientBillingConfigs.length >= 5 ? 0.9 : 0.7,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: clientBillingConfigs.length,
        });
      }

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const recentPayrollRuns = await db.select({
        runCount: sql<string>`COUNT(*)`,
        totalGross: sql<string>`COALESCE(SUM(CAST(${payrollRuns.totalGrossPay} AS NUMERIC)), 0)`,
        avgGross: sql<string>`COALESCE(AVG(CAST(${payrollRuns.totalGrossPay} AS NUMERIC)), 0)`,
      })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.workspaceId, workspaceId),
            eq(payrollRuns.status, 'completed'),
            gte(payrollRuns.createdAt, ninetyDaysAgo)
          )
        );

      const runCount = parseInt(recentPayrollRuns[0]?.runCount || '0');
      if (runCount > 0) {
        const avgGross = parseFloat(recentPayrollRuns[0]?.avgGross || '0');
        patterns.push({
          workspaceId,
          patternType: 'bonus_pattern',
          patternKey: 'payroll_run_frequency',
          value: {
            completedRunsLast90Days: runCount,
            totalGrossPayroll: parseFloat(recentPayrollRuns[0]?.totalGross || '0'),
            avgGrossPerRun: Math.round(avgGross * 100) / 100,
            estimatedAnnualPayroll: Math.round(avgGross * (runCount * 4) * 100) / 100,
          },
          confidence: runCount >= 3 ? 0.85 : 0.6,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: runCount,
        });
      }

      const paymentAnalysis = await db.select({
        clientId: invoices.clientId,
        avgDaysToPayment: sql<string>`AVG(EXTRACT(EPOCH FROM (${invoicePayments.paidAt} - ${invoices.issueDate})) / 86400)`,
        paymentCount: sql<string>`COUNT(*)`,
      })
        .from(invoices)
        .innerJoin(invoicePayments, eq(invoicePayments.invoiceId, invoices.id))
        .where(
          and(
            eq(invoices.workspaceId, workspaceId),
            gte(invoices.issueDate, ninetyDaysAgo),
            isNotNull(invoicePayments.paidAt)
          )
        )
        .groupBy(invoices.clientId);

      for (const payment of paymentAnalysis) {
        const avgDays = parseFloat(payment.avgDaysToPayment || '30');
        const pCount = parseInt(payment.paymentCount || '0');
        if (avgDays < 10 && pCount >= 2) {
          patterns.push({
            workspaceId,
            patternType: 'client_rate_change',
            patternKey: `client_early_payer_${payment.clientId}`,
            value: {
              clientId: payment.clientId,
              avgDaysToPayment: Math.round(avgDays),
              paymentsAnalyzed: pCount,
              suggestion: 'This client consistently pays early. Consider offering early payment discount or shortening payment terms.',
            },
            confidence: pCount >= 5 ? 0.9 : 0.75,
            learnedAt: new Date(),
            lastConfirmedAt: new Date(),
            occurrences: pCount,
          });
        }
      }
    } catch (err: any) {
      log.error(`[TrinityOrgIntel] Financial config pattern detection failed:`, (err instanceof Error ? err.message : String(err)));
    }
    return patterns;
  }

  private generateTaxFilingReminders(workspaceId: string): OrgPattern[] {
    const patterns: OrgPattern[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    const deadlines = [
      { quarter: 1, month: 4, day: 30, formDue: '941' },
      { quarter: 2, month: 7, day: 31, formDue: '941' },
      { quarter: 3, month: 10, day: 31, formDue: '941' },
      { quarter: 4, month: 1, day: 31, formDue: '941' },
    ];

    for (const dl of deadlines) {
      const deadlineYear = dl.quarter === 4 ? currentYear + 1 : currentYear;
      const deadline = new Date(deadlineYear, dl.month - 1, dl.day);
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil > 0 && daysUntil <= 30) {
        patterns.push({
          workspaceId,
          patternType: 'tax_filing_reminder',
          patternKey: `941_q${dl.quarter}_${deadlineYear}`,
          value: {
            form: '941',
            quarter: dl.quarter,
            year: dl.quarter === 4 ? currentYear : currentYear,
            deadlineDate: deadline.toISOString().slice(0, 10),
            daysUntilDue: daysUntil,
            urgency: daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'high' : 'normal',
            suggestion: `Form 941 for Q${dl.quarter} is due in ${daysUntil} days (${deadline.toISOString().slice(0, 10)}). Generate the report from Payroll > Tax Forms.`,
          },
          confidence: 1.0,
          learnedAt: new Date(),
          lastConfirmedAt: new Date(),
          occurrences: 1,
        });
      }
    }

    const futaDeadline = new Date(currentYear + 1, 0, 31);
    const futaDaysUntil = Math.ceil((futaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (futaDaysUntil > 0 && futaDaysUntil <= 60) {
      patterns.push({
        workspaceId,
        patternType: 'tax_filing_reminder',
        patternKey: `940_${currentYear}`,
        value: {
          form: '940',
          year: currentYear,
          deadlineDate: futaDeadline.toISOString().slice(0, 10),
          daysUntilDue: futaDaysUntil,
          urgency: futaDaysUntil <= 14 ? 'critical' : futaDaysUntil <= 30 ? 'high' : 'normal',
          suggestion: `Form 940 (Annual FUTA Return) for ${currentYear} is due in ${futaDaysUntil} days. Generate from Payroll > Tax Forms.`,
        },
        confidence: 1.0,
        learnedAt: new Date(),
        lastConfirmedAt: new Date(),
        occurrences: 1,
      });
    }

    return patterns;
  }

  private async learnSchedulingPattern(workspaceId: string, data: any): Promise<void> {
    const existing = this.orgPatterns.get(workspaceId) || [];
    const idx = existing.findIndex(p => p.patternType === 'scheduling_rhythm');
    const pattern: OrgPattern = {
      workspaceId,
      patternType: 'scheduling_rhythm',
      patternKey: 'schedule_publish_event',
      value: { ...data, lastPublish: new Date() },
      confidence: 0.9,
      learnedAt: idx >= 0 ? existing[idx].learnedAt : new Date(),
      lastConfirmedAt: new Date(),
      occurrences: idx >= 0 ? existing[idx].occurrences + 1 : 1,
    };
    if (idx >= 0) existing[idx] = pattern;
    else existing.push(pattern);
    this.orgPatterns.set(workspaceId, existing);
  }

  private async learnPayrollCycle(workspaceId: string, data: any): Promise<void> {
    const existing = this.orgPatterns.get(workspaceId) || [];
    const idx = existing.findIndex(p => p.patternType === 'payroll_cycle');
    const pattern: OrgPattern = {
      workspaceId,
      patternType: 'payroll_cycle',
      patternKey: 'payroll_event',
      value: { ...data, lastPayroll: new Date() },
      confidence: 0.9,
      learnedAt: idx >= 0 ? existing[idx].learnedAt : new Date(),
      lastConfirmedAt: new Date(),
      occurrences: idx >= 0 ? existing[idx].occurrences + 1 : 1,
    };
    if (idx >= 0) existing[idx] = pattern;
    else existing.push(pattern);
    this.orgPatterns.set(workspaceId, existing);
  }

  // --------------------------------------------------------------------------
  // AUTONOMOUS BOT DELEGATION WITH RESULT TRACKING
  // --------------------------------------------------------------------------

  async delegateToBot(params: {
    sessionId: string;
    workspaceId: string;
    userId?: string;
    botName: BotSummonRequest['botName'];
    command: string;
    instructions: string;
    parentTaskId?: string;
  }): Promise<BotDelegationTask> {
    const task: BotDelegationTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      sessionId: params.sessionId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      botName: params.botName,
      command: params.command,
      instructions: params.instructions,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      parentTaskId: params.parentTaskId,
    };

    this.activeTasks.set(task.id, task);

    log.info(`[TrinityOrgIntel] Delegating to ${params.botName}: ${params.instructions.substring(0, 80)}`);
    await this.executeTask(task);

    return task;
  }

  private async executeTask(task: BotDelegationTask): Promise<void> {
    task.status = 'executing';
    task.attempts++;

    try {
      const result = await helpAIOrchestrator.summonBot({
        sessionId: task.sessionId,
        botName: task.botName,
        command: task.command,
        instructions: task.instructions,
        workspaceId: task.workspaceId,
        userId: task.userId,
      });

      if (result.success) {
        task.status = 'completed';
        task.result = result.message;
        task.completedAt = new Date();
        log.info(`[TrinityOrgIntel] Task ${task.id} completed: ${result.message.substring(0, 100)}`);
      } else {
        if (task.attempts < task.maxAttempts) {
          task.status = 'retrying';
          log.info(`[TrinityOrgIntel] Task ${task.id} failed (attempt ${task.attempts}/${task.maxAttempts}), retrying...`);
          setTimeout(() => this.executeTask(task), 2000 * task.attempts);
        } else {
          task.status = 'failed';
          task.error = result.message;
          task.completedAt = new Date();
          log.info(`[TrinityOrgIntel] Task ${task.id} failed permanently: ${result.message}`);
        }
      }

      this.activeTasks.set(task.id, task);
    } catch (err: any) {
      task.error = (err instanceof Error ? err.message : String(err));
      if (task.attempts < task.maxAttempts) {
        task.status = 'retrying';
        setTimeout(() => this.executeTask(task), 2000 * task.attempts);
      } else {
        task.status = 'failed';
        task.completedAt = new Date();
      }
      this.activeTasks.set(task.id, task);
    }
  }

  private async handleBotResult(data: any): Promise<void> {
    if (!data?.sessionId) return;

    const matchingTask = Array.from(this.activeTasks.values())
      .find(t => t.sessionId === data.sessionId && t.status === 'executing');

    if (matchingTask) {
      matchingTask.result = data.success ? data.message || 'Completed' : data.error || 'Failed';
      matchingTask.status = data.success ? 'completed' : 'failed';
      matchingTask.completedAt = new Date();
      this.activeTasks.set(matchingTask.id, matchingTask);

      log.info(`[TrinityOrgIntel] Bot result received for task ${matchingTask.id}: ${matchingTask.status}`);

      if (!data.success && matchingTask.attempts < matchingTask.maxAttempts) {
        matchingTask.status = 'retrying';
        this.activeTasks.set(matchingTask.id, matchingTask);
        setTimeout(() => this.executeTask(matchingTask), 3000);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7-STEP ISSUE RESOLUTION PIPELINE
  // --------------------------------------------------------------------------

  async resolveIssue(params: {
    workspaceId: string;
    sessionId?: string;
    issueType: string;
    description: string;
    userId?: string;
  }): Promise<IssueResolution> {
    const resolution: IssueResolution = {
      id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      issueType: params.issueType,
      description: params.description,
      phase: 'detect',
      resolved: false,
      escalated: false,
      createdAt: new Date(),
    };

    this.activeResolutions.set(resolution.id, resolution);

    resolution.phase = 'analyze';
    const delegation = helpAIOrchestrator.detectBotDelegation(params.description);

    if (delegation) {
      resolution.phase = 'delegate';
      resolution.delegatedTo = delegation.botName;

      const task = await this.delegateToBot({
        sessionId: params.sessionId || `auto-${resolution.id}`,
        workspaceId: params.workspaceId,
        userId: params.userId,
        botName: delegation.botName,
        command: delegation.command,
        instructions: params.description,
      });

      resolution.taskId = task.id;
      resolution.phase = 'execute';
      this.activeResolutions.set(resolution.id, resolution);

      const checkResult = async (retries = 0): Promise<void> => {
        const currentTask = this.activeTasks.get(task.id);
        if (!currentTask) return;

        if (currentTask.status === 'completed') {
          resolution.phase = 'verify';
          resolution.resolved = true;
          resolution.resolution = currentTask.result;
          resolution.resolvedAt = new Date();
          resolution.phase = 'close';
          this.activeResolutions.set(resolution.id, resolution);
          log.info(`[TrinityOrgIntel] Issue ${resolution.id} resolved via ${delegation.botName}`);
        } else if (currentTask.status === 'failed') {
          if (retries < 2) {
            resolution.phase = 'iterate';
            this.activeResolutions.set(resolution.id, resolution);
            const retryTask = await this.delegateToBot({
              sessionId: params.sessionId || `auto-${resolution.id}`,
              workspaceId: params.workspaceId,
              userId: params.userId,
              botName: delegation.botName,
              command: delegation.command,
              instructions: `RETRY: ${params.description}. Previous error: ${currentTask.error}`,
              parentTaskId: task.id,
            });
            resolution.taskId = retryTask.id;
            this.activeResolutions.set(resolution.id, resolution);
            setTimeout(() => checkResult(retries + 1), 5000);
          } else {
            resolution.escalated = true;
            resolution.phase = 'close';
            resolution.resolution = `Escalated after ${retries + 1} attempts. Last error: ${currentTask.error}`;
            this.activeResolutions.set(resolution.id, resolution);
            log.info(`[TrinityOrgIntel] Issue ${resolution.id} escalated after failures`);
          }
        } else if (currentTask.status === 'executing' || currentTask.status === 'retrying') {
          if (retries < 10) {
            setTimeout(() => checkResult(retries), 3000);
          }
        }
      };

      setTimeout(() => checkResult(), 2000);
    } else {
      resolution.phase = 'close';
      resolution.resolution = 'No suitable bot found for autonomous resolution. Handled via AI response.';
      this.activeResolutions.set(resolution.id, resolution);
    }

    return resolution;
  }

  // --------------------------------------------------------------------------
  // CONTEXT ENRICHMENT FOR TRINITY CHAT
  // --------------------------------------------------------------------------

  getCachedHierarchyContext(workspaceId: string): string | null {
    const entry = this.hierarchyCache.get(workspaceId);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > TrinityOrgIntelligenceService.HIERARCHY_CACHE_TTL) {
      this.hierarchyCache.delete(workspaceId);
      return null;
    }
    return entry.context;
  }

  setCachedHierarchyContext(workspaceId: string, context: string): void {
    if (this.hierarchyCache.size >= TrinityOrgIntelligenceService.HIERARCHY_CACHE_MAX) {
      const oldest = [...this.hierarchyCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
      if (oldest) this.hierarchyCache.delete(oldest[0]);
    }
    this.hierarchyCache.set(workspaceId, { context, fetchedAt: Date.now() });
  }

  invalidateHierarchyCache(workspaceId: string): void {
    this.hierarchyCache.delete(workspaceId);
    for (const [key, entry] of this.hierarchyCache.entries()) {
      if (entry.context.includes(workspaceId)) {
        this.hierarchyCache.delete(key);
      }
    }
  }

  async getOrgHierarchyContext(workspaceId: string): Promise<string> {
    try {
      const [ws] = await db.select({
        id: workspaces.id,
        name: workspaces.name,
        isSubOrg: workspaces.isSubOrg,
        parentWorkspaceId: workspaces.parentWorkspaceId,
        consolidatedBillingEnabled: workspaces.consolidatedBillingEnabled,
        operatingStates: workspaces.operatingStates,
        primaryOperatingState: workspaces.primaryOperatingState,
        subOrgAddonCount: workspaces.subOrgAddonCount,
        subscriptionTier: workspaces.subscriptionTier,
      }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

      if (!ws) return '';

      const rootId = ws.parentWorkspaceId || ws.id;
      const isSubOrg = ws.isSubOrg || false;

      const subOrgs = await db.select({
        id: workspaces.id,
        name: workspaces.name,
        subOrgLabel: workspaces.subOrgLabel,
        primaryOperatingState: workspaces.primaryOperatingState,
        operatingStates: workspaces.operatingStates,
      }).from(workspaces).where(
        and(eq(workspaces.parentWorkspaceId, rootId), eq(workspaces.isSubOrg, true))
      );

      if (subOrgs.length === 0 && !isSubOrg) return '';

      const lines: string[] = ['[Org Hierarchy — Multi-Branch Structure]'];

      if (isSubOrg && ws.parentWorkspaceId) {
        const [parent] = await db.select({ name: workspaces.name }).from(workspaces)
          .where(eq(workspaces.id, ws.parentWorkspaceId)).limit(1);
        lines.push(`Current context: Sub-org "${ws.name}" under parent "${parent?.name || 'Unknown'}"`);
        lines.push(`Parent org ID: ${ws.parentWorkspaceId}`);
      } else {
        lines.push(`Parent org: "${ws.name}" (${ws.subscriptionTier} tier)`);
        lines.push(`Sub-organizations: ${subOrgs.length} active branches`);
        lines.push(`Consolidated billing: ${ws.consolidatedBillingEnabled ? 'ENABLED — all sub-orgs billed to parent' : 'DISABLED'}`);
      }

      if (subOrgs.length > 0) {
        const allStates = new Set<string>();
        if (ws.primaryOperatingState) allStates.add(ws.primaryOperatingState);
        for (const sub of subOrgs) {
          if (sub.primaryOperatingState) allStates.add(sub.primaryOperatingState);
          if (sub.operatingStates) sub.operatingStates.forEach(s => { if (s) allStates.add(s); });
        }

        lines.push(`Operating states: ${Array.from(allStates).join(', ') || 'Not configured'}`);
        lines.push('Branches:');
        for (const sub of subOrgs) {
          const stateTag = sub.primaryOperatingState ? ` [${sub.primaryOperatingState}]` : '';
          lines.push(`  - ${sub.subOrgLabel || sub.name}${stateTag}`);
        }
        lines.push(`Credit pool: Shared across all branches (sub-orgs deduct from parent pool)`);
      }

      return lines.join('\n');
    } catch (err) {
      log.warn('[TrinityOrgIntel] Failed to build hierarchy context:', err);
      return '';
    }
  }

  getOrgContext(workspaceId: string): string {
    const patterns = this.orgPatterns.get(workspaceId);
    if (!patterns || patterns.length === 0) return '';

    const lines: string[] = ['[Org Intelligence — Learned Patterns]'];

    for (const p of patterns) {
      switch (p.patternType) {
        case 'payroll_cycle':
          lines.push(`Payroll: ${p.value.cycleType} cycle (every ~${p.value.avgIntervalDays} days, ${p.value.recentRunCount} recent runs)`);
          break;
        case 'scheduling_rhythm':
          lines.push(`Scheduling: ${p.value.schedulingDensity} density (${p.value.weeklyShiftCount} shifts/week, ${p.value.activeEmployees} active employees)`);
          break;
        case 'peak_hours':
          lines.push(`Peak activity: ${p.value.peakHour}:00 (${p.value.sampleSize} data points)`);
          break;
        case 'common_issue':
          lines.push(`Common issue: "${p.value.issue}" (${p.value.totalOccurrences}x, ${p.value.resolutionRate}% resolved)`);
          break;
        case 'invoice_cycle':
          lines.push(`Invoicing: every ~${p.value.avgIntervalDays} days (${p.value.recentCount} recent)`);
          break;
        case 'employee_habit':
          lines.push(`Employee ${p.value.employeeId}: ${p.value.reliability} reliability (${p.value.lateRate}% late rate, ${p.value.completionRate}% completion, avg ${p.value.avgHoursPerEntry}h/entry, ${p.value.totalEntries} entries)`);
          break;
        case 'management_preference':
          lines.push(`Manager ${p.value.userId}: prefers hour ${p.value.preferredActiveHour}:00, ${p.value.totalSessions} sessions, top interests: ${(p.value.topInterests || []).join(', ') || 'general'}`);
          break;
        case 'report_insight':
          lines.push(`Report pattern "${p.value.category}": ${p.value.totalReports} reports, ${p.value.resolutionRate}% resolved, ${p.value.escalationRate}% escalated${p.value.recurringThemes?.length ? ', themes: ' + p.value.recurringThemes.join(', ') : ''}`);
          break;
        case 'conversation_learning':
          lines.push(`Conversation insights: ${p.value.totalSessionsAnalyzed} sessions analyzed, ${p.value.businessModeRatio}% business mode${p.value.topConcerns?.length ? ', top concerns: ' + p.value.topConcerns.map((c: any) => c.topic).join(', ') : ''}${p.value.topDecisions?.length ? ', decisions: ' + p.value.topDecisions.map((d: any) => d.action).join(', ') : ''}`);
          break;
      }
    }

    const suggestions = this.getImprovementSuggestions(workspaceId);
    if (suggestions.length > 0) {
      lines.push('');
      lines.push('[Proactive Improvement Suggestions — Surface Naturally in Conversation]');
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sorted = [...suggestions].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      for (const s of sorted.slice(0, 10)) {
        lines.push(`[${s.priority.toUpperCase()}] ${s.title}: ${s.description}`);
        this.markSuggestionSurfaced(workspaceId, s.id);
      }
    }

    return lines.join('\n');
  }

  applyPatternDecay(workspaceId: string): number {
    const patterns = this.orgPatterns.get(workspaceId);
    if (!patterns || patterns.length === 0) return 0;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const MIN_DECAY_INTERVAL = 24 * 60 * 60 * 1000;
    const MAX_DECAY_PER_CYCLE = 0.05;
    let decayedCount = 0;
    const survivingPatterns: OrgPattern[] = [];

    for (const p of patterns) {
      const daysSinceConfirmed = (now - new Date(p.lastConfirmedAt).getTime()) / ONE_DAY;

      if (daysSinceConfirmed > 180 && p.confidence < 0.2) {
        decayedCount++;
        continue;
      }

      if (p.lastDecayedAt && (now - new Date(p.lastDecayedAt).getTime()) < MIN_DECAY_INTERVAL) {
        survivingPatterns.push(p);
        continue;
      }

      if (daysSinceConfirmed > 14) {
        const decayFactor = Math.min(MAX_DECAY_PER_CYCLE, daysSinceConfirmed * 0.001);
        p.confidence = Math.max(0.15, p.confidence - decayFactor);
        p.lastDecayedAt = new Date(now);
        decayedCount++;
      }

      survivingPatterns.push(p);
    }

    this.orgPatterns.set(workspaceId, survivingPatterns);
    return decayedCount;
  }

  generateImprovementSuggestions(workspaceId: string): ImprovementSuggestion[] {
    const patterns = this.orgPatterns.get(workspaceId);
    if (!patterns || patterns.length === 0) return [];

    const suggestions: ImprovementSuggestion[] = [];
    const now = new Date();

    for (const p of patterns) {
      if (p.confidence < 0.5) continue;

      if (p.patternType === 'employee_habit' && p.value.reliability === 'needs_attention') {
        suggestions.push({
          id: `sug-${workspaceId}-emp-${p.value.employeeId}-${now.getTime()}`,
          workspaceId,
          category: 'performance',
          priority: p.value.lateRate > 40 ? 'high' : 'medium',
          title: `Employee attendance concern: ${p.value.employeeId}`,
          description: `Employee has a ${p.value.lateRate}% late arrival rate and ${p.value.completionRate}% shift completion rate over ${p.value.totalEntries} entries. Consider a coaching conversation or schedule adjustment.`,
          basedOnPatterns: [p.patternKey],
          createdAt: now,
        });
      }

      if (p.patternType === 'scheduling_rhythm' && p.value.schedulingDensity === 'heavy' && p.value.avgShiftsPerEmployee > 6) {
        suggestions.push({
          id: `sug-${workspaceId}-overwork-${now.getTime()}`,
          workspaceId,
          category: 'staffing',
          priority: 'high',
          title: 'Potential employee overwork detected',
          description: `Average shifts per employee is ${p.value.avgShiftsPerEmployee}/week with ${p.value.activeEmployees} active employees handling ${p.value.weeklyShiftCount} weekly shifts. Consider hiring additional staff to prevent burnout and compliance issues.`,
          basedOnPatterns: [p.patternKey],
          createdAt: now,
        });
      }

      if (p.patternType === 'common_issue' && p.value.resolutionRate < 50 && p.value.totalOccurrences >= 5) {
        suggestions.push({
          id: `sug-${workspaceId}-unresolved-${p.value.issue}-${now.getTime()}`,
          workspaceId,
          category: 'operational',
          priority: p.value.escalatedCount > 3 ? 'high' : 'medium',
          title: `Recurring unresolved issue: ${p.value.issue}`,
          description: `"${p.value.issue}" has occurred ${p.value.totalOccurrences} times with only ${p.value.resolutionRate}% resolution rate (${p.value.escalatedCount} escalations). A systemic fix or SOP update may be needed.`,
          basedOnPatterns: [p.patternKey],
          createdAt: now,
        });
      }

      if (p.patternType === 'report_insight' && p.value.escalationRate > 30) {
        suggestions.push({
          id: `sug-${workspaceId}-escalation-${p.value.category}-${now.getTime()}`,
          workspaceId,
          category: 'training',
          priority: 'medium',
          title: `High escalation rate in ${p.value.category}`,
          description: `${p.value.escalationRate}% of ${p.value.category} reports are being escalated (${p.value.totalReports} total). Frontline training or updated procedures could reduce escalations.${p.value.recurringThemes?.length ? ' Recurring themes: ' + p.value.recurringThemes.join(', ') : ''}`,
          basedOnPatterns: [p.patternKey],
          createdAt: now,
        });
      }

      if (p.patternType === 'conversation_learning' && p.value.topConcerns?.length > 0) {
        const topConcern = p.value.topConcerns[0];
        if (topConcern.mentions >= 5) {
          suggestions.push({
            id: `sug-${workspaceId}-concern-${topConcern.topic}-${now.getTime()}`,
            workspaceId,
            category: 'operational',
            priority: 'medium',
            title: `Frequently raised concern: "${topConcern.topic}"`,
            description: `Management has mentioned "${topConcern.topic}" ${topConcern.mentions} times in recent conversations. This may warrant a focused review or action plan.`,
            basedOnPatterns: [p.patternKey],
            createdAt: now,
          });
        }
      }

      if (p.patternType === 'peak_hours' && p.value.sampleSize > 30) {
        const peakHour = p.value.peakHour;
        const distribution = p.value.distribution as number[];
        if (distribution) {
          const totalEntries = distribution.reduce((a: number, b: number) => a + b, 0);
          const peakConcentration = (distribution[peakHour] / totalEntries) * 100;
          if (peakConcentration > 25) {
            suggestions.push({
              id: `sug-${workspaceId}-peakconcentration-${now.getTime()}`,
              workspaceId,
              category: 'scheduling',
              priority: 'low',
              title: 'Clock-in activity highly concentrated',
              description: `${Math.round(peakConcentration)}% of all clock-ins happen at ${peakHour}:00. Consider staggering shift start times to reduce bottlenecks.`,
              basedOnPatterns: [p.patternKey],
              createdAt: now,
            });
          }
        }
      }
    }

    const existingSuggestions = this.improvementSuggestions.get(workspaceId) || [];
    const existingIds = new Set(existingSuggestions.map(s => s.title));
    const newSuggestions = suggestions.filter(s => !existingIds.has(s.title));
    const combined = [...existingSuggestions, ...newSuggestions].slice(-50);
    this.improvementSuggestions.set(workspaceId, combined);

    if (newSuggestions.length > 0) {
      log.info(`[TrinityOrgIntel] Generated ${newSuggestions.length} new improvement suggestions for workspace ${workspaceId}`);
    }

    return newSuggestions;
  }

  getImprovementSuggestions(workspaceId: string): ImprovementSuggestion[] {
    const suggestions = this.improvementSuggestions.get(workspaceId) || [];
    return suggestions.filter(s => !s.dismissedAt && !s.surfacedAt);
  }

  markSuggestionSurfaced(workspaceId: string, suggestionId: string): void {
    const suggestions = this.improvementSuggestions.get(workspaceId) || [];
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (suggestion) suggestion.surfacedAt = new Date();
  }

  dismissSuggestion(workspaceId: string, suggestionId: string): void {
    const suggestions = this.improvementSuggestions.get(workspaceId) || [];
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (suggestion) suggestion.dismissedAt = new Date();
  }

  async enrichWithBehaviorScoring(workspaceId: string): Promise<string> {
    try {
      const { employeeBehaviorScoring } = await import('../employeeBehaviorScoring');
      const analytics = await employeeBehaviorScoring.getWorkspaceAnalytics(workspaceId);
      if (!analytics || analytics.totalEmployees === 0) return '';

      const topPerformers = await employeeBehaviorScoring.getTopPerformers(workspaceId, 5);

      const lines: string[] = [
        '[Employee Behavior Intelligence]',
        `- Tracked employees: ${analytics.totalEmployees}`,
        `- Avg reliability: ${(analytics.avgReliabilityScore * 100).toFixed(0)}%`,
        `- Avg offer acceptance: ${(analytics.avgAcceptanceRate * 100).toFixed(0)}%`,
        `- Top performers (80%+ reliability): ${analytics.topPerformersCount}`,
        `- At-risk employees: ${analytics.atRiskCount}`,
        `- Trends: ${analytics.behaviorTrends.improving} improving, ${analytics.behaviorTrends.declining} declining, ${analytics.behaviorTrends.stable} stable`,
      ];

      if (topPerformers.length > 0) {
        lines.push('- Top 5 by reliability:');
        for (const tp of topPerformers) {
          lines.push(`  - Employee ${tp.employeeId}: reliability ${(parseFloat(tp.reliabilityScore || '0') * 100).toFixed(0)}%, completion ${(parseFloat(tp.shiftCompletionRate || '0') * 100).toFixed(0)}%, ${tp.totalShiftsCompleted || 0} shifts completed`);
        }
      }

      return lines.join('\n');
    } catch {
      return '';
    }
  }

  getActiveTasksForSession(sessionId: string): BotDelegationTask[] {
    return Array.from(this.activeTasks.values())
      .filter(t => t.sessionId === sessionId);
  }

  getActiveResolutionsForWorkspace(workspaceId: string): IssueResolution[] {
    return Array.from(this.activeResolutions.values())
      .filter(r => r.workspaceId === workspaceId && !r.resolved && !r.escalated);
  }

  getPatterns(workspaceId: string): OrgPattern[] {
    return this.orgPatterns.get(workspaceId) || [];
  }

  async scanAllWorkspaces(): Promise<{
    totalWorkspaces: number;
    scannedWorkspaces: number;
    platformPatterns: OrgPattern[];
    workspaceSummaries: Array<{
      workspaceId: string;
      workspaceName: string;
      patternCount: number;
      activeIssues: number;
      activeTasks: number;
    }>;
    platformIssues: IssueResolution[];
    scannedAt: string;
  }> {
    try {
      const allWorkspaces = await db.select({
        id: workspaces.id,
        name: workspaces.name,
        subscriptionStatus: workspaces.subscriptionStatus,
        subscriptionTier: workspaces.subscriptionTier,
        isSuspended: workspaces.isSuspended,
        isFrozen: workspaces.isFrozen,
      }).from(workspaces);

      const activeWorkspaces = allWorkspaces.filter(ws => !ws.isSuspended);
      const workspaceSummaries: Array<{
        workspaceId: string;
        workspaceName: string;
        patternCount: number;
        activeIssues: number;
        activeTasks: number;
      }> = [];
      const allPatterns: OrgPattern[] = [];

      const scanLimit = Math.min(activeWorkspaces.length, 50);
      for (let i = 0; i < scanLimit; i++) {
        const ws = activeWorkspaces[i];
        try {
          const patterns = await this.learnOrgPatterns(ws.id);
          const issues = this.getActiveResolutionsForWorkspace(ws.id);
          const tasks = Array.from(this.activeTasks.values()).filter(t => t.workspaceId === ws.id && !t.completedAt);

          allPatterns.push(...patterns);
          workspaceSummaries.push({
            workspaceId: ws.id,
            workspaceName: ws.name || ws.id,
            patternCount: patterns.length,
            activeIssues: issues.length,
            activeTasks: tasks.length,
          });
        } catch (err: any) {
          log.error(`[TrinityOrgIntel] Platform scan: skipped workspace ${ws.id}:`, (err instanceof Error ? err.message : String(err)));
          workspaceSummaries.push({
            workspaceId: ws.id,
            workspaceName: ws.name || ws.id,
            patternCount: 0,
            activeIssues: 0,
            activeTasks: 0,
          });
        }
      }

      const allPlatformIssues = Array.from(this.activeResolutions.values())
        .filter(r => !r.resolved && !r.escalated);

      log.info(`[TrinityOrgIntel] Platform-wide scan complete: ${workspaceSummaries.length}/${allWorkspaces.length} workspaces, ${allPatterns.length} patterns, ${allPlatformIssues.length} active issues`);

      return {
        totalWorkspaces: allWorkspaces.length,
        scannedWorkspaces: workspaceSummaries.length,
        platformPatterns: allPatterns,
        workspaceSummaries,
        platformIssues: allPlatformIssues,
        scannedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      log.error('[TrinityOrgIntel] Platform-wide scan failed:', (err instanceof Error ? err.message : String(err)));
      return {
        totalWorkspaces: 0,
        scannedWorkspaces: 0,
        platformPatterns: [],
        workspaceSummaries: [],
        platformIssues: [],
        scannedAt: new Date().toISOString(),
      };
    }
  }

  getAllPlatformPatterns(): { workspaceId: string; patterns: OrgPattern[] }[] {
    const result: { workspaceId: string; patterns: OrgPattern[] }[] = [];
    for (const [wsId, patterns] of this.orgPatterns) {
      result.push({ workspaceId: wsId, patterns });
    }
    return result;
  }

  getAllActiveIssues(): IssueResolution[] {
    return Array.from(this.activeResolutions.values())
      .filter(r => !r.resolved && !r.escalated);
  }

  getAllActiveTasks(): BotDelegationTask[] {
    return Array.from(this.activeTasks.values())
      .filter(t => !t.completedAt);
  }

  async getSubOrgs(parentWorkspaceId: string): Promise<Array<{ id: string; name: string; subOrgLabel: string | null; primaryOperatingState: string | null }>> {
    try {
      return await db.select({
        id: workspaces.id,
        name: workspaces.name,
        subOrgLabel: workspaces.subOrgLabel,
        primaryOperatingState: workspaces.primaryOperatingState,
      }).from(workspaces).where(
        and(eq(workspaces.parentWorkspaceId, parentWorkspaceId), eq(workspaces.isSubOrg, true))
      );
    } catch {
      return [];
    }
  }

  async scanSubOrgAnomalies(parentWorkspaceId: string): Promise<CrossOrgAlert[]> {
    const alerts: CrossOrgAlert[] = [];
    const subOrgs = await this.getSubOrgs(parentWorkspaceId);
    if (subOrgs.length === 0) return alerts;

    for (const sub of subOrgs) {
      try {
        const patterns = await this.learnOrgPatterns(sub.id);
        const branchLabel = sub.subOrgLabel || sub.name || sub.id;

        for (const p of patterns) {
          if (p.patternType === 'employee_habit' && p.value.reliability === 'needs_attention' && p.value.lateRate > 30) {
            alerts.push({
              sourceWorkspaceId: sub.id,
              sourceWorkspaceName: branchLabel,
              parentWorkspaceId,
              severity: p.value.lateRate > 50 ? 'critical' : 'warning',
              category: 'performance',
              title: `High late arrivals at ${branchLabel}`,
              description: `Employee ${p.value.employeeId} at branch "${branchLabel}" has ${p.value.lateRate}% late arrival rate over ${p.value.totalEntries} entries.`,
              patternType: p.patternType,
              detectedAt: new Date(),
            });
          }

          if (p.patternType === 'scheduling_rhythm' && p.value.schedulingDensity === 'heavy' && p.value.avgShiftsPerEmployee > 6) {
            alerts.push({
              sourceWorkspaceId: sub.id,
              sourceWorkspaceName: branchLabel,
              parentWorkspaceId,
              severity: 'warning',
              category: 'compliance',
              title: `Potential overwork at ${branchLabel}`,
              description: `Branch "${branchLabel}" averages ${p.value.avgShiftsPerEmployee} shifts/employee/week with ${p.value.activeEmployees} employees. Risk of burnout and compliance issues.`,
              patternType: p.patternType,
              detectedAt: new Date(),
            });
          }

          if (p.patternType === 'common_issue' && p.value.resolutionRate < 40 && p.value.totalOccurrences >= 5) {
            alerts.push({
              sourceWorkspaceId: sub.id,
              sourceWorkspaceName: branchLabel,
              parentWorkspaceId,
              severity: p.value.escalatedCount > 3 ? 'critical' : 'warning',
              category: 'platform',
              title: `Unresolved recurring issue at ${branchLabel}`,
              description: `"${p.value.issue}" has occurred ${p.value.totalOccurrences} times at "${branchLabel}" with only ${p.value.resolutionRate}% resolution rate.`,
              patternType: p.patternType,
              detectedAt: new Date(),
            });
          }

          if (p.patternType === 'payroll_cycle' && p.value.cycleType === 'unknown') {
            alerts.push({
              sourceWorkspaceId: sub.id,
              sourceWorkspaceName: branchLabel,
              parentWorkspaceId,
              severity: 'info',
              category: 'compliance',
              title: `Irregular payroll cycle at ${branchLabel}`,
              description: `Branch "${branchLabel}" has an irregular payroll cycle (avg ${p.value.avgIntervalDays} days between runs). This may indicate missed or inconsistent payroll processing.`,
              patternType: p.patternType,
              detectedAt: new Date(),
            });
          }
        }

        const suggestions = this.generateImprovementSuggestions(sub.id);
        for (const s of suggestions.filter(s => s.priority === 'high' || s.priority === 'critical')) {
          alerts.push({
            sourceWorkspaceId: sub.id,
            sourceWorkspaceName: branchLabel,
            parentWorkspaceId,
            severity: s.priority === 'critical' ? 'critical' : 'warning',
            category: s.category as CrossOrgAlert['category'],
            title: `[${branchLabel}] ${s.title}`,
            description: s.description,
            patternType: 'improvement_suggestion',
            detectedAt: new Date(),
          });
        }
      } catch (err: any) {
        log.error(`[TrinityOrgIntel] Sub-org scan failed for ${sub.id}:`, (err instanceof Error ? err.message : String(err)));
      }
    }

    log.info(`[TrinityOrgIntel] Cross-org scan for parent ${parentWorkspaceId}: ${subOrgs.length} branches, ${alerts.length} alerts`);
    return alerts;
  }

  async aggregateOrgTreeAlerts(parentWorkspaceId: string): Promise<{
    parentWorkspaceId: string;
    totalBranches: number;
    totalAlerts: number;
    alertsBySeverity: Record<string, number>;
    alertsByBranch: Record<string, CrossOrgAlert[]>;
    alerts: CrossOrgAlert[];
    scannedAt: string;
  }> {
    const subOrgs = await this.getSubOrgs(parentWorkspaceId);
    const alerts = await this.scanSubOrgAnomalies(parentWorkspaceId);

    const alertsBySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0, urgent: 0 };
    const alertsByBranch: Record<string, CrossOrgAlert[]> = {};

    for (const alert of alerts) {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
      if (!alertsByBranch[alert.sourceWorkspaceName]) {
        alertsByBranch[alert.sourceWorkspaceName] = [];
      }
      alertsByBranch[alert.sourceWorkspaceName].push(alert);
    }

    return {
      parentWorkspaceId,
      totalBranches: subOrgs.length,
      totalAlerts: alerts.length,
      alertsBySeverity,
      alertsByBranch,
      alerts,
      scannedAt: new Date().toISOString(),
    };
  }

  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, task] of this.activeTasks) {
      if (task.completedAt && task.completedAt.getTime() < oneHourAgo) {
        this.activeTasks.delete(id);
      }
    }
    for (const [id, res] of this.activeResolutions) {
      if (res.resolvedAt && res.resolvedAt.getTime() < oneHourAgo) {
        this.activeResolutions.delete(id);
      }
    }
  }
}

export interface CrossOrgAlert {
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  parentWorkspaceId: string;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  category: 'platform' | 'integration' | 'security' | 'performance' | 'compliance';
  title: string;
  description: string;
  patternType: string;
  detectedAt: Date;
}

export const trinityOrgIntelligenceService = new TrinityOrgIntelligenceService();

setInterval(() => trinityOrgIntelligenceService.cleanup(), 15 * 60 * 1000);
