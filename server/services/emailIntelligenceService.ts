/**
 * Email Intelligence Service
 * 
 * Trinity-powered AI analysis for emails:
 * - Thread summarization
 * - Action item extraction
 * - Meeting detection
 * - Sentiment analysis
 * - Priority scoring
 * - Smart reply suggestions
 * 
 * Uses multi-model orchestration:
 * - Gemini: Fast analysis, extraction, categorization
 * - Claude: Complex reasoning, compliance checks
 * - GPT-4: Creative writing, suggestions
 */

import { db } from '../db';
import { meteredGemini } from './billing/meteredGeminiClient';
import { createLogger } from '../lib/logger';
const log = createLogger('emailIntelligenceService');


export interface EmailAnalysis {
  summary: string;
  actionItems: string[];
  meetingSuggestion: {
    detected: boolean;
    date?: string;
    time?: string;
    subject?: string;
    attendees?: string[];
  } | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  priority: number; // 1-10 scale
  category: 'primary' | 'updates' | 'promotions' | 'action_required' | 'scheduled';
  complianceFlags: string[];
  keyEntities: {
    people: string[];
    companies: string[];
    dates: string[];
    amounts: string[];
  };
  suggestedReplies: string[];
  confidence: number;
}

export interface SmartComposeRequest {
  context: string;
  recipientInfo?: string;
  intent: 'reply' | 'followup' | 'introduction' | 'request' | 'proposal' | 'thank_you';
  tone: 'formal' | 'professional' | 'friendly' | 'casual';
  length: 'short' | 'medium' | 'long';
  keyPoints?: string[];
}

export interface SmartComposeResult {
  subject: string;
  body: string;
  alternatives: { subject: string; body: string }[];
  confidence: number;
}

class EmailIntelligenceService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    log.info('[EmailIntelligence] Service initialized');
  }

  /**
   * Analyze an email for insights
   * @param workspaceId - Required: The org to bill for this analysis
   */
  async analyzeEmail(
    subject: string,
    body: string,
    fromAddress: string,
    workspaceId: string,
    threadContext?: string
  ): Promise<EmailAnalysis> {
    const prompt = `You are Trinity, an expert email analyst. Analyze this email and provide structured insights.

EMAIL:
From: ${fromAddress}
Subject: ${subject}
Body: ${body}
${threadContext ? `\nThread Context: ${threadContext}` : ''}

Respond with a JSON object containing:
{
  "summary": "2-3 sentence summary of the email",
  "actionItems": ["list of action items detected"],
  "meetingSuggestion": {
    "detected": true/false,
    "date": "if detected, the date",
    "time": "if detected, the time",
    "subject": "meeting topic",
    "attendees": ["email addresses"]
  },
  "sentiment": "positive|neutral|negative",
  "priority": 1-10 (10 being most urgent),
  "category": "primary|updates|promotions|action_required|scheduled",
  "complianceFlags": ["any compliance concerns"],
  "keyEntities": {
    "people": ["names mentioned"],
    "companies": ["company names"],
    "dates": ["dates mentioned"],
    "amounts": ["monetary amounts"]
  },
  "suggestedReplies": ["3 short reply suggestions"],
  "confidence": 0.0-1.0
}

Only respond with valid JSON.`;

    try {
      const response = await meteredGemini.generate({
        workspaceId, // Billed to the org receiving/sending the email
        featureKey: 'email_intelligence_analysis',
        prompt,
        maxOutputTokens: 2000,
        temperature: 0.3,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as EmailAnalysis;
        return this.normalizeAnalysis(parsed);
      }
    } catch (error) {
      log.error('[EmailIntelligence] Analysis failed:', error);
    }

    return this.getDefaultAnalysis();
  }

  /**
   * Generate smart compose suggestions
   * @param workspaceId - Required: The org to bill for this compose
   */
  async smartCompose(request: SmartComposeRequest, workspaceId: string): Promise<SmartComposeResult> {
    const toneDescriptions = {
      formal: 'Use formal business language with proper salutations',
      professional: 'Use professional but approachable language',
      friendly: 'Use warm and friendly language',
      casual: 'Use casual, conversational language',
    };

    const lengthGuidelines = {
      short: '2-3 sentences',
      medium: '1-2 paragraphs',
      long: '3-4 paragraphs with detail',
    };

    const intentTemplates = {
      reply: 'responding to the previous message',
      followup: 'following up on a previous conversation',
      introduction: 'introducing yourself or your company',
      request: 'requesting something from the recipient',
      proposal: 'proposing an idea or offering services',
      thank_you: 'expressing gratitude',
    };

    const prompt = `You are Trinity, an expert email writer. Compose an email based on these requirements:

CONTEXT: ${request.context}
${request.recipientInfo ? `RECIPIENT: ${request.recipientInfo}` : ''}
INTENT: ${intentTemplates[request.intent]}
TONE: ${toneDescriptions[request.tone]}
LENGTH: ${lengthGuidelines[request.length]}
${request.keyPoints?.length ? `KEY POINTS TO INCLUDE:\n${request.keyPoints.map(p => `- ${p}`).join('\n')}` : ''}

Respond with a JSON object:
{
  "subject": "email subject line",
  "body": "full email body",
  "alternatives": [
    {"subject": "alternative subject", "body": "alternative body"},
    {"subject": "another alternative", "body": "another body"}
  ],
  "confidence": 0.0-1.0
}

Only respond with valid JSON.`;

    try {
      const response = await meteredGemini.generate({
        workspaceId, // Billed to org
        featureKey: 'email_intelligence_compose',
        prompt,
        maxOutputTokens: 2000,
        temperature: 0.7,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as SmartComposeResult;
        return parsed;
      }
    } catch (error) {
      log.error('[EmailIntelligence] Smart compose failed:', error);
    }

    return {
      subject: '',
      body: '',
      alternatives: [],
      confidence: 0,
    };
  }

  /**
   * Summarize an email thread
   * @param workspaceId - Required: The org to bill for this summary
   */
  async summarizeThread(emails: { from: string; subject: string; body: string; date: string }[], workspaceId: string): Promise<{
    summary: string;
    keyPoints: string[];
    pendingActions: string[];
    participants: string[];
    timeline: { date: string; event: string }[];
  }> {
    const threadText = emails
      .map((e, i) => `[${i + 1}] From: ${e.from}\nDate: ${e.date}\nSubject: ${e.subject}\n${e.body}`)
      .join('\n\n---\n\n');

    const prompt = `You are Trinity, an expert at summarizing email threads. Analyze this thread and provide a comprehensive summary.

THREAD:
${threadText}

Respond with a JSON object:
{
  "summary": "comprehensive summary of the entire thread",
  "keyPoints": ["list of key discussion points"],
  "pendingActions": ["any unresolved action items"],
  "participants": ["list of all participants"],
  "timeline": [
    {"date": "date", "event": "what happened"}
  ]
}

Only respond with valid JSON.`;

    try {
      const response = await meteredGemini.generate({
        workspaceId, // Billed to org
        featureKey: 'email_intelligence_summary',
        prompt,
        maxOutputTokens: 3000,
        temperature: 0.3,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.error('[EmailIntelligence] Thread summary failed:', error);
    }

    return {
      summary: 'Unable to summarize thread',
      keyPoints: [],
      pendingActions: [],
      participants: [],
      timeline: [],
    };
  }

  /**
   * Generate reply suggestions
   * @param workspaceId - Required: The org to bill for reply generation
   */
  async generateReplySuggestions(
    originalEmail: { from: string; subject: string; body: string },
    workspaceId: string,
    userContext?: string
  ): Promise<{ quick: string[]; detailed: { subject: string; body: string }[] }> {
    const prompt = `You are Trinity, an expert email assistant. Generate reply suggestions for this email.

ORIGINAL EMAIL:
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Body: ${originalEmail.body}
${userContext ? `\nUSER CONTEXT: ${userContext}` : ''}

Respond with a JSON object:
{
  "quick": ["3 one-line quick replies"],
  "detailed": [
    {"subject": "Re: ${originalEmail.subject}", "body": "full professional reply option 1"},
    {"subject": "Re: ${originalEmail.subject}", "body": "full professional reply option 2"}
  ]
}

Only respond with valid JSON.`;

    try {
      const response = await meteredGemini.generate({
        workspaceId, // Billed to org
        featureKey: 'email_intelligence_reply',
        prompt,
        maxOutputTokens: 2000,
        temperature: 0.7,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.error('[EmailIntelligence] Reply suggestions failed:', error);
    }

    return {
      quick: ['Thanks for your email.', 'I\'ll review and get back to you.', 'Let me look into this.'],
      detailed: [],
    };
  }

  /**
   * Detect compliance issues
   * @param workspaceId - Required: The org to bill for compliance check
   */
  async checkCompliance(
    subject: string,
    body: string,
    workspaceId: string,
    context?: { industry?: string; regulations?: string[] }
  ): Promise<{
    hasIssues: boolean;
    issues: { severity: 'low' | 'medium' | 'high'; description: string; recommendation: string }[];
    overallRisk: 'low' | 'medium' | 'high';
  }> {
    const prompt = `You are Trinity, a compliance expert. Analyze this email for potential compliance issues.

EMAIL:
Subject: ${subject}
Body: ${body}
${context?.industry ? `Industry: ${context.industry}` : ''}
${context?.regulations?.length ? `Regulations to check: ${context.regulations.join(', ')}` : ''}

Look for:
- Personally identifiable information (PII) disclosure
- HIPAA violations (if healthcare)
- Financial disclosure issues
- Confidentiality breaches
- Discriminatory language
- Legal liability concerns

Respond with JSON:
{
  "hasIssues": true/false,
  "issues": [
    {"severity": "low|medium|high", "description": "issue description", "recommendation": "how to fix"}
  ],
  "overallRisk": "low|medium|high"
}

Only respond with valid JSON.`;

    try {
      const response = await meteredGemini.generate({
        workspaceId, // Billed to org
        featureKey: 'email_intelligence_compliance',
        prompt,
        maxOutputTokens: 1500,
        temperature: 0.2,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.error('[EmailIntelligence] Compliance check failed:', error);
    }

    return {
      hasIssues: false,
      issues: [],
      overallRisk: 'low',
    };
  }

  private normalizeAnalysis(raw: Partial<EmailAnalysis>): EmailAnalysis {
    return {
      summary: raw.summary || 'No summary available',
      actionItems: raw.actionItems || [],
      meetingSuggestion: raw.meetingSuggestion || null,
      sentiment: raw.sentiment || 'neutral',
      priority: Math.min(10, Math.max(1, raw.priority || 5)),
      category: raw.category || 'primary',
      complianceFlags: raw.complianceFlags || [],
      keyEntities: {
        people: raw.keyEntities?.people || [],
        companies: raw.keyEntities?.companies || [],
        dates: raw.keyEntities?.dates || [],
        amounts: raw.keyEntities?.amounts || [],
      },
      suggestedReplies: raw.suggestedReplies || [],
      confidence: Math.min(1, Math.max(0, raw.confidence || 0.5)),
    };
  }

  private getDefaultAnalysis(): EmailAnalysis {
    return {
      summary: 'Analysis unavailable',
      actionItems: [],
      meetingSuggestion: null,
      sentiment: 'neutral',
      priority: 5,
      category: 'primary',
      complianceFlags: [],
      keyEntities: { people: [], companies: [], dates: [], amounts: [] },
      suggestedReplies: [],
      confidence: 0,
    };
  }
}

export const emailIntelligenceService = new EmailIntelligenceService();
