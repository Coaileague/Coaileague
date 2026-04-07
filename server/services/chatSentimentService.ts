/**
 * Chat Message Sentiment Analysis Service
 * 
 * Analyzes chat message sentiment using Gemini AI to:
 * - Detect emotional tone (positive, neutral, negative, urgent)
 * - Score sentiment intensity (-100 to +100)
 * - Calculate urgency level (1-5)
 * - Flag for escalation if necessary
 * - Emit alerts for support staff
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { db } from '../db';
import { chatMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ChatSentimentAnalysisResult {
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  sentimentScore: number; // -100 to +100
  confidence: number; // 0-100
  urgencyLevel: number; // 1-5 (1=low, 5=critical)
  shouldEscalate: boolean;
  summary: string; // Brief reason for classification
}

/**
 * Analyze sentiment of a chat message
 * @param message The chat message text
 * @param context Additional context (e.g., conversation history, user type)
 * @param workspaceId Workspace ID for billing attribution
 * @returns Sentiment analysis result
 */
export async function analyzeChatMessageSentiment(
  message: string,
  context?: {
    senderType?: string;
    conversationContext?: string;
    previousMessages?: string[];
  },
  workspaceId?: string
): Promise<ChatSentimentAnalysisResult> {
  try {
    // Build context for analysis
    const contextStr = context?.conversationContext 
      ? `\nContext: ${context.conversationContext}`
      : '';
    const previousStr = context?.previousMessages?.length
      ? `\nPrevious messages in conversation:\n${context.previousMessages.join('\n')}`
      : '';

    const prompt = `Analyze this chat message for sentiment, emotional tone, and urgency level.

Message: "${message}"${contextStr}${previousStr}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "sentiment": "positive|neutral|negative|urgent",
  "sentimentScore": <number from -100 (very negative) to +100 (very positive)>,
  "confidence": <0-100 confidence in this assessment>,
  "urgencyLevel": <1-5, where 1=routine, 2=standard, 3=elevated, 4=high, 5=critical>,
  "shouldEscalate": <boolean true if urgent/critical/negative>,
  "summary": "<brief explanation of sentiment classification>"
}

Classification rules:
- positive: Friendly, satisfied, appreciative tone
- neutral: Informational, factual, emotionally neutral
- negative: Complaint, frustration, dissatisfaction
- urgent: Safety concerns, threats, extreme distress, profanity, demands immediate action
- sentimentScore: Range -100 (hostile, abusive) to +100 (very friendly, satisfied)
- urgencyLevel: Consider message urgency, not just sentiment
- shouldEscalate: true if sentiment is negative or urgency >= 3`;

    const aiResult = await meteredGemini.generate({
      workspaceId: workspaceId || 'platform',
      featureKey: 'ai_chat_sentiment',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.supervisor.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.supervisor.maxTokens,
    });

    if (!aiResult.success) {
      throw new Error(aiResult.error || 'Chat sentiment analysis failed');
    }

    const responseText = aiResult.text || '{}';

    // Extract JSON from response
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }
    }

    const parsed = JSON.parse(jsonText);

    const result: ChatSentimentAnalysisResult = {
      sentiment: parsed.sentiment || 'neutral',
      sentimentScore: Math.max(-100, Math.min(100, parsed.sentimentScore || 0)),
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      urgencyLevel: Math.max(1, Math.min(5, parsed.urgencyLevel || 2)),
      shouldEscalate: parsed.shouldEscalate || false,
      summary: parsed.summary || 'Sentiment analysis complete',
    };

    console.log(`[ChatSentiment] Analyzed message sentiment: ${result.sentiment} (score: ${result.sentimentScore}, urgency: ${result.urgencyLevel})`);
    return result;
  } catch (error) {
    console.error('[ChatSentiment] Error analyzing sentiment:', error);
    // Return neutral sentiment on error to avoid breaking the chat flow
    return {
      sentiment: 'neutral',
      sentimentScore: 0,
      confidence: 0,
      urgencyLevel: 2,
      shouldEscalate: false,
      summary: 'Sentiment analysis unavailable',
    };
  }
}

/**
 * Update message with sentiment analysis results
 * Should be called after message is saved to database
 */
export async function updateMessageSentiment(
  messageId: string,
  analysis: ChatSentimentAnalysisResult
): Promise<void> {
  try {
    await db
      .update(chatMessages)
      .set({
        sentiment: analysis.sentiment,
        sentimentScore: analysis.sentimentScore.toFixed(2),
        sentimentConfidence: analysis.confidence.toFixed(2),
        urgencyLevel: analysis.urgencyLevel,
        shouldEscalate: analysis.shouldEscalate,
        sentimentAnalyzedAt: new Date(),
      })
      .where(eq(chatMessages.id, messageId));

    console.log(`[ChatSentiment] Updated message ${messageId} with sentiment analysis`);
  } catch (error) {
    console.error('[ChatSentiment] Error updating message sentiment:', error);
    // Don't throw - sentiment update failure shouldn't break chat
  }
}

/**
 * Get message sentiment history for monitoring/analytics
 */
export async function getMessageSentimentStats(
  conversationId: string,
  limit: number = 100
): Promise<{
  totalMessages: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  urgentCount: number;
  escalatedCount: number;
  averageSentimentScore: number;
}> {
  try {
    const messages = await db
      .select({
        sentiment: chatMessages.sentiment,
        sentimentScore: chatMessages.sentimentScore,
        shouldEscalate: chatMessages.shouldEscalate,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .limit(limit);

    const stats = {
      totalMessages: messages.length,
      positiveCount: messages.filter(m => m.sentiment === 'positive').length,
      neutralCount: messages.filter(m => m.sentiment === 'neutral').length,
      negativeCount: messages.filter(m => m.sentiment === 'negative').length,
      urgentCount: messages.filter(m => m.sentiment === 'urgent').length,
      escalatedCount: messages.filter(m => m.shouldEscalate).length,
      averageSentimentScore: messages.reduce((sum, m) => {
        const score = m.sentimentScore ? parseFloat(m.sentimentScore.toString()) : 0;
        return sum + score;
      }, 0) / (messages.length || 1),
    };

    return stats;
  } catch (error) {
    console.error('[ChatSentiment] Error getting sentiment stats:', error);
    return {
      totalMessages: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      urgentCount: 0,
      escalatedCount: 0,
      averageSentimentScore: 0,
    };
  }
}

export const chatSentimentService = {
  analyzeChatMessageSentiment,
  updateMessageSentiment,
  getMessageSentimentStats,
};
