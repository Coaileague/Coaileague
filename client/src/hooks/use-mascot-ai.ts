/**
 * useMascotAI - React Query hooks for mascot AI integration
 * 
 * Fetches:
 * - AI-powered insights based on workspace context
 * - FAQ data for knowledge base
 * - Holiday status for themed messages
 * - Task suggestions for onboarding
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { useEffect } from 'react';

interface MascotInsight {
  id: string;
  type: 'insight' | 'tip' | 'warning' | 'task';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high';
  actionUrl?: string;
}

interface MascotFAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpfulCount: number;
}

interface MascotTask {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: number;
  completed: boolean;
  actionUrl: string;
}

interface HolidayStatus {
  isHoliday: boolean;
  holiday?: {
    name: string;
    greeting: string;
    thoughts: string[];
    color: string;
    emoji: string;
  };
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { insights: [], faqs: [], tasks: [], isHoliday: false } as T;
    }
    throw new Error(`Failed to fetch: ${res.status}`);
  }
  return res.json();
}

export function useMascotInsights(workspaceId?: string) {
  return useQuery<{ insights: MascotInsight[] }>({
    queryKey: ['/api/mascot/insights', workspaceId],
    queryFn: () => fetchJSON<{ insights: MascotInsight[] }>('/api/mascot/insights'),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });
}

export function useMascotFAQs(category?: string, limit: number = 10) {
  const url = category 
    ? `/api/mascot/faqs?category=${encodeURIComponent(category)}&limit=${limit}`
    : `/api/mascot/faqs?limit=${limit}`;
  return useQuery<{ faqs: MascotFAQ[] }>({
    queryKey: ['/api/mascot/faqs', category, limit],
    queryFn: () => fetchJSON<{ faqs: MascotFAQ[] }>(url),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  });
}

export function useMascotTasks(workspaceId?: string) {
  return useQuery<{ tasks: MascotTask[] }>({
    queryKey: ['/api/mascot/tasks', workspaceId],
    queryFn: () => fetchJSON<{ tasks: MascotTask[] }>('/api/mascot/tasks'),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });
}

export function useHolidayStatus() {
  return useQuery<HolidayStatus>({
    queryKey: ['/api/mascot/holiday'],
    queryFn: () => fetchJSON<HolidayStatus>('/api/mascot/holiday'),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: false,
  });
}

export function useAskMascot() {
  return useMutation({
    mutationFn: async (params: { 
      question: string; 
      workspaceId?: string; 
      businessCategory?: string;
      context?: string;
    }): Promise<{ advice: string; category: string }> => {
      const response = await apiRequest('POST', '/api/mascot/ask', params);
      if (!response.ok) {
        throw new Error('Failed to get advice');
      }
      return response.json();
    },
    onSuccess: (data) => {
      thoughtManager.triggerAIInsight(data.advice, 'high');
    },
  });
}

export function useCompleteMascotTask() {
  return useMutation({
    mutationFn: async (taskId: string): Promise<{ success: boolean; message: string }> => {
      const response = await apiRequest('POST', '/api/mascot/complete-task', { taskId });
      if (!response.ok) {
        throw new Error('Failed to complete task');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mascot/tasks'] });
    },
  });
}

export function useMascotAIIntegration(workspaceId?: string) {
  const { data: insightsData } = useMascotInsights(workspaceId);
  const { data: tasksData } = useMascotTasks(workspaceId);
  const { data: holidayData } = useHolidayStatus();
  
  useEffect(() => {
    if (insightsData?.insights && insightsData.insights.length > 0) {
      const highPriorityInsight = insightsData.insights.find(i => i.priority === 'high');
      if (highPriorityInsight) {
        setTimeout(() => {
          thoughtManager.triggerAIInsight(highPriorityInsight.message, 'high');
        }, 5000);
      }
    }
  }, [insightsData]);
  
  useEffect(() => {
    if (tasksData?.tasks && tasksData.tasks.length > 0) {
      const firstTask = tasksData.tasks[0];
      setTimeout(() => {
        thoughtManager.triggerTaskSuggestion(firstTask.title);
      }, 15000);
    }
  }, [tasksData]);
  
  return {
    insights: insightsData?.insights || [],
    tasks: tasksData?.tasks || [],
    holiday: holidayData,
    hasInsights: (insightsData?.insights?.length || 0) > 0,
    hasTasks: (tasksData?.tasks?.length || 0) > 0,
    isHoliday: holidayData?.isHoliday || false,
  };
}
