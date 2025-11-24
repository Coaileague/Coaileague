/**
 * Employer Ratings Service - Calculates and aggregates employer ratings
 * Provides analytics for management insights and sentiment tracking
 */

import { db } from "../db";
import { employerRatings, employees } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

export interface RatingStats {
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    excellent: number;
    good: number;
    neutral: number;
    poor: number;
    veryPoor: number;
  };
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topIssues: Array<{ issue: string; count: number }>;
  latestRatings: any[];
  recommendationScore: number; // Would recommend (0-100)
}

/**
 * Calculate aggregate employer ratings for a workspace or target (manager/department)
 */
export async function calculateEmployerRatingStats(
  workspaceId: string,
  targetId?: string,
  periodDays: number = 30
): Promise<RatingStats> {
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - periodDays);

  // Build query
  let query = db
    .select()
    .from(employerRatings)
    .where(
      and(
        eq(employerRatings.workspaceId, workspaceId),
        targetId ? eq(employerRatings.targetId, targetId) : undefined,
        gte(employerRatings.submittedAt, cutoffDate)
      )
    )
    .orderBy(desc(employerRatings.submittedAt));

  const ratings = await query;

  if (ratings.length === 0) {
    return {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: { excellent: 0, good: 0, neutral: 0, poor: 0, veryPoor: 0 },
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
      topIssues: [],
      latestRatings: [],
      recommendationScore: 0,
    };
  }

  // Calculate average rating
  const avgRating = ratings.reduce((sum, r) => sum + (parseFloat(r.overallRating?.toString() || '0')), 0) / ratings.length;

  // Calculate rating distribution
  const distribution = {
    excellent: ratings.filter(r => parseFloat(r.overallRating?.toString() || '0') >= 4.5).length,
    good: ratings.filter(r => {
      const rating = parseFloat(r.overallRating?.toString() || '0');
      return rating >= 3.5 && rating < 4.5;
    }).length,
    neutral: ratings.filter(r => {
      const rating = parseFloat(r.overallRating?.toString() || '0');
      return rating >= 2.5 && rating < 3.5;
    }).length,
    poor: ratings.filter(r => {
      const rating = parseFloat(r.overallRating?.toString() || '0');
      return rating >= 1.5 && rating < 2.5;
    }).length,
    veryPoor: ratings.filter(r => parseFloat(r.overallRating?.toString() || '0') < 1.5).length,
  };

  // Calculate sentiment breakdown
  const sentimentBreakdown = {
    positive: ratings.filter(r => r.sentiment === 'positive').length,
    neutral: ratings.filter(r => r.sentiment === 'neutral').length,
    negative: ratings.filter(r => r.sentiment === 'negative').length,
  };

  // Extract top issues from comments
  const allComments = ratings
    .filter(r => r.comment)
    .map(r => r.comment?.toLowerCase() || '');
  
  const issueKeywords = [
    'communication', 'management', 'support', 'feedback', 'growth', 'benefits',
    'salary', 'schedule', 'workload', 'team', 'culture', 'training', 'respect'
  ];

  const issueCounts = issueKeywords.reduce((acc, keyword) => {
    const count = allComments.filter(comment => comment.includes(keyword)).length;
    if (count > 0) {
      acc.push({ issue: keyword, count });
    }
    return acc;
  }, [] as Array<{ issue: string; count: number }>);

  const topIssues = issueCounts.sort((a, b) => b.count - a.count).slice(0, 5);

  // Calculate recommendation score (how many would recommend)
  // Based on overall rating: 4.0+ = would recommend
  const recommendCount = ratings.filter(r => parseFloat(r.overallRating?.toString() || '0') >= 4.0).length;
  const recommendationScore = Math.round((recommendCount / ratings.length) * 100);

  // Get latest 5 ratings with employee info
  const latestRatings = ratings.slice(0, 5).map(r => ({
    ...r,
    ratingDisplay: {
      rating: parseFloat(r.overallRating?.toString() || '0').toFixed(1),
      sentiment: r.sentiment,
      submittedAt: r.submittedAt,
      comment: r.comment,
    }
  }));

  return {
    averageRating: Math.round(avgRating * 10) / 10,
    totalRatings: ratings.length,
    ratingDistribution: distribution,
    sentimentBreakdown,
    topIssues,
    latestRatings,
    recommendationScore,
  };
}

/**
 * Get employer rating trends over time (weekly/monthly)
 */
export async function getRatingTrends(
  workspaceId: string,
  targetId?: string,
  granularity: 'week' | 'month' = 'week'
) {
  let query = db
    .select({
      period: sql`DATE_TRUNC('${sql.raw(granularity)}', ${employerRatings.submittedAt})`,
      avgRating: sql`AVG(CAST(${employerRatings.overallRating} AS FLOAT))`,
      count: sql`COUNT(*)`,
    })
    .from(employerRatings)
    .where(
      and(
        eq(employerRatings.workspaceId, workspaceId),
        targetId ? eq(employerRatings.targetId, targetId) : undefined
      )
    )
    .groupBy(sql`DATE_TRUNC('${sql.raw(granularity)}', ${employerRatings.submittedAt})`)
    .orderBy(sql`DATE_TRUNC('${sql.raw(granularity)}', ${employerRatings.submittedAt}) DESC`);

  return query;
}

/**
 * Compare ratings across multiple targets (managers/departments)
 */
export async function compareTargetRatings(
  workspaceId: string,
  targetIds: string[]
) {
  const comparisons: Record<string, Partial<RatingStats>> = {};

  for (const targetId of targetIds) {
    comparisons[targetId] = await calculateEmployerRatingStats(workspaceId, targetId);
  }

  return comparisons;
}

/**
 * Identify at-risk managers based on rating decline
 */
export async function identifyAtRiskManagers(
  workspaceId: string,
  threshold: number = 3.0
) {
  const managerRatings = await db
    .select({
      managerId: employerRatings.targetId,
      avgRating: sql`AVG(CAST(${employerRatings.overallRating} AS FLOAT))`,
      count: sql`COUNT(*)`,
    })
    .from(employerRatings)
    .where(eq(employerRatings.workspaceId, workspaceId))
    .groupBy(employerRatings.targetId)
    .having(sql`AVG(CAST(${employerRatings.overallRating} AS FLOAT)) < ${threshold}`)
    .orderBy(sql`AVG(CAST(${employerRatings.overallRating} AS FLOAT)) ASC`);

  return managerRatings.map(r => ({
    managerId: r.managerId,
    averageRating: Math.round((parseFloat(r.avgRating?.toString() || '0')) * 10) / 10,
    ratingCount: r.count,
    riskLevel: parseFloat(r.avgRating?.toString() || '0') < 2.0 ? 'critical' : 'warning',
  }));
}

export const employerRatingsService = {
  calculateEmployerRatingStats,
  getRatingTrends,
  compareTargetRatings,
  identifyAtRiskManagers,
};
