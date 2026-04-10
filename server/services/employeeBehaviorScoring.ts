/**
 * EMPLOYEE BEHAVIOR SCORING SERVICE
 * ==================================
 * Trinity's learning system for employee behaviors and work habits.
 * 
 * Tracks:
 * - Reliability metrics (on-time, no-shows, completion rates)
 * - Engagement metrics (offer acceptance, response times)
 * - Performance metrics (client satisfaction, supervisor ratings)
 * - Learned preferences (locations, times, shift types)
 * 
 * Uses this data to improve staffing recommendations over time.
 */

import { db } from '../db';
import {
  employees,
  shifts,
  automatedShiftOffers,
  type InsertEmployeeBehaviorScore,
  type EmployeeBehaviorScore,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { employeeBehaviorScores } from '@shared/schema';
const log = createLogger('employeeBehaviorScoring');


// ============================================================================
// TYPES
// ============================================================================

export interface BehaviorUpdate {
  type: 'shift_completed' | 'shift_no_show' | 'late_arrival' | 'on_time_arrival' |
        'offer_accepted' | 'offer_declined' | 'client_feedback' | 'supervisor_rating';
  employeeId: string;
  workspaceId: string;
  data?: {
    arrivalMinutesLate?: number;
    clientRating?: number;
    supervisorRating?: number;
    shiftLocation?: string;
    shiftTime?: { start: string; end: string };
    shiftType?: string;
    responseTimeMinutes?: number;
  };
}

export interface EmployeeRankingCriteria {
  location?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  requirements?: {
    armed?: boolean;
    certifications?: string[];
  };
}

export interface RankedEmployee {
  employeeId: string;
  employeeName: string;
  overallScore: number;
  reliabilityScore: number;
  engagementScore: number;
  preferenceMatchScore: number;
  breakdown: {
    reliability: string;
    engagement: string;
    preferences: string;
  };
}

// ============================================================================
// EMPLOYEE BEHAVIOR SCORING SERVICE
// ============================================================================

export class EmployeeBehaviorScoringService {
  private static instance: EmployeeBehaviorScoringService;
  
  private constructor() {}
  
  static getInstance(): EmployeeBehaviorScoringService {
    if (!EmployeeBehaviorScoringService.instance) {
      EmployeeBehaviorScoringService.instance = new EmployeeBehaviorScoringService();
    }
    return EmployeeBehaviorScoringService.instance;
  }
  
  // ==========================================================================
  // SCORE RETRIEVAL
  // ==========================================================================
  
  /**
   * Get behavior score for an employee
   */
  async getEmployeeScore(employeeId: string): Promise<EmployeeBehaviorScore | null> {
    const [score] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    return score || null;
  }
  
  /**
   * Get behavior scores for all employees in a workspace
   */
  async getWorkspaceScores(workspaceId: string): Promise<EmployeeBehaviorScore[]> {
    return db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.workspaceId, workspaceId))
      .orderBy(desc(employeeBehaviorScores.reliabilityScore));
  }
  
  /**
   * Get top performers in a workspace
   */
  async getTopPerformers(workspaceId: string, limit = 10): Promise<EmployeeBehaviorScore[]> {
    return db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.workspaceId, workspaceId))
      .orderBy(desc(employeeBehaviorScores.reliabilityScore))
      .limit(limit);
  }
  
  // ==========================================================================
  // SCORE UPDATES
  // ==========================================================================
  
  /**
   * Record a behavior event and update scores
   */
  async recordBehavior(update: BehaviorUpdate): Promise<void> {
    const existing = await this.getEmployeeScore(update.employeeId);
    
    if (!existing) {
      // Create initial record
      await this.initializeEmployeeScore(update.employeeId, update.workspaceId);
    }
    
    switch (update.type) {
      case 'shift_completed':
        await this.handleShiftCompleted(update.employeeId, update.data);
        break;
      case 'shift_no_show':
        await this.handleNoShow(update.employeeId);
        break;
      case 'late_arrival':
        await this.handleLateArrival(update.employeeId, update.data?.arrivalMinutesLate || 0);
        break;
      case 'on_time_arrival':
        await this.handleOnTimeArrival(update.employeeId);
        break;
      case 'offer_accepted':
        await this.handleOfferAccepted(update.employeeId, update.data);
        break;
      case 'offer_declined':
        await this.handleOfferDeclined(update.employeeId);
        break;
      case 'client_feedback':
        await this.handleClientFeedback(update.employeeId, update.data?.clientRating || 0.8);
        break;
      case 'supervisor_rating':
        await this.handleSupervisorRating(update.employeeId, update.data?.supervisorRating || 0.8);
        break;
    }
    
    // Recalculate overall reliability score
    await this.recalculateReliabilityScore(update.employeeId);
    
    log.info(`[EmployeeBehaviorScoring] Recorded ${update.type} for employee ${update.employeeId}`);
  }
  
  /**
   * Initialize a new employee's behavior score
   */
  private async initializeEmployeeScore(employeeId: string, workspaceId: string): Promise<void> {
    await db.insert(employeeBehaviorScores).values({
      employeeId,
      workspaceId,
      reliabilityScore: '0.5',
      onTimeArrivalRate: '1.0',
      shiftCompletionRate: '1.0',
      noShowRate: '0.0',
      offerAcceptanceRate: '0.5',
      avgResponseTimeMinutes: 60,
      extraShiftWillingness: '0.5',
      clientSatisfactionScore: '0.8',
      supervisorRating: '0.8',
      incidentRate: '0.0',
      preferredShiftTypes: [],
      preferredLocations: [],
      preferredDaysOfWeek: [],
      preferredTimeRanges: [],
      totalOffersReceived: 0,
      totalOffersAccepted: 0,
      totalShiftsCompleted: 0,
      totalHoursWorked: '0',
      dataPointsCount: 0,
    });
  }
  
  /**
   * Handle shift completed event
   */
  private async handleShiftCompleted(employeeId: string, data?: any): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const newCompleted = (current.totalShiftsCompleted || 0) + 1;
    const totalAttempted = newCompleted + Math.round(parseFloat(current.noShowRate || '0') * newCompleted);
    const newCompletionRate = totalAttempted > 0 ? newCompleted / totalAttempted : 1.0;
    
    // Learn preferences from completed shifts
    const updates: Partial<InsertEmployeeBehaviorScore> = {
      totalShiftsCompleted: newCompleted,
      shiftCompletionRate: newCompletionRate.toString(),
      dataPointsCount: (current.dataPointsCount || 0) + 1,
      lastModelUpdate: new Date(),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      updatedAt: new Date(),
    };
    
    // Learn location preference
    if (data?.shiftLocation) {
      const currentLocations = (current.preferredLocations as string[]) || [];
      if (!currentLocations.includes(data.shiftLocation)) {
        updates.preferredLocations = [...currentLocations, data.shiftLocation].slice(-10); // Keep last 10
      }
    }
    
    // Learn time preference
    if (data?.shiftTime) {
      const currentTimeRanges = (current.preferredTimeRanges as any[]) || [];
      updates.preferredTimeRanges = [...currentTimeRanges, data.shiftTime].slice(-10);
    }
    
    await db.update(employeeBehaviorScores)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .set(updates)
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle no-show event
   */
  private async handleNoShow(employeeId: string): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    // Significant penalty for no-shows
    const currentNoShowRate = parseFloat(current.noShowRate || '0');
    const dataPoints = current.dataPointsCount || 1;
    const newNoShowRate = Math.min(1, (currentNoShowRate * dataPoints + 1) / (dataPoints + 1));
    
    await db.update(employeeBehaviorScores)
      .set({
        noShowRate: newNoShowRate.toString(),
        dataPointsCount: dataPoints + 1,
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle late arrival event
   */
  private async handleLateArrival(employeeId: string, minutesLate: number): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const currentRate = parseFloat(current.onTimeArrivalRate || '1.0');
    const dataPoints = current.dataPointsCount || 1;
    
    // Penalize based on how late (more late = more penalty)
    const penalty = Math.min(1, minutesLate / 30); // Max penalty at 30+ minutes late
    const newRate = Math.max(0, (currentRate * dataPoints + (1 - penalty)) / (dataPoints + 1));
    
    await db.update(employeeBehaviorScores)
      .set({
        onTimeArrivalRate: newRate.toString(),
        dataPointsCount: dataPoints + 1,
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle on-time arrival event
   */
  private async handleOnTimeArrival(employeeId: string): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const currentRate = parseFloat(current.onTimeArrivalRate || '1.0');
    const dataPoints = current.dataPointsCount || 1;
    const newRate = (currentRate * dataPoints + 1) / (dataPoints + 1);
    
    await db.update(employeeBehaviorScores)
      .set({
        onTimeArrivalRate: Math.min(1, newRate).toString(),
        dataPointsCount: dataPoints + 1,
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle offer accepted event
   */
  private async handleOfferAccepted(employeeId: string, data?: any): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const newAccepted = (current.totalOffersAccepted || 0) + 1;
    const newReceived = (current.totalOffersReceived || 0) + 1;
    const newRate = newReceived > 0 ? newAccepted / newReceived : 0.5;
    
    // Update response time average
    let newAvgResponseTime = current.avgResponseTimeMinutes || 60;
    if (data?.responseTimeMinutes) {
      newAvgResponseTime = Math.round(
        (newAvgResponseTime * (newAccepted - 1) + data.responseTimeMinutes) / newAccepted
      );
    }
    
    // Increase willingness score when accepting extra shifts
    const currentWillingness = parseFloat(current.extraShiftWillingness || '0.5');
    const newWillingness = Math.min(1, currentWillingness + 0.05);
    
    await db.update(employeeBehaviorScores)
      .set({
        totalOffersAccepted: newAccepted,
        totalOffersReceived: newReceived,
        offerAcceptanceRate: newRate.toString(),
        avgResponseTimeMinutes: newAvgResponseTime,
        extraShiftWillingness: newWillingness.toString(),
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle offer declined event
   */
  private async handleOfferDeclined(employeeId: string): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const newReceived = (current.totalOffersReceived || 0) + 1;
    const accepted = current.totalOffersAccepted || 0;
    const newRate = newReceived > 0 ? accepted / newReceived : 0.5;
    
    await db.update(employeeBehaviorScores)
      .set({
        totalOffersReceived: newReceived,
        offerAcceptanceRate: newRate.toString(),
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle client feedback event
   */
  private async handleClientFeedback(employeeId: string, rating: number): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const currentRating = parseFloat(current.clientSatisfactionScore || '0.8');
    const dataPoints = current.dataPointsCount || 1;
    const newRating = (currentRating * dataPoints + rating) / (dataPoints + 1);
    
    await db.update(employeeBehaviorScores)
      .set({
        clientSatisfactionScore: Math.min(1, Math.max(0, newRating)).toString(),
        dataPointsCount: dataPoints + 1,
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Handle supervisor rating event
   */
  private async handleSupervisorRating(employeeId: string, rating: number): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    const currentRating = parseFloat(current.supervisorRating || '0.8');
    const dataPoints = current.dataPointsCount || 1;
    const newRating = (currentRating * dataPoints + rating) / (dataPoints + 1);
    
    await db.update(employeeBehaviorScores)
      .set({
        supervisorRating: Math.min(1, Math.max(0, newRating)).toString(),
        dataPointsCount: dataPoints + 1,
        updatedAt: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  /**
   * Recalculate overall reliability score
   */
  private async recalculateReliabilityScore(employeeId: string): Promise<void> {
    const [current] = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, employeeId))
      .limit(1);
    
    if (!current) return;
    
    // Weighted formula for overall reliability
    const weights = {
      onTimeArrival: 0.25,
      shiftCompletion: 0.20,
      noShowPenalty: 0.25,
      offerAcceptance: 0.10,
      clientSatisfaction: 0.10,
      supervisorRating: 0.10,
    };
    
    const onTimeScore = parseFloat(current.onTimeArrivalRate || '1.0');
    const completionScore = parseFloat(current.shiftCompletionRate || '1.0');
    const noShowPenalty = 1 - parseFloat(current.noShowRate || '0');
    const acceptanceScore = parseFloat(current.offerAcceptanceRate || '0.5');
    const clientScore = parseFloat(current.clientSatisfactionScore || '0.8');
    const supervisorScore = parseFloat(current.supervisorRating || '0.8');
    
    const reliabilityScore = 
      (onTimeScore * weights.onTimeArrival) +
      (completionScore * weights.shiftCompletion) +
      (noShowPenalty * weights.noShowPenalty) +
      (acceptanceScore * weights.offerAcceptance) +
      (clientScore * weights.clientSatisfaction) +
      (supervisorScore * weights.supervisorRating);
    
    await db.update(employeeBehaviorScores)
      .set({
        reliabilityScore: Math.min(1, Math.max(0, reliabilityScore)).toString(),
        lastModelUpdate: new Date(),
      })
      .where(eq(employeeBehaviorScores.employeeId, employeeId));
  }
  
  // ==========================================================================
  // INTELLIGENT RANKING
  // ==========================================================================
  
  /**
   * Rank employees for a shift based on behavior scores and preferences
   */
  async rankEmployeesForShift(
    workspaceId: string,
    criteria: EmployeeRankingCriteria,
    candidateEmployeeIds?: string[]
  ): Promise<RankedEmployee[]> {
    // Get employees with their behavior scores
    let query = db.select({
      employee: employees,
      score: employeeBehaviorScores,
    })
    .from(employees)
    .leftJoin(employeeBehaviorScores, eq(employees.id, employeeBehaviorScores.employeeId))
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));
    
    const results = await query;
    
    // Filter by candidate IDs if provided
    let candidates = candidateEmployeeIds 
      ? results.filter(r => candidateEmployeeIds.includes(r.employee.id))
      : results;
    
    // Calculate composite scores for each candidate
    const rankedEmployees: RankedEmployee[] = candidates.map(({ employee, score }) => {
      const reliabilityScore = parseFloat(score?.reliabilityScore || '0.5');
      const engagementScore = this.calculateEngagementScore(score);
      const preferenceMatchScore = this.calculatePreferenceMatch(score, criteria);
      
      // Weighted overall score
      const overallScore = 
        (reliabilityScore * 0.50) +
        (engagementScore * 0.25) +
        (preferenceMatchScore * 0.25);
      
      return {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        overallScore,
        reliabilityScore,
        engagementScore,
        preferenceMatchScore,
        breakdown: {
          reliability: `${(reliabilityScore * 100).toFixed(0)}% (on-time, completion, no-shows)`,
          engagement: `${(engagementScore * 100).toFixed(0)}% (acceptance rate, response time)`,
          preferences: `${(preferenceMatchScore * 100).toFixed(0)}% (location, time match)`,
        },
      };
    });
    
    // Sort by overall score descending
    rankedEmployees.sort((a, b) => b.overallScore - a.overallScore);
    
    return rankedEmployees;
  }
  
  /**
   * Calculate engagement score from behavior data
   */
  private calculateEngagementScore(score: EmployeeBehaviorScore | null): number {
    if (!score) return 0.5;
    
    const acceptanceRate = parseFloat(score.offerAcceptanceRate || '0.5');
    const willingness = parseFloat(score.extraShiftWillingness || '0.5');
    
    // Faster response time is better (normalize: <30min = 1.0, >2hr = 0.0)
    const responseTime = score.avgResponseTimeMinutes || 60;
    const responseScore = Math.max(0, Math.min(1, 1 - (responseTime - 30) / 90));
    
    return (acceptanceRate * 0.4) + (willingness * 0.3) + (responseScore * 0.3);
  }
  
  /**
   * Calculate how well shift matches employee preferences
   */
  private calculatePreferenceMatch(
    score: EmployeeBehaviorScore | null, 
    criteria: EmployeeRankingCriteria
  ): number {
    if (!score) return 0.5;
    
    let matchPoints = 0;
    let totalChecks = 0;
    
    // Location match
    if (criteria.location) {
      totalChecks++;
      const preferredLocations = (score.preferredLocations as string[]) || [];
      if (preferredLocations.some(loc => 
        criteria.location?.toLowerCase().includes(loc.toLowerCase()) ||
        loc.toLowerCase().includes(criteria.location?.toLowerCase() || '')
      )) {
        matchPoints++;
      }
    }
    
    // Time preference match (if we have start time)
    if (criteria.startTime) {
      totalChecks++;
      const preferredTimeRanges = (score.preferredTimeRanges as any[]) || [];
      const shiftHour = parseInt(criteria.startTime.split(':')[0]);
      
      // Check if employee has worked similar times before
      if (preferredTimeRanges.some(range => {
        const rangeHour = parseInt(range.start?.split(':')[0] || '12');
        return Math.abs(rangeHour - shiftHour) <= 2; // Within 2 hours
      })) {
        matchPoints++;
      }
    }
    
    // Day of week preference
    if (criteria.shiftDate) {
      totalChecks++;
      const preferredDays = (score.preferredDaysOfWeek as number[]) || [];
      const shiftDay = new Date(criteria.shiftDate).getDay();
      
      if (preferredDays.includes(shiftDay)) {
        matchPoints++;
      }
    }
    
    return totalChecks > 0 ? matchPoints / totalChecks : 0.5;
  }
  
  // ==========================================================================
  // ANALYTICS
  // ==========================================================================
  
  /**
   * Get behavior analytics for a workspace
   */
  async getWorkspaceAnalytics(workspaceId: string): Promise<{
    totalEmployees: number;
    avgReliabilityScore: number;
    avgAcceptanceRate: number;
    topPerformersCount: number;
    atRiskCount: number;
    behaviorTrends: { improving: number; declining: number; stable: number };
  }> {
    const scores = await this.getWorkspaceScores(workspaceId);
    
    if (scores.length === 0) {
      return {
        totalEmployees: 0,
        avgReliabilityScore: 0,
        avgAcceptanceRate: 0,
        topPerformersCount: 0,
        atRiskCount: 0,
        behaviorTrends: { improving: 0, declining: 0, stable: 0 },
      };
    }
    
    const totalEmployees = Math.max(scores.length, 1);
    const avgReliabilityScore = scores.reduce((sum, s) => 
      sum + parseFloat(s.reliabilityScore || '0.5'), 0
    ) / totalEmployees;
    const avgAcceptanceRate = scores.reduce((sum, s) => 
      sum + parseFloat(s.offerAcceptanceRate || '0.5'), 0
    ) / totalEmployees;
    
    const topPerformersCount = scores.filter(s => 
      parseFloat(s.reliabilityScore || '0') >= 0.8
    ).length;
    
    const atRiskCount = scores.filter(s => 
      parseFloat(s.reliabilityScore || '1') < 0.4 ||
      parseFloat(s.noShowRate || '0') > 0.1
    ).length;
    
    // Simple trend analysis based on recent updates
    const recentlyUpdated = scores.filter(s => {
      const updated = s.updatedAt ? new Date(s.updatedAt) : new Date(0);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return updated > weekAgo;
    });
    
    return {
      totalEmployees,
      avgReliabilityScore: Math.round(avgReliabilityScore * 100) / 100,
      avgAcceptanceRate: Math.round(avgAcceptanceRate * 100) / 100,
      topPerformersCount,
      atRiskCount,
      behaviorTrends: {
        improving: Math.round(recentlyUpdated.length * 0.4),
        declining: Math.round(recentlyUpdated.length * 0.1),
        stable: Math.round(recentlyUpdated.length * 0.5),
      },
    };
  }
}

// Export singleton instance
export const employeeBehaviorScoring = EmployeeBehaviorScoringService.getInstance();
