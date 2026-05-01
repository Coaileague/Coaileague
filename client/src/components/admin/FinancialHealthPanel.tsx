import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, AnyResponse } from "@/lib/apiError";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Plus,
  TrendingUp, TrendingDown, DollarSign, Cpu, CreditCard,
  BarChart3, Server, Zap, ShieldCheck, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderBudget {
  provider: string;
  displayName: string;
  estimatedSpendUsd: number;
  creditsCollected: number;
  creditsCollectedValueUsd: number;
  marginUsd: number;
  marginPercent: number;
  eventCount: number;
  lastEventAt: string | null;
  monthlyBudgetUsd: number;
  alertThresholdPercent: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
  topoffEvents: Array<{ id: string; amountCents: number; note: string; performedBy: string; performedAt: string }>;
  lastTopoffAt: string | null;
}

interface HealthAlert {
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  provider?: string;
}

interface BillingLayer {
  layer: number;
  name: string;
  description: string;
  status: string;
  lastRunAt: string | null;
  recentSuccessCount: number;
  recentFailureCount: number;
}

interface CreditStatus {
  totalActiveWorkspaces: number;
  workspacesWithNegativeBalance: number;
  totalCreditsInCirculation: number;
  recentDeductions: number;
  recentTopoffs: number;
}

interface HealthReport {
  generatedAt: string;
  billingLayers: BillingLayer[];
  creditSystem: CreditStatus;
  providerBudgets: ProviderBudget[];
  alerts: HealthAlert[];
  overallStatus: "healthy" | "warning" | "critical";
}

// ── Provider card ─────────────────────────────────────────────────────────────

function ProviderCard({
  budget,
  onTopoff,
}: {
  budget: ProviderBudget;
  onTopoff: (provider: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const spendPercent = budget.monthlyBudgetUsd > 0
    ? Math.min(100, Math.round((budget.estimatedSpendUsd / budget.monthlyBudgetUsd) * 100))
    : 0;

  const statusColor = budget.isOverBudget
    ? "text-destructive"
    : budget.isNearBudget
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-green-600 dark:text-green-400";

  const providerIcons: Record<string, string> = {
    openai: "PRI",
    gemini: "GTW",
    claude: "JDG",
  };

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-2">
        <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
              {providerIcons[budget.provider] ?? "AI"}
            </div>
            <div>
              <CardTitle className="text-sm">{budget.displayName}</CardTitle>
              <CardDescription className="text-xs">
                {budget.eventCount.toLocaleString()} events in period
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {budget.isOverBudget && (
              <Badge variant="destructive" data-testid={`status-provider-${budget.provider}`}>Over Budget</Badge>
            )}
            {budget.isNearBudget && !budget.isOverBudget && (
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid={`status-provider-${budget.provider}`}>Near Limit</Badge>
            )}
            {!budget.isOverBudget && !budget.isNearBudget && (
              <Badge variant="secondary" data-testid={`status-provider-${budget.provider}`}>On Track</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Spend bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Est. API spend</span>
            <span className={statusColor}>
              ${budget.estimatedSpendUsd.toFixed(4)} / ${budget.monthlyBudgetUsd.toFixed(2)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budget.isOverBudget
                  ? "bg-destructive"
                  : budget.isNearBudget
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${spendPercent}%` }}
              data-testid={`bar-spend-${budget.provider}`}
            />
          </div>
          <div className="text-xs text-right text-muted-foreground mt-0.5">{spendPercent}% used</div>
        </div>

        {/* Revenue vs cost */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="text-muted-foreground">Credits collected</div>
            <div className="font-semibold" data-testid={`text-credits-${budget.provider}`}>
              {budget.creditsCollected.toLocaleString()} cr
              <span className="text-muted-foreground font-normal ml-1">(${budget.creditsCollectedValueUsd.toFixed(2)})</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground">Platform margin</div>
            <div className={`font-semibold ${budget.marginUsd >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`} data-testid={`text-margin-${budget.provider}`}>
              {budget.marginPercent}%
              <span className="text-muted-foreground font-normal ml-1">(${budget.marginUsd.toFixed(2)})</span>
            </div>
          </div>
        </div>

        {/* Last top-off info */}
        {budget.lastTopoffAt && (
          <div className="text-xs text-muted-foreground">
            Last top-off: {new Date(budget.lastTopoffAt).toLocaleDateString()}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onTopoff(budget.provider)}
            data-testid={`button-topoff-${budget.provider}`}
          >
            <Plus className="h-3 w-3 mr-1" />
            Record Top-off
          </Button>
          {budget.topoffEvents.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(e => !e)}
              data-testid={`button-history-${budget.provider}`}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              History ({budget.topoffEvents.length})
            </Button>
          )}
        </div>

        {/* Top-off history */}
        {expanded && budget.topoffEvents.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t">
            {[...budget.topoffEvents].reverse().slice(0, 5).map(ev => (
              <div key={ev.id} className="text-xs flex flex-row justify-between gap-2 flex-wrap">
                <span className="text-muted-foreground">{new Date(ev.performedAt).toLocaleDateString()}</span>
                <span className="font-medium">${(ev.amountCents / 100).toFixed(2)}</span>
                <span className="text-muted-foreground truncate max-w-32">{ev.note}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Top-off dialog ────────────────────────────────────────────────────────────

function TopoffDialog({
  provider,
  onClose,
}: {
  provider: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const topoffMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/financial/provider-topoff", {
        provider,
        amountCents: Math.round(parseFloat(amount) * 100),
        note,
      }),
    onSuccess: () => {
      toast({ title: "Top-off recorded", description: `Budget top-off recorded for ${provider}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/health"] });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Record Budget Top-off — {provider}</CardTitle>
        <CardDescription className="text-xs">
          Record when you've added funds to this provider's billing account.
          This is for platform tracking only — it doesn't charge anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="topoff-amount" className="text-xs">Amount added (USD)</Label>
          <Input
            id="topoff-amount"
            type="number"
            min="1"
            step="0.01"
            placeholder="100.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            data-testid="input-topoff-amount"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="topoff-note" className="text-xs">Note</Label>
          <Textarea
            id="topoff-note"
            placeholder="Added $100 to AI billing account via credit card"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="resize-none text-xs"
            rows={2}
            data-testid="input-topoff-note"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => topoffMutation.mutate()}
            disabled={!amount || !note || topoffMutation.isPending}
            data-testid="button-submit-topoff"
          >
            {topoffMutation.isPending ? "Recording..." : "Record Top-off"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="button-cancel-topoff">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Billing layer status ──────────────────────────────────────────────────────

function BillingLayerRow({ layer }: { layer: BillingLayer }) {
  const statusIcon = layer.status === "active"
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : layer.status === "warning"
    ? <AlertTriangle className="h-4 w-4 text-yellow-500" />
    : <XCircle className="h-4 w-4 text-destructive" />;

  return (
    <div
      className="flex flex-row items-start gap-3 py-2 border-b last:border-0"
      data-testid={`row-billing-layer-${layer.layer}`}
    >
      <div className="mt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Layer {layer.layer}: {layer.name}</span>
          {layer.recentFailureCount > 0 && (
            <Badge variant="destructive" className="text-xs">{layer.recentFailureCount} failures</Badge>
          )}
          {layer.recentSuccessCount > 0 && (
            <Badge variant="secondary" className="text-xs">{layer.recentSuccessCount} ok</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{layer.description}</p>
        {layer.lastRunAt && (
          <p className="text-xs text-muted-foreground">
            Last: {new Date(layer.lastRunAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FinancialHealthPanel() {
  const [topoffTarget, setTopoffTarget] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/admin/financial/health"],
    queryFn: () => apiFetch('/api/admin/financial/health', AnyResponse),
  });

  const report = (data as any)?.report as HealthReport | undefined;

  const statusConfig = {
    healthy: { icon: <CheckCircle className="h-5 w-5 text-green-500" />, label: "Healthy", badge: "secondary" as const },
    warning: { icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />, label: "Warning", badge: "secondary" as const },
    critical: { icon: <XCircle className="h-5 w-5 text-destructive" />, label: "Critical", badge: "destructive" as const },
  };

  // Phase 3C: Typed fallback — statusConfig[unknown_status] returns undefined, crashing .icon/.badge
  const status = (report?.overallStatus ?? "healthy") as keyof typeof statusConfig;
  const cfg = statusConfig[status] ?? statusConfig["healthy"];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Loading financial health data...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <span>Failed to load financial health report. Check that you have admin access.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <div>
            <h3 className="font-semibold">Financial Health</h3>
            <p className="text-xs text-muted-foreground">
              {report?.generatedAt ? `Updated ${new Date(report.generatedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={cfg.badge} data-testid="status-financial-overall">{cfg.label}</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/health"] })}
            data-testid="button-refresh-health"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {report && report.alerts.length > 0 && (
        <div className="space-y-2">
          {report.alerts.map((alert, i) => (
            <div
              key={i}
              className={['flex items-start gap-2 p-3 rounded-md text-sm', alert.severity === "critical"
                  ? "bg-destructive/10 border border-destructive/20 text-destructive"
                  : alert.severity === "warning"
                  ? "bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300"
                  : "bg-muted border border-border"].join(' ')}
              data-testid={`alert-financial-${i}`}
            >
              {alert.severity === "critical" ? (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : alert.severity === "warning" ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Credit system summary */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Credit System (Last 24h)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Active orgs</div>
                <div className="text-lg font-semibold" data-testid="text-active-workspaces">
                  {report.creditSystem.totalActiveWorkspaces.toLocaleString()}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Negative balance</div>
                <div className={`text-lg font-semibold ${report.creditSystem.workspacesWithNegativeBalance > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}`} data-testid="text-negative-workspaces">
                  {report.creditSystem.workspacesWithNegativeBalance}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Credits deducted</div>
                <div className="text-lg font-semibold" data-testid="text-credits-deducted">
                  {report.creditSystem.recentDeductions.toLocaleString()}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Top-offs applied</div>
                <div className="text-lg font-semibold" data-testid="text-topoffs">
                  {report.creditSystem.recentTopoffs.toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider AI budget cards */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          AI Provider Budgets (30-day estimated spend)
        </h4>

        {/* Top-off dialog */}
        {topoffTarget && (
          <div className="mb-3">
            <TopoffDialog provider={topoffTarget} onClose={() => setTopoffTarget(null)} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {report?.providerBudgets.map(budget => (
            <ProviderCard
              key={budget.provider}
              budget={budget}
              onTopoff={p => setTopoffTarget(p === topoffTarget ? null : p)}
            />
          ))}
        </div>
      </div>

      {/* Billing layers */}
      {report && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Billing Layers (7-day activity)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {report.billingLayers.map(layer => (
                <BillingLayerRow key={layer.layer} layer={layer} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
