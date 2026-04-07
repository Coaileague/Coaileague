/**
 * Sentiment Analysis Service
 * Uses Gemini AI to analyze message tone for dispute escalation
 * With AI Guard Rails: Input validation, rate limiting, audit logging
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { aiGuardRails, type AIRequestContext } from "./aiGuardRails";
import { createLogger } from '../lib/logger';
const log = createLogger('sentimentAnalyzer');


export interface SentimentAnalysisResult {
  sentiment: "positive" | "neutral" | "negative" | "hostile";
  confidence: number; // 0-100
  urgencyLevel: 1 | 2 | 3 | 4 | 5; // 1=low, 5=critical
  reasoning: string;
  shouldEscalate: boolean;
  suggestedAction: string;
}

export async function analyzeSentiment(
  message: string,
  context?: string,
  workspaceId?: string,
  userId?: string
): Promise<SentimentAnalysisResult> {
  // Guard Rails: Validate request
  const requestContext: AIRequestContext = {
    workspaceId: workspaceId || 'unknown',
    userId: userId || 'unknown',
    organizationId: 'platform',
    requestId: crypto.randomUUID().slice(0, 8),
    timestamp: new Date(),
    operation: 'sentiment_analysis'
  };

  const validation = aiGuardRails.validateRequest(message, requestContext, 'sentiment_analysis');
  if (!validation.isValid) {
    log.warn('Sentiment analysis validation failed:', validation.errors);
    return {
      sentiment: 'neutral',
      confidence: 0,
      urgencyLevel: 2,
      reasoning: 'Input validation failed',
      shouldEscalate: false,
      suggestedAction: 'Manual review recommended'
    };
  }

  try {
    const prompt = `Analyze the sentiment and urgency of this dispute/complaint message. 
    
Message: "${message}"
${context ? `Context: ${context}` : ""}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "sentiment": "positive|neutral|negative|hostile",
  "confidence": 0-100,
  "urgencyLevel": 1-5,
  "reasoning": "brief explanation",
  "shouldEscalate": true|false,
  "suggestedAction": "recommended action"
}

Rules:
- Sentiment: positive (friendly/satisfied), neutral (informational), negative (complaint), hostile (abusive/threatening)
- Confidence: How certain you are (0-100)
- Urgency: 1=routine, 2=standard, 3=elevated, 4=high, 5=critical/safety
- Escalate: true if urgency >= 3 or sentiment is hostile
- Action: Specific next step (e.g., "Route to manager", "Create urgent ticket", "Immediate callback required")`;

    const aiResult = await meteredGemini.generate({
      workspaceId: workspaceId,
      userId: userId || 'system',
      featureKey: 'ai_sentiment_analysis',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 256
    });

    if (!aiResult.success) {
      log.warn('Sentiment analysis AI call failed:', aiResult.error);
      return {
        sentiment: 'neutral',
        confidence: 0,
        urgencyLevel: 2,
        reasoning: 'AI analysis unavailable',
        shouldEscalate: false,
        suggestedAction: 'Manual review recommended'
      };
    }

    const responseText = aiResult.text;

    // Extract JSON from response (handle markdown code blocks if present)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try to find JSON object directly
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { sentiment: 'neutral', confidence: 50, urgencyLevel: 2, reasoning: 'Parse error — defaulting to neutral' };
    }

    const result: SentimentAnalysisResult = {
      sentiment: parsed.sentiment || "neutral",
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      urgencyLevel: Math.max(
        1,
        Math.min(5, parsed.urgencyLevel || 2)
      ) as 1 | 2 | 3 | 4 | 5,
      reasoning: parsed.reasoning || "Analysis complete",
      shouldEscalate: parsed.shouldEscalate || false,
      suggestedAction: parsed.suggestedAction || "Review and respond",
    };

    // Guard Rails: Validate response and log operation
    const responseValidation = aiGuardRails.validateResponse(result, 256, 'sentiment_analysis');
    if (responseValidation.isValid) {
      aiGuardRails.logAIOperation(requestContext, message, JSON.stringify(result), {
        success: true,
        creditsUsed: responseValidation.costInCredits,
        tokensUsed: responseValidation.tokensUsed,
        duration: Date.now() - requestContext.timestamp.getTime()
      });
    }

    return result;
  } catch (error) {
    log.error("Sentiment analysis error:", error);
    
    // Guard Rails: Use fallback response
    const fallback = aiGuardRails.createFallbackResponse(
      'sentiment_analysis',
      requestContext,
      error as Error
    );

    aiGuardRails.logAIOperation(requestContext, message, 'FALLBACK', {
      success: false,
      creditsUsed: 0,
      tokensUsed: 0,
      duration: Date.now() - requestContext.timestamp.getTime(),
      errorMessage: (error as Error).message
    });

    return fallback.fallbackData as SentimentAnalysisResult;
  }
}

export const sentimentAnalyzer = {
  analyzeSentiment,
};
