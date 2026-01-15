/**
 * Smart Reply Service
 * 
 * AI-powered smart reply generation for chat.
 * Integrates with Trinity AI Brain for contextual suggestions.
 */

import { meteredGemini } from './billing/meteredGeminiClient';
import { db } from '../db';
import { sql } from 'drizzle-orm';

interface SmartReplyContext {
  conversationId?: string;
  lastMessage?: string;
  messageType?: string;
  senderRole?: string;
  topic?: string;
  userId?: string;
  workspaceId?: string;
}

interface SmartReply {
  id: string;
  text: string;
  category: 'quick' | 'contextual' | 'ai_generated' | 'template';
  confidence: number;
  metadata?: Record<string, any>;
}

const CONTEXTUAL_TEMPLATES: Record<string, SmartReply[]> = {
  schedule: [
    { id: 'tpl-sch-1', text: 'Schedule has been updated', category: 'template', confidence: 0.9 },
    { id: 'tpl-sch-2', text: 'Shift swap approved', category: 'template', confidence: 0.85 },
  ],
  payroll: [
    { id: 'tpl-pay-1', text: 'Payroll processed successfully', category: 'template', confidence: 0.9 },
    { id: 'tpl-pay-2', text: 'Payment adjustment noted', category: 'template', confidence: 0.85 },
  ],
  general: [
    { id: 'tpl-gen-1', text: 'Thank you for your message', category: 'template', confidence: 0.8 },
    { id: 'tpl-gen-2', text: 'I\'ll follow up on this', category: 'template', confidence: 0.75 },
  ],
};

class SmartReplyService {
  private static instance: SmartReplyService;

  static getInstance(): SmartReplyService {
    if (!this.instance) {
      this.instance = new SmartReplyService();
    }
    return this.instance;
  }

  async getTemplates(userId: string): Promise<SmartReply[]> {
    const templates: SmartReply[] = [];
    
    for (const category of Object.values(CONTEXTUAL_TEMPLATES)) {
      templates.push(...category);
    }
    
    return templates;
  }

  async generateSuggestions(
    message: string,
    context: SmartReplyContext
  ): Promise<SmartReply[]> {
    const suggestions: SmartReply[] = [];
    
    const topic = this.detectTopic(message);
    
    if (topic && CONTEXTUAL_TEMPLATES[topic]) {
      suggestions.push(...CONTEXTUAL_TEMPLATES[topic]);
    }
    
    suggestions.push(...CONTEXTUAL_TEMPLATES.general);
    
    if (process.env.GEMINI_API_KEY) {
      try {
        const aiSuggestions = await this.generateAISuggestions(message, context);
        suggestions.push(...aiSuggestions);
      } catch (error) {
        console.error('[SmartReply] AI generation failed:', error);
      }
    }
    
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    return suggestions.slice(0, 5);
  }

  async generateSingleReply(message: string, context: SmartReplyContext): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      return 'I\'ll look into this and get back to you.';
    }
    
    try {
      const prompt = `Generate a professional, helpful reply to this message in a workforce management context. Keep it brief (1-2 sentences max):

Message: "${message}"

Reply:`;
      
      const result = await meteredGemini.generate({
        workspaceId: context.workspaceId || 'platform',
        userId: context.userId || 'system',
        featureKey: 'ai_smart_reply',
        prompt,
        model: 'gemini-1.5-flash',
        temperature: 0.7,
        maxOutputTokens: 128
      });
      
      if (result.success && result.text) {
        return result.text.trim() || 'I\'ll follow up on this shortly.';
      }
      
      return 'I\'ll follow up on this shortly.';
    } catch (error) {
      console.error('[SmartReply] Single reply generation failed:', error);
      return 'I\'ll look into this and get back to you.';
    }
  }

  private async generateAISuggestions(
    message: string,
    context: SmartReplyContext
  ): Promise<SmartReply[]> {
    try {
      const prompt = `Generate 3 brief, professional reply suggestions for this message in a workforce management context. Return as JSON array with "text" and "confidence" (0.0-1.0) fields.

Message: "${message}"
Context: ${context.topic || 'general conversation'}

Return only valid JSON array, no markdown:`;
      
      const result = await meteredGemini.generate({
        workspaceId: context.workspaceId || 'platform',
        userId: context.userId || 'system',
        featureKey: 'ai_smart_reply',
        prompt,
        model: 'gemini-1.5-flash',
        temperature: 0.7,
        maxOutputTokens: 256
      });
      
      if (!result.success) {
        return [];
      }
      
      const text = result.text.trim();
      
      try {
        const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
        return parsed.map((s: any, i: number) => ({
          id: `ai-${Date.now()}-${i}`,
          text: s.text,
          category: 'ai_generated' as const,
          confidence: s.confidence || 0.7,
        }));
      } catch {
        return [];
      }
    } catch (error) {
      console.error('[SmartReply] AI suggestions failed:', error);
      return [];
    }
  }

  async recordUsage(
    replyId: string,
    category: string,
    userId: string,
    context?: SmartReplyContext
  ): Promise<void> {
    console.log(`[SmartReply] Usage recorded: ${replyId} by ${userId}`);
  }

  private detectTopic(message: string): string | null {
    const topics: Record<string, string[]> = {
      schedule: ['schedule', 'shift', 'calendar', 'availability'],
      payroll: ['pay', 'payroll', 'salary', 'wage'],
    };

    const lowerMessage = message.toLowerCase();
    
    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return topic;
      }
    }
    
    return null;
  }
}

export const smartReplyService = SmartReplyService.getInstance();
