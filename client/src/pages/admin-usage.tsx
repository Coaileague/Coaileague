import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { 
  Cpu, History,
  Zap, Calendar, TrendingDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { useTokenMonitor } from "@/hooks/use-token-monitor";

interface CreditBalance {
  currentBalance: number;
  monthlyAllocation: number;
  totalTokensUsed?: number;
  lastResetAt: string;
  nextResetAt: string;
  subscriptionTier: string;
  unlimited?: boolean;
  creditsUsedThisPeriod?: number;
  // Token fields (authoritative)
  tokensUsed?: number;
  tokensAllowance?: number | null;
  overageTokens?: number;
  overageAmountCents?: number;
}

interface CreditTransaction {
  id: string;
  workspaceId: string;
  userId: string | null;
  transactionType: string;
  amount: number;
  balanceAfter: number;
  featureKey: string | null;
  featureName: string | null;
  creditPackId: string | null;
  description: string | null;
  createdAt: string;
}

interface CreditUsageBreakdown {
  featureKey: string;
  featureName: string;
  totalCredits: number;
  operationCount: number;
}

const FRIENDLY_ACTION_NAMES: Record<string, string> = {
  // AI action types from token_usage_log
  'trinity_action': 'Trinity AI',
  'trinity_chat': 'Trinity Chat',
  'trinity_thought': 'Trinity Thinking',
  'trinity_insight': 'Trinity Insight',
  'ai_scheduling': 'AI Scheduling',
  'ai_invoicing': 'AI Invoicing',
  'ai_payroll': 'AI Payroll',
  'ai_analytics': 'AI Analytics',
  'ai_sentiment': 'Sentiment Analysis',
  'ai_onboarding': 'AI Onboarding',
  'ai_compliance': 'Compliance Check',
  'ai_dispute': 'Dispute Resolution',
  'ai_health_monitoring': 'Health Monitoring',
  'ai_document_extraction': 'Document Extraction',
  'ai_issue_detection': 'Issue Detection',
  'ai_quick_insight': 'Quick Insight',
  'ai_chat_query': 'AI Chat',
  'ai_vision': 'Vision Analysis',
  'email_classification': 'Email Classification',
  'voice': 'Voice Interaction',
  'ai_assist': 'AI Assist',
};

function getActionName(featureKey: string | null, featureName: string | null, transactionType: string): string {
  if (featureKey && FRIENDLY_ACTION_NAMES[featureKey]) return FRIENDLY_ACTION_NAMES[featureKey];
  if (featureName) return featureName;
  if (featureKey) return featureKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return transactionType.charAt(0).toUpperCase() + transactionType.slice(1);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminUsage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { balance: liveBalance, isUnlimited, daysUntilReset } = useTokenMonitor();
  const [txPage, setTxPage] = useState(0);
  const txLimit = 20;

  const { data: balance, isLoading: balanceLoading } = useQuery<CreditBalance>({
    queryKey: ['/api/usage/tokens'],
    enabled: isAuthenticated,
  });

  const { data: usage } = useQuery<CreditUsageBreakdown[]>({
    queryKey: ['/api/usage/token-breakdown'],
    enabled: isAuthenticated,
  });

  const { data: transactions, isLoading: txLoading } = useQuery<CreditTransaction[]>({
    queryKey: ['/api/usage/token-log', { limit: txLimit, offset: txPage * txLimit }],
    enabled: isAuthenticated,
  });

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const effectiveBalance = liveBalance || balance;
  const isUnlimitedUser = isUnlimited || effectiveBalance?.unlimited === true ||
    (effectiveBalance?.monthlyAllocation && effectiveBalance.monthlyAllocation > 999_999_999);

  // Token-based values (authoritative) with fallback to legacy credit fields
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
    id: 'ai-usage-ledger',
    title: 'AI Usage',
    subtitle: 'Track your monthly AI token usage and history included in your plan',
    category: 'admin',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="page-credit-usage">
        {/* Token Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <Card data-testid="card-current-balance">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4 shrink-0" />
                <span className="truncate">Tokens Used</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <div className="h-9 bg-muted rounded animate-pulse" />
              ) : isUnlimitedUser ? (
                <div className="text-xl sm:text-3xl font-bold text-foreground truncate" data-testid="text-balance">Unlimited</div>
              ) : (
                <>
                  <div className="text-xl sm:text-3xl font-bold truncate text-foreground" data-testid="text-balance">
                    {formatTokens(tokensUsed)}
                  </div>
                  {tokensAllowance && (
                    <p className="text-xs text-muted-foreground mt-1">
                      of {formatTokens(tokensAllowance)} monthly allowance
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-credits-used">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 shrink-0" />
                <span className="truncate">Overage Tokens</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              {balanceLoading ? (
                <div className="h-9 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-xl sm:text-3xl font-bold truncate" data-testid="text-used">
                    {formatTokens(effectiveBalance?.overageTokens ?? 0)}
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
                    {(effectiveBalance?.overageAmountCents ?? 0) > 0
                      ? `~$${((effectiveBalance?.overageAmountCents ?? 0) / 100).toFixed(2)} billed at month-end`
                      : 'No overage this period'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-reset-info">
            <CardHeader className="p-3 sm:px-6 sm:pt-6 pb-1 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="truncate">Period Resets</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="text-xl sm:text-3xl font-bold truncate" data-testid="text-days-reset">
                {daysUntilReset} days
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {effectiveBalance?.nextResetAt ? formatShortDate(effectiveBalance.nextResetAt) : 'Allowance resets monthly'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Token Usage Progress Bar */}
        {!isUnlimitedUser && tokensAllowance && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium">Monthly Token Usage</span>
                <span className="text-sm text-muted-foreground">{Math.round(usagePercent)}% used</span>
              </div>
              <Progress value={usagePercent} className="h-2" data-testid="progress-usage" />
              <div className="flex items-center justify-between gap-1 mt-2 text-xs text-muted-foreground">
                <span>{formatTokens(tokensUsed)} used</span>
                <span>{formatTokens(tokensAllowance)} allowance</span>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Usage Breakdown by Action Type */}
        {usage && usage.length > 0 && (
          <Card data-testid="card-usage-breakdown">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Token Usage Breakdown
              </CardTitle>
              <CardDescription>Tokens consumed per action type this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usage.map((item) => {
                  const totalUsed = usage.reduce((sum, u) => sum + u.totalCredits, 0);
                  const pct = totalUsed > 0 ? (item.totalCredits / totalUsed) * 100 : 0;
                  return (
                    <div key={item.featureKey} className="flex items-center justify-between gap-4" data-testid={`row-usage-${item.featureKey}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-sm font-medium truncate">
                            {FRIENDLY_ACTION_NAMES[item.featureKey] || item.featureName}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2 flex-shrink-0">
                            {formatTokens(item.totalCredits)} tokens · {item.operationCount} calls
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Token Usage Log */}
        <Card data-testid="card-transaction-ledger">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Token Usage Log
                </CardTitle>
                <CardDescription>Complete history of AI token consumption</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={txPage === 0}
                  onClick={() => setTxPage(p => Math.max(0, p - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {txPage + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!transactions || transactions.length < txLimit}
                  onClick={() => setTxPage(p => p + 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : !transactions || transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-transactions">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No token usage recorded yet</p>
                <p className="text-xs mt-1">Token usage will appear here as AI features are used</p>
              </div>
            ) : (
              <div className="space-y-1" data-testid="list-transactions">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3 py-2 border-b">
                  <div className="col-span-3">Date</div>
                  <div className="col-span-5">Action · Model</div>
                  <div className="col-span-4 text-right">Tokens</div>
                </div>
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-md hover-elevate"
                    data-testid={`row-transaction-${tx.id}`}
                  >
                    <div className="col-span-3 text-sm text-muted-foreground">
                      {formatDate(tx.createdAt)}
                    </div>
                    <div className="col-span-5 min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {getActionName(tx.featureKey, tx.featureName, tx.transactionType)}
                      </span>
                      {tx.description && (
                        <span className="text-xs text-muted-foreground truncate block">{tx.description}</span>
                      )}
                    </div>
                    <div className="col-span-4 text-right text-sm font-mono font-medium text-foreground">
                      {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-seat plan notice */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Per-Seat Plan — Tokens Tracked Monthly</p>
                <p className="text-sm text-muted-foreground">You are billed per seat. Each tier includes a monthly token allowance. Usage beyond your allowance is billed at $2.00 per 100,000 tokens at month-end.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
