/**
 * Plan status display components — per-seat pricing model.
 * Replaces legacy credit-balance displays.
 * Exports maintain backward-compatible names so all existing imports continue to work.
 */

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { TierStatusCard } from '@/components/billing/TierStatusCard';

type TierName = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

const TIER_DISPLAY: Record<TierName, string> = {
  free:         'Free Trial',
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  business:     'Business',
  enterprise:   'Enterprise',
  strategic:    'Strategic',
};

const TIER_COLORS: Record<TierName, string> = {
  free:         'bg-muted text-muted-foreground',
  trial:        'bg-muted text-muted-foreground',
  starter:      'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  professional: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  business:     'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  enterprise:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  strategic:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

interface WorkspaceInfo {
  subscriptionTier?: TierName;
}

/**
 * Compact plan badge for the header — replaces the old credit coin badge.
 * Shows current tier name (e.g., "Professional").
 */
export function CreditBalanceBadge({ onClick }: { onClick?: () => void }) {
  const { data: workspace, isLoading } = useQuery<WorkspaceInfo>({
    queryKey: ['/api/workspace/current'],
    staleTime: 5 * 60 * 1000,
  });

  const tier = (workspace?.subscriptionTier ?? 'free') as TierName;
  const label = isLoading ? '…' : (TIER_DISPLAY[tier] ?? tier);
  const colorClass = isLoading ? 'bg-muted text-muted-foreground' : (TIER_COLORS[tier] ?? TIER_COLORS.free);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="gap-1.5 px-2"
      data-testid="button-plan-header"
    >
      <Zap className="h-4 w-4 text-muted-foreground" />
      <Badge
        className={`text-[11px] font-medium no-default-active-elevate ${colorClass}`}
        data-testid="badge-plan-header"
      >
        {label}
      </Badge>
    </Button>
  );
}

/**
 * Full plan status card — replaces the old credit balance card.
 * Delegates to TierStatusCard (seats used / tier / upgrade).
 */
export function CreditBalanceCard({ onBuyCredits: _unused }: { onBuyCredits?: () => void } = {}) {
  return <TierStatusCard showUpgradePrompt />;
}
