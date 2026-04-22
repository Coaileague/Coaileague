/**
 * Trinity Token Usage Component
 * Shows workspace AI token usage for the current billing period.
 * Per-seat billing model — tokens tracked per tier allowance, overages billed monthly.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, TrendingUp } from 'lucide-react';

interface TrinityTokenStatus {
  workspaceId: string;
  tokensUsed: number;
  tokensAllowance: number | null;
  overageTokens: number;
  overageAmountCents: number;
  overageRateCentsPer100k: number;
  percentUsed: number;
  isWarning: boolean;
  isOverage: boolean;
  isUnlimited: boolean;
  tier: string;
  // legacy compat
  balance: number;
  isActive: boolean;
  lowBalance: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatOverageDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TrinityCreditsCard() {
  const { data: status, isLoading } = useQuery<TrinityTokenStatus>({
    queryKey: ['/api/billing/trinity-credits/status'],
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-trinity-credits">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            AI Token Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const tokensUsed = status?.tokensUsed ?? 0;
  const allowance = status?.tokensAllowance ?? null;
  const isUnlimited = status?.isUnlimited ?? false;
  const isWarning = status?.isWarning ?? false;
  const isOverage = status?.isOverage ?? false;
  const percentUsed = status?.percentUsed ?? 0;

  const progressValue = isUnlimited ? 0 : Math.min(100, percentUsed);

  return (
    <Card
      data-testid="card-trinity-credits"
      className={isOverage ? 'border-orange-500' : isWarning ? 'border-yellow-500' : ''}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>AI Token Usage</CardTitle>
          </div>
          {isOverage && (
            <Badge variant="outline" className="border-orange-500 text-orange-600" data-testid="badge-overage">
              OVERAGE
            </Badge>
          )}
          {!isOverage && isWarning && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600" data-testid="badge-warning">
              80%+ USED
            </Badge>
          )}
        </div>
        <CardDescription>
          Monthly token allowance · per-seat plan · overages billed at month-end
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Tokens Used This Month</span>
            <span
              className={`text-3xl font-bold ${isOverage ? 'text-orange-600' : isWarning ? 'text-yellow-600' : 'text-foreground'}`}
              data-testid="text-trinity-balance"
            >
              {formatTokens(tokensUsed)}
            </span>
          </div>

          {!isUnlimited && allowance !== null && (
            <>
              <Progress value={progressValue} className="h-2" data-testid="progress-token-usage" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(percentUsed)}% of {formatTokens(allowance)} allowance</span>
                {isOverage && (
                  <span className="text-orange-600 font-medium">
                    +{formatTokens(status?.overageTokens ?? 0)} overage
                  </span>
                )}
              </div>
            </>
          )}

          {isUnlimited && (
            <p className="text-sm text-muted-foreground">Unlimited — tracked monthly for review</p>
          )}
        </div>

        {isOverage && (status?.overageAmountCents ?? 0) > 0 && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950/20 dark:border-orange-900" data-testid="alert-overage">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-500">Token Overage</p>
              <p className="text-xs text-orange-700 dark:text-orange-600 mt-1">
                {formatTokens(status?.overageTokens ?? 0)} tokens over limit · estimated {formatOverageDollars(status?.overageAmountCents ?? 0)} billed at month-end
              </p>
            </div>
          </div>
        )}

        {isWarning && !isOverage && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-950/20 dark:border-yellow-900" data-testid="alert-warning">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-500">High Token Usage</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-600 mt-1">
                You have used over 80% of your monthly token allowance. Usage continues — overages are billed at $2.00 per 100K tokens.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t">
          <TrendingUp className="h-3 w-3" />
          <span>Tier: <span className="font-medium capitalize">{status?.tier ?? 'free'}</span></span>
          {!isUnlimited && allowance !== null && (
            <>
              <span>·</span>
              <span>Allowance: <span className="font-medium">{formatTokens(allowance)}/mo</span></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TrinityCreditsHeaderBadge({ onClick }: { onClick?: () => void }) {
  const { data: status, isLoading } = useQuery<TrinityTokenStatus>({
    queryKey: ['/api/billing/trinity-credits/status'],
    retry: 1,
  });

  if (isLoading) {
    return (
      <button
        className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium rounded hover:bg-accent"
        disabled
        data-testid="button-trinity-credits-header"
      >
        <Activity className="h-4 w-4" />
        <span>...</span>
      </button>
    );
  }

  const tokensUsed = status?.tokensUsed ?? 0;
  const isWarning = status?.isWarning ?? false;
  const isOverage = status?.isOverage ?? false;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium rounded hover:bg-accent ${isOverage ? 'text-orange-600' : isWarning ? 'text-yellow-600' : ''}`}
      data-testid="button-trinity-credits-header"
    >
      <Activity className={`h-4 w-4 ${isOverage ? 'text-orange-500' : isWarning ? 'text-yellow-500' : 'text-primary'}`} />
      <span data-testid="text-trinity-header-balance">{formatTokens(tokensUsed)}</span>
      {isOverage && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-orange-500 text-orange-600">
          OVER
        </Badge>
      )}
      {isWarning && !isOverage && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-yellow-500 text-yellow-600">
          80%
        </Badge>
      )}
    </button>
  );
}

export function FeatureLockedOverlay({
  featureKey,
  children,
}: {
  featureKey: string;
  children: React.ReactNode;
}) {
  const { data: gateResult, isLoading } = useQuery<{ allowed: boolean; reason?: string; requiredAction?: string }>({
    queryKey: ['/api/billing/feature-gate', featureKey],
    retry: 1,
  });

  if (isLoading || gateResult?.allowed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
        <div className="text-center p-4 space-y-2">
          <Activity className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            {gateResult?.reason || 'Feature requires a higher plan'}
          </p>
          {gateResult?.requiredAction === 'upgrade_plan' && (
            <a href="/settings/billing" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" data-testid="button-unlock-feature">
              Upgrade Plan
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
