import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ApprovalRequest {
  id: string;
  workspaceId: string;
  requesterId: string;
  approverId: string | null;
  sourceTaskId: string | null;
  sourceSystem: 'ai_brain' | 'trinity' | 'subagent';
  sourceAgentId: string | null;
  requestType: string;
  title: string;
  description: string | null;
  requestPayload: Record<string, any>;
  decision: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  decisionAt: string | null;
  decisionNote: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  expiresAt: string | null;
  estimatedTokens: number;
  createdAt: string;
  requesterName: string | null;
}

interface UseApprovalsOptions {
  decision?: string[];
  scope?: 'admin' | 'manager' | 'employee';
  limit?: number;
  enabled?: boolean;
}

export function useApprovals(options: UseApprovalsOptions = {}) {
  const { decision, scope = 'employee', limit = 50, enabled = true } = options;

  const queryParams = new URLSearchParams();
  if (decision?.length) queryParams.set('decision', decision.join(','));
  if (scope) queryParams.set('scope', scope);
  if (limit) queryParams.set('limit', limit.toString());

  const queryString = queryParams.toString();

  return useQuery<ApprovalRequest[]>({
    queryKey: ['/api/approvals', { decision, scope, limit }],
    queryFn: async () => {
      const response = await secureFetch(`/api/approvals${queryString ? `?${queryString}` : ''}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch approvals');
      const result = await response.json();
      return result.approvals || [];
    },
    enabled,
    refetchInterval: 30000,
  });
}

export function usePendingApprovalsCount(enabled = true) {
  return useQuery<number>({
    queryKey: ['/api/approvals/pending-count'],
    queryFn: async () => {
      const response = await secureFetch('/api/approvals/pending-count', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch pending count');
      const result = await response.json();
      return result.count || 0;
    },
    enabled,
    refetchInterval: 15000,
  });
}

export function useApprovalDecision() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      approvalId, 
      decision, 
      note 
    }: { 
      approvalId: string; 
      decision: 'approved' | 'rejected'; 
      note?: string;
    }) => {
      return apiRequest('POST', `/api/approvals/${approvalId}/decision`, { decision, note });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/pending-count'] });
      toast({
        title: variables.decision === 'approved' ? 'Approved' : 'Rejected',
        description: `Request has been ${variables.decision}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Action Failed',
        description: error.message || 'Could not process your decision',
        variant: 'destructive',
      });
    },
  });
}

export function useCancelApproval() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ approvalId, reason }: { approvalId: string; reason?: string }) => {
      return apiRequest('POST', `/api/approvals/${approvalId}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/pending-count'] });
      toast({
        title: 'Cancelled',
        description: 'Request has been cancelled',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed',
        description: error.message || 'Could not cancel request',
        variant: 'destructive',
      });
    },
  });
}
