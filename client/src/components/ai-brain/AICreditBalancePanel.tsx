import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  ExternalLink,
  AlertCircle,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProviderBalance {
  provider: string;
  displayName: string;
  status: "active" | "low_balance" | "inactive" | "error";
  balance?: { available: number; currency: string };
  dashboardUrl?: string;
  error?: string;
  lastChecked?: string;
}

export interface BalancesResponse {
  success: boolean;
  providers: ProviderBalance[];
  summary: {
    totalProviders: number;
    activeProviders: number;
    providersWithWarnings: number;
    lastUpdated: string;
  };
}

interface AICreditBalancePanelProps {
  canRefresh?: boolean;
  showDashboardLinks?: boolean;
}

export function AICreditBalancePanel({
  canRefresh = true,
  showDashboardLinks = true,
}: AICreditBalancePanelProps) {
  const { toast } = useToast();

  const { data: balanceData, isLoading, isFetching } = useQuery<BalancesResponse>({
    queryKey: ["/api/ai-brain/providers/balances"],
    staleTime: 90000,
    refetchInterval: 120000,
  });

  const forceRefreshMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/ai-brain/providers/balances?refresh=true"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-brain/providers/balances"] });
      toast({ title: "Refreshed", description: "Provider balances updated." });
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Could not fetch balances.",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    if (status === "active") return "text-green-500";
    if (status === "low_balance") return "text-amber-500";
    if (status === "inactive") return "text-muted-foreground";
    return "text-red-500";
  };

  const getStatusDot = (status: string) => {
    if (status === "active") return "bg-green-500";
    if (status === "low_balance") return "bg-amber-500 animate-pulse";
    if (status === "inactive") return "bg-muted-foreground";
    return "bg-red-500 animate-pulse";
  };

  const hasWarnings = (balanceData?.summary?.providersWithWarnings ?? 0) > 0;

  return (
    <div
      className={`rounded-lg p-5 border space-y-4 ${
        hasWarnings ? "bg-amber-500/5 border-amber-500/30" : "bg-card border-border"
      }`}
      data-testid="panel-ai-credit-balance"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasWarnings ? "bg-amber-500/10" : "bg-muted"}`}>
            <DollarSign className={`w-5 h-5 ${hasWarnings ? "text-amber-500" : "text-foreground"}`} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">AI Credits</p>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : hasWarnings
                ? `${balanceData?.summary.providersWithWarnings} provider(s) low`
                : `${balanceData?.summary.activeProviders ?? 0} active providers`}
            </p>
          </div>
        </div>
        {canRefresh && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={forceRefreshMutation.isPending || isFetching}
            onClick={() => forceRefreshMutation.mutate()}
            data-testid="button-refresh-balances"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                forceRefreshMutation.isPending || isFetching ? "animate-spin" : ""
              }`}
            />
          </Button>
        )}
      </div>

      {!isLoading &&
        balanceData?.providers?.map((provider) => (
          <div key={provider.provider} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusDot(provider.status)}`} />
                <span className="text-sm font-medium text-foreground">{provider.displayName}</span>
              </div>
              <div className="flex items-center gap-2">
                {provider.status === "low_balance" && (
                  <div className="flex items-center gap-1 text-amber-500">
                    <TrendingDown className="w-3 h-3" />
                    <span className="text-[10px] font-medium">LOW</span>
                  </div>
                )}
                <span className={`text-xs font-medium ${getStatusColor(provider.status)}`}>
                  {provider.status === "active"
                    ? "Active"
                    : provider.status === "low_balance"
                    ? "Low Balance"
                    : provider.status === "inactive"
                    ? "Inactive"
                    : "Error"}
                </span>
                {showDashboardLinks && provider.dashboardUrl && (
                  <a
                    href={provider.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={`Top up ${provider.displayName}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {provider.balance?.available != null && provider.balance.available !== -1 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      provider.status === "low_balance" ? "bg-amber-500" : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(5, (provider.balance.available / 200) * 100))}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  ${provider.balance.available.toFixed(2)}
                </span>
              </div>
            )}

            {provider.balance?.available === -1 && (
              <p className="text-[10px] text-muted-foreground pl-4">
                Usage-based — check dashboard
              </p>
            )}

            {provider.error && (
              <p className="text-[10px] text-red-400 pl-4 truncate">{provider.error}</p>
            )}
          </div>
        ))}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 bg-muted/40 rounded animate-pulse w-2/3" />
              <div className="h-1.5 bg-muted/40 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {showDashboardLinks && hasWarnings &&
        balanceData?.providers
          ?.filter((p) => p.status === "low_balance")
          .map(
            (p) =>
              p.dashboardUrl && (
                <div
                  key={p.provider}
                  className="flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-md"
                >
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-200">{p.displayName} balance is low</p>
                    <p className="text-[10px] text-amber-400/70">
                      Refill to avoid service interruption
                    </p>
                  </div>
                  <a
                    href={p.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <Button
                      size="sm"
                      className="h-6 text-[10px] px-2 bg-amber-500 hover:bg-amber-600 text-black"
                    >
                      Refill
                    </Button>
                  </a>
                </div>
              ),
          )}

      {balanceData?.summary?.lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-right">
          Updated {new Date(balanceData.summary.lastUpdated).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
