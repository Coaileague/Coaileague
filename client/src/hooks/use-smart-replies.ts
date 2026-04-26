/**
 * AI-Powered Smart Replies Hook
 * 
 * Provides intelligent reply suggestions for common chat queries.
 * Integrates with Trinity AI Brain for contextual suggestions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from './useAuth';

export interface SmartReply {
  id: string;
  text: string;
  category: 'quick' | 'contextual' | 'ai_generated' | 'template';
  confidence: number;
  icon?: string;
  metadata?: Record<string, any>;
}

interface SmartReplyContext {
  conversationId?: string;
  lastMessage?: string;
  messageType?: string;
  senderRole?: string;
  topic?: string;
}

interface UseSmartRepliesOptions {
  context?: SmartReplyContext;
  maxSuggestions?: number;
  includeTemplates?: boolean;
  categoryFilter?: SmartReply['category'][];
}

const QUICK_REPLIES: SmartReply[] = [
  { id: 'qr-1', text: 'Got it, thanks!', category: 'quick', confidence: 1, icon: '👍' },
  { id: 'qr-2', text: 'I\'ll look into this', category: 'quick', confidence: 1, icon: '🔍' },
  { id: 'qr-3', text: 'Can you provide more details?', category: 'quick', confidence: 1, icon: '❓' },
  { id: 'qr-4', text: 'I\'ll get back to you shortly', category: 'quick', confidence: 1, icon: '⏰' },
  { id: 'qr-5', text: 'Yes, that works for me', category: 'quick', confidence: 1, icon: '✅' },
  { id: 'qr-6', text: 'Let me check and confirm', category: 'quick', confidence: 1, icon: '🔄' },
];

const CONTEXTUAL_PATTERNS: Record<string, SmartReply[]> = {
  schedule: [
    { id: 'ctx-sch-1', text: 'I\'ve updated the schedule as requested', category: 'contextual', confidence: 0.9 },
    { id: 'ctx-sch-2', text: 'The shift has been approved', category: 'contextual', confidence: 0.85 },
    { id: 'ctx-sch-3', text: 'Please check the updated schedule in the calendar', category: 'contextual', confidence: 0.8 },
  ],
  payroll: [
    { id: 'ctx-pay-1', text: 'Payroll has been processed successfully', category: 'contextual', confidence: 0.9 },
    { id: 'ctx-pay-2', text: 'I\'ll review the payroll discrepancy', category: 'contextual', confidence: 0.85 },
    { id: 'ctx-pay-3', text: 'Payment will be reflected within 2-3 business days', category: 'contextual', confidence: 0.8 },
  ],
  timeoff: [
    { id: 'ctx-to-1', text: 'Time off request approved', category: 'contextual', confidence: 0.9 },
    { id: 'ctx-to-2', text: 'Your leave balance has been updated', category: 'contextual', confidence: 0.85 },
    { id: 'ctx-to-3', text: 'Please submit through the time-off portal', category: 'contextual', confidence: 0.8 },
  ],
  help: [
    { id: 'ctx-help-1', text: 'I\'d be happy to help with that', category: 'contextual', confidence: 0.9 },
    { id: 'ctx-help-2', text: 'Have you tried the Help Center?', category: 'contextual', confidence: 0.85 },
    { id: 'ctx-help-3', text: 'Let me connect you with the right team', category: 'contextual', confidence: 0.8 },
  ],
  approval: [
    { id: 'ctx-app-1', text: 'Approved!', category: 'contextual', confidence: 0.95 },
    { id: 'ctx-app-2', text: 'I need more information before approving', category: 'contextual', confidence: 0.85 },
    { id: 'ctx-app-3', text: 'Forwarding to the appropriate approver', category: 'contextual', confidence: 0.8 },
  ],
};

function detectTopic(message: string): string | null {
  const topics: Record<string, string[]> = {
    schedule: ['schedule', 'shift', 'calendar', 'availability', 'swap', 'cover'],
    payroll: ['pay', 'payroll', 'salary', 'wage', 'payment', 'direct deposit'],
    timeoff: ['time off', 'vacation', 'leave', 'pto', 'sick', 'absence'],
    help: ['help', 'support', 'question', 'how do i', 'can you', 'issue'],
    approval: ['approve', 'approval', 'pending', 'request', 'authorize'],
  };

  const lowerMessage = message.toLowerCase();
  
  for (const [topic, keywords] of Object.entries(topics)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return topic;
    }
  }
  
  return null;
}

export interface UseSmartRepliesReturn {
  suggestions: SmartReply[];
  isLoading: boolean;
  error: Error | null;
  selectReply: (reply: SmartReply) => void;
  refreshSuggestions: () => void;
  generateAIReply: (prompt: string) => Promise<string>;
  isGenerating: boolean;
  lastSelected: SmartReply | null;
}

export function useSmartReplies(options: UseSmartRepliesOptions = {}): UseSmartRepliesReturn {
  const { 
    context, 
    maxSuggestions = 5, 
    includeTemplates = true,
    categoryFilter 
  } = options;
  
  const { user } = useAuth();
  const [lastSelected, setLastSelected] = useState<SmartReply | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<SmartReply[]>([]);

  const { data: templateData, isLoading: templatesLoading } = useQuery<{ templates: SmartReply[] }>({
    queryKey: ['/api/experience/smart-replies/templates'],
    enabled: includeTemplates && !!user,
    staleTime: 5 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async (params: { message: string; context?: SmartReplyContext }) => {
      const response = await apiRequest('POST', '/api/experience/smart-replies/generate', params);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.suggestions) {
        setAiSuggestions(data.suggestions.map((s: any, i: number) => ({
          id: `ai-${Date.now()}-${i}`,
          text: s.text,
          category: 'ai_generated' as const,
          confidence: s.confidence || 0.7,
          metadata: s.metadata,
        })));
      }
    },
  });

  const suggestions = useMemo(() => {
    let all: SmartReply[] = [];

    if (context?.lastMessage) {
      const topic = detectTopic(context.lastMessage);
      if (topic && CONTEXTUAL_PATTERNS[topic]) {
        all.push(...CONTEXTUAL_PATTERNS[topic]);
      }
    }

    all.push(...QUICK_REPLIES);

    if (aiSuggestions.length > 0) {
      all.push(...aiSuggestions);
    }

    if (templateData?.templates) {
      all.push(...templateData.templates);
    }

    if (categoryFilter && categoryFilter.length > 0) {
      all = all.filter(s => categoryFilter.includes(s.category));
    }

    all.sort((a, b) => b.confidence - a.confidence);

    return all.slice(0, maxSuggestions);
  }, [context, aiSuggestions, templateData, maxSuggestions, categoryFilter]);

  const selectReply = useCallback((reply: SmartReply) => {
    setLastSelected(reply);
    
    apiRequest('POST', '/api/experience/smart-replies/usage', {
      replyId: reply.id,
      category: reply.category,
      context: context,
    }).catch(() => {});
  }, [context]);

  const refreshSuggestions = useCallback(() => {
    if (context?.lastMessage) {
      generateMutation.mutate({ 
        message: context.lastMessage, 
        context 
      });
    }
  }, [context, generateMutation]);

  const generateAIReply = useCallback(async (prompt: string): Promise<string> => {
    const response = await apiRequest('POST', '/api/experience/smart-replies/generate', {
      message: prompt,
      context,
      mode: 'single',
    });
    const data = await response.json();
    return data.reply || '';
  }, [context]);

  useEffect(() => {
    if (context?.lastMessage && context.lastMessage.length > 10) {
      const debounce = setTimeout(() => {
        refreshSuggestions();
      }, 500);
      return () => clearTimeout(debounce);
    }
  }, [context?.lastMessage]);

  return {
    suggestions,
    isLoading: templatesLoading,
    error: generateMutation.error as Error | null,
    selectReply,
    refreshSuggestions,
    generateAIReply,
    isGenerating: generateMutation.isPending,
    lastSelected,
  };
}

export default useSmartReplies;
