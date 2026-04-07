/**
 * Credit Monitoring Hook
 * ======================
 * Real-time credit balance sync via WebSocket
 * - Cross-device sync on credit changes
 * - Low-balance alerts with thresholds
 * - Automatic refetch on credit updates
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
  type: 'low' | 'critical' | 'purchase' | 'deduction';
  message: string;
  balance: number;
  timestamp: number;
}

const LOW_BALANCE_THRESHOLD = 0.2;
const CRITICAL_BALANCE_THRESHOLD = 0.05;

export function useCreditMonitor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bus = useWebSocketBus();
  const isConnected = useWsConnected();
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const lastBalanceRef = useRef<number | null>(null);
  const alertShownRef = useRef<{ low: boolean; critical: boolean }>({ low: false, critical: false });

  const { data: balance, isLoading, refetch } = useQuery<CreditBalance>({
    queryKey: ['/api/credits/balance'],
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 15000,
  });

  const isUnlimited = balance?.unlimitedCredits === true || 
    balance?.monthlyAllocation === -1 || 
    (balance?.monthlyAllocation && balance.monthlyAllocation > 999999);

  const isLow = !isUnlimited && balance ? 
    balance.currentBalance < (balance.monthlyAllocation * LOW_BALANCE_THRESHOLD) : false;
  
  const isCritical = !isUnlimited && balance ? 
    balance.currentBalance < (balance.monthlyAllocation * CRITICAL_BALANCE_THRESHOLD) : false;

  const percentRemaining = balance && !isUnlimited ? 
    Math.max(0, (balance.currentBalance / balance.monthlyAllocation) * 100) : 100;

  const addAlert = useCallback((alert: Omit<CreditAlert, 'timestamp'>) => {
    setAlerts(prev => [{
      ...alert,
      timestamp: Date.now(),
    }, ...prev.slice(0, 9)]);
  }, []);

  useEffect(() => {
    if (!user) return;

    const sendJoin = () => {
      bus.send({ type: 'join_credit_updates' });
    };
    if (bus.isConnected()) sendJoin();
    const unsubConnect = bus.subscribe('__ws_connected', sendJoin);

    const handleCreditUpdate = (message: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/credits/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/usage-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits/transactions'] });
      
      if (message.data?.newBalance !== undefined) {
        const oldBalance = lastBalanceRef.current;
        const newBalance = message.data.newBalance;
        
        if (oldBalance !== null) {
          if (newBalance < oldBalance) {
            addAlert({
              type: 'deduction',
              message: `${oldBalance - newBalance} credits used`,
              balance: newBalance,
            });
          } else if (newBalance > oldBalance) {
            addAlert({
              type: 'purchase',
              message: `${newBalance - oldBalance} credits added`,
              balance: newBalance,
            });
            
            toast({
              title: 'Credits Added',
              description: `${newBalance - oldBalance} credits have been added to your account`,
            });
          }
        }
      }
    };

    const unsub1 = bus.subscribe('credit_balance_updated', handleCreditUpdate);
    const unsub2 = bus.subscribe('credits_deducted', handleCreditUpdate);
    const unsub3 = bus.subscribe('credits_added', handleCreditUpdate);
    const unsub4 = bus.subscribe('credit_update_subscribed', () => {});

    return () => {
      unsubConnect();
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [bus, user, queryClient, toast, addAlert]);

  useEffect(() => {
    if (!balance || isUnlimited) return;

    lastBalanceRef.current = balance.currentBalance;

    if (isCritical && !alertShownRef.current.critical) {
      alertShownRef.current.critical = true;
      toast({
        title: 'Credits Critically Low',
        description: `Only ${balance.currentBalance} credits remaining. AI automations may pause.`,
        variant: 'destructive',
      });
      addAlert({
        type: 'critical',
        message: 'Credits critically low - automations at risk',
        balance: balance.currentBalance,
      });
    } else if (isLow && !isCritical && !alertShownRef.current.low) {
      alertShownRef.current.low = true;
      toast({
        title: 'Credits Running Low',
        description: `${balance.currentBalance} credits remaining (${percentRemaining.toFixed(0)}%)`,
      });
      addAlert({
        type: 'low',
        message: 'Credit balance is running low',
        balance: balance.currentBalance,
      });
    }

    if (!isLow && !isCritical) {
      alertShownRef.current = { low: false, critical: false };
    }
  }, [balance, isLow, isCritical, isUnlimited, toast, addAlert, percentRemaining]);

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
