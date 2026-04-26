import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import thoughtManager, { type CreditStatus } from '@/lib/mascot/ThoughtManager';

interface TokenBalanceResponse {
  tokensUsed?: number;
  tokensAllowance?: number | null;
  currentBalance?: number;
  monthlyAllocation?: number;
  creditsUsedThisPeriod?: number;
  isActive?: boolean;
  unlimited?: boolean;
  subscriptionTier?: string;
}

export function useTokenAwareness() {
  const { user } = useAuth();
  const lastUsedRef = useRef<number | null>(null);

  const { data: balanceData } = useQuery<TokenBalanceResponse>({
    queryKey: ['/api/usage/tokens'],
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: false,
  });

  useEffect(() => {
    if (!balanceData || !user) return;

    const tokensUsed = balanceData.tokensUsed ?? balanceData.creditsUsedThisPeriod ?? 0;
    const allowance = balanceData.tokensAllowance ?? (balanceData.monthlyAllocation !== -1 ? balanceData.monthlyAllocation : null) ?? 5_000_000;
    const isUnlimited = balanceData.unlimited === true || balanceData.monthlyAllocation === -1 || !allowance;

    const percentUsed = allowance && !isUnlimited ? Math.min(1, tokensUsed / allowance) : 0;

    const status: CreditStatus = {
      currentBalance: isUnlimited ? 999_999_999 : Math.max(0, (allowance ?? 0) - tokensUsed),
      monthlyAllocation: allowance ?? 0,
      usedThisMonth: tokensUsed,
      percentUsed,
      isLow: !isUnlimited && percentUsed >= 0.8,
      isCritical: !isUnlimited && percentUsed >= 1.0,
      tier: balanceData.subscriptionTier || 'free',
    };

    thoughtManager.updateCreditStatus(status);
    lastUsedRef.current = tokensUsed;
  }, [balanceData, user]);

  return {
    creditsData: balanceData,
    creditSummary: thoughtManager.getCreditSummary(),
  };
}
