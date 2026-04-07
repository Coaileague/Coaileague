import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { useWebSocketBus } from '@/providers/WebSocketProvider';

function createThrottledInvalidator(intervalMs: number = 800) {
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (pending) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules/week/stats"] });
      pending = false;
    }, intervalMs);
  };
}

const throttledInvalidateShifts = createThrottledInvalidator(800);

let _globalLastCompletionId: string | null = null;
let _globalLastCompletionTime = 0;
const COMPLETION_DEDUP_WINDOW_MS = 5000;

let _globalLastThoughtKey: string | null = null;
let _globalLastThoughtTime = 0;
const THOUGHT_DEDUP_WINDOW_MS = 300;

export interface ThinkingStep {
  id: string;
  message: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  timestamp: number;
  type: 'analysis' | 'decision' | 'action' | 'review';
}

export interface TrinityThought {
  timestamp: Date;
  type: 'analyzing' | 'assigned' | 'skipped' | 'error' | 'deliberating';
  message: string;
  deliberationType?: 'analysis' | 'decision' | 'action' | 'review';
}

export interface TrinitySchedulingSession {
  sessionId: string;
  isWorking: boolean;
  currentShiftId: string | null;
  currentIndex: number;
  totalShifts: number;
  status: string;
  message: string;
  thoughts: TrinityThought[];
  mutationCount?: number;
  summary?: {
    shiftsCreated?: number;
    openShiftsFilled?: number;
    employeesSwapped?: number;
    shiftsEdited?: number;
    shiftsDeleted?: number;
  };
}

export interface TrinityCompletionResult {
  sessionId: string;
  mutationCount: number;
  summary: {
    shiftsCreated: number;
    openShiftsFilled: number;
    employeesSwapped: number;
    shiftsEdited: number;
    shiftsDeleted: number;
    totalHoursScheduled: number;
    estimatedLaborCost: number;
  };
  mutations?: Array<{
    id: string;
    type: string;
    description: string;
    employeeName?: string;
    clientName?: string;
    startTime?: string;
    endTime?: string;
  }>;
  aiSummary?: string;
  requiresVerification: boolean;
  executionId?: string;
}

export interface SchedulingProgressStep {
  shiftId: string;
  step: 'analyzing' | 'matching' | 'assigning' | 'complete' | 'no_match' | 'error';
  message: string;
  progress: number;
  assignedEmployee?: {
    id: string;
    name: string;
    score: number;
  };
  shift?: any;
  businessMetrics?: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    avgProfitMargin: number;
  };
  thinkingSteps?: ThinkingStep[];
  executionMode?: string;
  creditsCharged?: number;
}

export function useTrinitySchedulingProgress(workspaceId?: string) {
  const [activeProgress, setActiveProgress] = useState<Map<string, SchedulingProgressStep>>(new Map());
  const [completedShifts, setCompletedShifts] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const bus = useWebSocketBus();
  const subscribedRef = useRef(false);

  const [session, setSession] = useState<TrinitySchedulingSession>({
    sessionId: '',
    isWorking: false,
    currentShiftId: null,
    currentIndex: 0,
    totalShifts: 0,
    status: '',
    message: '',
    thoughts: [],
  });

  const [recentlyAssigned, setRecentlyAssigned] = useState<Set<string>>(new Set());
  const [completionResult, setCompletionResult] = useState<TrinityCompletionResult | null>(null);

  useEffect(() => {
    if (!workspaceId || !bus) return;

    const unsubs: (() => void)[] = [];

    const sendSubscribe = () => {
      if (bus.isConnected() && !subscribedRef.current) {
        bus.send({
          type: 'join_scheduling_progress',
          workspaceId,
        });
        subscribedRef.current = true;
        setIsConnected(true);
      }
    };

    unsubs.push(bus.subscribe('__ws_connected', () => {
      subscribedRef.current = false;
      sendSubscribe();
    }));

    unsubs.push(bus.subscribe('__ws_disconnected', () => {
      setIsConnected(false);
      subscribedRef.current = false;
    }));

    if (bus.isConnected()) {
      sendSubscribe();
    }

    const schedulingTypes = [
      'trinity_scheduling_started',
      'trinity_scheduling_progress',
      'trinity_scheduling_completed',
      'scheduling_progress_subscribed',
      'shift_created',
      'shift_updated',
      'shift_deleted',
    ];

    unsubs.push(bus.subscribeAll((message: any) => {
      if (!schedulingTypes.includes(message.type)) return;

      if (message.type === 'trinity_scheduling_started') {
        setSession({
          sessionId: message.sessionId || '',
          isWorking: true,
          currentShiftId: null,
          currentIndex: 0,
          totalShifts: message.totalShifts || 0,
          status: 'starting',
          message: 'Trinity is starting auto-schedule...',
          thoughts: [{
            timestamp: new Date(),
            type: 'analyzing',
            message: `Starting auto-fill for ${message.totalShifts || 0} shifts...`,
          }],
        });
        setRecentlyAssigned(new Set());
      }

      if (message.type === 'trinity_scheduling_progress') {
        if (message.data) {
          const progress = message.data as SchedulingProgressStep;
          setActiveProgress(prev => {
            const newMap = new Map(prev);
            newMap.set(progress.shiftId, progress);
            return newMap;
          });

          if (progress.step === 'complete') {
            queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
            setTimeout(() => {
              setActiveProgress(prev => {
                const newMap = new Map(prev);
                newMap.delete(progress.shiftId);
                return newMap;
              });
              setCompletedShifts(prev => [...prev, progress.shiftId]);
            }, 3000);
          } else if (progress.step === 'no_match') {
            setTimeout(() => {
              setActiveProgress(prev => {
                const newMap = new Map(prev);
                newMap.delete(progress.shiftId);
                return newMap;
              });
            }, 3000);
          }
        }

        const thoughtType: TrinityThought['type'] =
          message.status === 'assigned' ? 'assigned' :
          message.status === 'skipped' ? 'skipped' :
          message.status === 'deliberating' ? 'deliberating' : 'analyzing';

        const thoughtKey = `${message.status}:${message.currentShiftId || ''}:${(message.message || '').slice(0, 60)}`;
        const thoughtNow = Date.now();
        const isDuplicateThought = _globalLastThoughtKey === thoughtKey && (thoughtNow - _globalLastThoughtTime) < THOUGHT_DEDUP_WINDOW_MS;
        _globalLastThoughtKey = thoughtKey;
        _globalLastThoughtTime = thoughtNow;

        if (!isDuplicateThought) {
          setSession(prev => ({
            ...prev,
            currentShiftId: message.status !== 'deliberating' ? (message.currentShiftId || null) : prev.currentShiftId,
            currentIndex: message.status !== 'deliberating' ? (message.currentIndex || prev.currentIndex) : prev.currentIndex,
            totalShifts: message.totalShifts || prev.totalShifts,
            status: message.status !== 'deliberating' ? (message.status || prev.status) : prev.status,
            message: message.status !== 'deliberating' ? (message.message || prev.message) : prev.message,
            thoughts: [...prev.thoughts, {
              timestamp: new Date(),
              type: thoughtType,
              message: message.message || '',
              deliberationType: message.deliberationType || undefined,
            }],
          }));
        }

        if (message.status === 'assigned' && message.currentShiftId) {
          setRecentlyAssigned(prev => new Set(prev).add(message.currentShiftId));
          throttledInvalidateShifts();
          setTimeout(() => {
            setRecentlyAssigned(prev => {
              const next = new Set(prev);
              next.delete(message.currentShiftId);
              return next;
            });
          }, 1500);
        }
      }

      if (message.type === 'trinity_scheduling_completed') {
        const completionKey = message.sessionId || message.executionId || `completion-${message.mutationCount}`;
        const now = Date.now();
        if (_globalLastCompletionId === completionKey && (now - _globalLastCompletionTime) < COMPLETION_DEDUP_WINDOW_MS) return;
        _globalLastCompletionId = completionKey;
        _globalLastCompletionTime = now;

        const completionSummary = message.summary || {};
        const mutationCount = message.mutationCount || 0;

        setSession(prev => ({
          ...prev,
          isWorking: false,
          currentShiftId: null,
          mutationCount,
          summary: completionSummary,
          thoughts: [...prev.thoughts, {
            timestamp: new Date(),
            type: 'assigned',
            message: `Completed! ${mutationCount} changes proposed.`,
          }],
        }));

        setCompletionResult({
          sessionId: message.sessionId || '',
          mutationCount,
          summary: {
            shiftsCreated: completionSummary.shiftsCreated || 0,
            openShiftsFilled: completionSummary.openShiftsFilled || 0,
            employeesSwapped: completionSummary.employeesSwapped || 0,
            shiftsEdited: completionSummary.shiftsEdited || 0,
            shiftsDeleted: completionSummary.shiftsDeleted || 0,
            totalHoursScheduled: completionSummary.totalHoursScheduled || 0,
            estimatedLaborCost: completionSummary.estimatedLaborCost || 0,
          },
          mutations: message.mutations || [],
          aiSummary: message.aiSummary || `Trinity completed ${mutationCount} scheduling changes. ${completionSummary.openShiftsFilled || 0} open shifts filled, ${completionSummary.employeesSwapped || 0} optimizations made.`,
          requiresVerification: true,
          executionId: message.executionId,
        });

        queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/schedules/week/stats"] });

        toast({
          title: 'Trinity Auto-Schedule Complete',
          description: `${completionSummary.openShiftsFilled || 0} shifts filled. Review changes before publishing.`,
        });
      }

      if (message.type === 'shift_created' || message.type === 'shift_updated' || message.type === 'shift_deleted') {
        queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      }
    }));

    return () => {
      unsubs.forEach(u => u());
      subscribedRef.current = false;
    };
  }, [workspaceId, bus, toast]);

  const clearProgress = useCallback((shiftId: string) => {
    setActiveProgress(prev => {
      const newMap = new Map(prev);
      newMap.delete(shiftId);
      return newMap;
    });
  }, []);

  const clearSession = useCallback(() => {
    setSession({
      sessionId: '',
      isWorking: false,
      currentShiftId: null,
      currentIndex: 0,
      totalShifts: 0,
      status: '',
      message: '',
      thoughts: [],
    });
    setRecentlyAssigned(new Set());
  }, []);

  const clearCompletion = useCallback(() => {
    setCompletionResult(null);
  }, []);

  const isShiftBeingProcessed = useCallback((shiftId: string) => {
    return session.currentShiftId === shiftId;
  }, [session.currentShiftId]);

  const wasShiftJustAssigned = useCallback((shiftId: string) => {
    return recentlyAssigned.has(shiftId);
  }, [recentlyAssigned]);

  return {
    activeProgress: Array.from(activeProgress.values()),
    completedShifts,
    clearProgress,
    hasActiveProgress: activeProgress.size > 0,
    isConnected,

    session,
    clearSession,
    isShiftBeingProcessed,
    wasShiftJustAssigned,
    trinityWorking: session.isWorking,

    completionResult,
    clearCompletion,
  };
}
