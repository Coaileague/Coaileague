import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type TierName = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise';

const TIER_HIERARCHY: Record<TierName, number> = {
  free:         1,
  trial:        2,
  starter:      3,
  professional: 4,
  business:     5,
  enterprise:   6,
};

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

interface WorkspaceInfo {
  subscriptionTier: TierName;
  subscriptionStatus: string;
}

interface TierGateProps {
  /** Minimum tier required to see the children */
  requiredTier: TierName;
  /** The feature name to display in the locked state */
  featureName?: string;
  /** Short description of why this feature is gated */
  description?: string;
  /** Children rendered when the workspace meets the tier requirement */
  children: ReactNode;
  /** If true, render nothing instead of the locked state when access is denied */
  silent?: boolean;
}

/**
 * TierGate — wraps any feature/UI section and shows a locked upgrade prompt
 * when the current workspace does not meet the minimum tier requirement.
 *
 * Usage:
 *   <TierGate requiredTier="professional" featureName="Advanced Analytics">
 *     <AdvancedAnalyticsDashboard />
 *   </TierGate>
 */
export function TierGate({
  requiredTier,
  featureName,
  description,
  children,
  silent = false,
}: TierGateProps) {
  const { data: workspace, isLoading } = useQuery<WorkspaceInfo>({
    queryKey: ['/api/workspace/current'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  const currentTier = (workspace?.subscriptionTier ?? 'free') as TierName;
  const currentLevel = TIER_HIERARCHY[currentTier] ?? 1;
  const requiredLevel = TIER_HIERARCHY[requiredTier];
  const hasAccess = currentLevel >= requiredLevel;

  if (hasAccess) {
    return <>{children}</>;
  }

  if (silent) {
    return null;
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-4 rounded-md border border-dashed bg-muted/30 p-10 text-center"
      data-testid="tier-gate-locked"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          {featureName && (
            <h3 className="text-base font-semibold" data-testid="tier-gate-feature-name">
              {featureName}
            </h3>
          )}
          <Badge className={`text-xs no-default-active-elevate ${TIER_COLORS[requiredTier]}`}>
            {TIER_DISPLAY[requiredTier]}+
          </Badge>
        </div>

        <p className="max-w-sm text-sm text-muted-foreground" data-testid="tier-gate-description">
          {description ??
            `This feature requires the ${TIER_DISPLAY[requiredTier]} plan or higher. You are currently on the ${TIER_DISPLAY[currentTier]} plan.`}
        </p>
      </div>

      <Link href={`/billing/upgrade?tier=${requiredTier}`} data-testid="tier-gate-upgrade-link">
        <Button size="default" data-testid="tier-gate-upgrade-btn">
          <ArrowUpCircle className="mr-2 h-4 w-4" />
          Upgrade to {TIER_DISPLAY[requiredTier]}
        </Button>
      </Link>
    </div>
  );
}

/**
 * useTierAccess — hook to programmatically check tier access.
 * Returns { hasAccess, currentTier, isLoading }.
 */
export function useTierAccess(requiredTier: TierName) {
  const { data: workspace, isLoading } = useQuery<WorkspaceInfo>({
    queryKey: ['/api/workspace/current'],
    staleTime: 5 * 60 * 1000,
  });

  const currentTier = (workspace?.subscriptionTier ?? 'free') as TierName;
  const currentLevel = TIER_HIERARCHY[currentTier] ?? 1;
  const requiredLevel = TIER_HIERARCHY[requiredTier];
  const hasAccess = currentLevel >= requiredLevel;

  return { hasAccess, currentTier, isLoading };
}
