import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";
import { useEmployee } from "./useEmployee";
import type { AiWorkboardTask } from "@shared/schema";

interface WorkboardListParams {
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

interface WorkboardListResponse {
  success: boolean;
  tasks: AiWorkboardTask[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface WorkboardStatsResponse {
  success: boolean;
  stats: {
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byAgent: Record<string, number>;
    avgCompletionTime: number;
    successRate: number;
    totalTasks: number;
  };
}

interface SubmitTaskParams {
  requestContent: string;
  requestType?: 'voice_command' | 'chat' | 'direct_api' | 'automation' | 'escalation' | 'system';
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'scheduled';
  notifyVia?: string[];
  metadata?: Record<string, unknown>;
  executionMode?: 'normal' | 'trinity_fast';
}

interface SubmitTaskResponse {
  success: boolean;
  task: AiWorkboardTask;
  message: string;
}

export function useWorkboardRBAC() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  
  const platformRole = user?.platformRole || 'none';
  const workspaceRole = employee?.workspaceRole || 'staff';
  
  const isAdmin = ['root_admin', 'super_admin', 'support_admin'].includes(platformRole);
  const isManager = workspaceRole === 'org_owner' || workspaceRole === 'org_admin' || workspaceRole === 'manager';
  const isSupport = ['support_manager', 'support_agent', 'support_lead'].includes(platformRole);
  
  return {
    canViewAllTasks: isAdmin || isSupport,
    canViewTeamTasks: isManager,
    canCancelTasks: isAdmin || isManager,
    canRetryTasks: isAdmin || isManager,
    canSubmitTasks: true,
    roleLevel: isAdmin ? 'admin' : (isManager ? 'manager' : 'employee') as 'admin' | 'manager' | 'employee',
    platformRole,
    workspaceRole,
    userId: user?.id,
    employeeId: employee?.id,
    workspaceId: employee?.workspaceId,
  };
}

export function useWorkboardTasks(params: WorkboardListParams = {}) {
  const { user } = useAuth();
  const rbac = useWorkboardRBAC();
  
  return useQuery<WorkboardListResponse>({
    queryKey: ['/api/workboard/tasks', {
      ...params,
      scope: rbac.roleLevel,
    }],
    enabled: !!user,
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useWorkboardTask(taskId: string) {
  const { user } = useAuth();
  
  return useQuery<{ success: boolean; task: AiWorkboardTask }>({
    queryKey: ['/api/workboard/tasks', taskId],
    enabled: !!user && !!taskId,
    staleTime: 5000,
  });
}

export function useWorkboardStats() {
  const { user } = useAuth();
  const rbac = useWorkboardRBAC();
  
  return useQuery<WorkboardStatsResponse>({
    queryKey: ['/api/workboard/stats', { scope: rbac.roleLevel }],
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useSubmitWorkboardTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: SubmitTaskParams) => {
      const response = await apiRequest('POST', '/api/workboard/submit', params);
      return response.json() as Promise<SubmitTaskResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/stats'] });
    },
  });
}

export function useCancelWorkboardTask() {
  const queryClient = useQueryClient();
  const rbac = useWorkboardRBAC();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!rbac.canCancelTasks) {
        throw new Error('You do not have permission to cancel tasks');
      }
      const response = await apiRequest('POST', `/api/workboard/tasks/${taskId}/cancel`);
      return response.json();
    },
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/stats'] });
    },
  });
}

export function useRetryWorkboardTask() {
  const queryClient = useQueryClient();
  const rbac = useWorkboardRBAC();
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!rbac.canRetryTasks) {
        throw new Error('You do not have permission to retry tasks');
      }
      const response = await apiRequest('POST', `/api/workboard/tasks/${taskId}/retry`);
      return response.json();
    },
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/tasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['/api/workboard/stats'] });
    },
  });
}
