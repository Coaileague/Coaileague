import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  AlertTriangle, CheckCircle, Database, Mail, CreditCard,
  Zap, RefreshCw
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WFLogoCompact } from "@/components/wf-logo";

export default function AdminUsage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: stats } = useQuery({
    queryKey: ['/api/analytics/stats', refreshKey],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[hsl(var(--cad-background))] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[hsl(var(--cad-blue))] border-t-transparent rounded-full" />
      </div>
    );
  }

  // Simulated credit data - Replace with actual API call when available
  const creditBalance = 100.00; // Your $100 credit
  const creditUsed = 12.50; // Estimated usage so far
  const creditRemaining = creditBalance - creditUsed;
  const usagePercent = (creditUsed / creditBalance) * 100;

  // Cost estimations
  const totalWorkspaces = (stats as any)?.totalEmployees || 0;
  const monthlyEmailsSent = 450; // Estimated
  const monthlyDatabaseSize = 2.5; // GB
  
  // Per-service costs (monthly estimates)
  const costs = {
    database: totalWorkspaces * 0.30, // $0.30 per workspace
    email: monthlyEmailsSent * 0.01, // $0.01 per email
    compute: 8.00, // Fixed hosting cost
    stripe: 0, // Transaction fees passed to customers
  };

  const totalMonthlyCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const projectedMonthsRemaining = creditRemaining / totalMonthlyCost;
  const needsRecharge = projectedMonthsRemaining < 2;

  // Revenue data
  const monthlyRevenue = 799; // Professional tier example
  const profitMargin = ((monthlyRevenue - totalMonthlyCost) / monthlyRevenue) * 100;

  return (
    <div className="p-4 sm:p-6 lg:p-5 max-w-7xl mx-auto w-full h-full overflow-auto">
      <div className="p-4 sm:p-6 lg:p-5 max-w-7xl mx-auto w-full">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 sm:h-12 sm:w-12 rounded-lg bg-gradient-to-br from-blue-900 to-indigo-800 flex items-center justify-center shadow-md shadow-blue-900/30 p-2">
                <WFLogoCompact size={28} />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="text-usage-title">
                  Platform Usage & Credits
                </h2>
                <p className="text-sm sm:text-base text-[hsl(var(--cad-text-secondary))]">
                  Monitor operational costs and credit balance
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey(prev => prev + 1)}
              data-testid="button-refresh-usage"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Credit Balance Alert */}
          {needsRecharge && (
            <Card className="bg-gradient-to-br from-[hsl(var(--cad-orange))]/10 to-[hsl(var(--cad-red))]/10 border-[hsl(var(--cad-orange))] p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-6 w-6 text-[hsl(var(--cad-orange))] flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[hsl(var(--cad-text-primary))] mb-2">
                    Low Credit Balance Warning
                  </h3>
                  <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-4">
                    Your credit balance is running low. At current usage, you have approximately{" "}
                    <span className="font-bold text-[hsl(var(--cad-orange))]">
                      {projectedMonthsRemaining.toFixed(1)} months
                    </span>{" "}
                    of credits remaining. We recommend recharging soon to avoid service interruption.
                  </p>
                  <Button
                    className="bg-[hsl(var(--cad-orange))] hover:bg-[hsl(var(--cad-orange))]/90 text-white"
                    onClick={() => window.open('https://replit.com/pricing', '_blank')}
                    data-testid="button-recharge-credits"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Add Credits to Replit Account
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Credit Balance Overview */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6" data-testid="card-total-credits">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 rounded-lg bg-[hsl(var(--cad-blue))]/10 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-[hsl(var(--cad-blue))]" />
                </div>
                <Badge className="bg-[hsl(var(--cad-blue))]/10 text-[hsl(var(--cad-blue))] border-none">
                  Initial Balance
                </Badge>
              </div>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Total Credits Added</p>
              <p className="text-3xl font-bold font-mono">${creditBalance.toFixed(2)}</p>
            </Card>

            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6" data-testid="card-used-credits">
              <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 rounded-lg bg-[hsl(var(--cad-red))]/10 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-[hsl(var(--cad-red))]" />
                </div>
                <Badge className="bg-[hsl(var(--cad-red))]/10 text-[hsl(var(--cad-red))] border-none">
                  {usagePercent.toFixed(1)}% Used
                </Badge>
              </div>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Credits Used</p>
              <p className="text-3xl font-bold font-mono text-[hsl(var(--cad-red))]">
                ${creditUsed.toFixed(2)}
              </p>
            </Card>

            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6" data-testid="card-remaining-credits">
              <div className="flex items-center justify-between mb-4">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                  needsRecharge 
                    ? 'bg-[hsl(var(--cad-orange))]/10' 
                    : 'bg-[hsl(var(--cad-green))]/10'
                }`}>
                  {needsRecharge ? (
                    <AlertTriangle className="h-6 w-6 text-[hsl(var(--cad-orange))]" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-[hsl(var(--cad-green))]" />
                  )}
                </div>
                <Badge className={`border-none ${
                  needsRecharge
                    ? 'bg-[hsl(var(--cad-orange))]/10 text-[hsl(var(--cad-orange))]'
                    : 'bg-[hsl(var(--cad-green))]/10 text-[hsl(var(--cad-green))]'
                }`}>
                  {needsRecharge ? 'Recharge Soon' : 'Healthy'}
                </Badge>
              </div>
              <p className="text-sm text-[hsl(var(--cad-text-secondary))] mb-2">Credits Remaining</p>
              <p className={`text-3xl font-bold font-mono ${
                needsRecharge ? 'text-[hsl(var(--cad-orange))]' : 'text-[hsl(var(--cad-green))]'
              }`}>
                ${creditRemaining.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* Credit Usage Progress */}
          <Card className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-6">
            <h3 className="text-lg font-semibold mb-4">Credit Usage</h3>
            <Progress value={usagePercent} className="h-3 mb-2" />
            <div className="flex justify-between text-sm text-[hsl(var(--cad-text-secondary))]">
              <span>${creditUsed.toFixed(2)} used</span>
              <span>${creditRemaining.toFixed(2)} remaining</span>
            </div>
          </Card>

          {/* Monthly Cost Breakdown */}
          <Card className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-6">
            <h3 className="text-lg font-semibold mb-6">Monthly Cost Breakdown</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[hsl(var(--cad-surface-elevated))] rounded-lg">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-[hsl(var(--cad-blue))]" />
                  <div>
                    <p className="font-medium text-sm">Database Storage</p>
                    <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                      {totalWorkspaces} workspaces × $0.30
                    </p>
                  </div>
                </div>
                <p className="font-mono font-semibold">${costs.database.toFixed(2)}</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-[hsl(var(--cad-surface-elevated))] rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-[hsl(var(--cad-purple))]" />
                  <div>
                    <p className="font-medium text-sm">Email Sending (Resend)</p>
                    <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                      {monthlyEmailsSent} emails × $0.01
                    </p>
                  </div>
                </div>
                <p className="font-mono font-semibold">${costs.email.toFixed(2)}</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-[hsl(var(--cad-surface-elevated))] rounded-lg">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-[hsl(var(--cad-cyan))]" />
                  <div>
                    <p className="font-medium text-sm">Compute & Hosting</p>
                    <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                      Replit hosting fixed cost
                    </p>
                  </div>
                </div>
                <p className="font-mono font-semibold">${costs.compute.toFixed(2)}</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-[hsl(var(--cad-surface-elevated))] rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-[hsl(var(--cad-green))]" />
                  <div>
                    <p className="font-medium text-sm">Stripe Transaction Fees</p>
                    <p className="text-xs text-[hsl(var(--cad-text-tertiary))]">
                      Passed to customers (2.9% + $0.30)
                    </p>
                  </div>
                </div>
                <p className="font-mono font-semibold text-[hsl(var(--cad-text-tertiary))]">$0.00</p>
              </div>

              <div className="pt-4 border-t border-[hsl(var(--cad-border))] flex items-center justify-between">
                <p className="font-semibold text-lg">Total Monthly Cost</p>
                <p className="text-2xl font-bold font-mono text-[hsl(var(--cad-text-primary))]">
                  ${totalMonthlyCost.toFixed(2)}
                </p>
              </div>
            </div>
          </Card>

          {/* Profit Margin Analysis */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gradient-to-br from-[hsl(var(--cad-green))]/10 via-[hsl(var(--cad-surface-elevated))] to-[hsl(var(--cad-cyan))]/10 border-[hsl(var(--cad-border-strong))] p-6">
              <h3 className="text-lg font-semibold mb-4">Profitability Analysis</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[hsl(var(--cad-text-secondary))]">Monthly Revenue (Example)</span>
                  <span className="font-mono font-semibold text-[hsl(var(--cad-green))]">
                    +${monthlyRevenue.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[hsl(var(--cad-text-secondary))]">Operating Costs</span>
                  <span className="font-mono font-semibold text-[hsl(var(--cad-red))]">
                    -${totalMonthlyCost.toFixed(2)}
                  </span>
                </div>
                <div className="pt-3 border-t border-[hsl(var(--cad-border))] flex justify-between items-center">
                  <span className="font-semibold">Net Profit</span>
                  <span className="text-xl font-mono font-bold text-[hsl(var(--cad-green))]">
                    ${(monthlyRevenue - totalMonthlyCost).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-[hsl(var(--cad-green))]" />
                  <span className="text-[hsl(var(--cad-text-secondary))]">
                    Profit Margin: 
                    <span className="font-bold text-[hsl(var(--cad-green))] ml-1">
                      {profitMargin.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            </Card>

            <Card className="bg-[hsl(var(--cad-surface-elevated))] border-[hsl(var(--cad-border-strong))] p-6">
              <h3 className="text-lg font-semibold mb-4">Runway Projection</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[hsl(var(--cad-text-secondary))]">Current Balance</span>
                  <span className="font-mono font-semibold">${creditRemaining.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[hsl(var(--cad-text-secondary))]">Monthly Burn Rate</span>
                  <span className="font-mono font-semibold text-[hsl(var(--cad-red))]">
                    ${totalMonthlyCost.toFixed(2)}
                  </span>
                </div>
                <div className="pt-3 border-t border-[hsl(var(--cad-border))] flex justify-between items-center">
                  <span className="font-semibold">Months Remaining</span>
                  <span className={`text-xl font-mono font-bold ${
                    needsRecharge ? 'text-[hsl(var(--cad-orange))]' : 'text-[hsl(var(--cad-cyan))]'
                  }`}>
                    {projectedMonthsRemaining.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {needsRecharge ? (
                    <AlertTriangle className="h-4 w-4 text-[hsl(var(--cad-orange))]" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--cad-green))]" />
                  )}
                  <span className={needsRecharge 
                    ? "text-[hsl(var(--cad-orange))]" 
                    : "text-[hsl(var(--cad-text-secondary))]]"
                  }>
                    {needsRecharge 
                      ? "Recharge recommended within 30 days" 
                      : "Credit balance is healthy"
                    }
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card className="bg-[hsl(var(--cad-surface))] border-[hsl(var(--cad-border))] p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => window.open('https://replit.com/pricing', '_blank')}
              >
                <CreditCard className="h-5 w-5" />
                <span>Add Credits</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => window.location.href = '/analytics'}
              >
                <Activity className="h-5 w-5" />
                <span>View Analytics</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => window.location.href = '/pricing'}
              >
                <DollarSign className="h-5 w-5" />
                <span>View Pricing</span>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
