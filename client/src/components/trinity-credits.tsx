/**
 * Trinity Credits Display Component
 * Shows workspace Trinity AI credit balance with feature gating status
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Lock, Unlock, AlertTriangle, ShoppingCart, Sparkles, KeyRound, Check, Loader2, Brain } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TrinityCreditsStatus {
  workspaceId: string;
  balance: number;
  isActive: boolean;
  lowBalance: boolean;
  lifetimePurchased: number;
  lifetimeUsed: number;
  lastUsedAt: string | null;
  lastPurchasedAt: string | null;
}

interface TrinityPackage {
  id: string;
  name: string;
  description: string;
  credits: number;
  bonusCredits: number;
  priceUsd: string;
}

interface FeatureState {
  featureKey: string;
  isUnlocked: boolean;
  unlockMethod?: string;
  expiresAt?: string;
}

type FeatureCategory = 'trinity_command' | 'automation_action' | 'automation_cycle' | 'staged_publish' | 'ai_brain';

interface FeatureDefinition {
  key: string;
  category: FeatureCategory;
  displayName: string;
  description?: string;
  creditsPerUse: number;
  requiresOnboarding: boolean;
  lockMessage?: string;
}

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  'trinity_command': 'Trinity Commands',
  'automation_action': 'Automation Actions',
  'automation_cycle': 'Automation Cycles',
  'staged_publish': 'Staged Publishing',
  'ai_brain': 'AI Brain Features',
};

export function TrinityCreditsCard() {
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: creditStatus, isLoading: isLoadingStatus } = useQuery<TrinityCreditsStatus>({
    queryKey: ['/api/billing/trinity-credits/status'],
    retry: 1,
  });

  const { data: packages } = useQuery<{ success: boolean; packages: TrinityPackage[] }>({
    queryKey: ['/api/billing/trinity-credits/packages'],
    retry: 1,
  });

  const { data: featureData } = useQuery<{ success: boolean; states: FeatureState[]; definitions: Record<string, FeatureDefinition> }>({
    queryKey: ['/api/billing/feature-states'],
    retry: 1,
  });

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest('POST', '/api/billing/trinity-credits/redeem-code', { code });
      return response as unknown as { success: boolean; creditsAdded?: number; featureUnlocked?: string; error?: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Code Redeemed',
          description: data.creditsAdded 
            ? `Added ${data.creditsAdded} credits to your account!`
            : data.featureUnlocked
              ? `Unlocked feature: ${data.featureUnlocked}`
              : 'Code redeemed successfully',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/trinity-credits/status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/feature-states'] });
        setShowRedeemDialog(false);
        setRedeemCode('');
      } else {
        toast({
          title: 'Redemption Failed',
          description: data.error || 'Invalid code',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoadingStatus) {
    return (
      <Card data-testid="card-trinity-credits">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Trinity Credits
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

  const balance = creditStatus?.balance ?? 0;
  const isLow = creditStatus?.lowBalance ?? false;
  const isCritical = balance === 0;
  const isInactive = creditStatus?.isActive === false;

  const definitions = featureData?.definitions || {};
  const states = featureData?.states || [];

  const lockedFeatures = Object.values(definitions).filter(def => {
    const state = states.find(s => s.featureKey === def.key);
    return !state?.isUnlocked && def.requiresOnboarding;
  });

  const unlockedFeatures = Object.values(definitions).filter(def => {
    const state = states.find(s => s.featureKey === def.key);
    return state?.isUnlocked || !def.requiresOnboarding;
  });

  return (
    <Card 
      data-testid="card-trinity-credits" 
      className={isInactive ? 'border-destructive' : isCritical ? 'border-destructive/50' : isLow ? 'border-orange-500' : ''}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Trinity AI Credits</CardTitle>
          </div>
          {isInactive && (
            <Badge variant="destructive" data-testid="badge-inactive">
              INACTIVE
            </Badge>
          )}
          {!isInactive && isCritical && (
            <Badge variant="destructive" data-testid="badge-depleted">
              DEPLETED
            </Badge>
          )}
          {!isInactive && !isCritical && isLow && (
            <Badge variant="outline" className="border-orange-500 text-orange-600" data-testid="badge-low">
              LOW
            </Badge>
          )}
        </div>
        <CardDescription>
          Powers Trinity commands, HelpAI, and AI automations
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Credit Balance</span>
            <span 
              className={`text-3xl font-bold ${isCritical ? 'text-destructive' : isLow ? 'text-orange-600' : 'text-foreground'}`}
              data-testid="text-trinity-balance"
            >
              {balance.toLocaleString()}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Lifetime Used:</span>
              <span className="ml-1 font-medium" data-testid="text-lifetime-used">
                {creditStatus?.lifetimeUsed?.toLocaleString() ?? 0}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Purchased:</span>
              <span className="ml-1 font-medium" data-testid="text-lifetime-purchased">
                {creditStatus?.lifetimePurchased?.toLocaleString() ?? 0}
              </span>
            </div>
          </div>
        </div>

        {(isInactive || isCritical) && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive rounded-lg" data-testid="alert-credits-depleted">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {isInactive ? 'Account Inactive' : 'Credits Depleted'}
              </p>
              <p className="text-xs text-destructive/80 mt-1">
                {isInactive 
                  ? 'Your credit account is inactive. Contact support to reactivate.'
                  : 'All Trinity AI features are suspended. Purchase credits to resume.'}
              </p>
            </div>
          </div>
        )}

        {isLow && !isCritical && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950/20 dark:border-orange-900" data-testid="alert-credits-low">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900 dark:text-orange-500">Low Credits</p>
              <p className="text-xs text-orange-700 dark:text-orange-600 mt-1">
                Running low on Trinity credits. Consider purchasing more to ensure uninterrupted AI services.
              </p>
            </div>
          </div>
        )}

        {lockedFeatures.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Locked Features ({lockedFeatures.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lockedFeatures.slice(0, 4).map(def => (
                <Badge 
                  key={def.key} 
                  variant="outline" 
                  className="text-xs opacity-70"
                  data-testid={`badge-locked-${def.key}`}
                >
                  <Lock className="h-2.5 w-2.5 mr-1" />
                  {def.displayName}
                </Badge>
              ))}
              {lockedFeatures.length > 4 && (
                <Badge variant="outline" className="text-xs opacity-70">
                  +{lockedFeatures.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {unlockedFeatures.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Unlock className="h-3 w-3" />
              Active Features ({unlockedFeatures.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unlockedFeatures.slice(0, 4).map(def => (
                <Badge 
                  key={def.key} 
                  variant="secondary" 
                  className="text-xs"
                  data-testid={`badge-unlocked-${def.key}`}
                >
                  <Check className="h-2.5 w-2.5 mr-1" />
                  {def.displayName}
                </Badge>
              ))}
              {unlockedFeatures.length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{unlockedFeatures.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant={isCritical ? 'default' : 'outline'}
            className="flex-1 gap-2"
            data-testid="button-buy-trinity-credits"
          >
            <ShoppingCart className="h-4 w-4" />
            {isCritical ? 'Buy Credits Now' : 'Buy Credits'}
          </Button>
          
          <Dialog open={showRedeemDialog} onOpenChange={setShowRedeemDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-redeem-code">
                <KeyRound className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Redeem Unlock Code
                </DialogTitle>
                <DialogDescription>
                  Enter your unlock code to receive credits or unlock features.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="TRIN-XXXX-XXXX-XXXX"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  data-testid="input-redeem-code"
                  className="font-mono text-center tracking-wider"
                />
                <Button
                  onClick={() => redeemMutation.mutate(redeemCode)}
                  disabled={!redeemCode || redeemMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-redeem"
                >
                  {redeemMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Redeeming...
                    </>
                  ) : (
                    'Redeem Code'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export function TrinityCreditsHeaderBadge({ onClick }: { onClick?: () => void }) {
  const { data: creditStatus, isLoading } = useQuery<TrinityCreditsStatus>({
    queryKey: ['/api/billing/trinity-credits/status'],
    retry: 1,
  });

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled data-testid="button-trinity-credits-header">
        <Brain className="h-4 w-4 mr-1.5" />
        <span className="text-sm">...</span>
      </Button>
    );
  }

  const balance = creditStatus?.balance ?? 0;
  const isLow = creditStatus?.lowBalance ?? false;
  const isCritical = balance === 0;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="gap-1.5"
      data-testid="button-trinity-credits-header"
    >
      <Brain className={`h-4 w-4 ${isCritical ? 'text-destructive' : isLow ? 'text-orange-500' : 'text-primary'}`} />
      <span 
        className={`text-sm font-medium ${isCritical ? 'text-destructive' : isLow ? 'text-orange-600' : ''}`}
        data-testid="text-trinity-header-balance"
      >
        {balance.toLocaleString()}
      </span>
      {isLow && !isCritical && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-orange-500 text-orange-600">
          LOW
        </Badge>
      )}
      {isCritical && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          EMPTY
        </Badge>
      )}
    </Button>
  );
}

export function FeatureLockedOverlay({ 
  featureKey, 
  children 
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
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            {gateResult?.reason || 'Feature locked'}
          </p>
          {gateResult?.requiredAction === 'purchase_credits' && (
            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-unlock-feature">
              <ShoppingCart className="h-3 w-3" />
              Buy Credits
            </Button>
          )}
          {gateResult?.requiredAction === 'complete_onboarding' && (
            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-complete-onboarding">
              Complete Setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
