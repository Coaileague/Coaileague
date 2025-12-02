/**
 * useMascotTaskGeneration - Hook for generating AI-powered task lists
 * 
 * Features:
 * - Generates personalized task lists based on user context
 * - Tracks task completion and dismissal
 * - Syncs with backend mascot sessions
 */

import { useCallback, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface GeneratedTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  actionUrl: string | null;
  aiReasoning: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TaskGenerationResult {
  success: boolean;
  tasks: GeneratedTask[];
}

interface UseTaskGenerationOptions {
  sessionId?: string;
  workspaceId?: string;
  autoFetch?: boolean;
}

export function useMascotTaskGeneration(options: UseTaskGenerationOptions = {}) {
  const { sessionId, workspaceId, autoFetch = true } = options;
  const { toast } = useToast();
  const [location] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);

  const tasksQuery = useQuery<{ tasks: GeneratedTask[] }>({
    queryKey: ['/api/mascot/generated-tasks', workspaceId],
    enabled: autoFetch && !!workspaceId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const generateMutation = useMutation({
    mutationFn: async (context?: string) => {
      const response = await apiRequest('POST', '/api/mascot/generate-tasks', {
        sessionId,
        context,
        currentPage: location,
      });
      return response.json() as Promise<TaskGenerationResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/mascot/generated-tasks'] });
      if (data.tasks?.length > 0) {
        toast({
          title: 'Tasks Generated',
          description: `Created ${data.tasks.length} personalized tasks for you!`,
        });
      }
    },
    onError: () => {
      toast({
        title: 'Generation Failed',
        description: 'Could not generate tasks. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/mascot/tasks/${taskId}/status`, {
        status,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mascot/generated-tasks'] });
    },
  });

  const generateTasks = useCallback(async (context?: string) => {
    if (!sessionId) {
      console.warn('[TaskGeneration] No session ID available');
      return;
    }
    
    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync(context);
    } finally {
      setIsGenerating(false);
    }
  }, [sessionId, generateMutation]);

  const completeTask = useCallback((taskId: string) => {
    updateStatusMutation.mutate({ taskId, status: 'completed' });
  }, [updateStatusMutation]);

  const dismissTask = useCallback((taskId: string) => {
    updateStatusMutation.mutate({ taskId, status: 'dismissed' });
  }, [updateStatusMutation]);

  const startTask = useCallback((taskId: string) => {
    updateStatusMutation.mutate({ taskId, status: 'in_progress' });
  }, [updateStatusMutation]);

  const pendingTasks = (tasksQuery.data?.tasks || []).filter(t => t.status === 'pending');
  const inProgressTasks = (tasksQuery.data?.tasks || []).filter(t => t.status === 'in_progress');
  const completedTasks = (tasksQuery.data?.tasks || []).filter(t => t.status === 'completed');

  return {
    tasks: tasksQuery.data?.tasks || [],
    pendingTasks,
    inProgressTasks,
    completedTasks,
    isLoading: tasksQuery.isLoading,
    isGenerating,
    generateTasks,
    completeTask,
    dismissTask,
    startTask,
    refetch: tasksQuery.refetch,
  };
}

export default useMascotTaskGeneration;
