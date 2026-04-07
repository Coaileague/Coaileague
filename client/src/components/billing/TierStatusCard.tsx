import { useQuery } from "@tanstack/react-query";
import { Users, Zap, ArrowUpCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type TierName = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise';

const TIER_DISPLAY: Record<TierName, string> = {
  free:         'Free Trial',
  trial:        'Trial',
  starter:      'Starter',
  professional: 'Professional',
  business:     'Business',
  enterprise:   'Enterprise',
};

const TIER_COLORS: Record<TierName, string> = {
  free:         'bg-muted text-muted-foreground',
  trial:        'bg-muted text-muted-foreground',
  starter:      'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  professional: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  business:     'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  enterprise:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

const TIER_SEAT_LIMITS: Record<TierName, number> = {
  free:         5,
  trial:        5,
  starter:      10,
  professional: 100,
  business:     300,
  enterprise:   1000,
};

interface WorkspaceInfo {
  subscriptionTier: TierName;
  subscriptionStatus: string;
  employeeCount?: number;
  name?: string;
}

interface TierStatusCardProps {
  className?: string;
  showUpgradePrompt?: boolean;
}

/**
 * TierStatusCard — displays the workspace's current tier, seat usage,
 * and an optional upgrade prompt. Used in Settings / Billing pages.
 */
export function TierStatusCard({ className = '', showUpgradePrompt = true }: TierStatusCardProps) {
  const { data: workspace, isLoading } = useQuery<WorkspaceInfo>({
    queryKey: ['/api/workspace/current'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: employeeData } = useQuery<{ total: number }>({
    queryKey: ['/api/employees/count'],
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </CardContent>
      </Card>
    );
  }

  const currentTier = (workspace?.subscriptionTier ?? 'free') as TierName;
  const seatLimit = TIER_SEAT_LIMITS[currentTier];
  const seatUsed = employeeData?.total ?? 0;
  const seatPct = seatLimit > 0 ? Math.min(100, Math.round((seatUsed / seatLimit) * 100)) : 0;
  const isNearLimit = seatPct >= 80;
  const isAtLimit = seatPct >= 100;
  const isActive = workspace?.subscriptionStatus === 'active';

  const nextTier: TierName | null =
    currentTier === 'free'         ? 'starter'
    : currentTier === 'starter'    ? 'professional'
    : currentTier === 'professional'? 'business'
    : currentTier === 'business'   ? 'enterprise'
    : null;

  return (
    <Card className={className} data-testid="tier-status-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">Current Plan</span>
        </div>
        <Badge
          className={`text-xs no-default-active-elevate ${TIER_COLORS[currentTier]}`}
          data-testid="tier-badge"
        >
          {TIER_DISPLAY[currentTier]}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Subscription status */}
        <div className="flex items-center gap-2">
          {isActive ? (
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <span className="text-sm text-muted-foreground" data-testid="subscription-status">
            {isActive ? 'Active subscription' : `Status: ${workspace?.subscriptionStatus ?? 'unknown'}`}
          </span>
        </div>

        {/* Seat usage */}
        <div className="flex flex-col gap-2" data-testid="seat-usage">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Seats used</span>
            </div>
            <span
              className={`text-sm font-medium ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-amber-600 dark:text-amber-400' : ''}`}
              data-testid="seat-count"
            >
              {seatUsed} / {seatLimit}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                isAtLimit
                  ? 'bg-destructive'
                  : isNearLimit
                  ? 'bg-amber-500'
                  : 'bg-primary'
              }`}
              style={{ width: `${seatPct}%` }}
              data-testid="seat-progress-bar"
            />
          </div>

          {isNearLimit && (
            <p
              className={`text-xs ${isAtLimit ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}
              data-testid="seat-warning"
            >
              {isAtLimit
                ? 'Seat limit reached. Upgrade your plan to add more team members.'
                : `You have used ${seatPct}% of your seat limit. Consider upgrading soon.`}
            </p>
          )}
        </div>

        {/* Upgrade prompt */}
        {showUpgradePrompt && nextTier && (
          <Link href={`/billing/upgrade?tier=${nextTier}`} data-testid="tier-upgrade-link">
            <Button variant="outline" size="default" className="w-full" data-testid="tier-upgrade-btn">
              <ArrowUpCircle className="mr-2 h-4 w-4" />
              Upgrade to {TIER_DISPLAY[nextTier]}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
