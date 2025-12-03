import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import thoughtManager, { type CreditStatus } from '@/lib/mascot/ThoughtManager';

interface CreditsBalanceResponse {
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
}

export function useCreditAwareness() {
  const { user } = useAuth();
  const lastBalanceRef = useRef<number | null>(null);

  const { data: creditsData } = useQuery<CreditsBalanceResponse>({
    queryKey: ['/api/credits/balance'],
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: false,
  });

  useEffect(() => {
    if (!creditsData || !user) return;

    const usedThisMonth = creditsData.totalCreditsSpent || 0;
    const allocation = creditsData.monthlyAllocation || 100;
    const balance = creditsData.currentBalance;
    const percentUsed = allocation > 0 ? (usedThisMonth / allocation) : 0;
    
    const status: CreditStatus = {
      currentBalance: balance,
      monthlyAllocation: allocation,
      usedThisMonth,
      percentUsed: Math.min(1, percentUsed),
      isLow: balance < (allocation * 0.2),
      isCritical: balance < (allocation * 0.05),
      tier: creditsData.tier || 'free',
    };

    thoughtManager.updateCreditStatus(status);

    if (lastBalanceRef.current !== null && balance > lastBalanceRef.current) {
      const addedCredits = balance - lastBalanceRef.current;
      if (addedCredits >= 50) {
        thoughtManager.triggerCreditPurchaseCelebration(addedCredits);
      }
    }
    lastBalanceRef.current = balance;
  }, [creditsData, user]);

  return {
    creditsData,
    creditSummary: thoughtManager.getCreditSummary(),
  };
}
