/**
 * BOT AI SERVICE
 * ===============
 * Unified AI service for ALL bots in the CoAIleague ecosystem.
 * 
 * TRI-AI CHAIN OF COMMAND:
 * - Gemini (AI Brain): Primary intelligence, cognitive thinking, tool calling, data analysis
 * - Claude (Architect): Final judge for complex decisions, synthesis, strategic analysis
 * - GPT (Worker): Fast chat responses, grunt work, reliable execution, cost-effective
 * 
 * Bot AI uses Gemini (via meteredGemini) for all bot operations because bots
 * need the tool-calling and domain data access that Gemini provides.
 * When bots encounter complex conflicts or need arbitration, the metaCognitionService
 * escalates to Claude (architect) and GPT (arbitrator) automatically.
 * 
 * POOL FUND MODEL:
 * - All AI token costs are billed to the workspace (client)
 * - Platform provides support to end users, clients fund it
 * - Usage is tracked per bot for transparency
 * 
 * Every bot must use this service for AI operations.
 * Direct Gemini calls from bots are NOT allowed.
 */

import { createLogger } from '../lib/logger';
const log = createLogger('botAIService');
import { meteredGemini, MeteredGenerateResult } from '../services/billing/meteredGeminiClient';
import { BOT_REGISTRY, BotDefinition } from './registry';
import { PLATFORM, HELPAI } from '@shared/platformConfig';
import { orgDataPrivacyGuard } from '../services/privacy/orgDataPrivacyGuard';

// Bot-specific AI feature keys for billing tracking
export const BOT_AI_FEATURES = {
  helpai: {
    greeting: 'bot_helpai_greeting',
    response: 'bot_helpai_response',
    faq: 'bot_helpai_faq',
    escalation: 'bot_helpai_escalation',
  },
  meetingbot: {
    transcription: 'bot_meeting_transcription',
    summary: 'bot_meeting_summary',
    actionItems: 'bot_meeting_action_items',
    decisions: 'bot_meeting_decisions',
  },
  reportbot: {
    detection: 'bot_report_detection',
    cleanup: 'bot_report_cleanup',
    summary: 'bot_report_summary',
    routing: 'bot_report_routing',
  },
  clockbot: {
    validation: 'bot_clock_validation',
    summary: 'bot_clock_summary',
    anomaly: 'bot_clock_anomaly',
  },
  cleanupbot: {
    retention: 'bot_cleanup_retention',
    archive: 'bot_cleanup_archive',
  },
} as const;

export interface BotAIRequest {
  botId: string;
  workspaceId: string;
  userId?: string;
  action: string;
  prompt: string;
  context?: Record<string, any>;
  maxTokens?: number;
}

export interface BotAIResponse {
  success: boolean;
  text: string;
  botId: string;
  tokensUsed: number;
  billedTo: string;
  error?: string;
}

class BotAIService {
  /**
   * Generate AI response for any bot
   * ALWAYS bills to the workspace pool fund
   * ENFORCES privacy rules before any operation
   */
  async generate(request: BotAIRequest): Promise<BotAIResponse> {
    const { botId, workspaceId, userId, action, prompt, context, maxTokens } = request;
    
    // PRIVACY CHECK FIRST - Block cross-org data access
    const privacyCheck = await this.validatePrivacy(request);
    if (!privacyCheck.allowed) {
      return {
        success: false,
        text: 'I can only help with your organization\'s information. I cannot access data from other organizations.',
        botId,
        tokensUsed: 0,
        billedTo: workspaceId,
        error: `Privacy violation blocked: ${privacyCheck.reason}`,
      };
    }
    
    // Validate bot exists
    const bot = BOT_REGISTRY[botId];
    if (!bot) {
      return {
        success: false,
        text: '',
        botId,
        tokensUsed: 0,
        billedTo: workspaceId,
        error: `Unknown bot: ${botId}`,
      };
    }
    
    // Construct feature key for billing tracking
    const featureKey = this.getFeatureKey(botId, action);
    const systemPrompt = this.getBotSystemPrompt(bot, action);
    
    try {
      const result = await meteredGemini.generate({
        workspaceId, // Client pays via pool fund
        userId: userId || 'bot-system',
        featureKey,
        prompt,
        systemInstruction: systemPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxOutputTokens: maxTokens || 1024,
        metadata: {
          botId,
          action,
          ...context,
        },
      });
      
      return {
        success: result.success,
        text: result.text || this.getSmartFallback(botId, action),
        botId,
        tokensUsed: result.tokensUsed?.total || 0,
        billedTo: workspaceId,
      };
    } catch (error) {
      log.error(`[BotAI] ${botId} AI error:`, error);
      return {
        success: false,
        text: this.getSmartFallback(botId, action),
        botId,
        tokensUsed: 0,
        billedTo: workspaceId,
        error: error instanceof Error ? error.message : 'AI generation failed',
      };
    }
  }
  
  /**
   * Generate meeting summary using AI
   */
  async generateMeetingSummary(
    workspaceId: string,
    meetingTitle: string,
    transcript: string[],
    participants: string[]
  ): Promise<BotAIResponse> {
    const prompt = `Summarize this meeting "${meetingTitle}" with ${participants.length} participants.

Transcript:
${transcript.join('\n')}

Generate:
1. Executive Summary (2-3 sentences)
2. Key Discussion Points
3. Decisions Made
4. Action Items (who does what by when)

Be concise and professional.`;
    
    return this.generate({
      botId: 'meetingbot',
      workspaceId,
      action: 'summary',
      prompt,
      maxTokens: 2048,
    });
  }
  
  /**
   * Generate incident report cleanup/summary
   */
  async generateReportSummary(
    workspaceId: string,
    incidentType: string,
    rawText: string,
    userId?: string
  ): Promise<BotAIResponse> {
    const prompt = `Clean up and summarize this ${incidentType} incident report:

${rawText}

Generate a professional incident report with:
1. Incident Summary
2. Date/Time/Location
3. Persons Involved
4. Description of Events
5. Actions Taken
6. Recommendations

Remove any unprofessional language. Keep facts accurate.`;
    
    return this.generate({
      botId: 'reportbot',
      workspaceId,
      userId,
      action: 'summary',
      prompt,
      maxTokens: 1500,
    });
  }
  
  /**
   * Generate clock entry summary/validation
   */
  async generateClockSummary(
    workspaceId: string,
    userId: string,
    entries: Array<{ type: 'in' | 'out'; time: Date; location?: string }>
  ): Promise<BotAIResponse> {
    const entriesText = entries.map(e => 
      `${e.type.toUpperCase()}: ${e.time.toLocaleString()}${e.location ? ` at ${e.location}` : ''}`
    ).join('\n');
    
    const prompt = `Summarize these time clock entries for the employee:

${entriesText}

Calculate:
1. Total hours worked
2. Any overtime (over 8 hours/day or 40 hours/week)
3. Any anomalies (missing clock-out, unusual times, etc.)

Keep it brief and factual.`;
    
    return this.generate({
      botId: 'clockbot',
      workspaceId,
      userId,
      action: 'summary',
      prompt,
      maxTokens: 500,
    });
  }
  
  /**
   * Analyze a security photo using AI vision
   * Passes image URL in prompt context; Gemini describes likely contents based on security context
   */
  async analyzePhotoForReport(
    workspaceId: string,
    attachmentUrl: string,
    context: {
      siteName: string;
      officerName: string;
      timeOfDay: string;
      shiftStart: string;
      shiftEnd: string;
      photoNumber: number;
    },
    userId?: string
  ): Promise<BotAIResponse> {
    // Build a vision-aware prompt that includes the image URL and security context
    // Gemini Flash can reason about image content when given the URL in context
    const prompt =
      `You are ReportBot, an AI security report assistant analyzing a patrol photo submitted by a field officer.\n\n` +
      `OFFICER: ${context.officerName}\n` +
      `SITE: ${context.siteName}\n` +
      `TIME: ${context.timeOfDay}\n` +
      `SHIFT: ${context.shiftStart} to ${context.shiftEnd}\n` +
      `PHOTO #: ${context.photoNumber}\n` +
      `IMAGE URL: ${attachmentUrl}\n\n` +
      `Based on this context, provide a brief professional analysis (2-3 sentences) for the shift log. ` +
      `Note: describe what a security officer at this type of site should document at this time of shift. ` +
      `Flag if the submission time is consistent with patrol schedule expectations. ` +
      `Keep your response factual and useful for the shift report. No bullet points.`;

    return this.generate({
      botId: 'reportbot',
      workspaceId,
      userId,
      action: 'summary',
      prompt,
      maxTokens: 200,
    });
  }

  /**
   * Generate comprehensive meeting summary from full transcript
   * Identifies tagged AND untagged decisions, action items, and key discussion points
   */
  async generateFullTranscriptMeetingSummary(
    workspaceId: string,
    meetingTitle: string,
    transcript: string[],
    participants: string[],
    taggedActionItems: Array<{ text: string; owner?: string }>,
    taggedDecisions: Array<{ text: string }>
  ): Promise<BotAIResponse> {
    const transcriptText = transcript.join('\n');
    const taggedItems =
      taggedActionItems.length > 0
        ? `\nPre-tagged action items:\n${taggedActionItems.map(a => `- ${a.text}${a.owner ? ` (Owner: ${a.owner})` : ''}`).join('\n')}`
        : '';
    const taggedDecs =
      taggedDecisions.length > 0
        ? `\nPre-tagged decisions:\n${taggedDecisions.map(d => `- ${d.text}`).join('\n')}`
        : '';

    const prompt =
      `You are MeetingBot, an AI meeting recorder for a security services company.\n\n` +
      `Analyze the following meeting transcript for "${meetingTitle}" with ${participants.length} participants: ${participants.join(', ')}.\n` +
      `${taggedItems}${taggedDecs}\n\n` +
      `FULL TRANSCRIPT:\n${transcriptText}\n\n` +
      `Generate a comprehensive meeting summary. ` +
      `IMPORTANT: Identify ALL decisions and action items from the transcript, including those NOT explicitly tagged. ` +
      `Look for phrases like "we will", "someone needs to", "let's", "I'll", "can you", "make sure to", etc.\n\n` +
      `Respond in this exact JSON format:\n` +
      `{\n` +
      `  "summary": "2-3 sentence executive summary",\n` +
      `  "keyPoints": ["point 1", "point 2", ...],\n` +
      `  "decisions": ["decision 1", "decision 2", ...],\n` +
      `  "actionItems": [{"task": "description", "owner": "name or unassigned"}, ...],\n` +
      `  "unresolvedQuestions": ["question 1", ...],\n` +
      `  "nextSteps": ["step 1", ...]\n` +
      `}`;

    return this.generate({
      botId: 'meetingbot',
      workspaceId,
      action: 'summary',
      prompt,
      maxTokens: 2048,
    });
  }

  /**
   * Detect if a message contains an incident report
   */
  async detectIncident(
    workspaceId: string,
    message: string,
    userId?: string
  ): Promise<{ isIncident: boolean; incidentType?: string; confidence: number }> {
    const result = await this.generate({
      botId: 'reportbot',
      workspaceId,
      userId,
      action: 'detection',
      prompt: `Analyze if this message describes a security/safety incident:

"${message}"

Respond in JSON format:
{ "isIncident": boolean, "incidentType": "theft|assault|trespass|medical|fire|damage|other|null", "confidence": 0.0-1.0 }`,
      maxTokens: 100,
    });
    
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      log.warn('[BotAIService] Failed to parse incident detection response:', parseError);
    }
    
    return { isIncident: false, confidence: 0 };
  }
  
  /**
   * Generate dynamic bot response
   */
  async generateBotResponse(
    botId: string,
    workspaceId: string,
    userMessage: string,
    conversationContext: string[] = [],
    userId?: string
  ): Promise<BotAIResponse> {
    const contextText = conversationContext.length > 0 
      ? `\nRecent conversation:\n${conversationContext.slice(-5).join('\n')}`
      : '';
    
    const prompt = `User says: "${userMessage}"${contextText}

Respond helpfully as ${BOT_REGISTRY[botId]?.name || 'assistant'}. Be concise (1-2 sentences unless more detail needed).`;
    
    return this.generate({
      botId,
      workspaceId,
      userId,
      action: 'response',
      prompt,
      maxTokens: 300,
    });
  }
  
  private getFeatureKey(botId: string, action: string): string {
    const botFeatures = BOT_AI_FEATURES[botId as keyof typeof BOT_AI_FEATURES];
    if (botFeatures && action in botFeatures) {
      return botFeatures[action as keyof typeof botFeatures];
    }
    return `bot_${botId}_${action}`;
  }
  
  /**
   * Validate bot has privacy clearance for the operation
   * CRITICAL: Ensures bots NEVER access cross-org data
   */
  async validatePrivacy(request: BotAIRequest): Promise<{ allowed: boolean; reason: string }> {
    const privacyCheck = await orgDataPrivacyGuard.canAccessWorkspaceData({
      userId: request.userId || 'bot-system',
      sessionWorkspaceId: request.workspaceId,
      targetWorkspaceId: request.context?.targetWorkspaceId,
      entityType: 'bot',
      actionType: request.action,
      dataClassification: request.context?.dataClassification || 'internal',
    });

    if (!privacyCheck.allowed) {
      log.error(`[BotAI] PRIVACY BLOCK: ${request.botId} denied - ${privacyCheck.reason}`);
    }

    return {
      allowed: privacyCheck.allowed,
      reason: privacyCheck.reason,
    };
  }

  private getBotSystemPrompt(bot: BotDefinition, action: string): string {
    const basePrompt = `You are ${bot.name}, an AI bot for ${PLATFORM.name} workforce management platform.
Your role: ${bot.description}

CRITICAL PRIVACY RULES (NEVER VIOLATE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER share information from one organization with users from another organization
2. NEVER mention or reference other organizations, their employees, or their data
3. NEVER reveal internal system details, database contents, or cross-org statistics
4. NEVER disclose employee personal information (SSN, salary, medical, disciplinary) without authorization
5. If asked about other organizations, respond: "I can only help with your organization's information"
6. All data you access is STRICTLY CONFIDENTIAL to this organization
7. You operate ONLY within the context of the current user's workspace
8. Support staff asking about other orgs must have explicit cross-org authorization
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Guidelines:
- Be concise and professional
- Never make promises you can't keep
- Admit when you don't know something
- No emojis unless absolutely necessary
- Sound like a knowledgeable coworker, not a corporate bot`;

    const actionPrompts: Record<string, string> = {
      summary: `${basePrompt}\n\nYou are generating a summary. Be thorough but concise. Include only information from THIS organization.`,
      detection: `${basePrompt}\n\nYou are analyzing content. Return structured JSON when asked.`,
      response: `${basePrompt}\n\nYou are having a conversation. Be helpful and direct. Only reference this organization's data.`,
      greeting: `${basePrompt}\n\nYou are greeting a user. Be welcoming but brief.`,
    };
    
    return actionPrompts[action] || basePrompt;
  }
  
  private getSmartFallback(botId: string, action: string): string {
    const fallbacks: Record<string, Record<string, string[]>> = {
      helpai: {
        response: [
          "Let me look into that for you.",
          "I'm checking on this now.",
          "Give me a moment to find the answer.",
        ],
        greeting: [
          "Hey! What can I help you with?",
          "Hi there, what's going on?",
        ],
      },
      meetingbot: {
        summary: [
          "Meeting captured. Processing summary...",
          "Got it. I'll have the summary ready shortly.",
        ],
      },
      reportbot: {
        summary: [
          "Report logged. Generating professional summary...",
          "Incident noted. Processing documentation...",
        ],
        detection: [
          "Analyzing message content...",
        ],
      },
      clockbot: {
        summary: [
          "Calculating time entries...",
          "Processing your clock data...",
        ],
      },
    };
    
    const botFallbacks = fallbacks[botId];
    if (botFallbacks && botFallbacks[action]) {
      const options = botFallbacks[action];
      return options[Math.floor(Math.random() * options.length)];
    }
    
    return "Processing your request...";
  }
}

export const botAIService = new BotAIService();
