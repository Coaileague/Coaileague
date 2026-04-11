import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { ResponsiveLoading } from "@/components/loading-indicators";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Cpu, 
  TrendingDown, 
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Calendar,
  History,
  Zap
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCreditMonitor } from "@/hooks/use-credit-monitor";

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
  creditsUsedThisPeriod?: number;
  tokensUsed?: number;
  tokensAllowance?: number | null;
  overageTokens?: number;
  overageAmountCents?: number;
}

interface CreditUsageBreakdown {
  featureKey: string;
  featureName: string;
  totalCredits: number;
  operationCount: number;
}

interface CreditTransaction {
  id: string;
  transactionType: string;
  amount: number;
  balanceAfter: number;
  featureKey: string | null;
  featureName: string | null;
  description: string | null;
  createdAt: string;
}

const FEATURE_LABELS: Record<string, string> = {
  'trinity_action': 'Trinity AI',
  'ai_scheduling': 'Smart Scheduling',
  'ai_general': 'General AI Assistant',
  'ai_notification': 'Smart Notifications',
  'ai_email_classification': 'Email Sorting',
  'ai_shift_extraction': 'Shift Detection',
  'dynamic_motd': 'Daily Briefing',
  'usage_metering': 'Usage Tracking',
  'trinity_chat': 'Trinity Chat',
  'trinity_thought': 'Trinity Thinking',
  'trinity_insight': 'Trinity Insight',
  'ai_invoicing': 'Smart Invoicing',
  'ai_payroll': 'Payroll Processing',
  'ai_analytics': 'Analytics & Reports',
  'ai_sentiment': 'Team Sentiment',
  'ai_onboarding': 'Employee Onboarding',
  'ai_compliance': 'Compliance Check',
  'ai_dispute': 'Dispute Resolution',
  'ai_document_extraction': 'Document Reading',
  'ai_issue_detection': 'Issue Detection',
  'ai_quick_insight': 'Quick Insight',
  'ai_chat_query': 'AI Chat',
  'ai_vision': 'Image Analysis',
  'email_classification': 'Email Classification',
  'voice': 'Voice Interaction',
  'ai_assist': 'AI Assist',
};

function humanizeRawName(raw: string): string {
  const cleaned = raw
    .replace(/^AI operation:\s*/i, '')
    .replace(/^scheduleos_/i, 'Schedule ')
    .replace(/_/g, ' ')
    .replace(/\bai\b/gi, 'AI')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function humanizeFeatureName(featureKey: string | null, featureName?: string | null): string {
  if (featureKey && FEATURE_LABELS[featureKey]) return FEATURE_LABELS[featureKey];
  if (featureName) return humanizeRawName(featureName);
  if (featureKey) return humanizeRawName(featureKey);
  return 'System Activity';
}

function humanizeTransactionDescription(tx: CreditTransaction): string {
  if (tx.featureKey && FEATURE_LABELS[tx.featureKey]) return FEATURE_LABELS[tx.featureKey];
  if (tx.description) return humanizeRawName(tx.description);
  return humanizeFeatureName(tx.featureKey, tx.featureName);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export default function UsageDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, isLoading: accessLoading } = useWorkspaceAccess();
  const { balance: liveBalance, isUnlimited, daysUntilReset } = useCreditMonitor();
  const [txPage, setTxPage] = useState(0);
  const txLimit = 15;

  const { data: balance, isLoading } = useQuery<CreditBalance>({
    queryKey: ['/api/credits/balance'],
    enabled: isAuthenticated,
  });

  const { data: usage } = useQuery<CreditUsageBreakdown[]>({
    queryKey: ['/api/credits/usage-breakdown'],
    enabled: isAuthenticated,
  });

  const { data: transactions, isLoading: txLoading } = useQuery<CreditTransaction[]>({
    queryKey: ['/api/credits/transactions', { limit: txLimit, offset: txPage * txLimit }],
    enabled: isAuthenticated,
  });

  if (authLoading || !isAuthenticated || accessLoading) {
    return <ResponsiveLoading message="Loading Usage Dashboard..." />;
  }

  if (workspaceRole !== 'org_owner' && workspaceRole !== 'co_owner') {
    const accessDeniedConfig: CanvasPageConfig = {
      id: 'usage-dashboard-denied',
      title: 'Access Denied',
      subtitle: '',
      category: 'error',
    };
    return (
      <CanvasHubPage config={accessDeniedConfig}>
        <div className="flex items-center justify-center h-full">
          <Alert variant="destructive" className="max-w-md" data-testid="alert-permission-denied">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              Only organization owners and administrators can view usage data.
            </AlertDescription>
          </Alert>
        </div>
      </CanvasHubPage>
    );
  }

  const effectiveBalance = liveBalance || balance;
  const isUnlimitedUser = isUnlimited || effectiveBalance?.unlimitedCredits === true;

  // Token-based values (authoritative)
  const tokensUsed = effectiveBalance?.tokensUsed ?? effectiveBalance?.creditsUsedThisPeriod ?? 0;
  const tokensAllowance = effectiveBalance?.tokensAllowance ?? (effectiveBalance?.monthlyAllocation !== -1 ? effectiveBalance?.monthlyAllocation : null) ?? null;
  const usagePercent = !isUnlimitedUser && tokensAllowance
    ? Math.min(100, (tokensUsed / tokensAllowance) * 100) : 0;

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toLocaleString();
  }

  const pageConfig: CanvasPageConfig = {
    id: 'usage-dashboard',
    title: 'Usage Dashboard',
    subtitle: 'Monitor your monthly AI token usage and allowance',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="page-usage-dashboard">
        {/* Tier & Token Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-subscription-tier">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Subscription Tier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge data-testid="badge-tier">
                {(effectiveBalance?.subscriptionTier || 'standard').toUpperCase()}
              </Badge>
            </CardContent>
          </Card>

          <Card data-testid="card-current-balance">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Tokens Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isUnlimitedUser ? (
                <div className="text-2xl font-bold text-foreground" data-testid="text-balance">Unlimited</div>
              ) : (
                <div className="text-2xl font-bold text-foreground" data-testid="text-balance">
                  {formatTokens(tokensUsed)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {isUnlimitedUser ? 'Tracked monthly for review' : tokensAllowance ? `of ${formatTokens(tokensAllowance)} monthly allowance` : 'this billing period'}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-credits-spent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Overage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-spent">
                {formatTokens(effectiveBalance?.overageTokens ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {(effectiveBalance?.overageAmountCents ?? 0) > 0
                  ? `~$${((effectiveBalance?.overageAmountCents ?? 0) / 100).toFixed(2)} billed at month-end`
                  : 'No overage this period'}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-reset-info">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Period Resets In
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-reset-days">
                {daysUntilReset} days
              </div>
              <p className="text-xs text-muted-foreground mt-1">Monthly usage period</p>
            </CardContent>
          </Card>
        </div>

        {/* Token Usage Progress */}
        {!isUnlimitedUser && tokensAllowance && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium">Monthly Token Usage</span>
                <span className="text-sm text-muted-foreground">{Math.round(usagePercent)}% used</span>
              </div>
              <Progress value={usagePercent} className="h-2" data-testid="progress-monthly-usage" />
              <div className="flex items-center justify-between gap-1 mt-2 text-xs text-muted-foreground">
                <span>{formatTokens(tokensUsed)} used</span>
                <span>{formatTokens(tokensAllowance)} allowance</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Token Usage Breakdown by Action */}
        {usage && usage.length > 0 && (
          <Card data-testid="card-ai-usage">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    Token Usage by Action
                  </CardTitle>
                  <CardDescription>How your token usage is distributed this month</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usage.map((item) => {
                  const total = usage.reduce((s, u) => s + u.totalCredits, 0);
                  const pct = total > 0 ? (item.totalCredits / total) * 100 : 0;
                  return (
                    <div key={item.featureKey} data-testid={`row-feature-${item.featureKey}`}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {humanizeFeatureName(item.featureKey, item.featureName)}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatTokens(item.totalCredits)} tokens · {item.operationCount} calls
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Token Usage */}
        <Card data-testid="card-recent-transactions">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Recent Token Usage
                </CardTitle>
                <CardDescription>Latest AI token consumption events</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={txPage === 0} onClick={() => setTxPage(p => Math.max(0, p - 1))} data-testid="button-tx-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">Page {txPage + 1}</span>
                <Button variant="outline" size="sm" disabled={!transactions || transactions.length < txLimit} onClick={() => setTxPage(p => p + 1)} data-testid="button-tx-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={`skeleton-${i}`} className="h-12 bg-muted rounded animate-pulse" />)}
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No token usage recorded yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 py-2.5 px-3 rounded-md hover-elevate" data-testid={`row-tx-${tx.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {humanizeTransactionDescription(tx)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                    </div>
                    <span className="text-sm font-mono font-medium text-foreground flex-shrink-0">
                      +{tx.amount.toLocaleString()} tokens
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Notice */}
        <Alert data-testid="alert-info">
          <Cpu className="h-4 w-4" />
          <AlertTitle>About AI Tokens</AlertTitle>
          <AlertDescription>
            Tokens are the unit of AI computation. Every Trinity action, scheduling optimization, payroll analysis,
            and automation consumes tokens. Your plan includes a monthly token allowance. Usage above your allowance
            is tracked and billed at $2.00 per 100,000 tokens at month-end.
          </AlertDescription>
        </Alert>
      </div>
    </CanvasHubPage>
  );
}
