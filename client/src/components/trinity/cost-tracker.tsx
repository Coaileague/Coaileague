/**
 * COST TRACKER
 * ============
 * Real-time financial impact tracking showing labor costs vs client billing.
 * Shows net profit/loss with budget progress.
 */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import type { CostTracking } from '@/hooks/use-trinity-state';

interface CostTrackerProps {
  costs: CostTracking | null;
  showDetails?: boolean;
}

export function CostTracker({ costs, showDetails = true }: CostTrackerProps) {
  if (!costs) {
    return null;
  }

  const netProfit = costs.billing - costs.labor;
  const isProfit = netProfit >= 0;
  const budgetPercentage = costs.budgetTotal > 0 
    ? (costs.budgetUsed / costs.budgetTotal) * 100 
    : 0;

  const formatCurrency = (value: number): string => {
    return `$${Math.abs(value).toFixed(2)}`;
  };

  return (
    <Card data-testid="panel-cost-tracker">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Financial Impact
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {showDetails && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Labor Costs
              </p>
              <p className="text-sm font-medium">{formatCurrency(costs.labor)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Client Billing
              </p>
              <p className="text-sm font-medium">{formatCurrency(costs.billing)}</p>
            </div>
          </div>
        )}
        
        <div className="p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium">Net Profit</span>
            <div className="flex items-center gap-2">
              {isProfit ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className={`text-sm font-bold ${isProfit ? 'text-emerald-600' : 'text-destructive'}`}>
                {isProfit ? '+' : '-'}{formatCurrency(netProfit)}
              </span>
              <Badge 
                variant="outline" 
                className={isProfit ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' : 'bg-destructive/10 text-destructive border-destructive/30'}
              >
                {isProfit ? 'Profit' : 'Loss'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1 text-xs">
            <span className="text-muted-foreground">Budget Used</span>
            <span className="font-medium">{costs.budgetUsed}/{costs.budgetTotal}</span>
          </div>
          <Progress 
            value={budgetPercentage} 
            className={`h-2 ${budgetPercentage > 90 ? '[&>div]:bg-amber-500' : ''}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
