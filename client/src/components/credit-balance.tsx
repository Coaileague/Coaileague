/**
 * Credit Balance Display Component
 * Shows workspace automation credit balance with monthly allocation and usage breakdown
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { Coins, TrendingUp, Calendar, ShoppingCart, Zap, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { BuyCreditsModal } from './buy-credits-modal';
import { useAuth } from '@/hooks/useAuth';

interface CreditBalance {
  currentBalance: number;
  monthlyAllocation: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  totalCreditsPurchased: number;
  lastResetAt: string;
  nextResetAt: string;
  subscriptionTier: string;
  unlimitedCredits?: boolean;
}

interface CreditUsageBreakdown {
  featureKey: string;
  featureName: string;
  totalCredits: number;
  operationCount: number;
}

export function CreditBalanceCard({ onBuyCredits }: { onBuyCredits?: () => void }) {
  const [showBuyModal, setShowBuyModal] = useState(false);
  const { user } = useAuth();
  const { data: accessData } = useQuery<{ workspaceId?: string }>({
    queryKey: ['/api/workspace/access'],
  });
  
  // Get workspaceId from user or from access data
  const workspaceId = user?.currentWorkspaceId || accessData?.workspaceId;
  
  const { data: balance, isLoading, error } = useQuery<CreditBalance>({
    queryKey: ['/api/credits/balance', workspaceId],
    enabled: !!workspaceId,
    retry: 1,
  });

  const { data: usage } = useQuery<CreditUsageBreakdown[]>({
    queryKey: ['/api/credits/usage-breakdown', workspaceId],
    enabled: !!workspaceId,
    retry: 1,
  });

  const handleBuyClick = () => {
    if (onBuyCredits) {
      onBuyCredits();
    } else {
      setShowBuyModal(true);
    }
  };

  if (isLoading || !balance) {
    return (
      <Card data-testid="card-credit-balance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Automation Credits
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

  // Check if user has unlimited credits (unlimitedCredits flag, monthlyAllocation is -1, or very high balance)
  const isUnlimited = balance.unlimitedCredits === true || balance.monthlyAllocation === -1 || balance.monthlyAllocation > 999999;
  
  const usagePercent = isUnlimited ? 0 : (balance.monthlyAllocation > 0 
    ? ((balance.monthlyAllocation - balance.currentBalance) / balance.monthlyAllocation) * 100 
    : 0);
  
  const isLow = isUnlimited ? false : (balance.currentBalance < balance.monthlyAllocation * 0.2); // Less than 20%
  const isCritical = isUnlimited ? false : (balance.currentBalance === 0);

  const daysUntilReset = balance.nextResetAt 
    ? Math.ceil((new Date(balance.nextResetAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Card data-testid="card-credit-balance" className={isCritical ? 'border-destructive' : isLow ? 'border-orange-500' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle>Automation Credits</CardTitle>
          </div>
          <Badge variant={isCritical ? 'destructive' : isLow ? 'outline' : 'secondary'} data-testid="badge-tier">
            {balance.subscriptionTier.toUpperCase()}
          </Badge>
        </div>
        <CardDescription>
          Powers AI scheduling, invoicing, payroll & more
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Balance */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Current Balance</span>
            {isUnlimited ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-green-600" data-testid="text-current-balance">
                  Unlimited
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${isCritical ? 'text-destructive' : isLow ? 'text-orange-600' : 'text-foreground'}`} data-testid="text-current-balance">
                  {balance.currentBalance.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">/ {balance.monthlyAllocation.toLocaleString()}</span>
              </div>
            )}
          </div>
          
          {!isUnlimited && <Progress value={100 - usagePercent} className="h-2" data-testid="progress-credit-usage" />}
          
          <p className="text-xs text-muted-foreground">
            {isUnlimited ? 'Unlimited credits - automations never pause' : `${balance.currentBalance} credits remaining this month`}
          </p>
        </div>

        {/* Low Credit Warning */}
        {isLow && !isCritical && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg" data-testid="alert-low-credits">
            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900">Running Low on Credits</p>
              <p className="text-xs text-orange-700 mt-1">
                You've used {Math.round(usagePercent)}% of your monthly allocation. Consider purchasing more credits to keep automations running.
              </p>
            </div>
          </div>
        )}

        {/* Critical: Out of Credits */}
        {isCritical && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive rounded-lg" data-testid="alert-no-credits">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Out of Credits</p>
              <p className="text-xs text-destructive/80 mt-1">
                All AI automations are paused. Purchase credits to resume scheduling, invoicing, and payroll automation.
              </p>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Resets In
            </div>
            <p className="text-sm font-medium" data-testid="text-reset-days">
              {daysUntilReset} days
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              Purchased
            </div>
            <p className="text-sm font-medium" data-testid="text-purchased-credits">
              {balance.totalCreditsPurchased.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Usage Breakdown */}
        {usage && usage.length > 0 && (
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">This Month's Usage</p>
            <div className="space-y-1.5">
              {usage.slice(0, 3).map((item) => (
                <div key={item.featureKey} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.featureName}</span>
                  <span className="font-medium">{item.totalCredits} credits</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buy Credits Button - hidden for unlimited users */}
        {!isUnlimited && (
          <Button 
            onClick={handleBuyClick} 
            className="w-full gap-2"
            variant={isCritical ? 'default' : 'outline'}
            data-testid="button-buy-credits"
          >
            <ShoppingCart className="h-4 w-4" />
            {isCritical ? 'Buy Credits Now' : 'Buy More Credits'}
          </Button>
        )}
      </CardContent>
      
      <BuyCreditsModal open={showBuyModal} onOpenChange={setShowBuyModal} />
    </Card>
  );
}

/**
 * Compact credit balance badge for header display
 */
export function CreditBalanceBadge({ onClick }: { onClick?: () => void }) {
  const { data: balance, isLoading } = useQuery<CreditBalance>({
    queryKey: ['/api/credits/balance'],
  });

  if (isLoading || !balance) {
    return (
      <Button variant="ghost" size="sm" disabled data-testid="button-credits-header">
        <Coins className="h-4 w-4 mr-1.5" />
        <span className="text-sm">...</span>
      </Button>
    );
  }

  // Check if user has unlimited credits
  const isUnlimited = balance.unlimitedCredits === true || balance.monthlyAllocation === -1 || balance.monthlyAllocation > 999999;
  const isLow = isUnlimited ? false : balance.currentBalance < balance.monthlyAllocation * 0.2;
  const isCritical = isUnlimited ? false : balance.currentBalance === 0;

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={onClick}
      className="gap-1.5"
      data-testid="button-credits-header"
    >
      <Coins className={`h-4 w-4 ${isCritical ? 'text-destructive' : isLow ? 'text-orange-500' : 'text-green-500'}`} />
      <span className={`text-sm font-medium ${isCritical ? 'text-destructive' : isLow ? 'text-orange-600' : isUnlimited ? 'text-green-600' : ''}`} data-testid="text-header-credits">
        {isUnlimited ? 'Unlimited' : balance.currentBalance.toLocaleString()}
      </span>
      {isLow && !isCritical && !isUnlimited && (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-orange-500 text-orange-600">
          LOW
        </Badge>
      )}
      {isCritical && !isUnlimited && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          EMPTY
        </Badge>
      )}
    </Button>
  );
}
