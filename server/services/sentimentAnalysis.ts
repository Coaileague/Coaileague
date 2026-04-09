/**
 * AI Sentiment Analysis Service
 * Implements PredictionOS integration for review scoring, dispute flagging, and ticket urgency detection
 * Now with full persistence to sentiment_history table for trend analysis
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { db } from '../db';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { supportTickets, disputes, sentimentHistory } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface SentimentResult {
  score: number; // -1 (negative) to 1 (positive)
  label: 'negative' | 'neutral' | 'positive';
  confidence: number;
  keywords: string[];
  urgency?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Analyze review text sentiment
 * Used for employee performance reviews, customer feedback scoring
 */
export async function analyzeReviewSentiment(
  reviewId: string,
  reviewText: string,
  workspaceId?: string
): Promise<SentimentResult> {
  try {
    const prompt = `Analyze the sentiment of this review text. Respond in JSON format:
{
  "score": <number from -1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "keywords": [<list of key sentiment words>]
}

Review text:
${reviewText}`;

    const result = await meteredGemini.generate({
      workspaceId: workspaceId || 'platform',
      featureKey: 'ai_sentiment_analysis',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.simple.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.simple.maxTokens,
    });

    if (!result.success) {
      throw new Error(result.error || 'Sentiment analysis failed');
    }

    const parsed = JSON.parse(result.text);

    // Persist sentiment to history for trend analysis
    await persistSentimentHistory({
      workspaceId: workspaceId || '',
      sourceType: 'review',
      sourceId: reviewId,
      overallScore: (parsed.score + 1) / 2, // Convert -1..1 to 0..1
      positiveScore: parsed.label === 'positive' ? parsed.confidence : 0,
      negativeScore: parsed.label === 'negative' ? parsed.confidence : 0,
      neutralScore: parsed.label === 'neutral' ? parsed.confidence : 0,
      keyTopics: parsed.keywords,
    });

    return {
      score: parsed.score,
      label: parsed.label,
      confidence: parsed.confidence,
      keywords: parsed.keywords,
    };
  } catch (error) {
    console.error('[SentimentAnalysis] Error analyzing review:', error);
    return {
      score: 0,
      label: 'neutral',
      confidence: 0,
      keywords: [],
    };
  }
}

/**
 * Analyze support ticket sentiment and detect urgency
 * Flags potentially escalated issues for manager review
 */
export async function analyzeSupportTicketSentiment(
  ticketId: string,
  ticketText: string,
  workspaceId?: string
): Promise<SentimentResult & { shouldEscalate: boolean }> {
  try {
    const prompt = `Analyze support ticket sentiment and urgency. Respond in JSON:
{
  "score": <number from -1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "urgency": "low" | "medium" | "high" | "critical",
  "keywords": [<sentiment keywords>]
}

Support Ticket:
${ticketText}`;

    const result = await meteredGemini.generate({
      workspaceId: workspaceId || 'platform',
      featureKey: 'ai_sentiment_analysis',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.simple.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.simple.maxTokens,
    });

    if (!result.success) {
      throw new Error(result.error || 'Sentiment analysis failed');
    }

    const parsed = JSON.parse(result.text);
    const shouldEscalate = parsed.urgency === 'critical' || parsed.score < -0.5;

    // Persist sentiment to history with escalation action insights
    await persistSentimentHistory({
      workspaceId: workspaceId || '',
      sourceType: 'ticket',
      sourceId: ticketId,
      overallScore: (parsed.score + 1) / 2, // Convert -1..1 to 0..1
      positiveScore: parsed.label === 'positive' ? parsed.confidence : 0,
      negativeScore: parsed.label === 'negative' ? parsed.confidence : 0,
      neutralScore: parsed.label === 'neutral' ? parsed.confidence : 0,
      keyTopics: parsed.keywords,
      actionableInsights: shouldEscalate ? ['Escalation recommended', `Urgency: ${parsed.urgency}`] : [],
    });

    return {
      score: parsed.score,
      label: parsed.label,
      confidence: parsed.confidence,
      keywords: parsed.keywords,
      urgency: parsed.urgency,
      shouldEscalate,
    };
  } catch (error) {
    console.error('[SentimentAnalysis] Error analyzing ticket:', error);
    return {
      score: 0,
      label: 'neutral',
      confidence: 0,
      keywords: [],
      shouldEscalate: false,
    };
  }
}

/**
 * Analyze dispute sentiment for resolution recommendations
 */
export async function analyzeDisputeSentiment(
  disputeId: string,
  disputeText: string,
  workspaceId?: string
): Promise<SentimentResult & { resolutionConfidence: number }> {
  try {
    const prompt = `Analyze dispute sentiment and recommend resolution confidence. JSON:
{
  "score": <-1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "keywords": [<key terms>],
  "resolutionConfidence": <0-1, likelihood dispute can be resolved amicably>
}

Dispute Description:
${disputeText}`;

    const result = await meteredGemini.generate({
      workspaceId: workspaceId || 'platform',
      featureKey: 'ai_sentiment_analysis',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.simple.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.simple.maxTokens,
    });

    if (!result.success) {
      throw new Error(result.error || 'Sentiment analysis failed');
    }

    const parsed = JSON.parse(result.text);

    // Persist dispute sentiment with resolution insights
    await persistSentimentHistory({
      workspaceId: workspaceId || '',
      sourceType: 'dispute',
      sourceId: disputeId,
      overallScore: (parsed.score + 1) / 2, // Convert -1..1 to 0..1
      positiveScore: parsed.label === 'positive' ? parsed.confidence : 0,
      negativeScore: parsed.label === 'negative' ? parsed.confidence : 0,
      neutralScore: parsed.label === 'neutral' ? parsed.confidence : 0,
      keyTopics: parsed.keywords,
      actionableInsights: [`Resolution confidence: ${(parsed.resolutionConfidence * 100).toFixed(0)}%`],
    });

    return {
      score: parsed.score,
      label: parsed.label,
      confidence: parsed.confidence,
      keywords: parsed.keywords,
      resolutionConfidence: parsed.resolutionConfidence,
    };
  } catch (error) {
    console.error('[SentimentAnalysis] Error analyzing dispute:', error);
    return {
      score: 0,
      label: 'neutral',
      confidence: 0,
      keywords: [],
      resolutionConfidence: 0,
    };
  }
}

// ============================================================================
// SENTIMENT PERSISTENCE (Gap #2 - Store sentiment for historical analysis)
// ============================================================================

interface SentimentPersistData {
  workspaceId: string;
  employeeId?: string;
  sourceType: string;
  sourceId: string;
  overallScore: number;
  positiveScore?: number;
  negativeScore?: number;
  neutralScore?: number;
  sourceText?: string;
  keyTopics?: string[];
  emotionBreakdown?: Record<string, number>;
  actionableInsights?: string[];
}

/**
 * Persist sentiment analysis result to database for trend tracking
 */
async function persistSentimentHistory(data: SentimentPersistData): Promise<void> {
  try {
    // Get previous score for trend calculation
    const previousEntry = await db
      .select({ overallScore: sentimentHistory.overallScore })
      .from(sentimentHistory)
      .where(
        and(
          eq(sentimentHistory.sourceType, data.sourceType),
          data.employeeId ? eq(sentimentHistory.employeeId, data.employeeId) : undefined
        )
      )
      .orderBy(desc(sentimentHistory.createdAt))
      .limit(1);

    const previousScore = previousEntry[0]?.overallScore 
      ? parseFloat(previousEntry[0].overallScore) 
      : null;

    // Calculate trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (previousScore !== null) {
      const delta = data.overallScore - previousScore;
      if (delta > 0.1) trend = 'improving';
      else if (delta < -0.1) trend = 'declining';
    }

    // Insert to sentiment history
    await db.insert(sentimentHistory).values({
      workspaceId: data.workspaceId || 'default',
      employeeId: data.employeeId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      overallScore: data.overallScore.toFixed(2),
      positiveScore: data.positiveScore?.toFixed(2),
      negativeScore: data.negativeScore?.toFixed(2),
      neutralScore: data.neutralScore?.toFixed(2),
      sourceText: data.sourceText,
      keyTopics: data.keyTopics ? JSON.stringify(data.keyTopics) : null,
      emotionBreakdown: data.emotionBreakdown,
      actionableInsights: data.actionableInsights,
      previousScore: previousScore?.toFixed(2),
      trend,
    });

    console.log(`[SentimentAnalysis] Persisted ${data.sourceType} sentiment: ${data.overallScore.toFixed(2)} (${trend})`);
  } catch (error) {
    console.error('[SentimentAnalysis] Error persisting sentiment:', error);
    // Don't throw - persistence failure shouldn't break analysis
  }
}

/**
 * Get sentiment trend for a specific source type and employee
 */
export async function getSentimentTrend(
  workspaceId: string,
  sourceType?: string,
  employeeId?: string,
  limit: number = 30
): Promise<{ scores: number[]; trend: string; averageScore: number }> {
  try {
    const conditions = [eq(sentimentHistory.workspaceId, workspaceId)];
    if (sourceType) conditions.push(eq(sentimentHistory.sourceType, sourceType));
    if (employeeId) conditions.push(eq(sentimentHistory.employeeId, employeeId));

    const history = await db
      .select({
        overallScore: sentimentHistory.overallScore,
        trend: sentimentHistory.trend,
        createdAt: sentimentHistory.createdAt,
      })
      .from(sentimentHistory)
      .where(and(...conditions))
      .orderBy(desc(sentimentHistory.createdAt))
      .limit(limit);

    const scores = history.map(h => parseFloat(h.overallScore));
    const averageScore = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;

    // Determine overall trend from recent entries
    const recentTrends = history.slice(0, 5).map(h => h.trend);
    const improvingCount = recentTrends.filter(t => t === 'improving').length;
    const decliningCount = recentTrends.filter(t => t === 'declining').length;
    
    let overallTrend = 'stable';
    if (improvingCount > decliningCount + 1) overallTrend = 'improving';
    else if (decliningCount > improvingCount + 1) overallTrend = 'declining';

    return { scores, trend: overallTrend, averageScore };
  } catch (error) {
    console.error('[SentimentAnalysis] Error getting sentiment trend:', error);
    return { scores: [], trend: 'stable', averageScore: 0 };
  }
}
