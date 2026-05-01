/**
 * TRINITY AUTONOMOUS SCHEDULER - Fortune 500-Grade Intelligent Scheduling
 * ========================================================================
 * 
 * Trinity's core scheduling brain that processes schedules systematically:
 * 1. Processes current day FIRST (immediate needs)
 * 2. Then tomorrow (next priority)
 * 3. Then rest of current week (week completion)
 * 4. Then next week (forward planning)
 * 
 * Features:
 * - Day-by-day systematic processing
 * - Demand/urgency priority scoring
 * - Historical pattern learning
 * - Multi-tier escalation (internal → contractors → partners)
 * - Real-time WebSocket feedback
 */

import crypto from 'crypto';
import { db } from '../../db';
import {
  employees,
  shifts,
  clients,
  employeeAvailability,
  performanceReviews,
  timeEntries,
  contractorPool,
  workspaces,
  notifications,
  recurringShiftPatterns,
} from '@shared/schema';
import { createNotification } from '../notificationService';
import { evaluateTexasGatekeeper, type GatekeeperOutcome } from '../compliance/texasGatekeeper';

function safeParseFloat(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
}
import { eq, and, gte, lte, isNull, desc, asc, sql, or, inArray } from 'drizzle-orm';
import { broadcastToWorkspace } from '../../websocket';
import { auditLogger } from '../audit-logger';
import { SCHEDULING } from '../../config/platformConfig';
import { schedulingEnhancementsService } from './schedulingEnhancementsService';
import { trinityActionReasoner } from '../ai-brain/trinityActionReasoner';
import { trinityOrgIntelligenceService } from '../ai-brain/trinityOrgIntelligenceService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityAutonomousScheduler');


interface SchedulingConfig {
  workspaceId: string;
  userId: string;
  mode: 'current_day' | 'current_week' | 'next_week' | 'full_month' | 'full_quarter';
  prioritizeBy: 'urgency' | 'value' | 'chronological';
  useContractorFallback: boolean;
  maxShiftsPerEmployee: number;
  respectAvailability: boolean;
  // Optional — when present, Texas Regulatory Gatekeeper rules (OC Ch. 1702) are enforced
  // during candidate scoring. Resolved from workspaces.stateCode upstream.
  stateCode?: string;
}

interface ShiftPriority {
  shiftId: string;
  shift: any;
  priorityScore: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  factors: {
    hoursUntilStart: number;
    contractValue: number;
    clientTier: string;
    daysUnfilled: number;
    isRecurring: boolean;
  };
}

interface EmployeeScore {
  employeeId: string;
  employee: any;
  score: number;
  breakdown: {
    reliabilityScore: number;
    proximityScore: number;
    availabilityScore: number;
    performanceScore: number;
    seniorityScore: number;
    workloadBalance: number;
  };
  disqualifyReasons: string[];
  certWarnings?: string[];
  isSecondShiftToday?: boolean;
  isEmergencyExtension?: boolean;
  emergencyOverrideNote?: string;
}

interface AssignmentResult {
  shiftId: string;
  employeeId: string | null;
  success: boolean;
  confidence: number;
  reasoning: string;
  escalationLevel: number;
}

interface RunAssignment {
  shiftId: string;
  employeeId: string;
  startTime: Date;
  endTime: Date;
  shiftHours: number;
}

class RunAssignmentTracker {
  private assignments: RunAssignment[] = [];
  private byEmployee: Map<string, RunAssignment[]> = new Map();

  record(assignment: RunAssignment): void {
    this.assignments.push(assignment);
    if (!this.byEmployee.has(assignment.employeeId)) {
      this.byEmployee.set(assignment.employeeId, []);
    }
    this.byEmployee.get(assignment.employeeId)!.push(assignment);
  }

  getForEmployee(employeeId: string): RunAssignment[] {
    return this.byEmployee.get(employeeId) || [];
  }

  hasOverlap(employeeId: string, start: Date, end: Date): boolean {
    const empAssignments = this.getForEmployee(employeeId);
    return empAssignments.some(a =>
      a.startTime.getTime() < end.getTime() && a.endTime.getTime() > start.getTime()
    );
  }

  getDailyHours(employeeId: string, dayStart: Date, dayEnd: Date): number {
    const empAssignments = this.getForEmployee(employeeId);
    let hours = 0;
    for (const a of empAssignments) {
      const overlapStart = a.startTime > dayStart ? a.startTime : dayStart;
      const overlapEnd = a.endTime < dayEnd ? a.endTime : dayEnd;
      if (overlapEnd > overlapStart) {
        hours += (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
      }
    }
    return hours;
  }

  getWeeklyCount(employeeId: string, weekStart: Date, weekEnd: Date): number {
    const empAssignments = this.getForEmployee(employeeId);
    return empAssignments.filter(a =>
      a.startTime >= weekStart && a.startTime <= weekEnd
    ).length;
  }

  getWeeklyHours(employeeId: string, weekStart: Date, weekEnd: Date): number {
    const empAssignments = this.getForEmployee(employeeId);
    let hours = 0;
    for (const a of empAssignments) {
      if (a.startTime >= weekStart && a.startTime <= weekEnd) {
        hours += a.shiftHours;
      }
    }
    return hours;
  }

  getNearbyShifts(employeeId: string, rangeStart: Date, rangeEnd: Date): RunAssignment[] {
    const empAssignments = this.getForEmployee(employeeId);
    return empAssignments.filter(a =>
      a.startTime <= rangeEnd && a.endTime >= rangeStart
    );
  }

  getAllAssignments(): RunAssignment[] {
    return [...this.assignments];
  }

  removeAssignment(shiftId: string): RunAssignment | undefined {
    const idx = this.assignments.findIndex(a => a.shiftId === shiftId);
    if (idx === -1) return undefined;
    const removed = this.assignments.splice(idx, 1)[0];
    const empList = this.byEmployee.get(removed.employeeId);
    if (empList) {
      const empIdx = empList.findIndex(a => a.shiftId === shiftId);
      if (empIdx !== -1) empList.splice(empIdx, 1);
    }
    return removed;
  }
}

interface SchedulingSession {
  sessionId: string;
  workspaceId: string;
  startTime: Date;
  status: 'running' | 'completed' | 'failed';
  progress: {
    totalShifts: number;
    processedShifts: number;
    assignedShifts: number;
    failedShifts: number;
    skippedShifts: number;
  };
  thoughtLog: string[];
  dayProgress: Map<string, { total: number; filled: number }>;
}

const URGENCY_WEIGHTS = {
  hoursUntilStart: 0.35,
  contractValue: 0.25,
  clientTier: 0.20,
  daysUnfilled: 0.15,
  isRecurring: 0.05,
};

const EMPLOYEE_SCORE_WEIGHTS = {
  reliability: 0.25,
  proximity: 0.20,
  availability: 0.20,
  performance: 0.15,
  seniority: 0.10,
  workloadBalance: 0.10,
};

const WS_THROTTLE_INTERVAL_MS = 200; // Min 200ms between WebSocket progress broadcasts for high-volume runs

function getSessionTimeoutMs(tier: string): number {
  const tierKey = (tier || 'professional') as keyof typeof SCHEDULING.sessionTimeoutByTier;
  return SCHEDULING.sessionTimeoutByTier[tierKey] || SCHEDULING.sessionTimeoutByTier.professional;
}

function getMaxShiftsPerWeekCap(tier: string): number {
  const tierKey = (tier || 'professional') as keyof typeof SCHEDULING.maxShiftsPerWeekByTier;
  return SCHEDULING.maxShiftsPerWeekByTier[tierKey] || SCHEDULING.maxShiftsPerWeekByTier.professional;
}

class TrinityAutonomousSchedulerService {
  private static instance: TrinityAutonomousSchedulerService;
  private activeSessions: Map<string, SchedulingSession> = new Map();
  private historicalPatterns: Map<string, any> = new Map();
  private lastBroadcastTime: Map<string, number> = new Map();

  static getInstance(): TrinityAutonomousSchedulerService {
    if (!TrinityAutonomousSchedulerService.instance) {
      TrinityAutonomousSchedulerService.instance = new TrinityAutonomousSchedulerService();
    }
    return TrinityAutonomousSchedulerService.instance;
  }

  /**
   * MAIN ENTRY POINT: Execute autonomous scheduling for a workspace
   */
  async executeAutonomousScheduling(config: SchedulingConfig): Promise<{
    success: boolean;
    session: SchedulingSession;
    summary: {
      totalProcessed: number;
      totalAssigned: number;
      totalFailed: number;
      daysProcessed: number;
      avgConfidence: number;
    };
  }> {
    const sessionId = `trinity-sched-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
    const session: SchedulingSession = {
      sessionId,
      workspaceId: config.workspaceId,
      startTime: new Date(),
      status: 'running',
      progress: {
        totalShifts: 0,
        processedShifts: 0,
        assignedShifts: 0,
        failedShifts: 0,
        skippedShifts: 0,
      },
      thoughtLog: [],
      dayProgress: new Map(),
    };

    this.activeSessions.set(sessionId, session);

    try {
      session.thoughtLog.push(`[Trinity] Starting autonomous scheduling session ${sessionId}`);
      session.thoughtLog.push(`[Trinity] Mode: ${config.mode}, Priority: ${config.prioritizeBy}`);

      broadcastToWorkspace(config.workspaceId, {
        type: 'trinity_scheduling_started',
        sessionId,
        mode: config.mode,
        timestamp: Date.now(),
      });

      // === TRINITY PRE-RUN REASONING ===
      // Trinity evaluates the full scheduling scope before any assignments begin.
      // This is the brain's first pass: understand the situation, identify risks,
      // flag labor law concerns, and decide if the run should proceed.
      try {
        const preRunReasoning = await trinityActionReasoner.reason({
          domain: config.mode === 'next_week' || config.mode === 'full_month' || config.mode === 'full_quarter'
            ? 'scheduling_generate'
            : 'scheduling_fill',
          workspaceId: config.workspaceId,
          userId: config.userId,
          actionSummary: `Autonomous scheduling run — mode: ${config.mode}, priority: ${config.prioritizeBy}, contractor fallback: ${config.useContractorFallback}`,
          payload: {
            mode: config.mode,
            prioritizeBy: config.prioritizeBy,
            useContractorFallback: config.useContractorFallback,
            maxShiftsPerEmployee: config.maxShiftsPerEmployee,
            respectAvailability: config.respectAvailability,
          },
        });

        session.thoughtLog.push(`[Trinity:Brain] Pre-run decision: ${preRunReasoning.decision.toUpperCase()} (confidence: ${(preRunReasoning.confidence * 100).toFixed(0)}%)`);
        session.thoughtLog.push(`[Trinity:Brain] ${preRunReasoning.reasoning}`);

        if (preRunReasoning.laborLawFlags.length > 0) {
          session.thoughtLog.push(`[Trinity:Brain] ⚠ Labor law flags: ${preRunReasoning.laborLawFlags.join('; ')}`);
        }

        if (preRunReasoning.profitImpact.assessment !== 'unknown') {
          session.thoughtLog.push(`[Trinity:Brain] Profit impact (${preRunReasoning.profitImpact.assessment}): ${preRunReasoning.profitImpact.detail}`);
        }

        if (preRunReasoning.recommendations.length > 0) {
          session.thoughtLog.push(`[Trinity:Brain] Recommendations: ${preRunReasoning.recommendations.slice(0, 3).join(' | ')}`);
        }

        if (preRunReasoning.decision === 'block') {
          session.status = 'completed';
          (session as any).endTime = new Date();
          this.activeSessions.delete(sessionId);
          broadcastToWorkspace(config.workspaceId, {
            type: 'trinity_scheduling_blocked',
            sessionId,
            reason: preRunReasoning.blockReason,
            timestamp: Date.now(),
          });
          return {
            success: false,
            session,
            summary: { totalProcessed: 0, totalAssigned: 0, totalFailed: 0, daysProcessed: 0, avgConfidence: 0 },
          };
        }

        if (preRunReasoning.decision === 'escalate') {
          session.thoughtLog.push(`[Trinity:Brain] ⚠ Escalation flag — proceeding but flagged for manager review.`);
          broadcastToWorkspace(config.workspaceId, {
            type: 'trinity_scheduling_escalated',
            sessionId,
            reason: preRunReasoning.escalationReason,
            laborLawFlags: preRunReasoning.laborLawFlags,
            timestamp: Date.now(),
          });
        }
      } catch (reasoningErr) {
        session.thoughtLog.push(`[Trinity:Brain] Pre-run reasoning unavailable (non-blocking): ${reasoningErr instanceof Error ? reasoningErr.message : 'unknown'}`);
      }
      // === END PRE-RUN REASONING ===

      const modeLabels: Record<string, string> = {
        'current_day': 'today only',
        'current_week': 'rest of this week',
        'next_week': 'next two weeks',
        'full_month': 'full month ahead',
        'full_quarter': 'full quarter (90 days)',
      };
      this.emitDeliberation(config.workspaceId, session, '', 'analysis',
        `Starting up... Let me analyze the schedule for ${modeLabels[config.mode] || config.mode}. Prioritizing by ${config.prioritizeBy}.`);

      // Step 1: Get date ranges based on mode
      const dateRanges = this.getDateRanges(config.mode);
      session.thoughtLog.push(`[Trinity] Processing ${dateRanges.length} date ranges`);

      this.emitDeliberation(config.workspaceId, session, '', 'analysis',
        `Loading workforce data, client contracts, and historical patterns...`);

      // Step 2: Load all required data + workspace tier
      const [allEmployees, allClients, historicalData, workspaceRow, loadedOrgPatterns] = await Promise.all([
        this.loadEmployees(config.workspaceId),
        this.loadClients(config.workspaceId),
        this.loadHistoricalPatterns(config.workspaceId),
        db.select({ tier: workspaces.subscriptionTier }).from(workspaces).where(eq(workspaces.id, config.workspaceId)).limit(1),
        // FIX 6: Load org patterns so learned client/employee preferences inform decisions
        trinityOrgIntelligenceService.learnOrgPatterns(config.workspaceId).catch(() => [] as any[]),
      ]);
      const workspaceTier = workspaceRow[0]?.tier || 'professional';
      const orgPatterns: any[] = loadedOrgPatterns ?? [];
      // Build client-specific staffing overrides from learned patterns
      const clientMinStaffOverrides = new Map<string, Map<number, number>>();
      const employeeAvoidDays = new Map<string, Set<number>>();
      for (const pattern of orgPatterns) {
        if (pattern.patternType === 'staffing_preference' && pattern.clientId && pattern.data?.dayOfWeek !== undefined) {
          if (!clientMinStaffOverrides.has(pattern.clientId)) clientMinStaffOverrides.set(pattern.clientId, new Map());
          clientMinStaffOverrides.get(pattern.clientId)!.set(pattern.data.dayOfWeek, pattern.data.minStaff ?? 1);
        }
        if (pattern.patternType === 'employee_availability' && pattern.employeeId && pattern.data?.unavailableDays) {
          const days: number[] = pattern.data.unavailableDays;
          if (!employeeAvoidDays.has(pattern.employeeId)) employeeAvoidDays.set(pattern.employeeId, new Set());
          days.forEach(d => employeeAvoidDays.get(pattern.employeeId)!.add(d));
        }
      }

      // FIX [TEMPLATE LINKAGE]: Ensure shifts generated from templates are marked correctly
      // This allows the UI and reporting to distinguish between AI-generated and template-based shifts
      const templates = await db.query.recurringShiftPatterns.findMany({
        where: eq(recurringShiftPatterns.workspaceId, config.workspaceId),
      });
      const templateMap = new Map(templates.map(t => [t.id, t]));

      session.thoughtLog.push(`[Trinity] Org patterns loaded: ${orgPatterns.length} patterns, ${clientMinStaffOverrides.size} client staffing overrides, ${employeeAvoidDays.size} employee preference maps`);
      const sessionTimeoutMs = getSessionTimeoutMs(workspaceTier);
      const tierMaxShiftsPerWeek = getMaxShiftsPerWeekCap(workspaceTier);

      session.thoughtLog.push(`[Trinity] Loaded ${allEmployees.length} employees, ${allClients.length} clients (tier: ${workspaceTier})`);
      this.emitDeliberation(config.workspaceId, session, '', 'analysis',
        `Found ${allEmployees.length} active employees and ${allClients.length} client sites. Analyzing capacity...`);

      // Smart max-shifts-per-employee: analyze demand vs capacity with tier-aware cap
      const minStart = dateRanges.reduce((min, r) => r.start < min ? r.start : min, dateRanges[0]?.start || new Date());
      const maxEnd = dateRanges.reduce((max, r) => r.end > max ? r.end : max, dateRanges[0]?.end || new Date());
      const allOpenShiftsCount = await db.select({ count: sql<number>`count(*)` })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, config.workspaceId),
          isNull(shifts.employeeId),
          gte(shifts.startTime, minStart),
          lte(shifts.startTime, maxEnd)
        ));
      const totalOpenCount = Number(allOpenShiftsCount[0]?.count || 0);
      const employeeCount = allEmployees.length || 1;
      const daySpan = Math.max(1, (maxEnd.getTime() - minStart.getTime()) / (1000 * 60 * 60 * 24));
      const weeksInRange = Math.max(1, daySpan / 7);
      const avgShiftsNeededPerEmployeePerWeek = Math.ceil(totalOpenCount / (employeeCount * weeksInRange));
      const dynamicMaxPerWeek = Math.max(5, Math.min(tierMaxShiftsPerWeek, avgShiftsNeededPerEmployeePerWeek + 4));
      config.maxShiftsPerEmployee = (config.maxShiftsPerEmployee > 0 && config.maxShiftsPerEmployee <= dynamicMaxPerWeek) ? config.maxShiftsPerEmployee : dynamicMaxPerWeek;
      session.thoughtLog.push(`[Trinity] Demand analysis: ${totalOpenCount} open shifts, ${employeeCount} employees, ${daySpan.toFixed(0)} days (${weeksInRange.toFixed(1)} weeks) → tier cap ${tierMaxShiftsPerWeek}, dynamic max ${config.maxShiftsPerEmployee} shifts/employee/week, session timeout ${Math.round(sessionTimeoutMs / 1000)}s`);
      
      const ratio = totalOpenCount / Math.max(1, employeeCount);
      const pressureAssessment = ratio > 3 ? 'High pressure — more shifts than employees can comfortably handle.' :
        ratio > 1.5 ? 'Moderate demand — should be manageable with smart distribution.' :
        'Light workload — plenty of capacity available.';
      
      this.emitDeliberation(config.workspaceId, session, '', 'decision',
        `Demand vs capacity: ${totalOpenCount} open shifts / ${employeeCount} employees across ${daySpan.toFixed(0)} days. ${pressureAssessment}`);
      this.emitDeliberation(config.workspaceId, session, '', 'decision',
        `Setting max ${config.maxShiftsPerEmployee} shifts per employee per week to balance workload fairly.`);
      this.emitDeliberation(config.workspaceId, session, '', 'analysis',
        `Applying compliance rules: 12h daily cap, 8h minimum rest between shifts, overtime tracking, consecutive day limits...`);

      let totalConfidence = 0;
      let assignmentCount = 0;
      const runTracker = new RunAssignmentTracker();

      // Step 2.5: Pre-run conflict scan — detect and unassign pre-existing double-bookings
      const preRunConflicts = await this.scanAndResolvePreExistingConflicts(config, session, dateRanges);
      if (preRunConflicts > 0) {
        session.thoughtLog.push(`[Trinity] Pre-run cleanup: resolved ${preRunConflicts} pre-existing double-booking(s)`);
        this.emitDeliberation(config.workspaceId, session, '', 'action',
          `Found and resolved ${preRunConflicts} pre-existing double-booking conflict(s). Unassigned the later shift in each pair so scheduling starts clean.`);
      }

      // Step 3: Process each date range systematically (day by day)
      for (const dateRange of dateRanges) {
        session.thoughtLog.push(`[Trinity] Processing: ${dateRange.label}`);

        // Get open shifts for this date range
        const openShifts = await this.getOpenShiftsForRange(
          config.workspaceId,
          dateRange.start,
          dateRange.end
        );

        if (openShifts.length === 0) {
          session.thoughtLog.push(`[Trinity] No open shifts for ${dateRange.label}`);
          continue;
        }

        session.progress.totalShifts += openShifts.length;
        session.dayProgress.set(dateRange.label, { total: openShifts.length, filled: 0 });

        // Step 4: Prioritize shifts by urgency/value
        const prioritizedShifts = this.prioritizeShifts(openShifts, allClients, config.prioritizeBy);
        session.thoughtLog.push(`[Trinity] Prioritized ${prioritizedShifts.length} shifts for ${dateRange.label}`);

        // Step 5: Process each shift
        const isHighVolume = session.progress.totalShifts > 20;
        
        for (let i = 0; i < prioritizedShifts.length; i++) {
          const priorityShift = prioritizedShifts[i];
          
          // Session timeout guard — tier-aware, prevents infinite hangs
          const elapsed = Date.now() - session.startTime.getTime();
          if (elapsed > sessionTimeoutMs) {
            session.thoughtLog.push(`[Trinity] Session timeout after ${Math.round(elapsed / 1000)}s — processed ${session.progress.processedShifts}/${session.progress.totalShifts} shifts`);
            session.status = 'completed';
            broadcastToWorkspace(config.workspaceId, {
              type: 'trinity_scheduling_completed',
              sessionId,
              totalAssigned: session.progress.assignedShifts,
              totalFailed: session.progress.failedShifts,
              totalSkipped: session.progress.skippedShifts || 0,
              totalShifts: session.progress.totalShifts,
              openShiftsRemaining: session.progress.totalShifts - session.progress.processedShifts,
              duration: elapsed,
              timedOut: true,
              summary: {
                openShiftsFilled: session.progress.assignedShifts,
                openShiftsSkipped: session.progress.skippedShifts || 0,
                openShiftsRemaining: session.progress.totalShifts - session.progress.processedShifts,
                avgConfidence: assignmentCount > 0 ? Math.round((totalConfidence / assignmentCount) * 100) : 0,
              },
            });
            break;
          }

          // Throttled progress broadcast — avoid flooding WebSocket for high-volume runs
          this.throttledBroadcast(config.workspaceId, sessionId, {
            type: 'trinity_scheduling_progress',
            sessionId,
            currentShiftId: priorityShift.shiftId,
            currentIndex: session.progress.processedShifts + 1,
            totalShifts: session.progress.totalShifts,
            status: 'analyzing',
            message: `Analyzing: ${priorityShift.shift.title} (${priorityShift.urgencyLevel} priority)`,
            shiftTitle: priorityShift.shift.title,
            dayLabel: dateRange.label,
          }, isHighVolume);

          // Step 6: Find best employee for this shift
          const result = await this.assignShift(
            priorityShift,
            allEmployees,
            allClients,
            config,
            session,
            runTracker
          );

          session.progress.processedShifts++;

          if (result.success && result.employeeId) {
            session.progress.assignedShifts++;
            totalConfidence += result.confidence;
            assignmentCount++;
            
            const dayProg = session.dayProgress.get(dateRange.label);
            if (dayProg) dayProg.filled++;

            this.throttledBroadcast(config.workspaceId, sessionId, {
              type: 'trinity_scheduling_progress',
              sessionId,
              currentShiftId: priorityShift.shiftId,
              currentIndex: session.progress.processedShifts,
              totalShifts: session.progress.totalShifts,
              status: 'assigned',
              message: `Assigned: ${result.reasoning}`,
              shiftTitle: priorityShift.shift.title,
              employeeId: result.employeeId,
              confidence: result.confidence,
            }, isHighVolume);
          } else {
            session.progress.failedShifts++;
            session.progress.skippedShifts = (session.progress.skippedShifts || 0) + 1;
            
            this.throttledBroadcast(config.workspaceId, sessionId, {
              type: 'trinity_scheduling_progress',
              sessionId,
              currentShiftId: priorityShift.shiftId,
              currentIndex: session.progress.processedShifts,
              totalShifts: session.progress.totalShifts,
              status: 'skipped',
              message: `Skipped ${priorityShift.shift.title}: ${result.reasoning}`,
              shiftTitle: priorityShift.shift.title,
              skipReason: result.reasoning,
            }, isHighVolume);
          }

          const totalShifts = session.progress.totalShifts;
          if (totalShifts <= 50) {
            await new Promise(resolve => setTimeout(resolve, totalShifts > 20 ? 10 : 50));
          } else if (session.progress.processedShifts % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }

        session.thoughtLog.push(`[Trinity] Completed ${dateRange.label}: ${session.dayProgress.get(dateRange.label)?.filled || 0}/${openShifts.length} filled`);
      }

      // Step 7: Post-run validation — catch any conflicts that slipped through and auto-correct
      const validationResult = await this.validateAndCorrectAssignments(runTracker, config, session);
      if (validationResult.corrected > 0) {
        session.progress.assignedShifts -= validationResult.corrected;
        session.progress.failedShifts += validationResult.corrected;
        session.thoughtLog.push(`[Trinity] Post-run validation: reverted ${validationResult.corrected} conflicting assignment(s)`);
      }
      if (validationResult.issues.length > 0) {
        session.thoughtLog.push(`[Trinity] Post-run issues: ${validationResult.issues.join('; ')}`);
      }

      // Step 8: Complete session
      session.status = 'completed';
      const avgConfidence = assignmentCount > 0 ? totalConfidence / assignmentCount : 0;

      // Step 8: Generate staffing gap alert — summarize unfilled shifts and notify managers
      try {
        await this.generateStaffingGapAlert(config, session, dateRanges, allEmployees, allClients);
      } catch (gapErr) {
        log.error('[Trinity] Staffing gap alert generation failed:', gapErr);
        session.thoughtLog.push(`[Trinity] Warning: staffing gap alert failed — ${(gapErr as Error).message}`);
        broadcastToWorkspace(config.workspaceId, {
          type: 'trinity_staffing_gap_alert_failed',
          sessionId,
          error: (gapErr as Error).message,
          message: 'Trinity could not generate the staffing gap report. Managers may not receive unfilled shift notifications for this run.',
        });
      }

      // Broadcast completion
      broadcastToWorkspace(config.workspaceId, {
        type: 'trinity_scheduling_completed',
        sessionId,
        totalAssigned: session.progress.assignedShifts,
        totalFailed: session.progress.failedShifts,
        totalSkipped: session.progress.skippedShifts || session.progress.failedShifts,
        totalShifts: session.progress.totalShifts,
        openShiftsRemaining: session.progress.failedShifts,
        duration: Date.now() - session.startTime.getTime(),
        summary: {
          openShiftsFilled: session.progress.assignedShifts,
          openShiftsSkipped: session.progress.skippedShifts || session.progress.failedShifts,
          openShiftsRemaining: session.progress.failedShifts,
          avgConfidence: Math.round(avgConfidence * 100),
        },
      });

      // Audit log
      await auditLogger.logSystemAction({
        actionType: 'TRINITY_AUTONOMOUS_SCHEDULING',
        targetEntityType: 'shift',
        targetEntityId: sessionId,
        workspaceId: config.workspaceId,
        payload: {
          userId: config.userId,
          mode: config.mode,
          totalProcessed: session.progress.processedShifts,
          totalAssigned: session.progress.assignedShifts,
          totalFailed: session.progress.failedShifts,
          avgConfidence,
        },
      });

      // AI usage billing is handled at the call level by meteredGemini/meteredGpt.
      // Each AI call inside this session was already metered and recorded in aiUsageEvents.
      // No post-session credit deduction is needed — doing so would double-bill.
      const shiftsAssigned = session.progress.assignedShifts;
      session.thoughtLog.push(`[Trinity] Session complete: ${shiftsAssigned} shifts assigned. AI usage billed per-call via metered clients.`);

      return {
        success: true,
        session,
        summary: {
          totalProcessed: session.progress.processedShifts,
          totalAssigned: session.progress.assignedShifts,
          totalFailed: session.progress.failedShifts,
          daysProcessed: session.dayProgress.size,
          avgConfidence,
        },
      };

    } catch (error: unknown) {
      session.status = 'failed';
      session.thoughtLog.push(`[Trinity] ERROR: ${(error instanceof Error ? error.message : String(error))}`);
      
      broadcastToWorkspace(config.workspaceId, {
        type: 'trinity_scheduling_error',
        sessionId,
        error: (error instanceof Error ? error.message : String(error)),
      });

      throw error;
    } finally {
      this.activeSessions.delete(sessionId);
      this.lastBroadcastTime.delete(sessionId);
    }
  }

  /**
   * Get date ranges based on scheduling mode
   * Processes day-by-day for precise control and spread
   */
  private getDateRanges(mode: string): Array<{ label: string; start: Date; end: Date }> {
    const ranges: Array<{ label: string; start: Date; end: Date }> = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let totalDays = 1;
    let startOffset = 0;
    if (mode === 'current_day') {
      totalDays = 1;
    } else if (mode === 'current_week') {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startOffset = mondayOffset;
      totalDays = 7;
    } else if (mode === 'next_week') {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startOffset = mondayOffset;
      totalDays = 14;
    } else if (mode === 'full_month') {
      totalDays = 30;
    } else if (mode === 'full_quarter') {
      totalDays = 90;
    }

    for (let i = 0; i < totalDays; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() + startOffset + i);
      day.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      let label: string;
      if (i === 0) {
        label = 'Today';
      } else if (i === 1) {
        label = 'Tomorrow';
      } else {
        label = day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      }

      ranges.push({ label, start: day, end: dayEnd });
    }

    return ranges;
  }

  /**
   * Load all employees for workspace
   */
  private async loadEmployees(workspaceId: string): Promise<any[]> {
    return db.select()
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));
  }

  /**
   * Load all clients for workspace
   */
  private async loadClients(workspaceId: string): Promise<any[]> {
    return db.select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));
  }

  /**
   * Load historical scheduling patterns
   */
  private async loadHistoricalPatterns(workspaceId: string): Promise<unknown> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const historicalShifts = await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, threeMonthsAgo),
        sql`${shifts.employeeId} IS NOT NULL`
      ));

    return {
      totalShifts: historicalShifts.length,
      patterns: this.analyzePatterns(historicalShifts),
    };
  }

  /**
   * Analyze historical patterns for learning
   */
  private analyzePatterns(historicalShifts: any[]): any {
    const patterns: any = {
      dayOfWeek: new Map<number, number>(),
      hourOfDay: new Map<number, number>(),
      clientFrequency: new Map<string, number>(),
      employeeClientPairs: new Map<string, number>(),
    };

    for (const shift of historicalShifts) {
      const startTime = new Date(shift.startTime);
      const dayOfWeek = startTime.getDay();
      const hourOfDay = startTime.getHours();

      patterns.dayOfWeek.set(dayOfWeek, (patterns.dayOfWeek.get(dayOfWeek) || 0) + 1);
      patterns.hourOfDay.set(hourOfDay, (patterns.hourOfDay.get(hourOfDay) || 0) + 1);
      
      if (shift.clientId) {
        patterns.clientFrequency.set(shift.clientId, (patterns.clientFrequency.get(shift.clientId) || 0) + 1);
      }
      
      if (shift.employeeId && shift.clientId) {
        const pair = `${shift.employeeId}:${shift.clientId}`;
        patterns.employeeClientPairs.set(pair, (patterns.employeeClientPairs.get(pair) || 0) + 1);
      }
    }

    return patterns;
  }

  /**
   * Get open (unassigned) shifts for a date range
   */
  private async getOpenShiftsForRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, startDate),
        lte(shifts.startTime, endDate),
        or(
          isNull(shifts.isManuallyLocked),
          eq(shifts.isManuallyLocked, false)
        )
      ))
      .orderBy(asc(shifts.startTime));
  }

  /**
   * Prioritize shifts by urgency/value
   */
  private getShiftTimeInTimezone(shiftStart: Date, timezone: string): { day: string; timeStr: string } {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    try {
      const formatted = shiftStart.toLocaleString('en-US', {
        timeZone: timezone,
        hour12: false,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const parts = formatted.split(', ');
      const day = (parts[0] || '').toLowerCase();
      const timePart = parts[1] || '00:00';
      return { day, timeStr: timePart.substring(0, 5) };
    } catch {
      const day = dayNames[shiftStart.getDay()];
      const timeStr = `${String(shiftStart.getHours()).padStart(2, '0')}:${String(shiftStart.getMinutes()).padStart(2, '0')}`;
      return { day, timeStr };
    }
  }

  private isShiftWithinCoverageWindow(shift: any, client: any): boolean {
    if (!client) return true;
    if (!client.coverageType || client.coverageType === '24_7') return true;

    const shiftStart = new Date(shift.startTime);
    const tz = client.coverageTimezone || 'America/New_York';
    const { day: shiftDay, timeStr: shiftTimeStr } = this.getShiftTimeInTimezone(shiftStart, tz);

    if (client.coverageDays && Array.isArray(client.coverageDays) && client.coverageDays.length > 0) {
      if (!client.coverageDays.includes(shiftDay)) return false;
    }

    if (client.coverageStartTime && client.coverageEndTime) {
      if (shiftTimeStr < client.coverageStartTime || shiftTimeStr > client.coverageEndTime) {
        return false;
      }
    }

    return true;
  }

  private prioritizeShifts(
    openShifts: any[],
    allClients: any[],
    prioritizeBy: string
  ): ShiftPriority[] {
    const now = new Date();
    const clientMap = new Map(allClients.map(c => [c.id, c]));

    const skippedByCoverage = openShifts.filter(shift => {
      const client = clientMap.get(shift.clientId);
      return !this.isShiftWithinCoverageWindow(shift, client);
    }).length;
    if (skippedByCoverage > 0) {
      log.info(`[Trinity] Coverage filter: ${skippedByCoverage}/${openShifts.length} shifts outside client coverage windows (still scheduling them — coverage is advisory)`);
    }

    const prioritized: ShiftPriority[] = openShifts.map(shift => {
      const client = clientMap.get(shift.clientId);
      const startTime = new Date(shift.startTime);
      const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Calculate days unfilled (if createdAt available)
      const createdAt = shift.createdAt ? new Date(shift.createdAt) : now;
      const daysUnfilled = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      // Contract value (default to rate or estimate)
      const contractValue = safeParseFloat(shift.contractRate || shift.hourlyRateOverride, 25);

      // Client tier (premium, standard, basic)
      const clientTier = client?.strategicTier || 'standard';
      const tierScore = clientTier === 'premium' ? 1.0 : clientTier === 'standard' ? 0.6 : 0.3;

      // Calculate priority score
      let priorityScore = 0;

      // Hours until start (closer = more urgent)
      const urgencyFromTime = Math.max(0, 1 - (hoursUntilStart / 168)); // 168 hours = 1 week
      priorityScore += urgencyFromTime * URGENCY_WEIGHTS.hoursUntilStart;

      // Contract value
      const valueScore = Math.min(1, contractValue / 100); // Normalize to 0-1
      priorityScore += valueScore * URGENCY_WEIGHTS.contractValue;

      // Client tier
      priorityScore += tierScore * URGENCY_WEIGHTS.clientTier;

      // Days unfilled
      const unfilledScore = Math.min(1, daysUnfilled / 7);
      priorityScore += unfilledScore * URGENCY_WEIGHTS.daysUnfilled;

      // Determine urgency level
      let urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
      if (hoursUntilStart < 4) {
        urgencyLevel = 'critical';
      } else if (hoursUntilStart < 24) {
        urgencyLevel = 'high';
      } else if (hoursUntilStart < 72) {
        urgencyLevel = 'medium';
      } else {
        urgencyLevel = 'low';
      }

      return {
        shiftId: shift.id,
        shift,
        priorityScore,
        urgencyLevel,
        factors: {
          hoursUntilStart,
          contractValue,
          clientTier,
          daysUnfilled,
          isRecurring: shift.isRecurring || false,
        },
      };
    });

    // Sort by priority score (highest first)
    return prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Assign a shift to the best available employee
   */
  private async assignShift(
    priorityShift: ShiftPriority,
    allEmployees: any[],
    allClients: any[],
    config: SchedulingConfig,
    session: SchedulingSession,
    runTracker: RunAssignmentTracker
  ): Promise<AssignmentResult> {
    const shift = priorityShift.shift;
    const client = allClients.find(c => c.id === shift.clientId);
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);

    session.thoughtLog.push(`[Trinity] Evaluating candidates for: ${shift.title}`);

    const timeStr = shiftStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTimeStr = shiftEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const clientName = client?.companyName || 'Unknown Site';

    this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
      `Thinking... Who can cover ${shift.title} at ${clientName}? (${timeStr}–${endTimeStr}, ${shiftHours.toFixed(1)}h)`);

    const nowForUrgency = new Date();
    const hoursUntilShift = (new Date(shift.startTime).getTime() - nowForUrgency.getTime()) / (1000 * 60 * 60);
    const isUrgentShift = hoursUntilShift >= 0 && hoursUntilShift <= 4;

    if (isUrgentShift) {
      this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
        `Urgent fill needed — this shift starts in ${hoursUntilShift.toFixed(1)}h. Standard 8h rest and 12h daily caps are being evaluated with emergency rules: I'll consider officers with as little as 2h rest if they're overtime-eligible, and allow up to 16h total daily hours. This is how real security ops work.`);
    } else {
      this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
        `Screening ${allEmployees.length} employees — checking availability, rest periods, daily hour caps, certifications...`);
    }

    const scoredEmployees = await this.scoreEmployeesForShift(
      shift,
      allEmployees,
      client,
      config,
      runTracker
    );

    // Surface second-shift and emergency extension scenarios in Trinity's deliberation
    const secondShiftCandidates = scoredEmployees.filter(e => e.isSecondShiftToday && e.disqualifyReasons.length === 0);
    const emergencyExtensions = scoredEmployees.filter(e => e.isEmergencyExtension);
    if (secondShiftCandidates.length > 0) {
      const names = secondShiftCandidates.slice(0, 3).map(e => e.employee.firstName).join(', ');
      this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
        `I see ${secondShiftCandidates.length} officer${secondShiftCandidates.length > 1 ? 's' : ''} who would be taking their second shift today: ${names}. This happens — officers stay late, pick up extra shifts. I'm considering them but will prefer fully-rested candidates first.`);
    }
    if (emergencyExtensions.length > 0) {
      const best = emergencyExtensions[0];
      this.emitDeliberation(config.workspaceId, session, shift.id, 'review',
        `Emergency scenario: ${best.employee.firstName} ${best.employee.lastName} already has ${(best.emergencyOverrideNote || '').match(/(\d+\.?\d*)h today/)?.[1] || '?'}h today but is overtime-eligible. Because this shift starts in ${hoursUntilShift.toFixed(1)}h with no rested alternatives, I'm applying emergency rules. Manager must review this assignment.`);
    }

    const qualifiedEmployees = scoredEmployees.filter(e => e.disqualifyReasons.length === 0);
    const disqualifiedCount = scoredEmployees.length - qualifiedEmployees.length;

    if (disqualifiedCount > 0) {
      const topReasons = scoredEmployees
        .filter(e => e.disqualifyReasons.length > 0)
        .flatMap(e => e.disqualifyReasons);
      const reasonCounts = new Map<string, number>();
      for (const r of topReasons) {
        const key = r.split('(')[0].trim();
        reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
      }
      const sortedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const reasonSummary = sortedReasons.map(([reason, count]) => `${count}x ${reason}`).join(', ');
      
      this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
        `Eliminated ${disqualifiedCount}/${scoredEmployees.length} employees: ${reasonSummary}`);
      
      if (qualifiedEmployees.length > 0 && qualifiedEmployees.length <= 3) {
        this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
          `Tight staffing — only ${qualifiedEmployees.length} candidate${qualifiedEmployees.length > 1 ? 's' : ''} remain${qualifiedEmployees.length === 1 ? 's' : ''}. Need to be strategic here.`);
      }
    }

    let isOvertimeAssignment = false;
    
    if (qualifiedEmployees.length === 0) {
      session.thoughtLog.push(`[Trinity] No qualified employees for ${shift.title} (standard caps)`);
      
      const topBlockers = scoredEmployees
        .filter(e => e.disqualifyReasons.length > 0)
        .slice(0, 2)
        .map(e => `${e.employee.firstName}: ${e.disqualifyReasons[0]}`);
      
      // Check if weekly hours cap was the dominant blocker — if so, try OT fallback
      // OT is expensive but an unfilled post means lost contract revenue and SLA violations
      const allReasons = scoredEmployees.flatMap(e => e.disqualifyReasons);
      const weeklyCapBlocked = allReasons.filter(r => r.includes('weekly cap')).length;
      const totalBlocked = allReasons.length;
      const weeklyCapIsDominant = weeklyCapBlocked > 0 && (weeklyCapBlocked / Math.max(1, totalBlocked)) > 0.2;
      
      if (weeklyCapIsDominant) {
        this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
          `Standard 40h W2 cap blocked ${weeklyCapBlocked} employees. OT is expensive but an empty post is worse — re-evaluating with overtime allowance (W2 up to 50h hard cap, 1099 up to 70h)...`);
        
        const otScored = await this.scoreEmployeesForShift(shift, allEmployees, client, config, runTracker, true);
        const otQualified = otScored.filter(e => e.disqualifyReasons.length === 0);
        
        if (otQualified.length > 0) {
          // Apply OT penalty — STRONGLY prefer employees with fewest existing weekly hours
          // This prevents stacking 64h on one person while others have capacity
          const otWeekStart = new Date(shiftStart);
          otWeekStart.setDate(otWeekStart.getDate() - otWeekStart.getDay());
          otWeekStart.setHours(0, 0, 0, 0);
          const otWeekEnd = new Date(otWeekStart);
          otWeekEnd.setDate(otWeekEnd.getDate() + 6);
          otWeekEnd.setHours(23, 59, 59, 999);
          for (const emp of otQualified) {
            const runHrs = runTracker.getWeeklyHours(emp.employee.id, otWeekStart, otWeekEnd);
            const otDepthPenalty = Math.min(0.5, runHrs / 40 * 0.3);
            emp.score = Math.max(0.01, emp.score - 0.15 - otDepthPenalty);
          }
          otQualified.sort((a, b) => b.score - a.score);
          
          const best = otQualified[0];
          this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
            `OT fallback: ${best.employee.firstName} ${best.employee.lastName} can cover this shift with overtime. Assigning with OT flag for manager review.`);
          
          session.thoughtLog.push(`[Trinity] OT fallback: ${best.employee.firstName} ${best.employee.lastName} for ${shift.title}`);
          
          // Promote OT candidates into the qualified list and continue normal assignment flow
          qualifiedEmployees.push(...otQualified);
          isOvertimeAssignment = true;
        } else {
          this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
            `Even with OT allowance, no one qualifies — other blockers (rest period, daily cap, conflicts) still prevent assignment.`);
        }
      } else {
        this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
          `Problem: No one available for ${shift.title}. Every employee is blocked. Top blockers: ${topBlockers.join('; ')}`);
      }
      
      // If still empty after OT fallback, try contractor pool then give up
      if (qualifiedEmployees.length === 0) {
        this.emitDeliberation(config.workspaceId, session, shift.id, 'review',
          `Should I flag this for manual review? This shift at ${clientName} may need contractor coverage or schedule adjustments.`);
        
        if (config.useContractorFallback) {
          this.emitDeliberation(config.workspaceId, session, shift.id, 'action',
            `Escalating: Searching contractor pool for emergency coverage at ${clientName}...`);
          const contractorResult = await this.tryContractorFallback(shift, config.workspaceId);
          if (contractorResult.success) {
            return contractorResult;
          }
          this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
            `No contractors available either. Marking shift as unassigned — needs manager attention.`);
        }

        return {
          shiftId: shift.id,
          employeeId: null,
          success: false,
          confidence: 0,
          reasoning: `No qualified employees for ${shift.title} at ${clientName}`,
          escalationLevel: 2,
        };
      }
    }

    if (qualifiedEmployees.length >= 2) {
      const top2 = qualifiedEmployees.slice(0, 2);
      const scoreDiff = ((top2[0].score - top2[1].score) * 100).toFixed(0);
      const isClose = Number(scoreDiff) < 5;
      
      this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
        `${qualifiedEmployees.length} candidates passed screening. Comparing top picks...`);
      
      this.emitDeliberation(config.workspaceId, session, shift.id, 'analysis',
        isClose
          ? `Close call: ${top2[0].employee.firstName} ${top2[0].employee.lastName} (${(top2[0].score * 100).toFixed(0)}%) vs ${top2[1].employee.firstName} ${top2[1].employee.lastName} (${(top2[1].score * 100).toFixed(0)}%) — only ${scoreDiff}% apart. Examining reliability and workload balance...`
          : `Clear winner: ${top2[0].employee.firstName} ${top2[0].employee.lastName} (${(top2[0].score * 100).toFixed(0)}%) leads ${top2[1].employee.firstName} ${top2[1].employee.lastName} (${(top2[1].score * 100).toFixed(0)}%) by ${scoreDiff}%`);
    } else {
      this.emitDeliberation(config.workspaceId, session, shift.id, 'decision',
        `Only 1 qualified candidate: ${qualifiedEmployees[0].employee.firstName} ${qualifiedEmployees[0].employee.lastName} (${(qualifiedEmployees[0].score * 100).toFixed(0)}% match). Proceeding with assignment.`);
    }

    const bestEmployee = qualifiedEmployees[0];
    const bd = bestEmployee.breakdown;
    
    const strengths: string[] = [];
    const concerns: string[] = [];
    if (bd.reliabilityScore >= 0.8) strengths.push('highly reliable');
    else if (bd.reliabilityScore < 0.5) concerns.push('reliability concerns');
    if (bd.proximityScore >= 0.7) strengths.push('close proximity');
    else if (bd.proximityScore < 0.3) concerns.push('far from site');
    if (bd.performanceScore >= 0.8) strengths.push('strong performer');
    if (bd.workloadBalance < 0.3) concerns.push('already heavy workload');
    if (bestEmployee.certWarnings && bestEmployee.certWarnings.length > 0) {
      concerns.push(...bestEmployee.certWarnings.map(w => `CERT: ${w}`));
    }
    
    const assessmentParts: string[] = [];
    if (strengths.length > 0) assessmentParts.push(`Strengths: ${strengths.join(', ')}`);
    if (concerns.length > 0) assessmentParts.push(`Watch: ${concerns.join(', ')}`);
    assessmentParts.push(`Overall: reliability ${(bd.reliabilityScore * 100).toFixed(0)}%, proximity ${(bd.proximityScore * 100).toFixed(0)}%, performance ${(bd.performanceScore * 100).toFixed(0)}%, balance ${(bd.workloadBalance * 100).toFixed(0)}%`);
    
    this.emitDeliberation(config.workspaceId, session, shift.id, 'review',
      `${bestEmployee.employee.firstName} assessment: ${assessmentParts.join('. ')}`);
    
    if (bestEmployee.isEmergencyExtension && bestEmployee.emergencyOverrideNote) {
      this.emitDeliberation(config.workspaceId, session, shift.id, 'action',
        `EMERGENCY OVERRIDE APPLIED — ${bestEmployee.emergencyOverrideNote}`);
    } else if (bestEmployee.isSecondShiftToday) {
      this.emitDeliberation(config.workspaceId, session, shift.id, 'action',
        `${bestEmployee.employee.firstName} will be working their second shift today. This is a legitimate security ops scenario — I'm allowing it because they meet the rest requirement and are within hourly limits. Manager is aware via shift flags.`);
    }

    // GAP-FIX: Always stamp payRate at assignment time so time_entries → payroll has a base rate.
    // Previously this was omitted causing 0-rate payroll rows for every AI-assigned shift.
    const assignedPayRate = (
      bestEmployee.employee.hourlyRate ||
      (bestEmployee as any).employee.payRate ||
      (bestEmployee as any).employee.currentHourlyRate ||
      '0'
    ).toString();

    // BELT-AND-SUSPENDERS: Final real-time DB overlap check before committing assignment.
    // The runTracker prevents in-run overlaps, but this catches edge cases from external
    // concurrent writes (manual assignments, other scheduler instances).
    const dbOverlapCheck = await db.select({ id: shifts.id })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, config.workspaceId),
        eq(shifts.employeeId, bestEmployee.employeeId),
        sql`${shifts.startTime} < ${shiftEnd}`,
        sql`${shifts.endTime} > ${shiftStart}`,
      ))
      .limit(1);

    if (dbOverlapCheck.length > 0) {
      session.thoughtLog.push(`[Trinity] BLOCKED: DB overlap detected for ${bestEmployee.employee.firstName} ${bestEmployee.employee.lastName} on ${shift.title} — another process assigned a conflicting shift`);
      return {
        shiftId: shift.id,
        employeeId: null,
        success: false,
        confidence: 0,
        reasoning: `Double-booking prevented: ${bestEmployee.employee.firstName} ${bestEmployee.employee.lastName} has a conflicting shift in DB`,
        escalationLevel: 1,
      };
    }

    // Record in runTracker BEFORE the DB write so that if the write is slow,
    // any concurrent in-process scoring already sees this assignment.
    runTracker.record({
      shiftId: shift.id,
      employeeId: bestEmployee.employeeId,
      startTime: shiftStart,
      endTime: shiftEnd,
      shiftHours,
    });

    // FIX 3b: Final employment status check before DB commit (race-condition guard)
    const [empStatusCheck] = await db.select({ isActive: employees.isActive })
      .from(employees)
      .where(eq(employees.id, bestEmployee.employeeId))
      .limit(1);
    if (!empStatusCheck || empStatusCheck.isActive === false) {
      session.thoughtLog.push(`[Trinity] BLOCKED: Employee ${bestEmployee.employeeId} deactivated between scoring and commit — skipping shift ${shift.id}`);
      return { shiftId: shift.id, employeeId: null, success: false, confidence: 0, reasoning: 'Employee deactivated before assignment could be committed.', escalationLevel: 2 };
    }

    const otNote = isOvertimeAssignment ? 'OT APPROVED — assigned via overtime fallback. Manager review recommended.' : undefined;
    const notesValue = bestEmployee.isEmergencyExtension
      ? bestEmployee.emergencyOverrideNote
      : otNote;

    // G21 FIX: Atomic shift assignment — WHERE includes isNull(shifts.employeeId)
    // so the UPDATE only succeeds if no one else has already claimed this shift.
    // If a concurrent manual assignment or a parallel scheduler cycle races us,
    // rowCount === 0 and we return ALREADY_ASSIGNED without overwriting the winner.
    const [atomicAssignment] = await db.update(shifts)
      .set({
        employeeId: bestEmployee.employeeId,
        status: 'scheduled',
        aiGenerated: true,
        payRate: assignedPayRate,
        ...(notesValue ? { notes: notesValue } : {}),
      })
      .where(and(eq(shifts.id, shift.id), isNull(shifts.employeeId)))
      .returning({ id: shifts.id });

    if (!atomicAssignment) {
      session.thoughtLog.push(
        `[Trinity] ALREADY_ASSIGNED: Shift ${shift.id} was claimed by a concurrent request — skipping`
      );
      return {
        shiftId: shift.id,
        employeeId: null,
        success: false,
        confidence: 0,
        reasoning: 'Shift already assigned by a concurrent request (ALREADY_ASSIGNED). No action taken.',
        escalationLevel: 0,
      };
    }

    const assignmentLabel = bestEmployee.isEmergencyExtension
      ? `EMERGENCY EXTENSION`
      : isOvertimeAssignment
        ? `OT ASSIGNED`
        : bestEmployee.isSecondShiftToday
          ? `2ND SHIFT`
          : `ASSIGNED`;

    session.thoughtLog.push(`[Trinity] ${assignmentLabel}: ${bestEmployee.employee.firstName} ${bestEmployee.employee.lastName} → ${shift.title} (score: ${bestEmployee.score.toFixed(2)})`);

    return {
      shiftId: shift.id,
      employeeId: bestEmployee.employeeId,
      success: true,
      confidence: bestEmployee.score,
      reasoning: `${bestEmployee.employee.firstName} ${bestEmployee.employee.lastName} (score: ${(bestEmployee.score * 100).toFixed(0)}%)${bestEmployee.isEmergencyExtension ? ' — EMERGENCY EXTENSION: manager review required' : isOvertimeAssignment ? ' — OT fallback: manager review' : bestEmployee.isSecondShiftToday ? ' — 2nd shift today' : ''}`,
      escalationLevel: isOvertimeAssignment ? 1 : 0,
    };
  }

  private emitDeliberation(workspaceId: string, session: SchedulingSession, shiftId: string, stepType: string, message: string): void {
    broadcastToWorkspace(workspaceId, {
      type: 'trinity_scheduling_progress',
      sessionId: session.sessionId,
      currentShiftId: shiftId,
      currentIndex: session.progress.processedShifts + 1,
      totalShifts: session.progress.totalShifts,
      status: 'deliberating',
      deliberationType: stepType,
      message,
    });
  }

  /**
   * Throttled WebSocket broadcast — prevents flooding clients during high-volume scheduling runs.
   * For runs >20 shifts, only broadcasts every WS_THROTTLE_INTERVAL_MS (200ms).
   * Always broadcasts the final shift and assignment results.
   */
  private throttledBroadcast(workspaceId: string, sessionId: string, payload: any, isHighVolume: boolean): void {
    if (!isHighVolume) {
      broadcastToWorkspace(workspaceId, payload);
      return;
    }

    const now = Date.now();
    const lastTime = this.lastBroadcastTime.get(sessionId) || 0;
    const isLastShift = payload.currentIndex === payload.totalShifts;
    const isResultStatus = payload.status === 'assigned' || payload.status === 'skipped';

    if (isLastShift || isResultStatus || (now - lastTime >= WS_THROTTLE_INTERVAL_MS)) {
      broadcastToWorkspace(workspaceId, payload);
      this.lastBroadcastTime.set(sessionId, now);
    }
  }

  private scoringCache = new Map<string, { data: any; expiry: number }>();

  private getCachedOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.scoringCache.get(key);
    if (cached && Date.now() < cached.expiry) return Promise.resolve(cached.data as T);
    return fetcher().then(data => {
      this.scoringCache.set(key, { data, expiry: Date.now() + ttlMs });
      return data;
    });
  }

  clearScoringCache(): void {
    this.scoringCache.clear();
  }

  /**
   * Score all employees for a specific shift
   * Checks availability, daily hours cap (12h), rest period (8h), weekly limits,
   * rate profitability, and conflict detection
   * Uses caching for DB lookups to avoid redundant queries during bulk scheduling
   */
  private async scoreEmployeesForShift(
    shift: any,
    allEmployees: any[],
    client: any,
    config: SchedulingConfig,
    runTracker: RunAssignmentTracker,
    overtimeFallback: boolean = false
  ): Promise<EmployeeScore[]> {
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const shiftDayOfWeek = shiftStart.getDay();
    const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
    const shiftStartHHMM = `${String(shiftStart.getHours()).padStart(2, '0')}:${String(shiftStart.getMinutes()).padStart(2, '0')}`;
    const shiftEndHHMM = `${String(shiftEnd.getHours()).padStart(2, '0')}:${String(shiftEnd.getMinutes()).padStart(2, '0')}`;

    const MAX_DAILY_HOURS = 12;
    const MIN_REST_HOURS = 8;

    // Determine urgency — shifts starting within 4 hours are considered emergency fills.
    // Real security ops reality: a NCNS or last-minute call-off at 2am cannot wait for a rested
    // replacement. An overtime-eligible officer who is willing to stay late or take a second shift
    // is the only realistic option. We relax constraints but flag the override clearly.
    const now = new Date();
    const hoursUntilStart = (shiftStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isUrgentFill = hoursUntilStart >= 0 && hoursUntilStart <= 4;
    const EMERGENCY_MIN_REST_HOURS = 2;   // Absolute safety floor — prevents truly back-to-back doubles
    const EMERGENCY_MAX_DAILY_HOURS = 16; // Allows one full emergency extension (e.g., 8h shift + 8h extension)

    const weekStart = new Date(shiftStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekKey = `week-${config.workspaceId}-${weekStart.toISOString().slice(0, 10)}`;

    const dayStart = new Date(shiftStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(shiftStart);
    dayEnd.setHours(23, 59, 59, 999);
    const dayKey = `day-${config.workspaceId}-${dayStart.toISOString().slice(0, 10)}`;

    const prevDayStart = new Date(dayStart);
    prevDayStart.setDate(prevDayStart.getDate() - 1);
    const nextDayEnd = new Date(dayEnd);
    nextDayEnd.setDate(nextDayEnd.getDate() + 1);
    const nearbyKey = `nearby-${config.workspaceId}-${dayStart.toISOString().slice(0, 10)}`;
    const availKey = `avail-${config.workspaceId}-${shiftDayOfWeek}`;

    const CACHE_TTL = 60000;
    const weekHoursKey = `weekhours-${config.workspaceId}-${weekStart.toISOString().slice(0, 10)}`;

    const [weeklyAssignments, weeklyHoursRows, sameDayShifts, nearbyShifts, availabilityRecords] = await Promise.all([
      this.getCachedOrFetch(weekKey, CACHE_TTL, () =>
        db.select({
          employeeId: shifts.employeeId,
          count: sql<number>`count(*)`,
        })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, config.workspaceId),
            sql`${shifts.employeeId} IS NOT NULL`,
            gte(shifts.startTime, weekStart),
            lte(shifts.startTime, weekEnd)
          ))
          .groupBy(shifts.employeeId)
      ),
      this.getCachedOrFetch(weekHoursKey, CACHE_TTL, () =>
        db.select({
          employeeId: shifts.employeeId,
          totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 3600.0), 0)`,
        })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, config.workspaceId),
            sql`${shifts.employeeId} IS NOT NULL`,
            gte(shifts.startTime, weekStart),
            lte(shifts.startTime, weekEnd)
          ))
          .groupBy(shifts.employeeId)
      ),
      this.getCachedOrFetch(dayKey, CACHE_TTL, () =>
        db.select()
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, config.workspaceId),
            sql`${shifts.employeeId} IS NOT NULL`,
            lte(shifts.startTime, dayEnd),
            gte(shifts.endTime, dayStart)
          ))
      ),
      this.getCachedOrFetch(nearbyKey, CACHE_TTL, () =>
        db.select()
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, config.workspaceId),
            sql`${shifts.employeeId} IS NOT NULL`,
            gte(shifts.startTime, prevDayStart),
            lte(shifts.endTime, nextDayEnd)
          ))
      ),
      this.getCachedOrFetch(availKey, CACHE_TTL, () =>
        db.select()
          .from(employeeAvailability)
          .where(and(
            eq(employeeAvailability.workspaceId, config.workspaceId),
            eq(employeeAvailability.dayOfWeek, shiftDayOfWeek),
            eq(employeeAvailability.status, 'available')
          ))
      ),
    ]);

    const assignmentMap = new Map(weeklyAssignments.map(a => [a.employeeId, Number(a.count)]));
    const weeklyHoursMap = new Map(weeklyHoursRows.map(a => [a.employeeId, Number(a.totalHours)]));

    const dailyShiftMap = new Map<string, any[]>();
    for (const s of sameDayShifts) {
      if (!s.employeeId) continue;
      if (!dailyShiftMap.has(s.employeeId)) dailyShiftMap.set(s.employeeId, []);
      dailyShiftMap.get(s.employeeId)!.push(s);
    }

    const nearbyShiftMap = new Map<string, any[]>();
    for (const s of nearbyShifts) {
      if (!s.employeeId) continue;
      if (!nearbyShiftMap.has(s.employeeId)) nearbyShiftMap.set(s.employeeId, []);
      nearbyShiftMap.get(s.employeeId)!.push(s);
    }

    const availabilityByEmployee = new Map<string, any[]>();
    for (const a of availabilityRecords) {
      if (!availabilityByEmployee.has(a.employeeId)) availabilityByEmployee.set(a.employeeId, []);
      availabilityByEmployee.get(a.employeeId)!.push(a);
    }

    // Contract rate for profitability comparison
    const contractRate = safeParseFloat(shift.contractRate || shift.hourlyRateOverride, 30);

    // Score each employee
    const scores: EmployeeScore[] = [];

    for (const employee of allEmployees) {
      const disqualifyReasons: string[] = [];

      // 0. Compliance hard-block — critical-tier officers (score < 60) cannot be auto-assigned
      const empComplianceScore = safeParseFloat(employee.complianceScore, 100);
      if (empComplianceScore < 60) {
        disqualifyReasons.push(`Compliance hard-block: score ${empComplianceScore.toFixed(0)}/100 (minimum 60 required for auto-assignment)`);
      }

      // 0.b Texas Regulatory Gatekeeper (OC Ch. 1702 — §1702.161 / §1702.163 / §1702.201 / §1702.323)
      // Only runs when the workspace is in Texas. Each outcome carries the OC § citation so the
      // disqualifyReason matches the canonical regulatoryReference written to trinity_decision_log.
      const gatekeeperOutcomes: GatekeeperOutcome[] = config.stateCode
        ? evaluateTexasGatekeeper(shift, employee, config.stateCode)
        : [];
      for (const outcome of gatekeeperOutcomes) {
        if (outcome.kind === 'block' || outcome.kind === 'downgrade') {
          disqualifyReasons.push(outcome.reason);
        }
      }

      // 1. Check for overlapping shift conflicts (DB-loaded + in-run assignments)
      const empConflictShifts = nearbyShiftMap.get(employee.id) || [];
      const hasDbConflict = empConflictShifts.some(s => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = new Date(s.endTime).getTime();
        return sStart < shiftEnd.getTime() && sEnd > shiftStart.getTime();
      });
      const hasRunConflict = runTracker.hasOverlap(employee.id, shiftStart, shiftEnd);
      if (hasDbConflict || hasRunConflict) {
        disqualifyReasons.push('Schedule conflict');
      }

      // 2. Check employee availability for this day/time — ADVISORY ONLY (scoring penalty, not a blocker)
      let outsideAvailability = false;
      if (config.respectAvailability) {
        const empAvail = availabilityByEmployee.get(employee.id);
        if (empAvail && empAvail.length > 0) {
          const now = new Date();
          const activeAvail = empAvail.filter(a => {
            if (a.effectiveUntil && new Date(a.effectiveUntil) < now) return false;
            if (a.effectiveFrom && new Date(a.effectiveFrom) > shiftStart) return false;
            return true;
          });
          if (activeAvail.length > 0) {
            const isAvailable = activeAvail.some(a => {
              if (a.endTime < a.startTime) {
                return shiftStartHHMM >= a.startTime || shiftEndHHMM <= a.endTime;
              }
              return a.startTime <= shiftStartHHMM && a.endTime >= shiftEndHHMM;
            });
            if (!isAvailable) {
              outsideAvailability = true;
            }
          }
        }
      }

      // Determine if employee is a 1099 contractor (higher weekly hour cap, but safety limits still apply)
      const isContractor = employee.is1099Eligible === true;

      // 3. Check daily hours cap (max 12 hours per day, 16h emergency) — DB + in-run
      // Real-world scenario: an officer on a morning shift may be the only available person when
      // a co-worker no-calls on the evening shift at the same site. Security posts cannot go dark.
      // We allow emergency extensions up to 16h/day but only for overtime-eligible employees,
      // and we flag every such override explicitly so managers can review.
      const isOvertimeEligible = employee.overtimeEligible !== false;
      const effectiveDailyMax = (isUrgentFill && isOvertimeEligible) ? EMERGENCY_MAX_DAILY_HOURS : MAX_DAILY_HOURS;

      const employeeDayShifts = dailyShiftMap.get(employee.id) || [];
      let dailyHours = 0;
      const existingDayShiftCount = employeeDayShifts.length;
      for (const ds of employeeDayShifts) {
        const dsStart = new Date(ds.startTime);
        const dsEnd = new Date(ds.endTime);
        const overlapStart = dsStart > dayStart ? dsStart : dayStart;
        const overlapEnd = dsEnd < dayEnd ? dsEnd : dayEnd;
        if (overlapEnd > overlapStart) {
          dailyHours += (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
        }
      }
      dailyHours += runTracker.getDailyHours(employee.id, dayStart, dayEnd);
      const runDayShiftCount = runTracker.getNearbyShifts(employee.id, dayStart, dayEnd).length;
      const totalDayShiftCount = existingDayShiftCount + runDayShiftCount;
      const isSecondShiftToday = dailyHours > 0 || totalDayShiftCount > 0;

      const thisShiftDayHours = (() => {
        const overlapStart = shiftStart > dayStart ? shiftStart : dayStart;
        const overlapEnd = shiftEnd < dayEnd ? shiftEnd : dayEnd;
        return overlapEnd > overlapStart ? (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60) : shiftHours;
      })();
      if (dailyHours + thisShiftDayHours > effectiveDailyMax) {
        if (isUrgentFill && isOvertimeEligible && dailyHours + thisShiftDayHours <= EMERGENCY_MAX_DAILY_HOURS) {
          // Would qualify under emergency limits — handled below via emergencyExtension flag
        } else {
          disqualifyReasons.push(`Would exceed ${effectiveDailyMax}h daily cap (${dailyHours.toFixed(1)}h + ${thisShiftDayHours.toFixed(1)}h)`);
        }
      }

      // 4. Check minimum rest period between shifts — DB + in-run
      // Standard: 8h minimum (labor law / safety standard for security officers)
      // Emergency: 2h minimum — only when shift starts within 4h AND employee is overtime-eligible.
      // Real-world security headache: an officer finishing a 7am-3pm shift is often the only
      // person who can cover the 4pm slot when someone no-calls. Making them wait 8 hours means
      // the post goes dark at 4pm. Trinity applies the emergency floor with an explicit override note.
      const effectiveMinRest = (isUrgentFill && isOvertimeEligible) ? EMERGENCY_MIN_REST_HOURS : MIN_REST_HOURS;

      const empNearbyShifts = nearbyShiftMap.get(employee.id) || [];
      const runNearbyShifts = runTracker.getNearbyShifts(employee.id, prevDayStart, nextDayEnd);
      const allNearbyForRest = [
        ...empNearbyShifts.map(ns => ({ start: new Date(ns.startTime), end: new Date(ns.endTime) })),
        ...runNearbyShifts.map(ns => ({ start: ns.startTime, end: ns.endTime })),
      ];
      for (const ns of allNearbyForRest) {
        const gapBeforeHours = (shiftStart.getTime() - ns.end.getTime()) / (1000 * 60 * 60);
        const gapAfterHours = (ns.start.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60);

        if (gapBeforeHours > 0 && gapBeforeHours < effectiveMinRest) {
          disqualifyReasons.push(`Only ${gapBeforeHours.toFixed(1)}h rest (needs ${effectiveMinRest}h min${isUrgentFill ? ' emergency' : ''})`);
          break;
        }
        if (gapAfterHours > 0 && gapAfterHours < effectiveMinRest) {
          disqualifyReasons.push(`Only ${gapAfterHours.toFixed(1)}h rest before next shift (needs ${effectiveMinRest}h min${isUrgentFill ? ' emergency' : ''})`);
          break;
        }
      }

      // 5. Check max shifts per employee per week — DB + in-run
      const dbAssignments = assignmentMap.get(employee.id) || 0;
      const runAssignments = runTracker.getWeeklyCount(employee.id, weekStart, weekEnd);
      const currentAssignments = dbAssignments + runAssignments;
      if (!isContractor) {
        if (currentAssignments >= config.maxShiftsPerEmployee) {
          disqualifyReasons.push(`Already has ${currentAssignments} shifts this week (max: ${config.maxShiftsPerEmployee})`);
        }
      }

      // 5b. Check weekly HOURS cap
      // Standard pass: W2 40h, 1099 60h (avoids OT cost)
      // OT fallback pass: W2 50h, 1099 70h (safety hard cap — OT is expensive but better than unfilled)
      // NOTE: No W2 employee should EVER exceed 50h in OT fallback. 64h violations killed fill quality.
      const STANDARD_WEEKLY_W2 = 40;
      const STANDARD_WEEKLY_1099 = 60;
      const OT_SAFETY_CAP_W2 = 50;
      const OT_SAFETY_CAP_1099 = 70;
      const maxWeeklyHours = overtimeFallback
        ? (isContractor ? OT_SAFETY_CAP_1099 : OT_SAFETY_CAP_W2)
        : (isContractor ? STANDARD_WEEKLY_1099 : STANDARD_WEEKLY_W2);
      const dbWeeklyHours = weeklyHoursMap.get(employee.id) || 0;
      const runWeeklyHours = runTracker.getWeeklyHours(employee.id, weekStart, weekEnd);
      const totalWeeklyHours = dbWeeklyHours + runWeeklyHours;
      if (totalWeeklyHours + shiftHours > maxWeeklyHours) {
        disqualifyReasons.push(`Would exceed ${maxWeeklyHours}h weekly cap (${totalWeeklyHours.toFixed(1)}h + ${shiftHours.toFixed(1)}h = ${(totalWeeklyHours + shiftHours).toFixed(1)}h)`);
      }

      // 6a. Check consecutive days limit (using cached nearby shifts — no extra DB query)
      // W-2: max 7 consecutive days (labor law compliance)
      // 1099: max 10 consecutive days (safety only — no labor law OT concern, but prevent burnout)
      if (disqualifyReasons.length === 0) {
        const maxConsecutiveDays = isContractor ? 10 : 7;
        const empNearbyShifts = nearbyShiftMap.get(employee.id) || [];
        const workedDays = new Set<string>();
        for (const s of empNearbyShifts) {
          workedDays.add(new Date(s.startTime).toISOString().slice(0, 10));
        }
        const runAssignments = runTracker.getForEmployee(employee.id);
        for (const ra of runAssignments) {
          workedDays.add(new Date(ra.startTime).toISOString().slice(0, 10));
        }
        workedDays.add(shiftStart.toISOString().slice(0, 10));
        let consecutiveStreak = 0;
        for (let d = -(maxConsecutiveDays + 1); d <= maxConsecutiveDays + 1; d++) {
          const checkDate = new Date(shiftStart);
          checkDate.setDate(checkDate.getDate() + d);
          if (workedDays.has(checkDate.toISOString().slice(0, 10))) {
            consecutiveStreak++;
            if (consecutiveStreak > maxConsecutiveDays) {
              disqualifyReasons.push(`Exceeds ${consecutiveStreak} consecutive days (max ${maxConsecutiveDays})`);
              break;
            }
          } else {
            consecutiveStreak = 0;
          }
        }
      }

      // 6b. Check certification status — ADVISORY ONLY, not a scheduling blocker
      // Officers can legally work while certs are pending renewal (registered with regulatory body).
      // Expired/missing certs produce warnings for managers but DO NOT prevent assignment.
      // Managers/owners can manually suspend an officer if licensing truly lapses.
      let certWarnings: string[] = [];
      if (disqualifyReasons.length === 0) {
        try {
          const certCheck = await schedulingEnhancementsService.checkCertificationsForShiftAssignment(
            employee.id, config.workspaceId, shift, client
          );
          if (!certCheck.eligible) {
            certWarnings = certCheck.reasons.slice(0, 2);
          }
        } catch (err: unknown) {
          log.warn(`[Trinity] certCheck failed for ${employee.id}: ${(err instanceof Error ? err.message : String(err))}`);
        }
      }

      // 7. Shift-level excluded employees — hard disqualify
      const shiftExcluded = shift.excludedEmployeeIds;
      if (shiftExcluded && Array.isArray(shiftExcluded) && shiftExcluded.includes(employee.id)) {
        disqualifyReasons.push('Excluded by shift preferences');
      }

      // 8. Client-level preferred employees — soft bonus (not a hard disqualification)
      // Preferred employees get a scoring bonus; non-preferred are NOT excluded
      const clientPreferred = client?.preferredEmployees;
      const hasClientWhitelist = clientPreferred && Array.isArray(clientPreferred) && clientPreferred.length > 0;

      // Calculate scores
      const reliabilityScore = this.calculateReliabilityScore(employee);
      const proximityScore = this.calculateProximityScore(employee, client);
      const availabilityScore = outsideAvailability ? 0.3 : 1.0;
      const performanceScore = this.calculatePerformanceScore(employee);
      const seniorityScore = this.calculateSeniorityScore(employee);
      const workloadBalance = this.calculateWorkloadBalance(currentAssignments, config.maxShiftsPerEmployee);

      // 9. Rate profitability bonus - prefer employees whose pay rate is below contract rate
      const employeeRate = safeParseFloat(employee.hourlyRate || employee.payRate || employee.currentHourlyRate, 20);
      const profitMargin = contractRate > 0 ? (contractRate - employeeRate) / contractRate : 0;
      const profitabilityBonus = Math.max(0, Math.min(0.15, profitMargin * 0.15));

      // Small scoring preference for cert-current officers (advisory, not blocking)
      const certPenalty = certWarnings.length > 0 ? -0.03 * certWarnings.length : 0;

      // Compliance score penalty — officers with critical compliance tier are penalized
      // (hard-block disqualification for score < 60 is applied earlier in the loop)
      const rawCompScore = safeParseFloat(employee.complianceScore, 100);
      const compliancePenalty = rawCompScore < 60 ? -0.5 : rawCompScore < 80 ? -0.05 : 0;

      // 10. Shift-level preferred employee bonus
      const shiftPreferred = shift.preferredEmployeeIds;
      const shiftPreferenceBonus = (shiftPreferred && Array.isArray(shiftPreferred) && shiftPreferred.includes(employee.id)) ? 0.2 : 0;

      // 11. Client preference bonus — employees on client whitelist or with strong history
      let clientPreferenceBonus = 0;
      if (hasClientWhitelist && clientPreferred.includes(employee.id)) {
        clientPreferenceBonus = 0.15;
      }

      // Calculate final weighted score with all bonuses
      const score = 
        reliabilityScore * EMPLOYEE_SCORE_WEIGHTS.reliability +
        proximityScore * EMPLOYEE_SCORE_WEIGHTS.proximity +
        availabilityScore * EMPLOYEE_SCORE_WEIGHTS.availability +
        performanceScore * EMPLOYEE_SCORE_WEIGHTS.performance +
        seniorityScore * EMPLOYEE_SCORE_WEIGHTS.seniority +
        workloadBalance * EMPLOYEE_SCORE_WEIGHTS.workloadBalance +
        profitabilityBonus +
        certPenalty +
        compliancePenalty +
        shiftPreferenceBonus +
        clientPreferenceBonus;

      scores.push({
        employeeId: employee.id,
        employee,
        score,
        breakdown: {
          reliabilityScore,
          proximityScore,
          availabilityScore,
          performanceScore,
          seniorityScore,
          workloadBalance,
        },
        disqualifyReasons,
        certWarnings,
        isSecondShiftToday,
        isEmergencyExtension: isUrgentFill && isSecondShiftToday && disqualifyReasons.length === 0,
        emergencyOverrideNote: (isUrgentFill && isSecondShiftToday && disqualifyReasons.length === 0)
          ? `Emergency extension: ${employee.firstName} already worked ${dailyHours.toFixed(1)}h today. Shift starts in ${hoursUntilStart.toFixed(1)}h — OT rules applied. Manager review required.`
          : undefined,
      });
    }

    // Sort by score (highest first)
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Check if employee has a conflicting shift
   */
  private async checkShiftConflict(
    employeeId: string,
    shiftStart: Date,
    shiftEnd: Date
  ): Promise<boolean> {
    const conflicts = await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.employeeId, employeeId),
        or(
          and(
            lte(shifts.startTime, shiftStart),
            gte(shifts.endTime, shiftStart)
          ),
          and(
            lte(shifts.startTime, shiftEnd),
            gte(shifts.endTime, shiftEnd)
          ),
          and(
            gte(shifts.startTime, shiftStart),
            lte(shifts.endTime, shiftEnd)
          )
        )
      ))
      .limit(1);

    return conflicts.length > 0;
  }

  /**
   * Calculate reliability score from real employee data
   * Uses performanceScore (DB: performance_score 0-100) > rating (DB: rating 0-5) > status-based estimate
   * Legacy field names (compositeScore, attendanceRate, behaviorScore) are also checked for
   * any joined data from employeeMetrics.
   */
  private calculateReliabilityScore(employee: any): number {
    // Primary: employees.performance_score (0-100 int)
    if (employee.performanceScore != null && employee.performanceScore !== '') {
      const val = safeParseFloat(employee.performanceScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    // Legacy / joined employeeMetrics fields
    if (employee.compositeScore != null && employee.compositeScore !== '') {
      const val = safeParseFloat(employee.compositeScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    if (employee.attendanceRate != null && employee.attendanceRate !== '') {
      const val = safeParseFloat(employee.attendanceRate, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    if (employee.behaviorScore != null && employee.behaviorScore !== '') {
      const val = safeParseFloat(employee.behaviorScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    if (employee.status === 'active' || employee.isActive === true) return 0.6;
    if (employee.status === 'on_leave') return 0.3;
    return 0.4;
  }

  /**
   * Calculate proximity score using haversine distance when coordinates available
   * Falls back to zip code matching or address city matching
   */
  private calculateProximityScore(employee: any, client: any): number {
    const empLatRaw = employee.homeLatitude ?? employee.latitude ?? null;
    const empLngRaw = employee.homeLongitude ?? employee.longitude ?? null;
    const clientLatRaw = client?.latitude ?? client?.serviceAreaLat ?? null;
    const clientLngRaw = client?.longitude ?? client?.serviceAreaLng ?? null;

    const empLat = empLatRaw != null ? safeParseFloat(empLatRaw, NaN) : NaN;
    const empLng = empLngRaw != null ? safeParseFloat(empLngRaw, NaN) : NaN;
    const clientLat = clientLatRaw != null ? safeParseFloat(clientLatRaw, NaN) : NaN;
    const clientLng = clientLngRaw != null ? safeParseFloat(clientLngRaw, NaN) : NaN;

    if (!isNaN(empLat) && !isNaN(empLng) && !isNaN(clientLat) && !isNaN(clientLng)) {
      const toRad = (deg: number) => deg * (Math.PI / 180);
      const dLat = toRad(clientLat - empLat);
      const dLng = toRad(clientLng - empLng);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(empLat)) * Math.cos(toRad(clientLat)) * Math.sin(dLng / 2) ** 2;
      const distMiles = 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distMiles <= 5) return 1.0;
      if (distMiles <= 10) return 0.9;
      if (distMiles <= 20) return 0.75;
      if (distMiles <= 35) return 0.55;
      if (distMiles <= 50) return 0.35;
      return 0.15;
    }

    const empCity = (employee.city || employee.address || '').toLowerCase();
    const clientCity = (client?.city || client?.address || '').toLowerCase();
    if (empCity && clientCity && empCity === clientCity) return 0.7;

    const empZip = employee.zipCode || employee.postalCode || '';
    const clientZip = client?.zipCode || client?.postalCode || '';
    if (empZip && clientZip && empZip === clientZip) return 0.8;

    return 0.5;
  }

  /**
   * Calculate performance score from real employee data
   * Primary: employees.performance_score (0-100 int) → employees.rating (0.0-5.0)
   * Legacy: performanceRating > lastReviewScore > qualityScore (for joined data)
   */
  private calculatePerformanceScore(employee: any): number {
    // Primary: employees.performance_score (0-100 int, DB: performance_score)
    if (employee.performanceScore != null && employee.performanceScore !== '') {
      const val = safeParseFloat(employee.performanceScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    // Secondary: employees.rating (0.0-5.0 decimal, DB: rating)
    if (employee.rating != null && employee.rating !== '') {
      const val = safeParseFloat(employee.rating, -1);
      if (val >= 0) return Math.min(1, val / 5);
    }
    // Legacy field names for any joined review data
    if (employee.performanceRating != null && employee.performanceRating !== '') {
      const rating = safeParseFloat(employee.performanceRating, -1);
      if (rating >= 0) return Math.min(1, rating / 5);
    }
    if (employee.lastReviewScore != null && employee.lastReviewScore !== '') {
      const val = safeParseFloat(employee.lastReviewScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    if (employee.qualityScore != null && employee.qualityScore !== '') {
      const val = safeParseFloat(employee.qualityScore, -1);
      if (val >= 0) return Math.min(1, val / 100);
    }
    if (employee.status === 'active' || employee.isActive === true) return 0.55;
    return 0.4;
  }

  /**
   * Calculate seniority score based on real hire date
   */
  private calculateSeniorityScore(employee: any): number {
    const dateField = employee.hireDate || employee.startDate || employee.createdAt;
    if (!dateField) return 0.3;
    
    const hireDate = new Date(dateField);
    if (isNaN(hireDate.getTime())) return 0.3;
    
    const yearsOfService = (Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return Math.min(1, yearsOfService / 5);
  }

  /**
   * Calculate workload balance score
   */
  private calculateWorkloadBalance(currentAssignments: number, maxShifts: number): number {
    const safeMax = Math.max(1, maxShifts);
    return Math.max(0, 1 - (currentAssignments / safeMax));
  }

  /**
   * Try contractor pool fallback — sends outreach emails to eligible contractors
   */
  private async tryContractorFallback(
    shift: any,
    workspaceId: string
  ): Promise<AssignmentResult> {
    const contractors = await db.select()
      .from(contractorPool)
      .where(eq(contractorPool.isActive, true))
      .limit(SCHEDULING.contractorPoolSize);

    if (contractors.length === 0) {
      return {
        shiftId: shift.id,
        employeeId: null,
        success: false,
        confidence: 0,
        reasoning: 'No contractors available in pool',
        escalationLevel: 3,
      };
    }

    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
    const clientName = shift.clientName || shift.title || 'Open Site';
    const shiftDate = shiftStart.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const startTime = shiftStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = shiftEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const eligible = contractors.filter(c => c.availableForLastMinute && c.onboardingCompleted && c.backgroundCheckStatus === 'approved');

    let outreachSent = 0;
    const outreachErrors: string[] = [];

    for (const contractor of eligible) {
      try {
        const { sendCanSpamCompliantEmail } = await import('../../email');
        await sendCanSpamCompliantEmail({
          to: contractor.email,
          subject: `Open Shift Available — ${clientName} on ${shiftDate}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #1a1a2e; margin-bottom: 4px;">Open Shift Available</h2>
              <p style="color: #555; margin-top: 0;">Hi ${contractor.firstName},</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 6px 0; color: #888; width: 90px;">Client</td><td style="padding: 6px 0; font-weight: 600;">${clientName}</td></tr>
                <tr><td style="padding: 6px 0; color: #888;">Date</td><td style="padding: 6px 0; font-weight: 600;">${shiftDate}</td></tr>
                <tr><td style="padding: 6px 0; color: #888;">Time</td><td style="padding: 6px 0; font-weight: 600;">${startTime} - ${endTime} (${shiftHours.toFixed(0)}h)</td></tr>
                <tr><td style="padding: 6px 0; color: #888;">Position</td><td style="padding: 6px 0; font-weight: 600;">${shift.title || 'Security Officer'}</td></tr>
              </table>
              <p style="color: #555;">Claim this shift in the CoAIleague app or reply to this email to confirm your availability.</p>
              <p style="color: #888; font-size: 12px; margin-top: 24px;">This is an automated message from Trinity Scheduling. Shift ID: ${shift.id}</p>
            </div>
          `,
          emailType: 'transactional',
          workspaceId,
        });
        outreachSent++;
      } catch (err: unknown) {
        outreachErrors.push(`${contractor.email}: ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    if (outreachErrors.length > 0) {
      log.warn(`[Trinity] Contractor outreach errors: ${outreachErrors.join('; ')}`);
    }

    try {
      await db.insert(notifications).values({
        userId: 'system',
        workspaceId,
        type: 'coverage_requested' as any,
        title: 'Contractor Outreach Sent',
        message: `Trinity sent shift coverage requests to ${outreachSent} contractor(s) for ${clientName} on ${shiftDate} (${startTime}-${endTime}). ${eligible.length - outreachSent} failed.`,
        metadata: { shiftId: shift.id, outreachSent, totalEligible: eligible.length, errors: outreachErrors.length },
      });
    } catch (_notifErr) { log.warn('[TrinityAutonomousScheduler] Contractor outreach notification failed:', _notifErr instanceof Error ? _notifErr.message : String(_notifErr)); }

    return {
      shiftId: shift.id,
      employeeId: null,
      success: false,
      confidence: 0,
      reasoning: `Outreach sent to ${outreachSent}/${eligible.length} eligible contractors (${contractors.length} total in pool). Awaiting contractor response.`,
      escalationLevel: 2,
    };
  }

  /**
   * Pre-run conflict scan: Detects ALL existing double-bookings in the workspace
   * across the scheduling date range and unassigns the later shift in each pair.
   * This protects against bad seed data, manual UI conflicts, and stale data
   * from previous interrupted runs.
   */
  private async scanAndResolvePreExistingConflicts(
    config: SchedulingConfig,
    session: SchedulingSession,
    dateRanges: Array<{ label: string; start: Date; end: Date }>
  ): Promise<number> {
    if (dateRanges.length === 0) return 0;

    const rangeStart = dateRanges[0].start;
    const rangeEnd = dateRanges[dateRanges.length - 1].end;

    const existingAssigned = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      title: shifts.title,
      createdAt: shifts.createdAt,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, config.workspaceId),
        sql`${shifts.employeeId} IS NOT NULL`,
        gte(shifts.startTime, rangeStart),
        lte(shifts.endTime, rangeEnd),
        sql`${shifts.status} NOT IN ('cancelled', 'completed')`,
      ))
      .orderBy(asc(shifts.startTime));

    const byEmployee = new Map<string, typeof existingAssigned>();
    for (const s of existingAssigned) {
      if (!s.employeeId) continue;
      if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, []);
      byEmployee.get(s.employeeId)!.push(s);
    }

    const shiftsToUnassign: string[] = [];

    for (const [employeeId, empShifts] of byEmployee) {
      const sorted = [...empShifts].sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const aEnd = new Date(a.endTime).getTime();
        const bStart = new Date(b.startTime).getTime();
        const aStart = new Date(a.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();

        if (aStart < bEnd && aEnd > bStart) {
          const laterShiftId = new Date(b.createdAt!).getTime() >= new Date(a.createdAt!).getTime()
            ? b.id : a.id;
          if (!shiftsToUnassign.includes(laterShiftId)) {
            shiftsToUnassign.push(laterShiftId);
            session.thoughtLog.push(
              `[Trinity] Pre-run conflict: employee ${employeeId} double-booked on shifts ${a.id} and ${b.id}. Unassigning ${laterShiftId}.`
            );
          }
        }
      }
    }

    if (shiftsToUnassign.length === 0) return 0;

    for (const shiftId of shiftsToUnassign) {
      await db.update(shifts)
        .set({
          employeeId: null,
          status: 'draft',
          aiGenerated: false,
        })
        .where(eq(shifts.id, shiftId));
    }

    return shiftsToUnassign.length;
  }

  /**
   * Staffing Gap Alert: After every scheduling run, produces a summary of unfilled
   * shifts grouped by client and time slot, with reasons and recommendations.
   * Notifies org owner and authorized managers via the notification system.
   */
  private async generateStaffingGapAlert(
    config: SchedulingConfig,
    session: SchedulingSession,
    dateRanges: Array<{ label: string; start: Date; end: Date }>,
    allEmployees: any[],
    allClients: any[],
  ): Promise<void> {
    if (dateRanges.length === 0) return;

    const rangeStart = dateRanges[0].start;
    const rangeEnd = dateRanges[dateRanges.length - 1].end;

    const unfilledShifts = await db.select({
      id: shifts.id,
      title: shifts.title,
      clientId: shifts.clientId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, config.workspaceId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, rangeStart),
        lte(shifts.startTime, rangeEnd),
        sql`${shifts.status} NOT IN ('cancelled', 'completed')`,
      ));

    if (unfilledShifts.length === 0) {
      session.thoughtLog.push('[Trinity] Staffing gap alert: All shifts filled — no gaps.');
      return;
    }

    const clientMap = new Map(allClients.map((c: any) => [c.id, c]));

    const gapsByClient = new Map<string, {
      clientName: string;
      unfilled: number;
      total: number;
      slots: Map<string, number>;
    }>();

    for (const s of unfilledShifts) {
      const clientId = s.clientId || 'unknown';
      const client = clientMap.get(clientId);
      const clientName = client?.companyName || 'Unknown Client';

      if (!gapsByClient.has(clientId)) {
        gapsByClient.set(clientId, {
          clientName,
          unfilled: 0,
          total: 0,
          slots: new Map(),
        });
      }
      const entry = gapsByClient.get(clientId)!;
      entry.unfilled++;

      const hour = new Date(s.startTime).getUTCHours();
      const slotLabel = hour < 6 ? 'overnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
      entry.slots.set(slotLabel, (entry.slots.get(slotLabel) || 0) + 1);
    }

    const totalFilled = session.progress.assignedShifts;
    const totalUnfilled = unfilledShifts.length;
    const totalCapacityHours = allEmployees.length * 40;
    const totalDemandHours = (totalFilled + totalUnfilled) * 8;
    const employeesNeeded = Math.ceil(totalDemandHours / 160) - allEmployees.length;

    const sortedGaps = [...gapsByClient.values()]
      .sort((a, b) => b.unfilled - a.unfilled)
      .slice(0, 10);

    const gapLines = sortedGaps.map(g => {
      const slotBreakdown = [...g.slots.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([slot, count]) => `${count} ${slot}`)
        .join(', ');
      return `${g.clientName}: ${g.unfilled} unfilled (${slotBreakdown})`;
    });

    const recommendations: string[] = [];
    if (employeesNeeded > 0) {
      recommendations.push(`Hire ${employeesNeeded}+ additional employees to meet current demand`);
    }

    const eveningGaps = [...gapsByClient.values()].reduce((sum, g) => sum + (g.slots.get('evening') || 0) + (g.slots.get('overnight') || 0), 0);
    const morningGaps = [...gapsByClient.values()].reduce((sum, g) => sum + (g.slots.get('morning') || 0), 0);
    if (eveningGaps > morningGaps * 1.5) {
      recommendations.push(`Night/evening shifts have the most gaps (${eveningGaps} unfilled) — recruit night-shift guards`);
    }

    if (totalUnfilled > totalFilled * 0.3) {
      recommendations.push('Consider approving overtime for existing staff to cover critical gaps');
    }

    const alertTitle = `Staffing Gap Report: ${totalFilled} filled, ${totalUnfilled} unfilled`;
    const alertMessage = [
      `Trinity scheduling completed: ${totalFilled} shifts filled, ${totalUnfilled} unfilled out of ${totalFilled + totalUnfilled} total.`,
      ``,
      `Capacity: ${allEmployees.length} employees x 40h/wk = ${totalCapacityHours}h available`,
      `Demand: ~${totalDemandHours}h needed${employeesNeeded > 0 ? ` (short ${employeesNeeded} employees)` : ''}`,
      ``,
      `Top unfilled clients:`,
      ...gapLines.map(l => `  ${l}`),
      ``,
      `Recommendations:`,
      ...recommendations.map(r => `  ${r}`),
    ].join('\n');

    session.thoughtLog.push(`[Trinity] Staffing gap alert generated: ${totalFilled} filled, ${totalUnfilled} unfilled`);

    const managersAndOwners = await db.select({ id: employees.userId, role: employees.workspaceRole })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, config.workspaceId),
        eq(employees.isActive, true),
        sql`${employees.workspaceRole} IN ('org_owner', 'co_owner', 'org_manager', 'department_manager')`,
        sql`${employees.userId} IS NOT NULL`,
      ));

    const notifiedUserIds = new Set<string>();
    for (const mgr of managersAndOwners) {
      if (!mgr.id || notifiedUserIds.has(mgr.id)) continue;
      notifiedUserIds.add(mgr.id);
      try {
        await createNotification({
          workspaceId: config.workspaceId,
          userId: mgr.id,
          type: 'ai_schedule_ready',
          title: alertTitle,
          message: alertMessage,
          actionUrl: '/schedule',
          relatedEntityType: 'scheduling_session',
          relatedEntityId: session.sessionId,
          metadata: {
            totalFilled,
            totalUnfilled,
            employeesNeeded: Math.max(0, employeesNeeded),
            topGapClients: sortedGaps.slice(0, 5).map(g => g.clientName),
            recommendations,
          },
        });
      } catch (err) {
        log.warn(`[Trinity] Failed to notify user ${mgr.id}:`, err);
      }
    }

    broadcastToWorkspace(config.workspaceId, {
      type: 'trinity_staffing_gap_alert',
      sessionId: session.sessionId,
      totalFilled,
      totalUnfilled,
      employeesNeeded: Math.max(0, employeesNeeded),
      topGapClients: sortedGaps.slice(0, 5).map(g => ({
        name: g.clientName,
        unfilled: g.unfilled,
        slots: Object.fromEntries(g.slots),
      })),
      recommendations,
    });
  }

  private async validateAndCorrectAssignments(
    runTracker: RunAssignmentTracker,
    config: SchedulingConfig,
    session: SchedulingSession
  ): Promise<{ corrected: number; issues: string[] }> {
    const runAssignments = runTracker.getAllAssignments();
    if (runAssignments.length === 0) return { corrected: 0, issues: [] };

    const issues: string[] = [];
    let corrected = 0;

    const MIN_REST_HOURS = 8;
    const MAX_DAILY_HOURS = 12;

    const affectedEmployeeIds = [...new Set(runAssignments.map(a => a.employeeId))];
    const minDate = new Date(Math.min(...runAssignments.map(a => a.startTime.getTime())));
    const maxDate = new Date(Math.max(...runAssignments.map(a => a.endTime.getTime())));
    const rangeStart = new Date(minDate);
    rangeStart.setDate(rangeStart.getDate() - 1);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(maxDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    rangeEnd.setHours(23, 59, 59, 999);

    const dbShifts = affectedEmployeeIds.length > 0 ? await db.select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, config.workspaceId),
        inArray(shifts.employeeId, affectedEmployeeIds),
        gte(shifts.startTime, rangeStart),
        lte(shifts.endTime, rangeEnd)
      )) : [];

    interface UnifiedShift {
      shiftId: string;
      employeeId: string;
      start: Date;
      end: Date;
      hours: number;
      isRunAssignment: boolean;
    }

    const runShiftIds = new Set(runAssignments.map(a => a.shiftId));
    const allShifts: UnifiedShift[] = [];

    for (const a of runAssignments) {
      allShifts.push({
        shiftId: a.shiftId,
        employeeId: a.employeeId,
        start: a.startTime,
        end: a.endTime,
        hours: a.shiftHours,
        isRunAssignment: true,
      });
    }
    for (const s of dbShifts) {
      if (!s.employeeId || runShiftIds.has(s.id)) continue;
      const sStart = new Date(s.startTime);
      const sEnd = new Date(s.endTime);
      allShifts.push({
        shiftId: s.id,
        employeeId: s.employeeId,
        start: sStart,
        end: sEnd,
        hours: (sEnd.getTime() - sStart.getTime()) / (1000 * 60 * 60),
        isRunAssignment: false,
      });
    }

    const byEmployee = new Map<string, UnifiedShift[]>();
    for (const s of allShifts) {
      if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, []);
      byEmployee.get(s.employeeId)!.push(s);
    }

    const shiftsToRevert = new Set<string>();

    for (const [employeeId, empShifts] of byEmployee) {
      const sorted = [...empShifts].sort((a, b) => a.start.getTime() - b.start.getTime());

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];

        if (a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()) {
          issues.push(`Double-book: employee ${employeeId} shifts ${a.shiftId} and ${b.shiftId} overlap`);
          const revertTarget = a.isRunAssignment && b.isRunAssignment
            ? b.shiftId
            : a.isRunAssignment ? a.shiftId : b.isRunAssignment ? b.shiftId : null;
          if (revertTarget) shiftsToRevert.add(revertTarget);
        }

        const gapHours = (b.start.getTime() - a.end.getTime()) / (1000 * 60 * 60);
        if (gapHours > 0 && gapHours < MIN_REST_HOURS) {
          issues.push(`Rest violation: employee ${employeeId} only ${gapHours.toFixed(1)}h between shifts ${a.shiftId} and ${b.shiftId}`);
          const revertTarget = a.isRunAssignment && b.isRunAssignment
            ? b.shiftId
            : a.isRunAssignment ? a.shiftId : b.isRunAssignment ? b.shiftId : null;
          if (revertTarget) shiftsToRevert.add(revertTarget);
        }
      }

      const dailyHoursMap = new Map<string, { total: number; runShifts: UnifiedShift[] }>();
      for (const s of empShifts) {
        const startDay = s.start.toISOString().slice(0, 10);
        const endDay = s.end.toISOString().slice(0, 10);
        const days = startDay === endDay ? [startDay] : [startDay, endDay];
        for (const day of days) {
          if (!dailyHoursMap.has(day)) dailyHoursMap.set(day, { total: 0, runShifts: [] });
          const entry = dailyHoursMap.get(day)!;
          const dStart = new Date(day + 'T00:00:00Z');
          const dEnd = new Date(day + 'T23:59:59.999Z');
          const overlapStart = s.start > dStart ? s.start : dStart;
          const overlapEnd = s.end < dEnd ? s.end : dEnd;
          if (overlapEnd > overlapStart) {
            entry.total += (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
          }
          if (s.isRunAssignment) entry.runShifts.push(s);
        }
      }
      for (const [day, { total, runShifts }] of dailyHoursMap) {
        if (total > MAX_DAILY_HOURS && runShifts.length > 0) {
          issues.push(`OT violation: employee ${employeeId} has ${total.toFixed(1)}h on ${day} (max ${MAX_DAILY_HOURS}h)`);
          const shortest = [...runShifts].sort((a, b) => a.hours - b.hours);
          shiftsToRevert.add(shortest[0].shiftId);
        }
      }
    }

    for (const shiftId of shiftsToRevert) {
      if (!runShiftIds.has(shiftId)) continue;
      await db.update(shifts)
        .set({
          employeeId: null,
          status: 'draft',
          aiGenerated: false,
        })
        .where(eq(shifts.id, shiftId));
      runTracker.removeAssignment(shiftId);
      corrected++;
      session.thoughtLog.push(`[Trinity] Validation revert: unassigned shift ${shiftId}`);
    }

    if (corrected === 0 && runAssignments.length > 0) {
      session.thoughtLog.push(`[Trinity] Post-run validation passed: ${runAssignments.length} assignments clean, no conflicts`);
    }

    return { corrected, issues };
  }

  /**
   * Get active scheduling session
   */
  getActiveSession(sessionId: string): SchedulingSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions for a workspace
   */
  getWorkspaceSessions(workspaceId: string): SchedulingSession[] {
    return Array.from(this.activeSessions.values())
      .filter(s => s.workspaceId === workspaceId);
  }

  async evaluateShiftForTraining(
    shift: any,
    allEmployees: any[],
    allClients: any[],
    workspaceId: string,
    runTracker: RunAssignmentTracker
  ): Promise<{
    success: boolean;
    employeeId: string | null;
    employee: any | null;
    confidence: number;
    reasoning: string;
    candidatesEvaluated: number;
    candidatesRejected: number;
    rejectionReasons: string[];
    scoreBreakdown: any | null;
  }> {
    const client = allClients.find(c => c.id === shift.clientId);

    const employeeCount = allEmployees.length || 1;
    const avgShiftHours = 6.5;
    const dynamicMaxShifts = Math.max(5, Math.min(10, Math.floor(40 / avgShiftHours)));

    const config: SchedulingConfig = {
      workspaceId,
      userId: 'trinity-training',
      mode: 'current_week',
      prioritizeBy: 'urgency',
      useContractorFallback: false,
      maxShiftsPerEmployee: dynamicMaxShifts,
      respectAvailability: true,
    };

    const scores = await this.scoreEmployeesForShift(
      shift,
      allEmployees,
      client,
      config,
      runTracker
    );

    const qualified = scores.filter(e => e.disqualifyReasons.length === 0);
    const disqualified = scores.filter(e => e.disqualifyReasons.length > 0);

    const rejectionReasons = disqualified
      .slice(0, 5)
      .map(d => `${d.employee.firstName} ${d.employee.lastName}: ${d.disqualifyReasons.join(', ')}`);

    if (qualified.length === 0) {
      const reasonCounts: Record<string, number> = {};
      for (const d of disqualified) {
        for (const r of d.disqualifyReasons) {
          const key = r.split('(')[0].split(':')[0].trim();
          reasonCounts[key] = (reasonCounts[key] || 0) + 1;
        }
      }
      log.info(`[ScenarioSeeder] ALL ${scores.length} disqualified for "${shift.title}" — reasons:`, JSON.stringify(reasonCounts));
      return {
        success: false,
        employeeId: null,
        employee: null,
        confidence: 0,
        reasoning: `Evaluated ${scores.length} candidates — all disqualified`,
        candidatesEvaluated: scores.length,
        candidatesRejected: disqualified.length,
        rejectionReasons,
        scoreBreakdown: null,
      };
    }

    const best = qualified[0];
    return {
      success: true,
      employeeId: best.employeeId,
      employee: best.employee,
      confidence: best.score,
      reasoning: `Best of ${qualified.length} qualified (${disqualified.length} rejected) — score ${(best.score * 100).toFixed(0)}%`,
      candidatesEvaluated: scores.length,
      candidatesRejected: disqualified.length,
      rejectionReasons,
      scoreBreakdown: best.breakdown,
    };
  }
}

export { RunAssignmentTracker };
export type { RunAssignment };
export const trinityAutonomousScheduler = TrinityAutonomousSchedulerService.getInstance();

// ============================================================================
// COMPLIANCE & CLIENT PREFERENCE ENHANCEMENTS
// ============================================================================

/**
 * Labor Law Compliance Service - 50-State Compliance Integration
 */
export class SchedulingComplianceService {
  private static instance: SchedulingComplianceService;
  
  static getInstance(): SchedulingComplianceService {
    if (!SchedulingComplianceService.instance) {
      SchedulingComplianceService.instance = new SchedulingComplianceService();
    }
    return SchedulingComplianceService.instance;
  }
  
  /**
   * Check if assignment complies with labor laws
   */
  async checkComplianceForAssignment(
    employeeId: string,
    shiftStart: Date,
    shiftEnd: Date,
    workspaceId: string
  ): Promise<{ compliant: boolean; violations: string[]; warnings: string[] }> {
    const violations: string[] = [];
    const warnings: string[] = [];
    
    // Get employee's state from their profile for state-specific rules
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    const state = employee?.address ? this.extractState(employee.address) : 'CA'; // Default to CA
    
    // Get existing shifts for the week
    const weekStart = new Date(shiftStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const weeklyShifts = await db.select().from(shifts).where(and(
      eq(shifts.employeeId, employeeId),
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, weekStart),
      lte(shifts.endTime, weekEnd)
    ));
    
    // Calculate weekly hours including this shift
    const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
    let weeklyHours = shiftHours;
    for (const s of weeklyShifts) {
      weeklyHours += (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
    }
    
    // Get state-specific rules
    const rules = this.getStateRules(state);
    
    // Check weekly overtime (40 hours federal, some states stricter)
    if (weeklyHours > rules.weeklyOvertimeThreshold) {
      warnings.push(`Overtime warning: ${weeklyHours.toFixed(1)} hours this week (threshold: ${rules.weeklyOvertimeThreshold})`);
    }
    
    if (weeklyHours > rules.maxWeeklyHours) {
      violations.push(`Exceeds max weekly hours: ${weeklyHours.toFixed(1)} > ${rules.maxWeeklyHours}`);
    }
    
    // Check daily overtime (CA: 8 hours, most states: none)
    if (rules.dailyOvertimeThreshold && shiftHours > rules.dailyOvertimeThreshold) {
      warnings.push(`Daily overtime: ${shiftHours.toFixed(1)} hours (threshold: ${rules.dailyOvertimeThreshold})`);
    }
    
    // Check required rest between shifts (typically 8-12 hours)
    const lastShift = weeklyShifts
      .filter(s => new Date(s.endTime) < shiftStart)
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())[0];
    
    if (lastShift) {
      const restHours = (shiftStart.getTime() - new Date(lastShift.endTime).getTime()) / (1000 * 60 * 60);
      if (restHours < rules.minRestBetweenShifts) {
        violations.push(`Insufficient rest: ${restHours.toFixed(1)} hours between shifts (min: ${rules.minRestBetweenShifts})`);
      }
    }
    
    // Check split shift rules
    if (rules.splitShiftPremium && shiftHours > 10) {
      warnings.push('Split shift premium may apply (shift > 10 hours)');
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }
  
  private extractState(address: string): string {
    // Simple state extraction - matches 2-letter state codes
    const stateMatch = address.match(/\b([A-Z]{2})\b/);
    return stateMatch ? stateMatch[1] : 'CA';
  }
  
  private getStateRules(state: string): {
    weeklyOvertimeThreshold: number;
    maxWeeklyHours: number;
    dailyOvertimeThreshold: number | null;
    minRestBetweenShifts: number;
    splitShiftPremium: boolean;
  } {
    // State-specific labor law rules (simplified for key states)
    const stateRules: Record<string, unknown> = {
      CA: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 72, dailyOvertimeThreshold: 8, minRestBetweenShifts: 8, splitShiftPremium: true },
      NY: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 8, splitShiftPremium: false },
      TX: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 8, splitShiftPremium: false },
      FL: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 8, splitShiftPremium: false },
      IL: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 7.5, splitShiftPremium: false },
      PA: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 8, splitShiftPremium: false },
      WA: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 10, splitShiftPremium: false },
      OR: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: null, minRestBetweenShifts: 11, splitShiftPremium: false },
      CO: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: 12, minRestBetweenShifts: 8, splitShiftPremium: false },
      NV: { weeklyOvertimeThreshold: 40, maxWeeklyHours: 60, dailyOvertimeThreshold: 8, minRestBetweenShifts: 8, splitShiftPremium: false },
    };
    
    return stateRules[state] || stateRules['TX']; // Default to Texas (least restrictive)
  }
}

/**
 * Client Preference Service - Learns and applies client-employee preferences
 */
export class ClientPreferenceService {
  private static instance: ClientPreferenceService;
  
  static getInstance(): ClientPreferenceService {
    if (!ClientPreferenceService.instance) {
      ClientPreferenceService.instance = new ClientPreferenceService();
    }
    return ClientPreferenceService.instance;
  }
  
  /**
   * Get client's preferred employees based on history and explicit preferences
   */
  async getClientPreferences(clientId: string, workspaceId: string): Promise<{
    preferredEmployees: string[];
    avoidEmployees: string[];
    positionPreferences: Record<string, string[]>;
    historicalAssignments: { employeeId: string; successRate: number; count: number }[];
  }> {
    // Get historical successful assignments
    const historicalShifts = await db.select({
      employeeId: shifts.employeeId,
      status: shifts.status,
    })
      .from(shifts)
      .where(and(
        eq(shifts.clientId, clientId),
        eq(shifts.workspaceId, workspaceId),
        sql`${shifts.employeeId} IS NOT NULL`
      ));
    
    // Calculate success rates per employee
    const employeeStats = new Map<string, { total: number; successful: number }>();
    for (const shift of historicalShifts) {
      if (!shift.employeeId) continue;
      const stats = employeeStats.get(shift.employeeId) || { total: 0, successful: 0 };
      stats.total++;
      if (shift.status === 'completed') stats.successful++;
      employeeStats.set(shift.employeeId, stats);
    }
    
    // Convert to array and sort by success rate
    const historicalAssignments = Array.from(employeeStats.entries())
      .map(([employeeId, stats]) => ({
        employeeId,
        successRate: stats.total > 0 ? stats.successful / stats.total : 0,
        count: stats.total,
      }))
      .sort((a, b) => b.successRate - a.successRate);
    
    // Employees with 80%+ success rate and 3+ assignments are preferred
    const preferredEmployees = historicalAssignments
      .filter(a => a.successRate >= 0.8 && a.count >= 3)
      .map(a => a.employeeId);
    
    // Employees with <50% success rate and 3+ assignments should be avoided
    const avoidEmployees = historicalAssignments
      .filter(a => a.successRate < 0.5 && a.count >= 3)
      .map(a => a.employeeId);
    
    return {
      preferredEmployees,
      avoidEmployees,
      positionPreferences: {}, // Can be extended with explicit client preferences
      historicalAssignments,
    };
  }
  
  /**
   * Calculate preference score modifier for employee-client pairing
   */
  async getPreferenceScore(employeeId: string, clientId: string, workspaceId: string): Promise<number> {
    const preferences = await this.getClientPreferences(clientId, workspaceId);
    
    if (preferences.preferredEmployees.includes(employeeId)) {
      return 0.25; // +25% bonus for preferred employees
    }
    
    if (preferences.avoidEmployees.includes(employeeId)) {
      return -0.5; // -50% penalty for employees to avoid
    }
    
    // Check historical success rate
    const history = preferences.historicalAssignments.find(a => a.employeeId === employeeId);
    if (history) {
      return (history.successRate - 0.5) * 0.2; // -10% to +10% based on success rate
    }
    
    return 0; // Neutral if no history
  }
}

export const schedulingComplianceService = SchedulingComplianceService.getInstance();
export const clientPreferenceService = ClientPreferenceService.getInstance();

// ============================================================================
// AI INTELLIGENCE INTEGRATION FOR SCHEDULING DECISIONS
// ============================================================================

/**
 * Trinity AI Scheduling Intelligence - Uses Gemini/GPT/Claude for decisions
 */
export class TrinitySchedulingAI {
  private static instance: TrinitySchedulingAI;
  
  static getInstance(): TrinitySchedulingAI {
    if (!TrinitySchedulingAI.instance) {
      TrinitySchedulingAI.instance = new TrinitySchedulingAI();
    }
    return TrinitySchedulingAI.instance;
  }
  
  /**
   * Get AI recommendation for complex scheduling decisions
   */
  async getAISchedulingRecommendation(context: {
    shift: any;
    topCandidates: { employee: any; score: number; reasoning: string }[];
    clientPreferences: any;
    complianceIssues: string[];
    urgencyLevel: string;
    workspaceId: string;
  }): Promise<{
    recommendedEmployeeId: string | null;
    confidence: number;
    reasoning: string;
    alternativeActions: string[];
  }> {
    try {
      // Import AI services dynamically
      const { unifiedGeminiClient } = await import('../ai-brain/unifiedGeminiClient');
      
      let orgContext = '';
      try {
        const { workspaceContextService } = await import('../ai-brain/workspaceContextService');
        const wsCtx = await workspaceContextService.getFullContext(context.workspaceId);
        orgContext = `\nORGANIZATION CONTEXT:\n${wsCtx.summary}\n`;
      } catch (err: unknown) {
        log.warn(`[TrinityScheduler] Failed to load org context for workspace ${context.workspaceId}:`, err?.message);
      }

      const prompt = `You are Trinity, an expert security company scheduler. Analyze this scheduling decision:
${orgContext}
SHIFT DETAILS:
- Title: ${context.shift.title || 'Security Shift'}
- Date: ${new Date(context.shift.startTime).toLocaleDateString()}
- Time: ${new Date(context.shift.startTime).toLocaleTimeString()} - ${new Date(context.shift.endTime).toLocaleTimeString()}
- Urgency: ${context.urgencyLevel}

TOP CANDIDATES (scored by reliability, performance, proximity):
${context.topCandidates.slice(0, 10).map((c, i) => 
  `${i + 1}. ${c.employee.firstName} ${c.employee.lastName} - Score: ${(c.score * 100).toFixed(0)}%
     Reasoning: ${c.reasoning}`
).join('\n')}

CLIENT PREFERENCES:
- Preferred employees: ${context.clientPreferences?.preferredEmployees?.length || 0}
- Employees to avoid: ${context.clientPreferences?.avoidEmployees?.length || 0}

COMPLIANCE ISSUES:
${context.complianceIssues.length > 0 ? context.complianceIssues.join('\n') : 'None'}

Based on your expertise as a senior security scheduler, recommend the BEST assignment. Consider:
1. Employee reliability and past performance
2. Client preferences and history
3. Compliance with labor laws
4. Workload balance and employee wellbeing
5. Urgency of the shift

Respond in JSON format:
{
  "recommendedIndex": <1-10 or 0 if none suitable>,
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>",
  "alternativeActions": ["<action1>", "<action2>"]
}`;

      const response = await unifiedGeminiClient.generateContent(prompt, { // withGemini
        temperature: 0.3,
        maxOutputTokens: 500,
        workspaceId: context.workspaceId,
        featureKey: 'trinity_shift_placement',
      });
      
      // Parse AI response
      const jsonMatch = (response as any).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const recommendedIndex = parsed.recommendedIndex - 1;
        
        return {
          recommendedEmployeeId: recommendedIndex >= 0 && recommendedIndex < context.topCandidates.length
            ? context.topCandidates[recommendedIndex].employee.id
            : null,
          confidence: parsed.confidence || 0.7,
          reasoning: parsed.reasoning || 'AI-powered intelligent scheduling',
          alternativeActions: parsed.alternativeActions || [],
        };
      }
      
      // Fallback to top scored candidate
      return {
        recommendedEmployeeId: context.topCandidates[0]?.employee.id || null,
        confidence: context.topCandidates[0]?.score || 0.5,
        reasoning: 'Fallback to top-scored candidate',
        alternativeActions: ['Consider manual review'],
      };
      
    } catch (error) {
      log.error('[TrinitySchedulingAI] AI recommendation error:', error);
      // Fallback to algorithmic selection
      return {
        recommendedEmployeeId: context.topCandidates[0]?.employee.id || null,
        confidence: context.topCandidates[0]?.score || 0.5,
        reasoning: 'Algorithmic selection (AI unavailable)',
        alternativeActions: [],
      };
    }
  }
  
  /**
   * Get AI analysis for scheduling patterns
   */
  async analyzeSchedulingPatterns(workspaceId: string): Promise<{
    insights: string[];
    recommendations: string[];
    riskAreas: string[];
  }> {
    try {
      const { unifiedGeminiClient } = await import('../ai-brain/unifiedGeminiClient');
      
      // Get recent scheduling data
      const recentShifts = await db.select().from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        ))
        .limit(SCHEDULING.patternAnalysisSampleSize);
      
      const prompt = `Analyze these scheduling patterns for a security company:

RECENT SHIFTS (30 days):
- Total shifts: ${recentShifts.length}
- Unfilled shifts: ${recentShifts.filter(s => !s.employeeId).length}
- Completed: ${recentShifts.filter(s => s.status === 'completed').length}
- Cancelled: ${recentShifts.filter(s => s.status === 'cancelled').length}

Provide scheduling insights in JSON:
{
  "insights": ["insight1", "insight2"],
  "recommendations": ["rec1", "rec2"],
  "riskAreas": ["risk1", "risk2"]
}`;

      const response = await unifiedGeminiClient.generateContent(prompt, { // withGemini
        temperature: 0.4,
        maxOutputTokens: 400,
        workspaceId,
        featureKey: 'trinity_schedule_insights',
      });
      
      const jsonMatch = (response as any).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { insights: [], recommendations: [], riskAreas: [] };
    } catch (error) {
      log.error('[TrinitySchedulingAI] Pattern analysis error:', error);
      return { insights: [], recommendations: [], riskAreas: [] };
    }
  }
}

/**
 * Escalation Chain Service - Contractors, Partners, External Resources
 */
export class SchedulerEscalationChainService {
  private static instance: SchedulerEscalationChainService;
  
  static getInstance(): SchedulerEscalationChainService {
    if (!SchedulerEscalationChainService.instance) {
      SchedulerEscalationChainService.instance = new SchedulerEscalationChainService();
    }
    return SchedulerEscalationChainService.instance;
  }
  
  /**
   * Execute escalation chain when internal employees unavailable
   */
  async executeEscalation(
    shift: any,
    workspaceId: string,
    tier: 1 | 2 | 3 | 4 | 5
  ): Promise<{
    success: boolean;
    assignedResourceId: string | null;
    resourceType: 'internal' | 'contractor' | 'partner' | 'external';
    cost: number;
    message: string;
  }> {
    log.info(`[EscalationChain] Executing tier ${tier} escalation for shift ${shift.id}`);
    
    switch (tier) {
      case 1:
        // Tier 1: Internal overtime employees (willing to work extra)
        const overtimeEmployees = await this.getOvertimeWillingEmployees(workspaceId);
        if (overtimeEmployees.length > 0) {
          return {
            success: true,
            assignedResourceId: overtimeEmployees[0].id,
            resourceType: 'internal',
            cost: 1.5, // OT rate multiplier
            message: `Assigned to ${overtimeEmployees[0].firstName} (overtime)`,
          };
        }
        break;
        
      case 2:
        // Tier 2: On-call pool
        const onCallPool = await this.getOnCallEmployees(workspaceId);
        if (onCallPool.length > 0) {
          return {
            success: true,
            assignedResourceId: onCallPool[0].id,
            resourceType: 'internal',
            cost: 1.25,
            message: `Assigned to on-call: ${onCallPool[0].firstName}`,
          };
        }
        break;
        
      case 3:
        // Tier 3: Contractor pool (global pool — no workspace_id filter)
        const contractors = await db.select().from(contractorPool)
          .where(eq(contractorPool.isActive, true))
          .limit(SCHEDULING.contractorPoolSize);
        
        if (contractors.length > 0) {
          return {
            success: true,
            assignedResourceId: contractors[0].id,
            resourceType: 'contractor',
            cost: 2.0, // Contractor rate multiplier
            message: `Contractor assigned: ${contractors[0].agencyName || contractors[0].firstName || 'Contract Worker'}`,
          };
        }
        break;
        
      case 4:
        // Tier 4: Partner agencies
        return {
          success: false,
          assignedResourceId: null,
          resourceType: 'partner',
          cost: 2.5,
          message: 'Partner agency request initiated (pending approval)',
        };
        
      case 5:
        // Tier 5: External staffing services (last resort)
        return {
          success: false,
          assignedResourceId: null,
          resourceType: 'external',
          cost: 3.0,
          message: 'External staffing request queued (requires management approval)',
        };
    }
    
    // Escalate to next tier
    if (tier < 5) {
      return this.executeEscalation(shift, workspaceId, (tier + 1) as 1 | 2 | 3 | 4 | 5);
    }
    
    return {
      success: false,
      assignedResourceId: null,
      resourceType: 'external',
      cost: 0,
      message: 'All escalation tiers exhausted - requires manual intervention',
    };
  }
  
  private async getOvertimeWillingEmployees(workspaceId: string): Promise<any[]> {
    return db.select().from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ))
      .limit(SCHEDULING.escalationPoolSize);
  }
  
  private async getOnCallEmployees(workspaceId: string): Promise<any[]> {
    return db.select().from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ))
      .limit(SCHEDULING.escalationPoolSize);
  }
}

export const trinitySchedulingAI = TrinitySchedulingAI.getInstance();
export const schedulerEscalationChainService = SchedulerEscalationChainService.getInstance();

log.info('[TrinityAutonomousScheduler] AI Intelligence, Compliance, Preferences, and Escalation Chain loaded');

// ============================================================================
// REAL-TIME HUMAN OVERRIDE CAPABILITY
// ============================================================================

/**
 * Human Override Controller - Allows managers to override AI scheduling decisions
 */
export class HumanOverrideController {
  private static instance: HumanOverrideController;
  private overrideQueue: Map<string, {
    shiftId: string;
    action: 'pause' | 'skip' | 'force_assign' | 'force_unassign';
    employeeId?: string;
    reason: string;
    timestamp: Date;
    userId: string;
  }> = new Map();
  
  private pausedWorkspaces: Set<string> = new Set();
  
  static getInstance(): HumanOverrideController {
    if (!HumanOverrideController.instance) {
      HumanOverrideController.instance = new HumanOverrideController();
    }
    return HumanOverrideController.instance;
  }
  
  /**
   * Pause autonomous scheduling for a workspace
   */
  pauseScheduling(workspaceId: string, userId: string, reason: string): void {
    this.pausedWorkspaces.add(workspaceId);
    log.info(`[HumanOverride] Scheduling paused for workspace ${workspaceId} by ${userId}: ${reason}`);
    
    // Emit event for real-time UI update
    platformEventBus.emit('scheduling_paused', {
      workspaceId,
      userId,
      reason,
      timestamp: new Date(),
    });
  }
  
  /**
   * Resume autonomous scheduling for a workspace
   */
  resumeScheduling(workspaceId: string, userId: string): void {
    this.pausedWorkspaces.delete(workspaceId);
    log.info(`[HumanOverride] Scheduling resumed for workspace ${workspaceId} by ${userId}`);
    
    platformEventBus.emit('scheduling_resumed', {
      workspaceId,
      userId,
      timestamp: new Date(),
    });
  }
  
  /**
   * Check if scheduling is paused for a workspace
   */
  isPaused(workspaceId: string): boolean {
    return this.pausedWorkspaces.has(workspaceId);
  }
  
  /**
   * Queue a human override for a specific shift
   */
  queueOverride(override: {
    shiftId: string;
    workspaceId: string;
    action: 'skip' | 'force_assign' | 'force_unassign';
    employeeId?: string;
    reason: string;
    userId: string;
  }): void {
    this.overrideQueue.set(override.shiftId, {
      ...override,
      timestamp: new Date(),
    });
    
    log.info(`[HumanOverride] Override queued for shift ${override.shiftId}: ${override.action}`);
    
    platformEventBus.emit('scheduling_override_queued', override);
  }
  
  /**
   * Check for pending override on a shift
   */
  getOverride(shiftId: string): {
    action: 'skip' | 'force_assign' | 'force_unassign';
    employeeId?: string;
    reason: string;
  } | null {
    const override = this.overrideQueue.get(shiftId);
    if (override) {
      this.overrideQueue.delete(shiftId); // Consume the override
      return {
        action: override.action as 'skip' | 'force_assign' | 'force_unassign',
        employeeId: override.employeeId,
        reason: override.reason,
      };
    }
    return null;
  }
  
  /**
   * Get all pending overrides for a workspace
   */
  getPendingOverrides(workspaceId: string): Array<{
    shiftId: string;
    action: string;
    reason: string;
    timestamp: Date;
  }> {
    const overrides: Array<{
      shiftId: string;
      action: string;
      reason: string;
      timestamp: Date;
    }> = [];
    
    for (const [shiftId, override] of this.overrideQueue.entries()) {
      overrides.push({
        shiftId,
        action: override.action,
        reason: override.reason,
        timestamp: override.timestamp,
      });
    }
    
    return overrides;
  }
  
  /**
   * Clear all overrides for a workspace
   */
  clearOverrides(workspaceId: string): void {
    for (const [shiftId] of this.overrideQueue.entries()) {
      this.overrideQueue.delete(shiftId);
    }
    log.info(`[HumanOverride] Cleared all overrides for workspace ${workspaceId}`);
  }
}

export const humanOverrideController = HumanOverrideController.getInstance();

log.info('[HumanOverrideController] Real-time human override capability initialized');
