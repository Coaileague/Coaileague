/**
 * useBroadcasts Hook
 * Manages broadcast state and interactions
 */

import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { 
  Broadcast, 
  BroadcastRecipient, 
  CreateBroadcastRequest,
  SubmitFeedbackRequest,
  BroadcastStatsResponse,
} from '@shared/types/broadcasts';

// ============================================
// GET BROADCASTS (For Managers)
// ============================================

export function useBroadcasts(options?: {
  type?: string;
  isActive?: boolean;
  limit?: number;
}) {
  return useQuery<Broadcast[]>({
    queryKey: ['/api/broadcasts', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.type) params.set('type', options.type);
      if (options?.isActive !== undefined) params.set('isActive', String(options.isActive));
      if (options?.limit) params.set('limit', String(options.limit));
      
      const res = await secureFetch(`/api/broadcasts?${params}`);
      if (!res.ok) throw new Error('Failed to fetch broadcasts');
      return res.json();
    },
  });
}

// ============================================
// GET MY BROADCASTS (For Employees)
// ============================================

export function useMyBroadcasts(options?: {
  unreadOnly?: boolean;
  limit?: number;
}) {
  return useQuery<Array<Broadcast & { recipient: BroadcastRecipient }>>({
    queryKey: ['/api/broadcasts/my', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.unreadOnly) params.set('unreadOnly', 'true');
      if (options?.limit) params.set('limit', String(options.limit));
      
      const res = await secureFetch(`/api/broadcasts/my?${params}`);
      if (!res.ok) throw new Error('Failed to fetch broadcasts');
      return res.json();
    },
  });
}

// ============================================
// GET BROADCAST BY ID
// ============================================

export function useBroadcast(broadcastId: string | null) {
  return useQuery<Broadcast>({
    queryKey: ['/api/broadcasts', broadcastId],
    queryFn: async () => {
      const res = await secureFetch(`/api/broadcasts/${broadcastId}`);
      if (!res.ok) throw new Error('Failed to fetch broadcast');
      return res.json();
    },
    enabled: !!broadcastId,
  });
}

// ============================================
// GET BROADCAST STATS
// ============================================

export function useBroadcastStats(broadcastId: string | null) {
  return useQuery<BroadcastStatsResponse>({
    queryKey: ['/api/broadcasts', broadcastId, 'stats'],
    queryFn: async () => {
      const res = await secureFetch(`/api/broadcasts/${broadcastId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!broadcastId,
  });
}

// ============================================
// CREATE BROADCAST
// ============================================

export function useCreateBroadcast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBroadcastRequest) => {
      return await apiRequest('POST', '/api/broadcasts', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
      toast({
        title: 'Broadcast Created',
        description: 'Your broadcast has been sent to recipients.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Create Broadcast',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

// ============================================
// CREATE PLATFORM BROADCAST
// ============================================

export function useCreatePlatformBroadcast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBroadcastRequest) => {
      return await apiRequest('POST', '/api/broadcasts/platform', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
      toast({
        title: 'Platform Broadcast Created',
        description: 'Your broadcast has been sent platform-wide.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Create Broadcast',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

// ============================================
// MARK AS READ
// ============================================

export function useMarkBroadcastRead() {
  return useMutation({
    mutationFn: async (broadcastId: string) => {
      return await apiRequest('POST', `/api/broadcasts/${broadcastId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts/my'] });
    },
  });
}

// ============================================
// ACKNOWLEDGE BROADCAST
// ============================================

export function useAcknowledgeBroadcast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ broadcastId, note }: { broadcastId: string; note?: string }) => {
      return await apiRequest('POST', `/api/broadcasts/${broadcastId}/acknowledge`, { note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts/my'] });
      toast({
        title: 'Acknowledged',
        description: 'Your acknowledgment has been recorded.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Acknowledge',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

// ============================================
// DISMISS BROADCAST
// ============================================

export function useDismissBroadcast() {
  return useMutation({
    mutationFn: async (broadcastId: string) => {
      return await apiRequest('POST', `/api/broadcasts/${broadcastId}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts/my'] });
    },
    onError: (error) => {
      // Don't show error for expected "can't dismiss critical" error
      console.error('Dismiss error:', error);
    },
  });
}

// ============================================
// SUBMIT FEEDBACK
// ============================================

export function useSubmitBroadcastFeedback() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      broadcastId, 
      ...data 
    }: SubmitFeedbackRequest) => {
      return await apiRequest('POST', `/api/broadcasts/${broadcastId}/feedback`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts/my'] });
      toast({
        title: 'Feedback Submitted',
        description: 'Thank you for your feedback!',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Submit Feedback',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

// ============================================
// UPDATE BROADCAST
// ============================================

export function useUpdateBroadcast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ broadcastId, ...data }: { broadcastId: string } & Partial<Broadcast>) => {
      return await apiRequest('PATCH', `/api/broadcasts/${broadcastId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
      toast({
        title: 'Broadcast Updated',
        description: 'Changes have been saved.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Update',
        description: error.message || 'Something went wrong',
      });
    },
  });
}

// ============================================
// DELETE BROADCAST
// ============================================

export function useDeleteBroadcast() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (broadcastId: string) => {
      return await apiRequest('DELETE', `/api/broadcasts/${broadcastId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/broadcasts'] });
      toast({
        title: 'Broadcast Deleted',
        description: 'The broadcast has been removed.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Delete',
        description: error.message || 'Something went wrong',
      });
    },
  });
}
