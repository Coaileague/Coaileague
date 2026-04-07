import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, formatCurrency, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleDetailShell, ModuleStatGrid, ModuleSkeletonList,
  ModuleEmptyState, ModuleAlertBanner, ModuleToolbar,
} from "@/components/modules/ModulePageShell";
import {
  Target, DollarSign, CheckCircle2, XCircle, RefreshCw,
  ChevronRight, ArrowLeft, AlertCircle, Phone,
} from "lucide-react";

interface Proposal {
  id: string;
  prospect_name: string;
  contact_name?: string;
  contact_email?: string;
  stage: string;
  estimated_monthly_value?: number | string;
  proposal_type?: string;
  decision_maker_name?: string;
  expected_close_date?: string;
  actual_close_date?: string;
  loss_reason?: string;
  our_differentiators?: string;
  no_response_flag?: boolean;
  overdue_flag?: boolean;
  days_open?: number;
  follow_up_count?: number;
  last_follow_up_at?: string;
  created_at: string;
}

interface Analytics {
  snapshots: any[];
  live: {
    total_deals: number;
    won: number;
    lost: number;
    in_pipeline: number;
    no_response: number;
    pipeline_value: number | string;
    won_value: number | string;
  };
}

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead:     { label: "Lead",     color: BADGE_COLORS.slate },
  survey:   { label: "Survey",   color: BADGE_COLORS.blue },
  rfp:      { label: "RFP",      color: BADGE_COLORS.purple },
  proposal: { label: "Proposal", color: BADGE_COLORS.amber },
  contract: { label: "Contract", color: BADGE_COLORS.orange },
  won:      { label: "Won",      color: BADGE_COLORS.green },
  lost:     { label: "Lost",     color: BADGE_COLORS.red },
};

export default function BidManagementPage() {
  const { toast } = useAppToast();
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<Proposal | null>(null);

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/bid-analytics/proposals", stageFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (stageFilter !== "all") params.set("stage", stageFilter);
      return fetch(`/api/bid-analytics/proposals?${params}`, { credentials: "include" }).then((r) => r.json());
    },
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ["/api/bid-analytics/analytics"],
  });

  const { data: followUpNeeded = [] } = useQuery<Proposal[]>({
    queryKey: ["/api/bid-analytics/follow-up-needed"],
  });

  const generateAnalyticsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bid-analytics/analytics/generate", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-analytics/analytics"] });
      toast({ title: "Analytics snapshot generated" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage, loss_reason }: { id: string; stage: string; loss_reason?: string }) =>
      apiRequest("PATCH", `/api/bid-analytics/proposals/${id}`, { stage, loss_reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-analytics"] });
      toast({ title: "Stage updated" });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/bid-analytics/proposals/${id}/follow-up`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-analytics"] });
      toast({ title: "Follow-up recorded" });
    },
  });

  const live = analytics?.live;
  const won = Number(live?.won || 0);
  const lost = Number(live?.lost || 0);
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const cfg = STAGE_CONFIG[selected.stage] || STAGE_CONFIG.lead;
    return (
      <ModuleDetailShell
        backButton={
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)} data-testid="button-back-proposals" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to proposals
          </Button>
        }
        title={selected.prospect_name}
        subtitle={selected.contact_name ? `${selected.contact_name} · ${selected.contact_email || ""}` : undefined}
        badges={
          <>
            <Badge className={cfg.color}>{cfg.label}</Badge>
            {selected.no_response_flag && <Badge className={BADGE_COLORS.slate}>No Response</Badge>}
            {selected.overdue_flag && <Badge className={BADGE_COLORS.amber}>Overdue</Badge>}
          </>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: "Monthly Value",   value: selected.estimated_monthly_value ? `${formatCurrency(selected.estimated_monthly_value)}/mo` : "—" },
            { label: "Annual Value",    value: selected.estimated_monthly_value ? `${formatCurrency(Number(selected.estimated_monthly_value) * 12)}/yr` : "—" },
            { label: "Days Open",       value: selected.days_open !== undefined ? `${selected.days_open}d` : "—" },
            { label: "Expected Close",  value: formatDate(selected.expected_close_date) },
            { label: "Follow-ups",      value: selected.follow_up_count ?? 0 },
            { label: "Last Follow-up",  value: formatDate(selected.last_follow_up_at) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selected.our_differentiators && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Our Differentiators</p>
              <p className="text-sm text-foreground">{selected.our_differentiators}</p>
            </CardContent>
          </Card>
        )}

        {!["won", "lost"].includes(selected.stage) && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => followUpMutation.mutate(selected.id)} disabled={followUpMutation.isPending} data-testid="button-record-followup">
                  <Phone className="w-3 h-3 mr-1" /> Record Follow-up
                </Button>
                <Button size="sm" onClick={() => updateStageMutation.mutate({ id: selected.id, stage: "won" })} data-testid="button-mark-won">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Won
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const r = window.prompt("Loss reason (optional):");
                  updateStageMutation.mutate({ id: selected.id, stage: "lost", loss_reason: r || undefined });
                }} data-testid="button-mark-lost">
                  <XCircle className="w-3 h-3 mr-1" /> Mark Lost
                </Button>
              </div>
              <div>
                <Label className="text-xs">Move Stage</Label>
                <Select
                  value={selected.stage}
                  onValueChange={(v) => {
                    updateStageMutation.mutate({ id: selected.id, stage: v });
                    setSelected({ ...selected, stage: v });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid="select-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}
      </ModuleDetailShell>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <ModulePageShell
      title="Bid & Proposal Management"
      description="Track proposals, win rates, and pipeline analytics"
      action={
        <Button
          variant="outline"
          onClick={() => generateAnalyticsMutation.mutate()}
          disabled={generateAnalyticsMutation.isPending}
          data-testid="button-generate-analytics"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${generateAnalyticsMutation.isPending ? "animate-spin" : ""}`} />
          {generateAnalyticsMutation.isPending ? "Generating..." : "Refresh Analytics"}
        </Button>
      }
    >
      <ModuleStatGrid stats={[
        { label: "Win Rate",       value: `${winRate}%`,                    color: winRate >= 50 ? "text-green-500" : "text-amber-500" },
        { label: "In Pipeline",    value: live?.in_pipeline ?? "—",         color: "text-blue-500" },
        { label: "Pipeline Value", value: formatCurrency(live?.pipeline_value), color: "text-foreground" },
        { label: "No Response",    value: live?.no_response ?? "—",         color: (Number(live?.no_response) || 0) > 0 ? "text-amber-500" : "text-foreground" },
      ]} />

      {followUpNeeded.length > 0 && (
        <ModuleAlertBanner
          variant="warning"
          message={`${followUpNeeded.length} proposal${followUpNeeded.length !== 1 ? "s" : ""} need follow-up: ${followUpNeeded.slice(0, 3).map((p) => p.prospect_name).join(", ")}${followUpNeeded.length > 3 ? ` +${followUpNeeded.length - 3} more` : ""}`}
        />
      )}

      <ModuleToolbar>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40" data-testid="select-stage-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
        </p>
      </ModuleToolbar>

      {isLoading ? (
        <ModuleSkeletonList count={4} height="h-16" />
      ) : proposals.length === 0 ? (
        <ModuleEmptyState icon={Target} title="No proposals found" />
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => {
            const cfg = STAGE_CONFIG[p.stage] || STAGE_CONFIG.lead;
            return (
              <Card key={p.id} className="hover-elevate cursor-pointer" onClick={() => setSelected(p)} data-testid={`card-proposal-${p.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground" data-testid={`text-prospect-${p.id}`}>{p.prospect_name}</p>
                      <p className="text-xs text-muted-foreground">{p.contact_name || "—"} · {p.days_open}d open</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {p.no_response_flag && (
                        <Badge className={BADGE_COLORS.slate} data-testid={`badge-no-response-${p.id}`}>No Response</Badge>
                      )}
                      {p.overdue_flag && <Badge className={BADGE_COLORS.amber}>Overdue</Badge>}
                      <Badge className={cfg.color} data-testid={`badge-stage-${p.id}`}>{cfg.label}</Badge>
                      {p.estimated_monthly_value && (
                        <p className="text-sm font-medium text-muted-foreground">{formatCurrency(p.estimated_monthly_value)}/mo</p>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
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
