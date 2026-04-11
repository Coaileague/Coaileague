import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Coins, ArrowDownToLine, TrendingUp, Database } from "lucide-react";

interface RecycledDeposit {
  id: string;
  amount: number;
  poolType: string;
  sourceWorkspaceId: string | null;
  description: string | null;
  createdAt: string;
}

interface RecycledCreditsStats {
  platformWorkspaceId: string;
  currentBalance: number;
  totalEverEarned: number;
  totalRecycledDeposited: number;
  recentDeposits: RecycledDeposit[];
}

export function RecycledCreditsPanel() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<RecycledCreditsStats>({
    queryKey: ["/api/platform/credits/recycled"],
  });

  const triggerMutation = useMutation({
    // @ts-expect-error — TS migration: fix in refactoring sprint
    mutationFn: () => apiRequest("/api/platform/credits/recycled/trigger", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/credits/recycled"] });
      toast({ title: "Sweep complete", description: "Recycled token accounting complete." });
    },
    onError: (err: any) => {
      toast({ title: "Sweep failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const s = stats;

  return (
    <div className="space-y-4" data-testid="panel-recycled-credits">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Recycled Token Accounting</h3>
          <p className="text-sm text-muted-foreground">
            Legacy token accounting pipeline — tracks unused token allowances at billing cycle end.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          data-testid="button-trigger-sweep"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerMutation.isPending ? "animate-spin" : ""}`} />
          {triggerMutation.isPending ? "Sweeping…" : "Run Sweep Now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Coins className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Platform Token Pool</p>
              <p className="text-xl font-bold" data-testid="text-platform-balance">
                {(s?.currentBalance ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">credits</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-md bg-green-500/10">
              <ArrowDownToLine className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recycled All-Time</p>
              <p className="text-xl font-bold" data-testid="text-recycled-total">
                {(s?.totalRecycledDeposited ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">tokens from tenant allocations</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="p-2 rounded-md bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Pool Ever Earned</p>
              <p className="text-xl font-bold" data-testid="text-pool-total-earned">
                {(s?.totalEverEarned ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">tokens (lifetime)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-3.5 w-3.5" />
            Recent Deposits
          </CardTitle>
          <CardDescription className="text-xs">
            Last {s?.recentDeposits?.length ?? 0} recycled token deposits from tenant workspaces
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!s?.recentDeposits?.length ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              No recycled deposits yet. Token allocations are swept at the end of each billing cycle.
            </div>
          ) : (
            <div className="divide-y">
              {s.recentDeposits.map((deposit, idx) => (
                <div
                  key={deposit.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                  data-testid={`row-deposit-${idx}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium truncate">
                      {deposit.sourceWorkspaceId ?? "unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {deposit.description ?? deposit.poolType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 font-mono text-xs">
                      +{deposit.amount.toLocaleString()}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(deposit.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Platform workspace: <span className="font-mono">{s?.platformWorkspaceId}</span>
        {" · "}
        Pipeline runs automatically at midnight on the 1st of each month alongside the billing cycle reset.
      </p>
    </div>
  );
}
