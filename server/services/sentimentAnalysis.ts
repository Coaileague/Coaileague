/**
 * AI Sentiment Analysis Service
 * Implements PredictionOS integration for review scoring, dispute flagging, and ticket urgency detection
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { supportTickets, disputes } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

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
  reviewText: string
): Promise<SentimentResult> {
  try {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyze the sentiment of this review text. Respond in JSON format:
{
  "score": <number from -1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "keywords": [<list of key sentiment words>]
}

Review text:
${reviewText}`,
            },
          ],
        },
      ],
    });

    const content = response.response.text();
    const parsed = JSON.parse(content);

    // Note: Review sentiment storage would require schema updates to add sentiment fields
    // For now, just return the analysis result without persistence

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
  ticketText: string
): Promise<SentimentResult & { shouldEscalate: boolean }> {
  try {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyze support ticket sentiment and urgency. Respond in JSON:
{
  "score": <number from -1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "urgency": "low" | "medium" | "high" | "critical",
  "keywords": [<sentiment keywords>]
}

Support Ticket:
${ticketText}`,
            },
          ],
        },
      ],
    });

    const content = response.response.text();
    const parsed = JSON.parse(content);
    const shouldEscalate = parsed.urgency === 'critical' || parsed.score < -0.5;

    // Note: Ticket sentiment storage would require schema updates
    // Sentiment analysis returned but not persisted to database yet
    // Admin can use shouldEscalate flag to manually review critical tickets

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
  disputeText: string
): Promise<SentimentResult & { resolutionConfidence: number }> {
  try {
    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyze dispute sentiment and recommend resolution confidence. JSON:
{
  "score": <-1 to 1>,
  "label": "negative" | "neutral" | "positive",
  "confidence": <0-1>,
  "keywords": [<key terms>],
  "resolutionConfidence": <0-1, likelihood dispute can be resolved amicably>
}

Dispute Description:
${disputeText}`,
            },
          ],
        },
      ],
    });

    const content = response.response.text();
    const parsed = JSON.parse(content);

    // Note: Dispute sentiment storage would require schema updates
    // Analysis returned for admin review without persistence

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
