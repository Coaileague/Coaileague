/**
 * useMascotChatObserver - Observes chat messages and provides AI-powered mascot reactions
 * 
 * Features:
 * - Monitors outgoing and incoming chat messages
 * - Triggers mascot thoughts based on message sentiment/content
 * - Provides contextual AI advice for chat interactions
 * - Stores chat interactions in mascot session for analysis
 */

import { useEffect, useCallback, useRef } from 'react';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { apiRequest } from '@/lib/queryClient';

interface ChatMessage {
  id: string;
  message: string;
  senderName: string;
  senderType: string;
  isSystemMessage?: boolean;
  sentiment?: string;
  urgencyLevel?: string;
}

interface ChatObserverConfig {
  sessionId?: string;
  workspaceId?: string;
  userId?: string;
  enabled?: boolean;
}

const CHAT_REACTION_COOLDOWN = 15000;
const AI_ADVICE_COOLDOWN = 60000;

const SENTIMENT_REACTIONS: Record<string, { thought: string; priority: 'low' | 'normal' | 'high' }> = {
  positive: { thought: "That's the spirit!", priority: 'low' },
  negative: { thought: "Let me know if I can help with that...", priority: 'normal' },
  neutral: { thought: "I'm here if you need anything!", priority: 'low' },
  urgent: { thought: "This sounds important - I'm paying attention!", priority: 'high' },
};

const MESSAGE_PATTERN_REACTIONS: Array<{ pattern: RegExp; thought: string; priority: 'low' | 'normal' | 'high' }> = [
  { pattern: /\b(help|assist|support)\b/i, thought: "Need a hand? I can point you to resources!", priority: 'normal' },
  { pattern: /\b(thank|thanks|appreciate)\b/i, thought: "You're welcome! Happy to help!", priority: 'low' },
  { pattern: /\b(error|bug|issue|problem)\b/i, thought: "Hmm, let me think about that...", priority: 'normal' },
  { pattern: /\b(schedule|shift|time)\b/i, thought: "Scheduling tip: Use templates for recurring shifts!", priority: 'low' },
  { pattern: /\b(invoice|payment|billing)\b/i, thought: "Pro tip: Link timesheets to auto-calculate hours!", priority: 'low' },
  { pattern: /\b(employee|team|staff)\b/i, thought: "Team management is key to success!", priority: 'low' },
  { pattern: /\?\s*$/i, thought: "Good question! Let me see if I can help...", priority: 'normal' },
  { pattern: /\b(urgent|asap|immediately)\b/i, thought: "On it! Prioritizing your request!", priority: 'high' },
];

export function useMascotChatObserver(config: ChatObserverConfig = {}) {
  const { sessionId, workspaceId, userId, enabled = true } = config;
  const lastReactionTimeRef = useRef(0);
  const lastAIAdviceTimeRef = useRef(0);
  const observedMessagesRef = useRef<Set<string>>(new Set());

  const logInteraction = useCallback(async (
    actionType: string,
    metadata: Record<string, unknown>
  ) => {
    if (!sessionId || !workspaceId) return;
    
    try {
      await apiRequest('POST', `/api/mascot/sessions/${sessionId}/interactions`, {
        actionType,
        pageContext: window.location.pathname,
        metadata,
      });
    } catch (error) {
      console.debug('Failed to log mascot chat interaction:', error);
    }
  }, [sessionId, workspaceId]);

  const triggerReaction = useCallback((thought: string, priority: 'low' | 'normal' | 'high') => {
    const now = Date.now();
    if (now - lastReactionTimeRef.current < CHAT_REACTION_COOLDOWN) {
      return;
    }
    lastReactionTimeRef.current = now;
    thoughtManager.triggerAIInsight(thought, priority);
  }, []);

  const requestAIAdvice = useCallback(async (context: string) => {
    const now = Date.now();
    if (now - lastAIAdviceTimeRef.current < AI_ADVICE_COOLDOWN) {
      return;
    }
    
    if (!workspaceId) return;
    
    lastAIAdviceTimeRef.current = now;
    
    try {
      const response = await apiRequest('POST', '/api/mascot/ask', {
        question: `Based on this chat context, provide brief helpful advice: ${context}`,
        workspaceId,
        context: 'chat_observation',
      });
      
      const data = await response.json();
      if (data.advice) {
        thoughtManager.triggerAIInsight(data.advice, 'normal');
      }
    } catch (error) {
      console.debug('Failed to get AI advice:', error);
    }
  }, [workspaceId]);

  const observeMessage = useCallback((message: ChatMessage) => {
    if (!enabled) return;
    if (observedMessagesRef.current.has(message.id)) return;
    if (message.isSystemMessage) return;
    
    observedMessagesRef.current.add(message.id);
    
    logInteraction('chat_message_observed', {
      messageId: message.id,
      senderType: message.senderType,
      sentiment: message.sentiment,
      urgencyLevel: message.urgencyLevel,
      messageLength: message.message.length,
    });
    
    if (message.sentiment && SENTIMENT_REACTIONS[message.sentiment]) {
      const reaction = SENTIMENT_REACTIONS[message.sentiment];
      if (Math.random() > 0.7) {
        triggerReaction(reaction.thought, reaction.priority);
        return;
      }
    }
    
    for (const { pattern, thought, priority } of MESSAGE_PATTERN_REACTIONS) {
      if (pattern.test(message.message)) {
        if (Math.random() > 0.6) {
          triggerReaction(thought, priority);
        }
        break;
      }
    }
    
    if (message.urgencyLevel === 'high' || message.urgencyLevel === 'critical') {
      requestAIAdvice(message.message.substring(0, 200));
    }
  }, [enabled, logInteraction, triggerReaction, requestAIAdvice]);

  const observeOutgoingMessage = useCallback((messageText: string) => {
    if (!enabled) return;
    
    logInteraction('chat_message_sent', {
      messageLength: messageText.length,
      hasQuestion: messageText.includes('?'),
    });
    
    if (messageText.includes('?')) {
      if (Math.random() > 0.8) {
        setTimeout(() => {
          triggerReaction("Waiting for their response...", 'low');
        }, 2000);
      }
    }
  }, [enabled, logInteraction, triggerReaction]);

  const observeTypingStart = useCallback(() => {
    if (!enabled) return;
    
    logInteraction('chat_typing_started', {
      timestamp: Date.now(),
    });
  }, [enabled, logInteraction]);

  const observeTypingStop = useCallback((duration: number) => {
    if (!enabled) return;
    
    logInteraction('chat_typing_stopped', {
      duration,
      timestamp: Date.now(),
    });
    
    if (duration > 30000 && Math.random() > 0.8) {
      triggerReaction("Taking your time? Let me know if you need help!", 'low');
    }
  }, [enabled, logInteraction, triggerReaction]);

  useEffect(() => {
    observedMessagesRef.current = new Set();
  }, [config.sessionId]);

  return {
    observeMessage,
    observeOutgoingMessage,
    observeTypingStart,
    observeTypingStop,
  };
}

export default useMascotChatObserver;
