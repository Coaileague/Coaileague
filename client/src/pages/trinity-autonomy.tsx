import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Brain, Eye, Lightbulb, Send, Zap } from "lucide-react";

type Mode = "off" | "advisory" | "order_execution" | "supervised_autonomous";

interface AutonomyResponse {
  mode: Mode;
  modes: Mode[];
  descriptions: Record<Mode, string>;
}

const MODE_META: Record<Mode, { title: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  off: { title: "Off — Read Only", icon: Eye, color: "text-slate-500" },
  advisory: { title: "Advisory", icon: Lightbulb, color: "text-amber-500" },
  order_execution: { title: "Order Execution (default)", icon: Send, color: "text-blue-500" },
  supervised_autonomous: { title: "Supervised Autonomous", icon: Zap, color: "text-emerald-500" },
};

export default function TrinityAutonomyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AutonomyResponse>({
    queryKey: ["/api/trinity/autonomy"],
  });

  const setMode = useMutation({
    mutationFn: async (mode: Mode) => {
      return apiRequest("POST", "/api/trinity/autonomy", { mode });
    },
    onSuccess: (_d: unknown, mode: Mode) => {
      toast({ title: "Trinity autonomy updated", description: MODE_META[mode].title });
      qc.invalidateQueries({ queryKey: ["/api/trinity/autonomy"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not update autonomy";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  const current: Mode = data?.mode ?? "order_execution";
  const allModes: Mode[] = data?.modes ?? ["off", "advisory", "order_execution", "supervised_autonomous"];

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <header className="mb-6 flex items-start gap-3">
        <div className="p-2 bg-muted rounded-md">
          <Brain className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trinity Autonomy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick how much initiative Trinity takes. Hard ceilings — dollar
            thresholds, the public-safety boundary, and conscience vetoes — always
            apply on top of this setting.
          </p>
        </div>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {allModes.map(mode => {
          const meta = MODE_META[mode];
          const isCurrent = mode === current;
          return (
            <Card
              key={mode}
              className={`transition-all ${isCurrent ? "ring-2 ring-primary" : "hover-elevate cursor-pointer"}`}
              data-testid={`card-autonomy-${mode}`}
              onClick={() => { if (!isCurrent) setMode.mutate(mode); }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md">
                    <meta.icon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <CardTitle className="text-base">{meta.title}</CardTitle>
                  {isCurrent && <span className="ml-auto"><Badge variant="default">Active</Badge></span>}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm whitespace-pre-line">
                  {data?.descriptions[mode] ?? "—"}
                </CardDescription>
                {!isCurrent && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    size="sm"
                    disabled={setMode.isPending}
                    onClick={e => { e.stopPropagation(); setMode.mutate(mode); }}
                    data-testid={`button-set-autonomy-${mode}`}
                  >
                    Switch to this mode
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 text-xs text-muted-foreground border-t pt-4">
        <strong>Hard ceilings (cannot be overridden):</strong> dollar-threshold
        approval table (server/services/ai-brain/financialApprovalThresholds.ts),
        Public Safety Boundary law (CLAUDE.md), trinityConscience vetoes.
      </div>
    </div>
  );
}
