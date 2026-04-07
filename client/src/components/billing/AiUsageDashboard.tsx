import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp, Zap, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";

interface AiUsageData {
  tier: string;
  includedTokensK: number;
  softCapK: number | null;
  geminiTokensK: number;
  claudeTokensK: number;
  gptTokensK: number;
  totalTokensK: number;
  totalCostMicrocents: number;
  overageTokensK: number;
  overageChargesCents: number;
  percentUsed: number;
  daysLeftInPeriod: number;
  periodStart: string;
  periodEnd: string;
  recentCalls: Array<{
    model_name: string;
    call_type: string;
    total_tokens: number;
    cost_microcents: number;
    created_at: string;
  }>;
  dailyHistory: Array<{
    summary_date: string;
    total_tokens_k: number;
    total_cost_microcents: number;
    call_count: number;
  }>;
  empty?: boolean;
}

function formatTokens(k: number): string {
  if (k >= 1000) return `${(k / 1000).toFixed(1)}M`;
  if (k >= 1) return `${k.toFixed(1)}K`;
  return `${Math.round(k * 1000)}`;
}

function formatMicrocents(mc: number): string {
  const cents = mc / 1000000;
  if (cents < 0.01) return `< $0.01`;
  return `$${cents.toFixed(2)}`;
}

function modelLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("gemini")) return "Primary";
  if (n.includes("claude")) return "Judge";
  if (n.includes("gpt")) return "Backbone";
  return "Trinity";
}

function progressColor(pct: number): string {
  if (pct >= 100) return "bg-red-500 dark:bg-red-500";
  if (pct >= 90) return "bg-orange-500 dark:bg-orange-500";
  if (pct >= 80) return "bg-yellow-500 dark:bg-yellow-500";
  return "bg-green-500 dark:bg-green-500";
}

export function AiUsageDashboard() {
  const { data, isLoading } = useQuery<AiUsageData>({
    queryKey: ["/api/billing/ai-usage"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="ai-usage-loading">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!data || data.empty) {
    return (
      <Card data-testid="ai-usage-empty">
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Zap className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">No Trinity AI usage recorded this period yet.</p>
        </CardContent>
      </Card>
    );
  }

  const pct = Math.min(data.percentUsed, 100);
  const isOverCap = data.totalTokensK > (data.includedTokensK ?? 0);
  const isNearCap = !isOverCap && data.percentUsed >= 80;

  return (
    <div className="space-y-4" data-testid="ai-usage-dashboard">
      <Card data-testid="ai-usage-period-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-medium">Trinity AI Usage</CardTitle>
          <div className="flex items-center gap-2">
            {isOverCap && (
              <Badge variant="destructive" data-testid="badge-ai-over-cap">
                Over Cap
              </Badge>
            )}
            {isNearCap && !isOverCap && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400" data-testid="badge-ai-near-cap">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Approaching Limit
              </Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-days-left">
              <Calendar className="h-3 w-3" />
              {data.daysLeftInPeriod}d left
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly token budget</span>
              <span data-testid="text-token-usage">
                <span className="font-medium">{formatTokens(data.totalTokensK)}</span>
                {" "}/{" "}{formatTokens(data.includedTokensK)}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${progressColor(pct)}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
                data-testid="progress-ai-usage"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span data-testid="text-usage-pct">{pct}% used</span>
              {data.softCapK && (
                <span>Soft cap: {formatTokens(data.softCapK)}</span>
              )}
            </div>
          </div>

          {data.overageChargesCents > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm dark:border-orange-800 dark:bg-orange-950" data-testid="alert-overage">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium">{formatTokens(data.overageTokensK)}</span> tokens over budget — estimated{" "}
                  <span className="font-medium">${(data.overageChargesCents / 100).toFixed(2)}</span> overage charge
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Primary AI", value: data.geminiTokensK, testId: "card-primary-ai-tokens" },
          { label: "Judge AI", value: data.claudeTokensK, testId: "card-judge-ai-tokens" },
          { label: "Backbone AI", value: data.gptTokensK, testId: "card-backbone-ai-tokens" },
        ].map((item) => (
          <Card key={item.label} data-testid={item.testId}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className="text-lg font-semibold" data-testid={`text-${item.testId}-value`}>
                {formatTokens(item.value)}
              </p>
              <p className="text-xs text-muted-foreground">tokens</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card data-testid="card-total-cost">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Trinity AI Cost (this period)</p>
            <p className="text-lg font-semibold" data-testid="text-total-cost">
              {formatMicrocents(data.totalCostMicrocents)}
            </p>
            <p className="text-xs text-muted-foreground">provider cost basis</p>
          </CardContent>
        </Card>
        <Card data-testid="card-period-dates">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Billing Period</p>
            <p className="text-sm font-medium" data-testid="text-period-range">
              {data.periodStart ? format(new Date(data.periodStart), "MMM d") : "—"} –{" "}
              {data.periodEnd ? format(new Date(data.periodEnd), "MMM d, yyyy") : "—"}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{data.tier} plan</p>
          </CardContent>
        </Card>
      </div>

      {data.recentCalls && data.recentCalls.length > 0 && (
        <Card data-testid="card-recent-calls">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Trinity Operations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentCalls.slice(0, 8).map((call, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs"
                  data-testid={`row-recent-call-${i}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {modelLabel(call.model_name)}
                    </Badge>
                    <span className="truncate text-muted-foreground">
                      {call.call_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pl-2">
                    <span className="text-muted-foreground">{call.total_tokens.toLocaleString()} tok</span>
                    <span className="text-muted-foreground">
                      {format(new Date(call.created_at), "HH:mm")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
