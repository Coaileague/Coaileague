import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleStatGrid, ModuleSkeletonList,
  ModuleEmptyState, ModuleToolbar,
} from "@/components/modules/ModulePageShell";
import { RefreshCw, CheckCircle2, Lightbulb, BarChart3 } from "lucide-react";

interface IncidentPattern {
  id: string;
  pattern_type: string;
  pattern_scope: string;
  sites_affected: string[] | string;
  incident_count: number;
  first_occurrence: string;
  most_recent_occurrence: string;
  pattern_description: string;
  risk_level: "low" | "medium" | "high" | "critical";
  recommended_action: string;
  status: "active" | "resolved" | "dismissed";
  created_at: string;
  hot_hour?: number | null;
}

interface Site { id: string; name: string; }

const RISK_CONFIG: Record<string, { color: string; label: string }> = {
  low:      { color: BADGE_COLORS.blue,   label: "Low" },
  medium:   { color: BADGE_COLORS.amber,  label: "Medium" },
  high:     { color: BADGE_COLORS.orange, label: "High" },
  critical: { color: BADGE_COLORS.red,    label: "Critical" },
};

const SCOPE_LABELS: Record<string, string> = {
  single_site:     "Single Site",
  multi_site:      "Multi-Site",
  time_based:      "Time-Based",
  officer_pattern: "Officer Pattern",
};

const TYPE_LABELS: Record<string, string> = {
  theft:              "Theft",
  vandalism:          "Vandalism",
  trespass:           "Trespass",
  suspicious_activity:"Suspicious Activity",
  medical:            "Medical",
  fire:               "Fire",
  access_control:     "Access Control",
  disturbance:        "Disturbance",
};

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function IncidentPatternsPage() {
  const { toast } = useAppToast();
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: patterns = [], isLoading } = useQuery<IncidentPattern[]>({
    queryKey: ["/api/incident-patterns", statusFilter],
    queryFn: () =>
      fetch(`/api/incident-patterns?status=${statusFilter}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });

  const detectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/incident-patterns/detect", {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incident-patterns"] });
      toast({ title: "Detection complete", description: `${data?.patternsFound || 0} new patterns identified.` });
    },
    onError: (err) => toast({ title: "Detection failed", description: err.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/incident-patterns/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incident-patterns"] });
      toast({ title: "Pattern resolved" });
    },
  });

  const getSiteNames = (pattern: IncidentPattern) => {
    const ids: string[] =
      typeof pattern.sites_affected === "string"
        ? JSON.parse(pattern.sites_affected)
        : pattern.sites_affected || [];
    return ids.map((id) => sites.find((s) => s.id === id)?.name || id).join(", ") || "—";
  };

  const active = patterns.filter((p) => p.status === "active");
  const highCrit = active.filter((p) => ["high", "critical"].includes(p.risk_level));
  const uniqueSites = new Set(
    patterns.flatMap((p) =>
      typeof p.sites_affected === "string" ? JSON.parse(p.sites_affected) : p.sites_affected || []
    )
  ).size;

  const sorted = [...patterns].sort(
    (a, b) => (RISK_ORDER[a.risk_level] ?? 4) - (RISK_ORDER[b.risk_level] ?? 4)
  );

  return (
    <ModulePageShell
      title="Incident Pattern Intelligence"
      description="AI-detected patterns from your incident history"
      action={
        <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending} data-testid="button-detect-patterns" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${detectMutation.isPending ? "animate-spin" : ""}`} />
          {detectMutation.isPending ? "Analyzing..." : "Run Detection"}
        </Button>
      }
    >
      <ModuleStatGrid stats={[
        { label: "Active Patterns",  value: active.length,    color: "text-orange-500" },
        { label: "High / Critical",  value: highCrit.length,  color: "text-red-500" },
        { label: "Sites Affected",   value: uniqueSites,      color: "text-amber-500" },
        { label: "Resolved",         value: patterns.filter((p) => p.status === "resolved").length, color: "text-green-500" },
      ]} />

      <ModuleToolbar>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {sorted.length} pattern{sorted.length !== 1 ? "s" : ""}
        </p>
      </ModuleToolbar>

      {isLoading ? (
        <ModuleSkeletonList count={3} height="h-32" />
      ) : sorted.length === 0 ? (
        <ModuleEmptyState
          icon={BarChart3}
          title="No patterns detected"
          subtitle="Run detection to analyze your incident history"
          action={
            <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending} data-testid="button-detect-empty">
              Run Detection
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {sorted.map((p) => {
            const risk = RISK_CONFIG[p.risk_level] || RISK_CONFIG.medium;
            return (
              <Card key={p.id} data-testid={`card-pattern-${p.id}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={risk.color} data-testid={`badge-risk-${p.id}`}>{risk.label} Risk</Badge>
                      <Badge variant="outline">{TYPE_LABELS[p.pattern_type] || p.pattern_type}</Badge>
                      <Badge variant="outline">{SCOPE_LABELS[p.pattern_scope] || p.pattern_scope}</Badge>
                    </div>
                    {p.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(p.id)} disabled={resolveMutation.isPending} data-testid={`button-resolve-${p.id}`}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Incidents</p>
                      <p className="font-semibold text-foreground" data-testid={`text-count-${p.id}`}>{p.incident_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Period</p>
                      <p className="font-medium text-foreground text-xs sm:text-sm">
                        {formatDate(p.first_occurrence)} — {formatDate(p.most_recent_occurrence)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sites Affected</p>
                      <p className="font-medium text-foreground text-xs sm:text-sm">{getSiteNames(p)}</p>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-md p-3 mb-3">
                    <p className="text-sm text-foreground leading-relaxed" data-testid={`text-description-${p.id}`}>
                      {p.pattern_description}
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">{p.recommended_action}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ModulePageShell>
  );
}
