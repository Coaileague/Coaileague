/**
 * ${PLATFORM.name} Scoring Service
 * 
 * Implements the Gap Analysis requirements for employee scoring:
 * - Configurable weight profiles per workspace
 * - Real-time event-driven score updates
 * - Historical tracking for trends and Gemini learning
 * - Personality likeness scoring
 * - Pool membership management (Org/Global)
 * 
 * Pipeline:
 * 1. Event Trigger (clock-in, shift complete, feedback, etc.)
 * 2. Points Calculation (based on weight profile)
 * 3. Score Recalculation (composite scores)
 * 4. Profile Update (CoAIleagueEmployeeProfile)
 * 5. Event Logging (employee_event_log)
 * 6. Snapshot Creation (periodic historical tracking)
 */

import { db } from "../../db";
import { 
  coaileagueEmployeeProfiles,
  employeeEventLog,
  employeeScoreSnapshots,
  scoringWeightProfiles,
  personalityTagsCatalog,
  employees,
  type CoaileagueEmployeeProfile,
  type ScoringWeightProfile,
  type InsertEmployeeEventLog,
  type InsertCoaileagueEmployeeProfile,
} from '@shared/schema';
import { eq, and, sql, desc } from "drizzle-orm";
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
const log = createLogger('coaileagueScoringService');


// ============================================================================
// CUSTOM ERRORS (for typed error handling in routes)
// ============================================================================

export class SchedulerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerNotFoundError';
  }
}

export class SchedulerAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerAccessDeniedError';
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type ScoringEventType = 
  | 'clock_in_on_time' | 'clock_in_late' | 'clock_out_on_time' | 'clock_out_early' | 'clock_out_late'
  | 'shift_completed' | 'shift_perfect' | 'shift_no_show' | 'shift_call_off' | 'shift_call_off_late'
  | 'shift_accepted' | 'shift_rejected' | 'shift_dropped'
  | 'client_positive_feedback' | 'client_negative_feedback' | 'client_neutral_feedback'
  | 'overtime_compliance' | 'overtime_violation'
  | 'certification_added' | 'certification_expired' | 'certification_renewed'
  | 'training_completed' | 'skill_verified'
  | 'manual_adjustment'
  | 'document_missing_critical' | 'document_expired_critical' | 'document_approved' | 'document_rejected'
  | 'compliance_suspension' | 'compliance_reinstatement'
  | 'grievance_score_adjustment';

export interface ScoringWeights {
  skills: number;
  certifications: number;
  performance: number;
  reliability: number;
  distance: number;
  payMargin: number;
  overtimeRisk: number;
  personalityLikeness: number;
}

export interface EventContext {
  referenceId?: string;
  referenceType?: 'shift' | 'time_entry' | 'feedback' | 'certification' | 'document' | 'compliance' | 'grievance';
  metadata?: Record<string, any>;
  triggeredBy?: string;
  isAutomatic?: boolean;
}

export interface ScoreUpdateResult {
  success: boolean;
  previousScore: number;
  newScore: number;
  pointsChange: number;
  eventLogId?: string;
  error?: string;
}

// ============================================================================
// DEFAULT SCORING WEIGHTS
// ============================================================================

export const COAI_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.25,
  certifications: 0.15,
  performance: 0.15,
  reliability: 0.15,
  distance: 0.10,
  payMargin: 0.10,
  overtimeRisk: 0.05,
  personalityLikeness: 0.05,
};

// Default point values for events
export const DEFAULT_POINT_VALUES: Record<ScoringEventType, number> = {
  clock_in_on_time: 2,
  clock_in_late: -5,
  clock_out_on_time: 2,
  clock_out_early: -3,
  clock_out_late: -2,
  shift_completed: 5,
  shift_perfect: 10,
  shift_no_show: -20,
  shift_call_off: -10,
  shift_call_off_late: -15,
  shift_accepted: 3,
  shift_rejected: -2,
  shift_dropped: -10,
  client_positive_feedback: 5,
  client_negative_feedback: -5,
  client_neutral_feedback: 0,
  overtime_compliance: 2,
  overtime_violation: -5,
  certification_added: 5,
  certification_expired: -3,
  certification_renewed: 3,
  training_completed: 5,
  skill_verified: 3,
  manual_adjustment: 0,
  document_missing_critical: -15,
  document_expired_critical: -10,
  document_approved: 3,
  document_rejected: -5,
  compliance_suspension: -25,
  compliance_reinstatement: 5,
  grievance_score_adjustment: 0,
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CoAIleagueScoringService {
  
  /**
   * Get or create the scoring weight profile for a workspace
   */
  async getWeightProfile(workspaceId: string): Promise<ScoringWeightProfile | null> {
    const profile = await db.query.scoringWeightProfiles.findFirst({
      where: and(
        eq(scoringWeightProfiles.workspaceId, workspaceId),
        eq(scoringWeightProfiles.isDefault, true),
        eq(scoringWeightProfiles.isActive, true)
      ),
    });
    
    return profile || null;
  }

  /**
   * Create default weight profile for a workspace
   */
  async createDefaultWeightProfile(workspaceId: string, createdBy?: string): Promise<ScoringWeightProfile> {
    const [profile] = await db.insert(scoringWeightProfiles).values({
      workspaceId,
      profileName: "Default Scoring Profile",
      description: `Standard ${PLATFORM.name} scoring weights for employee matching`,
      isDefault: true,
      isActive: true,
      skillsWeight: COAI_SCORING_WEIGHTS.skills.toString(),
      certificationsWeight: COAI_SCORING_WEIGHTS.certifications.toString(),
      performanceWeight: COAI_SCORING_WEIGHTS.performance.toString(),
      reliabilityWeight: COAI_SCORING_WEIGHTS.reliability.toString(),
      distanceWeight: COAI_SCORING_WEIGHTS.distance.toString(),
      payMarginWeight: COAI_SCORING_WEIGHTS.payMargin.toString(),
      overtimeRiskWeight: COAI_SCORING_WEIGHTS.overtimeRisk.toString(),
      personalityLikenessWeight: COAI_SCORING_WEIGHTS.personalityLikeness.toString(),
      createdBy,
    }).returning();
    
    return profile;
  }

  /**
   * Get or create employee profile (workspace-scoped for tenant isolation)
   * @throws SchedulerNotFoundError if employee not found in workspace
   * @throws SchedulerAccessDeniedError if workspace mismatch
   */
  async getOrCreateProfile(workspaceId: string, employeeId: string): Promise<CoaileagueEmployeeProfile> {
    // Always filter by BOTH workspaceId AND employeeId for tenant isolation
    let profile = await db.query.coaileagueEmployeeProfiles.findFirst({
      where: and(
        eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
        eq(coaileagueEmployeeProfiles.employeeId, employeeId)
      ),
    });

    if (!profile) {
      // Verify employee belongs to this workspace before creating profile
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.id, employeeId),
          eq(employees.workspaceId, workspaceId)
        ),
      });

      if (!employee) {
        throw new SchedulerNotFoundError(`Employee not found in workspace`);
      }

      [profile] = await db.insert(coaileagueEmployeeProfiles).values({
        workspaceId,
        employeeId,
        overallScore: "0.7500",
        reliabilityScore: "0.8500",
        skillMatchScore: "0.8000",
        distanceScore: "0.7000",
        personalityLikenessScore: "0.5000",
        costEfficiencyScore: "0.8000",
        currentHourlyRate: employee.hourlyRate,
        isInOrgPool: true,
        isInGlobalPool: false,
      }).returning();
    }

    // Final validation: ensure returned profile belongs to requested workspace
    if (profile.workspaceId !== workspaceId) {
      throw new SchedulerAccessDeniedError(`Access denied`);
    }

    return profile;
  }

  /**
   * Process a scoring event and update employee profile
   */
  async processEvent(
    workspaceId: string,
    employeeId: string,
    eventType: ScoringEventType,
    context: EventContext = {}
  ): Promise<ScoreUpdateResult> {
    try {
      // Get current profile
      const profile = await this.getOrCreateProfile(workspaceId, employeeId);
      
      // Get workspace weight profile for point values
      const weightProfile = await this.getWeightProfile(workspaceId);
      
      // Calculate points change
      const pointsChange = this.getPointsForEvent(eventType, weightProfile);
      const pointsType = pointsChange >= 0 ? 'good' : 'negative';
      
      // Get previous scores
      const previousOverallScore = parseFloat(profile.overallScore || "0.75");
      const previousReliabilityScore = parseFloat(profile.reliabilityScore || "0.85");
      
      // Update raw metrics based on event type
      const metricUpdates = this.getMetricUpdatesForEvent(eventType, profile);
      
      // Recalculate scores
      const newScores = this.recalculateScores(profile, metricUpdates, pointsChange);
      
      // Update profile in database - include workspaceId in WHERE for defense-in-depth
      await db.update(coaileagueEmployeeProfiles)
        .set({
          ...metricUpdates,
          overallScore: newScores.overallScore.toFixed(4),
          reliabilityScore: newScores.reliabilityScore.toFixed(4),
          goodPoints: pointsChange > 0 ? sql`good_points + ${pointsChange}` : sql`good_points`,
          negativePoints: pointsChange < 0 ? sql`negative_points + ${Math.abs(pointsChange)}` : sql`negative_points`,
          netPoints: sql`net_points + ${pointsChange}`,
          lastScoreUpdate: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(coaileagueEmployeeProfiles.id, profile.id),
          eq(coaileagueEmployeeProfiles.workspaceId, workspaceId)
        ));
      
      // Log the event
      const [eventLog] = await db.insert(employeeEventLog).values({
        workspaceId,
        employeeId,
        profileId: profile.id,
        eventType,
        eventSource: context.referenceType || 'system',
        pointsChange,
        pointsType,
        previousOverallScore: previousOverallScore.toFixed(4),
        newOverallScore: newScores.overallScore.toFixed(4),
        previousReliabilityScore: previousReliabilityScore.toFixed(4),
        newReliabilityScore: newScores.reliabilityScore.toFixed(4),
        referenceId: context.referenceId,
        referenceType: context.referenceType,
        metadata: context.metadata,
        triggeredBy: context.triggeredBy,
        isAutomatic: context.isAutomatic ?? true,
      }).returning();

      if (eventType === 'client_negative_feedback' && context.metadata?.clientId && context.metadata?.severity === 'critical') {
        const clientId = context.metadata.clientId as string;
        log.info(`[CoAIleagueScoringService] Critical complaint against employee ${employeeId} from client ${clientId} — triggering client-specific shift removal`);
        import('../scheduling/officerDeactivationHandler').then(({ handleOfficerDeactivation }) => {
          handleOfficerDeactivation(employeeId, workspaceId, 'complaint_client_removal', clientId).catch(e =>
            log.error('[CoAIleagueScoringService] Client removal error:', e)
          );
        }).catch(e => log.error('[CoAIleagueScoringService] Import error:', e));
      }

      if (eventType === 'compliance_suspension') {
        log.info(`[CoAIleagueScoringService] Compliance suspension for employee ${employeeId} — triggering workspace-wide shift removal`);
        import('../scheduling/officerDeactivationHandler').then(({ handleOfficerDeactivation }) => {
          handleOfficerDeactivation(employeeId, workspaceId, 'suspended').catch(e =>
            log.error('[CoAIleagueScoringService] Suspension removal error:', e)
          );
        }).catch(e => log.error('[CoAIleagueScoringService] Import error:', e));
      }

      return {
        success: true,
        previousScore: previousOverallScore,
        newScore: newScores.overallScore,
        pointsChange,
        eventLogId: eventLog.id,
      };
    } catch (error) {
      log.error('[CoAIleagueScoringService] Error processing event:', error);
      return {
        success: false,
        previousScore: 0,
        newScore: 0,
        pointsChange: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get point value for an event type
   */
  private getPointsForEvent(eventType: ScoringEventType, weightProfile: ScoringWeightProfile | null): number {
    if (weightProfile) {
      // Use workspace-specific point values
      const pointMap: Partial<Record<ScoringEventType, number>> = {
        clock_in_on_time: weightProfile.pointsClockInOnTime ?? 2,
        clock_in_late: weightProfile.pointsClockInLate ?? -5,
        shift_completed: weightProfile.pointsShiftComplete ?? 5,
        shift_perfect: weightProfile.pointsShiftPerfect ?? 10,
        shift_no_show: weightProfile.pointsNoShow ?? -20,
        shift_call_off: weightProfile.pointsCallOff ?? -10,
        shift_call_off_late: weightProfile.pointsLateCallOff ?? -15,
        client_positive_feedback: weightProfile.pointsPositiveFeedback ?? 5,
        client_negative_feedback: weightProfile.pointsNegativeFeedback ?? -5,
      };
      return pointMap[eventType] ?? DEFAULT_POINT_VALUES[eventType];
    }
    return DEFAULT_POINT_VALUES[eventType];
  }

  /**
   * Get metric updates based on event type
   */
  private getMetricUpdatesForEvent(
    eventType: ScoringEventType, 
    profile: CoaileagueEmployeeProfile
  ): Partial<CoaileagueEmployeeProfile> {
    const updates: Partial<CoaileagueEmployeeProfile> = {};
    
    switch (eventType) {
      case 'clock_in_on_time':
        updates.clockInsOnTime = (profile.clockInsOnTime ?? 0) + 1;
        break;
      case 'clock_in_late':
        updates.clockInsLate = (profile.clockInsLate ?? 0) + 1;
        break;
      case 'clock_out_on_time':
        updates.clockOutsOnTime = (profile.clockOutsOnTime ?? 0) + 1;
        break;
      case 'clock_out_late':
        updates.clockOutsLate = (profile.clockOutsLate ?? 0) + 1;
        break;
      case 'shift_completed':
        updates.shiftsCompleted = (profile.shiftsCompleted ?? 0) + 1;
        updates.lastShiftCompleted = new Date();
        break;
      case 'shift_perfect':
        updates.shiftsCompleted = (profile.shiftsCompleted ?? 0) + 1;
        updates.perfectShifts = (profile.perfectShifts ?? 0) + 1;
        updates.lastShiftCompleted = new Date();
        break;
      case 'shift_no_show':
        updates.shiftsNoShow = (profile.shiftsNoShow ?? 0) + 1;
        break;
      case 'shift_call_off':
        updates.shiftsCallOff = (profile.shiftsCallOff ?? 0) + 1;
        break;
      case 'shift_call_off_late':
        updates.shiftsLateCallOff = (profile.shiftsLateCallOff ?? 0) + 1;
        break;
      case 'shift_dropped':
        updates.shiftsDropped = (profile.shiftsDropped ?? 0) + 1;
        break;
      case 'client_positive_feedback':
        updates.clientPositiveFeedback = (profile.clientPositiveFeedback ?? 0) + 1;
        break;
      case 'client_negative_feedback':
        updates.clientNegativeFeedback = (profile.clientNegativeFeedback ?? 0) + 1;
        break;
      case 'client_neutral_feedback':
        updates.clientNeutralFeedback = (profile.clientNeutralFeedback ?? 0) + 1;
        break;
      case 'shift_accepted':
        updates.totalShiftsAssigned = (profile.totalShiftsAssigned ?? 0) + 1;
        updates.lastShiftAssigned = new Date();
        break;
    }
    
    return updates;
  }

  /**
   * Recalculate composite scores based on updated metrics
   */
  private recalculateScores(
    profile: CoaileagueEmployeeProfile,
    metricUpdates: Partial<CoaileagueEmployeeProfile>,
    pointsChange: number
  ): { overallScore: number; reliabilityScore: number } {
    // Merge updates with current profile
    const merged = { ...profile, ...metricUpdates };
    
    // Calculate reliability score (0.00-1.00)
    const totalShifts = (merged.shiftsCompleted ?? 0) + (merged.shiftsNoShow ?? 0) + (merged.shiftsCallOff ?? 0);
    let reliabilityScore = parseFloat(profile.reliabilityScore || "0.85");
    
    if (totalShifts > 0) {
      const completedRatio = (merged.shiftsCompleted ?? 0) / totalShifts;
      const onTimeRatio = (merged.clockInsOnTime ?? 0) / Math.max(1, (merged.clockInsOnTime ?? 0) + (merged.clockInsLate ?? 0));
      reliabilityScore = (completedRatio * 0.7) + (onTimeRatio * 0.3);
      reliabilityScore = Math.max(0, Math.min(1, reliabilityScore));
    }
    
    // Adjust overall score based on points change
    let overallScore = parseFloat(profile.overallScore || "0.75");
    
    // Points impact on overall score (each point = 0.001 adjustment, capped)
    const pointsImpact = (pointsChange / 1000);
    overallScore = Math.max(0, Math.min(1, overallScore + pointsImpact));
    
    // Weight reliability into overall score
    overallScore = (overallScore * 0.6) + (reliabilityScore * 0.4);
    overallScore = Math.max(0, Math.min(1, overallScore));
    
    return {
      overallScore,
      reliabilityScore,
    };
  }

  /**
   * Calculate personality likeness score between employee and client
   */
  async calculatePersonalityLikeness(
    workspaceId: string,
    employeeId: string,
    clientId: string
  ): Promise<number> {
    try {
      // Get employee personality tags
      const employeeTags = await db.query.employeePersonalityTags.findMany({
        where: eq(employeePersonalityTags.employeeId, employeeId),
      });

      const clientPrefs = await db.query.clientPersonalityPreferences.findMany({
        where: eq(clientPersonalityPreferences.clientId, clientId),
      });

      if (clientPrefs.length === 0) {
        return 0.5; // No preferences = neutral match
      }

      let matchScore = 0;
      let totalWeight = 0;

      for (const pref of clientPrefs) {
        const employeeHasTag = employeeTags.some(et => et.tagId === pref.tagId);
        const weight = parseFloat(pref.preferenceWeight || "0.5");
        
        if (employeeHasTag) {
          matchScore += weight;
        } else if (pref.isRequired) {
          // Required tag missing = significant penalty
          matchScore -= weight * 0.5;
        }
        
        totalWeight += weight;
      }

      // Normalize to 0-1 range
      return totalWeight > 0 ? Math.max(0, Math.min(1, matchScore / totalWeight)) : 0.5;
    } catch (error) {
      log.error('[CoAIleagueScoringService] Error calculating personality likeness:', error);
      return 0.5;
    }
  }

  /**
   * Create a periodic score snapshot for historical tracking (workspace-scoped)
   */
  async createSnapshot(
    workspaceId: string,
    employeeId: string,
    periodType: 'daily' | 'weekly' | 'monthly',
    periodStart: Date,
    periodEnd: Date
  ): Promise<void> {
    const profile = await this.getOrCreateProfile(workspaceId, employeeId);
    
    // Count events during this period - always filter by workspaceId for tenant isolation
    const eventsInPeriod = await db.query.employeeEventLog.findMany({
      where: and(
        eq(employeeEventLog.workspaceId, workspaceId),
        eq(employeeEventLog.employeeId, employeeId),
        sql`created_at >= ${periodStart}`,
        sql`created_at <= ${periodEnd}`
      ),
    });

    const shiftsAssigned = eventsInPeriod.filter(e => e.eventType === 'shift_accepted').length;
    const shiftsCompleted = eventsInPeriod.filter(e => 
      e.eventType === 'shift_completed' || e.eventType === 'shift_perfect'
    ).length;
    const shiftsNoShow = eventsInPeriod.filter(e => e.eventType === 'shift_no_show').length;
    const shiftsCallOff = eventsInPeriod.filter(e => 
      e.eventType === 'shift_call_off' || e.eventType === 'shift_call_off_late'
    ).length;

    const pointsEarned = eventsInPeriod
      .filter(e => (e.pointsChange ?? 0) > 0)
      .reduce((sum, e) => sum + (e.pointsChange ?? 0), 0);
    const pointsLost = eventsInPeriod
      .filter(e => (e.pointsChange ?? 0) < 0)
      .reduce((sum, e) => sum + Math.abs(e.pointsChange ?? 0), 0);

    const reliabilityPercentage = shiftsAssigned > 0 
      ? ((shiftsCompleted / shiftsAssigned) * 100).toFixed(2)
      : "100.00";

    await db.insert(employeeScoreSnapshots).values({
      workspaceId,
      employeeId,
      profileId: profile.id,
      periodType,
      periodStart,
      periodEnd,
      overallScore: profile.overallScore,
      reliabilityScore: profile.reliabilityScore,
      skillMatchScore: profile.skillMatchScore,
      distanceScore: profile.distanceScore,
      personalityLikenessScore: profile.personalityLikenessScore,
      shiftsAssigned,
      shiftsCompleted,
      shiftsNoShow,
      shiftsCallOff,
      pointsEarned,
      pointsLost,
      reliabilityPercentage,
    });
  }

  /**
   * Update day-of-week reliability patterns (workspace-scoped)
   */
  async updateDayOfWeekReliability(workspaceId: string, employeeId: string): Promise<void> {
    const profile = await this.getOrCreateProfile(workspaceId, employeeId);
    
    // Get all events for this employee - always filter by workspaceId for tenant isolation
    const allEvents = await db.query.employeeEventLog.findMany({
      where: and(
        eq(employeeEventLog.workspaceId, workspaceId),
        eq(employeeEventLog.employeeId, employeeId)
      ),
      orderBy: desc(employeeEventLog.createdAt),
    });

    // Group events by day of week
    const dayGroups: Record<number, { completed: number; total: number }> = {
      0: { completed: 0, total: 0 }, // Sunday
      1: { completed: 0, total: 0 }, // Monday
      2: { completed: 0, total: 0 }, // Tuesday
      3: { completed: 0, total: 0 }, // Wednesday
      4: { completed: 0, total: 0 }, // Thursday
      5: { completed: 0, total: 0 }, // Friday
      6: { completed: 0, total: 0 }, // Saturday
    };

    for (const event of allEvents) {
      if (!event.createdAt) continue;
      const dayOfWeek = event.createdAt.getDay();
      
      if (event.eventType === 'shift_accepted') {
        dayGroups[dayOfWeek].total++;
      }
      if (event.eventType === 'shift_completed' || event.eventType === 'shift_perfect') {
        dayGroups[dayOfWeek].completed++;
      }
    }

    // Calculate reliability for each day
    const calculateReliability = (day: number): string => {
      const { completed, total } = dayGroups[day];
      if (total === 0) return "0.8500"; // Default if no data
      return (completed / total).toFixed(4);
    };

    // Update reliability with workspace scope for defense-in-depth
    await db.update(coaileagueEmployeeProfiles)
      .set({
        sundayReliability: calculateReliability(0),
        mondayReliability: calculateReliability(1),
        tuesdayReliability: calculateReliability(2),
        wednesdayReliability: calculateReliability(3),
        thursdayReliability: calculateReliability(4),
        fridayReliability: calculateReliability(5),
        saturdayReliability: calculateReliability(6),
        updatedAt: new Date(),
      })
      .where(and(
        eq(coaileagueEmployeeProfiles.id, profile.id),
        eq(coaileagueEmployeeProfiles.workspaceId, workspaceId)
      ));
  }

  /**
   * Update pool membership for an employee (workspace-scoped)
   */
  async updatePoolMembership(
    workspaceId: string,
    employeeId: string,
    options: {
      isInOrgPool?: boolean;
      isInGlobalPool?: boolean;
      globalPoolCategories?: string[];
    }
  ): Promise<void> {
    const updateData: Partial<CoaileagueEmployeeProfile> = {
      updatedAt: new Date(),
    };

    if (options.isInOrgPool !== undefined) {
      updateData.isInOrgPool = options.isInOrgPool;
    }
    if (options.isInGlobalPool !== undefined) {
      updateData.isInGlobalPool = options.isInGlobalPool;
    }
    if (options.globalPoolCategories) {
      updateData.globalPoolCategories = options.globalPoolCategories;
    }

    // Always filter by both workspaceId and employeeId for tenant isolation
    await db.update(coaileagueEmployeeProfiles)
      .set(updateData)
      .where(and(
        eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
        eq(coaileagueEmployeeProfiles.employeeId, employeeId)
      ));
  }

  /**
   * Detect reliability trend (improving, stable, declining) - workspace-scoped
   */
  async detectReliabilityTrend(workspaceId: string, employeeId: string): Promise<'improving' | 'stable' | 'declining'> {
    // Get last 4 weekly snapshots - always filter by workspaceId for tenant isolation
    const snapshots = await db.query.employeeScoreSnapshots.findMany({
      where: and(
        eq(employeeScoreSnapshots.workspaceId, workspaceId),
        eq(employeeScoreSnapshots.employeeId, employeeId),
        eq(employeeScoreSnapshots.periodType, 'weekly')
      ),
      orderBy: desc(employeeScoreSnapshots.periodStart),
      limit: 4,
    });

    if (snapshots.length < 2) {
      return 'stable';
    }

    // Calculate trend
    const scores = snapshots.map(s => parseFloat(s.reliabilityScore || "0.85")).reverse();
    let improving = 0;
    let declining = 0;

    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[i - 1]) improving++;
      else if (scores[i] < scores[i - 1]) declining++;
    }

    if (improving > declining) return 'improving';
    if (declining > improving) return 'declining';
    return 'stable';
  }
}

// Export singleton instance
export const coaileagueScoringService = new CoAIleagueScoringService();
