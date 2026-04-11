/**
 * Token Usage Monitoring Hook
 * ======================
 * Real-time token usage sync via WebSocket
 * - Cross-device sync on token usage changes
 * - Usage threshold alerts (80% and overage)
 * - Automatic refetch on token usage updates
 *
 * Uses unified WebSocketProvider instead of creating its own connection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocketBus, useWsConnected } from '@/providers/WebSocketProvider';

export interface CreditBalance {
  id: string;
  workspaceId: string;
  // Token fields (authoritative)
  tokensUsed?: number;
  tokensAllowance?: number | null;
  overageTokens?: number;
  overageAmountCents?: number;
  // Legacy-compat fields (mapped from token data)
  currentBalance: number;
  monthlyAllocation: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  totalCreditsPurchased: number;
  lastResetAt: string | null;
  nextResetAt: string | null;
  isActive: boolean;
  isSuspended: boolean;
  tier: string;
  subscriptionTier: string;
  unlimitedCredits?: boolean;
  creditsUsedThisPeriod?: number;
}

export interface CreditAlert {
  type: 'low' | 'critical' | 'overage' | 'deduction';
  message: string;
  balance: number;
  timestamp: number;
}

const WARNING_THRESHOLD = 0.8;   // 80% token allowance used
const OVERAGE_THRESHOLD = 1.0;   // 100% = overage begins

export function useCreditMonitor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bus = useWebSocketBus();
  const isConnected = useWsConnected();
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const lastUsedRef = useRef<number | null>(null);
  const alertShownRef = useRef<{ warning: boolean; overage: boolean }>({ warning: false, overage: false });

  const { data: balance, isLoading, refetch } = useQuery<CreditBalance>({
    queryKey: ['/api/credits/balance'],
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 15000,
  });

  // Token-based values
  const tokensUsed = balance?.tokensUsed ?? balance?.creditsUsedThisPeriod ?? 0;
  const tokensAllowance = balance?.tokensAllowance ?? (balance?.monthlyAllocation !== -1 ? balance?.monthlyAllocation : null) ?? null;

  const isUnlimited = balance?.unlimitedCredits === true ||
    balance?.monthlyAllocation === -1 ||
    tokensAllowance === null ||
    (balance?.monthlyAllocation && balance.monthlyAllocation > 999_999_999);

  const percentUsed = tokensAllowance && !isUnlimited ? Math.min(200, (tokensUsed / tokensAllowance) * 100) : 0;

  const isLow = !isUnlimited && tokensAllowance ? percentUsed >= 80 : false;
  const isCritical = !isUnlimited && tokensAllowance ? tokensUsed > tokensAllowance : false;

  // percentRemaining kept for backward compat (some pages use it)
  const percentRemaining = isUnlimited ? 100 : Math.max(0, 100 - percentUsed);

  const addAlert = useCallback((alert: Omit<CreditAlert, 'timestamp'>) => {
    setAlerts(prev => [{
      ...alert,
      timestamp: Date.now(),
    }, ...prev.slice(0, 9)]);
  }, []);

  useEffect(() => {
    if (!user) return;

    const sendJoin = () => {
      bus.send({ type: 'join_token_usage_updates' });
    };
    if (bus.isConnected()) sendJoin();
    const unsubConnect = bus.subscribe('__ws_connected', sendJoin);

    const handleUsageUpdate = (message: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/usage-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/trinity-credits/status'] });

      if (message.data?.tokensUsed !== undefined) {
        const prevUsed = lastUsedRef.current;
        const newUsed = message.data.tokensUsed;
        if (prevUsed !== null && newUsed > prevUsed) {
          addAlert({
            type: 'deduction',
            message: `${(newUsed - prevUsed).toLocaleString()} tokens used`,
            balance: newUsed,
          });
        }
      }
    };

    const unsub1 = bus.subscribe('token_usage_updated', handleUsageUpdate);
    const unsub2 = bus.subscribe('credit_balance_updated', handleUsageUpdate);
    const unsub3 = bus.subscribe('credits_deducted', handleUsageUpdate);

    return () => {
      unsubConnect();
      unsub1();
      unsub2();
      unsub3();
    };
  }, [bus, user, queryClient, addAlert]);

  useEffect(() => {
    if (!balance || isUnlimited) return;

    lastUsedRef.current = tokensUsed;

    if (isCritical && !alertShownRef.current.overage) {
      alertShownRef.current.overage = true;
      toast({
        title: 'Token Allowance Exceeded',
        description: `You have used all ${tokensAllowance?.toLocaleString()} tokens for this period. Overages are billed at $2.00 per 100K tokens.`,
      });
      addAlert({
        type: 'overage',
        message: 'Monthly token allowance exceeded — overage billing active',
        balance: tokensUsed,
      });
    } else if (isLow && !isCritical && !alertShownRef.current.warning) {
      alertShownRef.current.warning = true;
      toast({
        title: 'Token Usage: 80%',
        description: `You have used ${percentUsed.toFixed(0)}% of your monthly token allowance (${tokensUsed.toLocaleString()} / ${tokensAllowance?.toLocaleString()}).`,
      });
      addAlert({
        type: 'low',
        message: 'Token usage at 80% of monthly allowance',
        balance: tokensUsed,
      });
    }

    if (!isLow && !isCritical) {
      alertShownRef.current = { warning: false, overage: false };
    }
  }, [balance, tokensUsed, tokensAllowance, isLow, isCritical, isUnlimited, toast, addAlert, percentUsed]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    balance,
    isLoading,
    isConnected,
    isUnlimited,
    isLow,
    isCritical,
    percentRemaining,
    alerts,
    clearAlerts,
    refetch,
    daysUntilReset: balance?.nextResetAt
      ? Math.ceil((new Date(balance.nextResetAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0,
  };
}
