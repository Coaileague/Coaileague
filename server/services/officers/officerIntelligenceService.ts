import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { employees, shifts, performanceReviews } from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('OfficerIntelligenceService');

export interface OfficerDashboard {
  officerId: string;
  name: string;
  section: {
    status: 'available' | 'limited' | 'unavailable';
    percentAvailable: number;
    nextAvailableTime?: Date;
  };
  assignment?: any;
  performance: {
    shiftsCompleted: number;
    avgRating: number;
    onTimeRate: number;
    clientSatisfaction: number;
  };
  insights: Array<{
    type: string;
    severity: 'positive' | 'warning' | 'critical';
    message: string;
  }>;
  recommendations: Array<{
    action: 'promote' | 'coach' | 'assign';
    text: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  timestamp: Date;
}

export class OfficerIntelligenceService {
  /**
   * Build dashboard for a single officer
   */
  async buildDashboard(officerId: string, workspaceId: string): Promise<OfficerDashboard> {
    const [officer] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, officerId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!officer) {
      throw new Error(`Officer not found: ${officerId}`);
    }

    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all shifts for this officer in this workspace
    const officerShifts = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.employeeId, officerId), eq(shifts.workspaceId, workspaceId)));

    // Current assignment — a shift actively in progress right now
    const currentAssignment = officerShifts.find(
      s => s.startTime <= now && s.endTime > now && s.status === 'in_progress'
    );

    // Get performance reviews for this officer
    const reviews = await db
      .select()
      .from(performanceReviews)
      .where(and(eq(performanceReviews.employeeId, officerId), eq(performanceReviews.workspaceId, workspaceId)));

    const name = `${officer.firstName} ${officer.lastName}`;
    const availability = this.calculateAvailability(officerShifts, now, sevenDaysLater);
    const performance = this.calculatePerformance(officerShifts, reviews);
    const insights = this.generateInsights(name, availability, performance);
    const recommendations = this.getRecommendations(name, performance);

    return {
      officerId,
      name,
      section: availability,
      assignment: currentAssignment ?? { status: 'unassigned' },
      performance,
      insights,
      recommendations,
      timestamp: now,
    };
  }

  /**
   * Calculate availability over the next 7 days based on scheduled shifts
   */
  private calculateAvailability(
    officerShifts: any[],
    now: Date,
    sevenDaysLater: Date,
  ) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Only count upcoming, non-cancelled shifts within the window
    const upcomingShifts = officerShifts.filter(
      s =>
        s.startTime > now &&
        s.startTime < sevenDaysLater &&
        !['cancelled', 'calloff'].includes(s.status),
    );

    let nextAvailableTime: Date | undefined;
    let percentAvailable = 100;

    if (upcomingShifts.length > 0) {
      const sorted = [...upcomingShifts].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );
      nextAvailableTime = sorted[0].endTime;

      const scheduledMs = upcomingShifts.reduce((sum, s) => {
        const overlapStart = Math.max(s.startTime.getTime(), now.getTime());
        const overlapEnd = Math.min(s.endTime.getTime(), sevenDaysLater.getTime());
        return sum + Math.max(0, overlapEnd - overlapStart);
      }, 0);

      percentAvailable = Math.max(0, 100 - (scheduledMs / sevenDaysMs) * 100);
    }

    const status: 'available' | 'limited' | 'unavailable' =
      percentAvailable > 50 ? 'available' :
      percentAvailable > 20 ? 'limited' : 'unavailable';

    return {
      status,
      percentAvailable: Math.round(percentAvailable),
      nextAvailableTime,
    };
  }

  /**
   * Calculate performance metrics from shifts and performance reviews
   */
  private calculatePerformance(officerShifts: any[], reviews: any[]) {
    const completedShifts = officerShifts.filter(s => s.status === 'completed');
    const noShows = officerShifts.filter(s => s.status === 'no_show').length;
    const totalRelevant = completedShifts.length + noShows;

    // Use clientFeedbackRating when available, fall back to overallRating
    const ratings = reviews
      .map(r => r.clientFeedbackRating ?? r.overallRating)
      .filter((r): r is number => r !== null && r !== undefined);

    const avgRating =
      ratings.length > 0
        ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
        : 0;

    // On-time rate: completed / (completed + no_shows); 100% when no history yet
    const onTimeRate =
      totalRelevant > 0 ? Math.round((completedShifts.length / totalRelevant) * 100) : 100;

    // Client satisfaction: % of ratings ≥ 4
    const clientSatisfaction =
      ratings.length > 0
        ? Math.round((ratings.filter(r => r >= 4).length / ratings.length) * 100)
        : 0;

    return {
      shiftsCompleted: completedShifts.length,
      avgRating,
      onTimeRate,
      clientSatisfaction,
    };
  }

  /**
   * Generate AI-style insights based on availability and performance data
   */
  private generateInsights(
    name: string,
    availability: ReturnType<OfficerIntelligenceService['calculateAvailability']>,
    performance: ReturnType<OfficerIntelligenceService['calculatePerformance']>,
  ): OfficerDashboard['insights'] {
    const insights: OfficerDashboard['insights'] = [];

    if (availability.percentAvailable > 80) {
      insights.push({
        type: 'availability',
        severity: 'positive',
        message: `${name} is highly available for scheduling`,
      });
    }

    if (performance.avgRating > 4.5) {
      insights.push({
        type: 'performance',
        severity: 'positive',
        message: `${name} has excellent client satisfaction (${performance.avgRating}/5)`,
      });
    } else if (performance.avgRating > 0 && performance.avgRating < 3.0) {
      insights.push({
        type: 'performance',
        severity: 'warning',
        message: `${name} may need performance coaching`,
      });
    }

    if (performance.onTimeRate < 80) {
      insights.push({
        type: 'reliability',
        severity: 'warning',
        message: `${name} has been late ${100 - performance.onTimeRate}% of the time`,
      });
    }

    return insights;
  }

  /**
   * Generate actionable recommendations based on performance thresholds
   */
  private getRecommendations(
    name: string,
    performance: ReturnType<OfficerIntelligenceService['calculatePerformance']>,
  ): OfficerDashboard['recommendations'] {
    const recommendations: OfficerDashboard['recommendations'] = [];

    if (performance.shiftsCompleted > 20 && performance.avgRating > 4.3) {
      recommendations.push({
        action: 'promote',
        text: `Consider promoting ${name} to senior officer role`,
        priority: 'high',
      });
    }

    if (performance.avgRating > 0 && performance.avgRating < 3.5) {
      recommendations.push({
        action: 'coach',
        text: `Schedule performance coaching session with ${name}`,
        priority: 'high',
      });
    }

    if (performance.shiftsCompleted > 30) {
      recommendations.push({
        action: 'assign',
        text: `${name} is qualified for more complex assignments`,
        priority: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Get dashboards for all active officers in a workspace
   */
  async getWorkspaceDashboards(workspaceId: string): Promise<OfficerDashboard[]> {
    const officers = await db
      .select()
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

    const dashboards = await Promise.all(
      officers.map(o => this.buildDashboard(o.id, workspaceId)),
    );

    return dashboards;
  }
}

export const officerIntelligenceService = new OfficerIntelligenceService();
