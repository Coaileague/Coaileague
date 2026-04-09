/**
 * Officer Readiness Score Service
 *
 * Manages the portable 0-100 readiness score for field officers.
 * - Officers start at 100 (perfect) when they join the platform
 * - Score travels with them across all CoAIleague companies
 * - Support staff: score only goes UP (rating-based, never punitive)
 * - Org owners: score not affected by owner role; only activates when added
 *   as employee/staff OR manually scheduled on a shift
 */

import { db } from '../db';
import { sql, eq, and, desc } from 'drizzle-orm';
import {
  officerReadiness,
  officerScoreEvents,
  officerComplaints,
  officerGrievances,
  employees,
  workspaceMembers,
  type OfficerReadiness,
  type OfficerScoreEvent,
  type OfficerComplaint,
  type OfficerGrievance,
} from '../../shared/schema';
import { meteredGemini } from './billing/meteredGeminiClient';
import { createLogger } from '../lib/logger';
const log = createLogger('officerScoreService');


// Score change caps per event type
const EVENT_DELTAS: Record<string, number> = {
  // Negative events (penalties)
  no_show: -10,
  late_arrival: -3,
  early_departure: -5,
  client_complaint_low: -5,
  client_complaint_medium: -10,
  client_complaint_high: -20,
  client_complaint_critical: -30,
  incident_report: -15,
  failed_certification: -5,
  // Positive events (bonuses)
  shift_completion_bonus: 1,
  client_satisfaction_bonus: 3,
  supervisor_rating_bonus: 2,
  support_rating_bonus: 5,   // support staff only
  certification_earned: 5,
  years_service_bonus: 2,
  // System events
  system_init: 0,
  manual_adjustment: 0,
  grievance_restored: 0,
};

// Score type detection based on workspace role
function detectScoreType(workspaceRole?: string): 'officer' | 'support' | 'owner' {
  if (!workspaceRole) return 'officer';
  if (['org_owner', 'co_owner', 'owner'].includes(workspaceRole)) return 'owner';
  if (workspaceRole === 'support' || workspaceRole === 'platform_support') return 'support';
  return 'officer';
}

export const officerScoreService = {
  /**
   * Get or initialize the readiness record for an employee.
   * Auto-detects score type based on workspace role.
   * If role is 'owner', only creates record if forcedActive = true
   * (which is set when they're added as employee/staff or manually scheduled).
   */
  async getOrInitScore(
    employeeId: string,
    workspaceId: string,
    options: { workspaceRole?: string; forceActivate?: boolean } = {}
  ): Promise<OfficerReadiness | null> {
    // Check existing
    const [existing] = await db
      .select()
      .from(officerReadiness)
      .where(eq(officerReadiness.employeeId, employeeId))
      .limit(1);

    if (existing) return existing;

    const scoreType = detectScoreType(options.workspaceRole);

    // Owners don't get a score record unless forceActivate is set
    if (scoreType === 'owner' && !options.forceActivate) return null;

    // Create initial record
    const [created] = await db
      .insert(officerReadiness)
      .values({
        employeeId,
        workspaceId,
        readinessScore: 100,
        underReview: false,
        activeComplaintCount: 0,
        scoreType,
      })
      .returning();

    // Record the system_init event
    await db.insert(officerScoreEvents).values({
      employeeId,
      workspaceId,
      eventType: 'system_init',
      pointsDelta: 0,
      scoreAfter: 100,
      reason: 'Welcome to CoAIleague. Starting readiness score: 100/100.',
      referenceType: 'manual',
      triggeredBy: 'system',
      isDisputable: false,
    });

    return created;
  },

  /**
   * Record a score-changing event and update the readiness score.
   * Support staff events only go up. Owner events are blocked unless record exists.
   */
  async recordEvent(params: {
    employeeId: string;
    workspaceId: string;
    eventType: string;
    pointsDelta?: number;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    triggeredBy?: string;
    isDisputable?: boolean;
  }): Promise<{ newScore: number; event: OfficerScoreEvent } | null> {
    const record = await this.getOrInitScore(params.employeeId, params.workspaceId);
    if (!record) return null;

    // Support staff: only positive deltas allowed
    let delta = params.pointsDelta ?? EVENT_DELTAS[params.eventType] ?? 0;
    if (record.scoreType === 'support' && delta < 0) delta = 0;

    const newScore = Math.max(0, Math.min(100, record.readinessScore + delta));

    // Update score
    await db
      .update(officerReadiness)
      .set({ readinessScore: newScore, updatedAt: new Date() })
      .where(eq(officerReadiness.employeeId, params.employeeId));

    // Record event
    const [event] = await db
      .insert(officerScoreEvents)
      .values({
        employeeId: params.employeeId,
        workspaceId: params.workspaceId,
        eventType: params.eventType,
        pointsDelta: delta,
        scoreAfter: newScore,
        reason: params.reason,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        triggeredBy: params.triggeredBy ?? 'system',
        isDisputable: params.isDisputable ?? delta < 0,
      })
      .returning();

    log.info(`[OfficerScore] ${params.employeeId}: ${params.eventType} delta=${delta} newScore=${newScore}`);

    return { newScore, event };
  },

  /**
   * Get the full score + event history for an employee.
   * What the employee sees when they click their score badge.
   */
  async getScoreWithHistory(
    employeeId: string,
    workspaceId: string
  ): Promise<{
    score: OfficerReadiness | null;
    events: OfficerScoreEvent[];
    pendingGrievances: string[];
  }> {
    const [score] = await db
      .select()
      .from(officerReadiness)
      .where(eq(officerReadiness.employeeId, employeeId))
      .limit(1);

    const events = await db
      .select()
      .from(officerScoreEvents)
      .where(eq(officerScoreEvents.employeeId, employeeId))
      .orderBy(desc(officerScoreEvents.createdAt))
      .limit(100);

    // Find which events already have pending grievances
    const activeGrievances = await db
      .select({ scoreEventId: officerGrievances.scoreEventId })
      .from(officerGrievances)
      .where(
        and(
          eq(officerGrievances.employeeId, employeeId),
          sql`status NOT IN ('resolved_upheld', 'resolved_reversed', 'auto_denied')`
        )
      );

    const pendingGrievances = activeGrievances.map((g) => g.scoreEventId);

    return { score: score ?? null, events, pendingGrievances };
  },

  /**
   * File a complaint against an officer (from client email, DockChat, or portal).
   * Trinity analyzes it, sets under_review, deducts points, notifies managers.
   */
  async fileComplaint(params: {
    workspaceId: string;
    employeeId: string;
    filedByEmail?: string;
    filedByName?: string;
    source: string;
    complaintText: string;
    severity?: string;
  }): Promise<{ complaint: OfficerComplaint; scoreEvent: OfficerScoreEvent | null }> {
    // Use Trinity to analyze the complaint
    let trinitySummary = '';
    let legalFlags: string[] = [];
    let sopViolations: string[] = [];
    let recommendedAction = '';
    let detectedSeverity = params.severity ?? 'medium';

    try {
      const aiPrompt = `You are Trinity, the CoAIleague AI Staffing Coordinator. Analyze this client complaint about a security officer and provide a structured analysis.

COMPLAINT:
${params.complaintText}

Respond in this exact JSON format:
{
  "severity": "low|medium|high|critical",
  "summary": "2-3 sentence factual summary of the complaint",
  "legalExposureFlags": ["list any legal risks, or empty array if none"],
  "sopViolations": ["list any SOP violations identified, or empty array if none"],
  "recommendedAction": "specific recommended action for the case manager",
  "isAutoTermination": false
}

Auto-termination applies ONLY to: arrests, law enforcement reports, confirmed criminal conduct.`;

      const aiResponse = await meteredGemini.generate({
        workspaceId: params.workspaceId,
        feature: 'trinity_staffing',
        prompt: aiPrompt,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        billedTo: 'org',
      });
      const raw = (aiResponse?.text ?? '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        detectedSeverity = parsed.severity ?? detectedSeverity;
        trinitySummary = parsed.summary ?? '';
        legalFlags = parsed.legalExposureFlags ?? [];
        sopViolations = parsed.sopViolations ?? [];
        recommendedAction = parsed.recommendedAction ?? '';
      }
    } catch {
      trinitySummary = 'Client complaint received and logged. Manual review required.';
      recommendedAction = 'Case manager should review this complaint and contact the client.';
    }

    // Determine point deduction by severity
    const severityEventMap: Record<string, string> = {
      low: 'client_complaint_low',
      medium: 'client_complaint_medium',
      high: 'client_complaint_high',
      critical: 'client_complaint_critical',
    };
    const eventType = severityEventMap[detectedSeverity] ?? 'client_complaint_medium';
    const pointsToDeduct = Math.abs(EVENT_DELTAS[eventType] ?? 10);

    // Insert complaint record
    const [complaint] = await db
      .insert(officerComplaints)
      .values({
        workspaceId: params.workspaceId,
        employeeId: params.employeeId,
        filedByEmail: params.filedByEmail,
        filedByName: params.filedByName,
        source: params.source,
        severity: detectedSeverity,
        complaintText: params.complaintText,
        trinitySummary,
        legalExposureFlags: legalFlags,
        sopViolations,
        recommendedAction,
        status: 'open',
        officerUnderReview: true,
        pointsDeducted: pointsToDeduct,
      })
      .returning();

    // Record score event for the deduction
    const scoreResult = await this.recordEvent({
      employeeId: params.employeeId,
      workspaceId: params.workspaceId,
      eventType,
      pointsDelta: -pointsToDeduct,
      reason: `Client complaint (${detectedSeverity} severity): ${trinitySummary || params.complaintText.substring(0, 120)}`,
      referenceType: 'complaint',
      referenceId: complaint.id,
      triggeredBy: 'trinity_ai',
      isDisputable: true,
    });

    // Link score event to complaint
    if (scoreResult) {
      await db
        .update(officerComplaints)
        .set({ scoreEventId: scoreResult.event.id })
        .where(eq(officerComplaints.id, complaint.id));
    }

    // Set officer under_review flag
    await db
      .update(officerReadiness)
      .set({ underReview: true, activeComplaintCount: sql`active_complaint_count + 1` })
      .where(eq(officerReadiness.employeeId, params.employeeId));

    return { complaint, scoreEvent: scoreResult?.event ?? null };
  },

  /**
   * Submit a grievance on behalf of an employee.
   * Validates:
   * - Score event must be disputable
   * - No open grievance already exists for this event
   * - Auto-denies if arrest/law enforcement related
   */
  async submitGrievance(params: {
    employeeId: string;
    workspaceId: string;
    scoreEventId: string;
    submittedReason: string;
    officerEvidence?: { type: string; description: string; url?: string }[];
  }): Promise<{ grievance: OfficerGrievance; autoDenied: boolean; message: string }> {
    // Fetch the score event
    const [event] = await db
      .select()
      .from(officerScoreEvents)
      .where(
        and(
          eq(officerScoreEvents.id, params.scoreEventId),
          eq(officerScoreEvents.employeeId, params.employeeId)
        )
      )
      .limit(1);

    if (!event) {
      throw new Error('Score event not found.');
    }

    // Check if already has a pending grievance
    const [existing] = await db
      .select()
      .from(officerGrievances)
      .where(
        and(
          eq(officerGrievances.scoreEventId, params.scoreEventId),
          sql`status NOT IN ('resolved_upheld', 'resolved_reversed', 'auto_denied')`
        )
      )
      .limit(1);

    if (existing) {
      throw new Error('A grievance is already pending for this event.');
    }

    // Check if not disputable (auto-deny: arrests, law enforcement)
    if (!event.isDisputable) {
      const [grievance] = await db
        .insert(officerGrievances)
        .values({
          workspaceId: params.workspaceId,
          employeeId: params.employeeId,
          scoreEventId: params.scoreEventId,
          status: 'auto_denied',
          submittedReason: params.submittedReason,
          officerEvidence: params.officerEvidence ?? [],
          autoDeniedReason: 'This event is not eligible for grievance review. Events involving law enforcement reports, arrests, or confirmed criminal conduct are not subject to appeal.',
          finalVerdict: 'Auto-denied. No appeal path available.',
          finalVerdictBy: 'system',
        })
        .returning();

      return {
        grievance,
        autoDenied: true,
        message: 'This type of event is not eligible for a grievance. Events involving arrests or law enforcement reports result in automatic termination with no appeal path.',
      };
    }

    // Use Trinity to do an initial analysis
    let trinityAnalysis = '';
    let trinityOpinion = '';
    try {
      const prompt = `You are Trinity, the CoAIleague AI system. An officer has submitted a grievance against a score deduction. Provide a brief initial analysis for the review team.

SCORE EVENT:
Type: ${event.eventType}
Points deducted: ${Math.abs(event.pointsDelta)}
Reason on record: ${event.reason}

OFFICER'S GRIEVANCE:
${params.submittedReason}

Provide a 2-3 sentence impartial analysis of the officer's argument and a tentative opinion (upheld/reversed/needs more info). Be factual and fair.`;

      const aiResponse = await meteredGemini.generate({
        workspaceId: params.workspaceId,
        feature: 'trinity_staffing',
        prompt,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        billedTo: 'org',
      });
      const text = (aiResponse?.text ?? '').trim();
      trinityAnalysis = text.substring(0, 1000);
      trinityOpinion = text.includes('upheld') ? 'Tentatively supports upholding the deduction.' :
                       text.includes('reversed') ? 'Tentatively supports reversing the deduction.' :
                       'Needs more information to form an opinion.';
    } catch {
      trinityAnalysis = 'Trinity analysis pending. Case manager review required.';
      trinityOpinion = 'To be determined.';
    }

    const [grievance] = await db
      .insert(officerGrievances)
      .values({
        workspaceId: params.workspaceId,
        employeeId: params.employeeId,
        scoreEventId: params.scoreEventId,
        status: 'submitted',
        submittedReason: params.submittedReason,
        officerEvidence: params.officerEvidence ?? [],
        trinityAnalysis,
        trinityOpinion,
      })
      .returning();

    return {
      grievance,
      autoDenied: false,
      message: 'Your grievance has been submitted. A case manager and CoAIleague liaison will review your case and Trinity has performed an initial analysis. You will be notified of the outcome.',
    };
  },

  /**
   * Resolve a grievance — called by support agent.
   * If upheld: restore points, clear under_review if no other complaints.
   */
  async resolveGrievance(params: {
    grievanceId: string;
    verdict: 'resolved_upheld' | 'resolved_reversed';
    finalVerdict: string;
    resolvedBy: string;
    pointsRestored?: number;
    complaintDismissed?: boolean;
    liaisonNotes?: string;
  }): Promise<void> {
    const [grievance] = await db
      .select()
      .from(officerGrievances)
      .where(eq(officerGrievances.id, params.grievanceId))
      .limit(1);

    if (!grievance) throw new Error('Grievance not found.');

    await db
      .update(officerGrievances)
      .set({
        status: params.verdict,
        finalVerdict: params.finalVerdict,
        finalVerdictBy: params.resolvedBy,
        pointsRestored: params.pointsRestored ?? 0,
        complaintDismissed: params.complaintDismissed ?? false,
        liaisonNotes: params.liaisonNotes,
        resolvedAt: new Date(),
      })
      .where(eq(officerGrievances.id, params.grievanceId));

    if (params.verdict === 'resolved_upheld') {
      // Restore points
      const pointsToRestore = params.pointsRestored ?? 0;
      if (pointsToRestore > 0) {
        await this.recordEvent({
          employeeId: grievance.employeeId,
          workspaceId: grievance.workspaceId,
          eventType: 'grievance_restored',
          pointsDelta: pointsToRestore,
          reason: `Grievance upheld by CoAIleague liaison. ${pointsToRestore} points restored.`,
          referenceType: 'grievance',
          referenceId: grievance.id,
          triggeredBy: params.resolvedBy,
          isDisputable: false,
        });
      }

      // Mark the original event as overturned
      await db
        .update(officerScoreEvents)
        .set({
          isOverturned: true,
          overturnedBy: params.resolvedBy,
          overturnedAt: new Date(),
        })
        .where(eq(officerScoreEvents.id, grievance.scoreEventId));
    }

    // Check if officer still has active complaints — if not, clear under_review
    const activeComplaints = await db
      .select({ id: officerComplaints.id })
      .from(officerComplaints)
      .where(
        and(
          eq(officerComplaints.employeeId, grievance.employeeId),
          sql`status NOT IN ('resolved', 'dismissed')`
        )
      );

    if (activeComplaints.length === 0) {
      await db
        .update(officerReadiness)
        .set({ underReview: false, activeComplaintCount: 0 })
        .where(eq(officerReadiness.employeeId, grievance.employeeId));
    }
  },

  /**
   * Award a shift completion bonus — called when officer completes a shift
   */
  async awardShiftBonus(employeeId: string, workspaceId: string, shiftId: string): Promise<void> {
    await this.recordEvent({
      employeeId,
      workspaceId,
      eventType: 'shift_completion_bonus',
      reason: 'Shift completed successfully. +1 point.',
      referenceType: 'shift',
      referenceId: shiftId,
      isDisputable: false,
    });
  },

  /**
   * Award support staff rating bonus — called after a support session is rated
   */
  async awardSupportRating(employeeId: string, workspaceId: string, rating: number, sessionId?: string): Promise<void> {
    if (rating < 4) return; // Only award for 4-5 star ratings
    await this.recordEvent({
      employeeId,
      workspaceId,
      eventType: 'support_rating_bonus',
      pointsDelta: rating === 5 ? 5 : 3,
      reason: `Received a ${rating}/5 star support rating. Score increased.`,
      referenceType: 'rating',
      referenceId: sessionId,
      isDisputable: false,
    });
  },

  /**
   * Record a no-show penalty
   */
  async recordNoShow(employeeId: string, workspaceId: string, shiftId: string): Promise<void> {
    await this.recordEvent({
      employeeId,
      workspaceId,
      eventType: 'no_show',
      reason: 'No-call, no-show on scheduled shift. -10 points.',
      referenceType: 'shift',
      referenceId: shiftId,
      isDisputable: true,
    });
  },
};
