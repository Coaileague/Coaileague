import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate, BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleDetailShell, ModuleStatGrid, ModuleSkeletonList,
  ModuleEmptyState, ModuleAlertBanner,
} from "@/components/modules/ModulePageShell";
import { TrendingDown, TrendingUp, AlertTriangle, Plus, ArrowLeft, BarChart3, Minus } from "lucide-react";

interface SatisfactionRecord {
  id: string;
  client_id: string;
  client_name?: string;
  check_in_type: string;
  check_in_date: string;
  satisfaction_score?: number | string;
  nps_score?: number;
  feedback_text?: string;
  issues_raised?: string[] | string;
  issues_resolved: boolean;
  follow_up_required: boolean;
  conducted_by_name?: string;
}

interface ClientRow {
  id: string;
  company_name?: string;
  companyName?: string;
  last_check_in?: string;
  latest_score?: number | string;
  previous_score?: number | string;
  check_in_count: number;
}

interface Dashboard {
  clients: ClientRow[];
  openConcerns: number;
  averageScore: number | null;
  churnRisks: number;
}

interface Client { id: string; companyName?: string; company_name?: string; }

function ScoreDisplay({ score }: { score?: number | string | null }) {
  if (score === null || score === undefined || score === "") {
    return <span className="text-muted-foreground text-sm">No score</span>;
  }
  const n = typeof score === "string" ? parseFloat(score) : score;
  const color = n >= 4 ? "text-green-500" : n >= 3 ? "text-amber-500" : "text-red-500";
  return <span className={`text-lg font-bold ${color}`}>{n.toFixed(1)}/5</span>;
}

function getScoreTrend(latest?: number | string | null, prev?: number | string | null) {
  if (!latest || !prev) return null;
  const l = typeof latest === "string" ? parseFloat(latest) : latest;
  const p = typeof prev === "string" ? parseFloat(prev) : prev;
  const diff = l - p;
  if (diff > 0) return { icon: TrendingUp,   color: "text-green-500", label: `+${diff.toFixed(1)}` };
  if (diff < 0) return { icon: TrendingDown,  color: "text-red-500",   label: diff.toFixed(1) };
  return            { icon: Minus,           color: "text-muted-foreground", label: "0" };
}

export default function ClientSatisfactionPage() {
  const { toast } = useAppToast();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [form, setForm] = useState({
    client_id: "", check_in_type: "scheduled", check_in_date: "",
    satisfaction_score: "", nps_score: "", feedback_text: "", follow_up_required: false,
  });

  const { data: dashboard, isLoading: loadingDash } = useQuery<Dashboard>({
    queryKey: ["/api/client-satisfaction/dashboard"],
  });
  const { data: rawClients } = useQuery<Client[] | any>({ queryKey: ["/api/clients/lookup"] });
  const clients: Client[] = Array.isArray(rawClients) ? rawClients : [];
  const { data: trend } = useQuery<{
    records: SatisfactionRecord[];
    churnRisk: boolean;
    churnMessage: string;
    averageScore: number | null;
  }>({
    queryKey: ["/api/client-satisfaction/clients", selectedClient, "trend"],
    queryFn: () =>
      fetch(`/api/client-satisfaction/clients/${selectedClient}/trend`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!selectedClient,
  });

  const addRecordMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/client-satisfaction/records", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-satisfaction"] });
      setShowAddRecord(false);
      setForm({ client_id: "", check_in_type: "scheduled", check_in_date: "", satisfaction_score: "", nps_score: "", feedback_text: "", follow_up_required: false });
      toast({ title: "Check-in recorded" });
    },
    onError: (err) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const clientRows = dashboard?.clients || [];
  const churnClients = clientRows.filter((c) => {
    const l = c.latest_score ? parseFloat(String(c.latest_score)) : null;
    const p = c.previous_score ? parseFloat(String(c.previous_score)) : null;
    return l !== null && p !== null && p - l >= 0.5;
  });

  // ── Client detail view ───────────────────────────────────────────────────
  if (selectedClient) {
    const found = clients.find((c) => c.id === selectedClient);
    const clientName = found?.companyName || found?.company_name || "Client";
    const records = trend?.records || [];
    return (
      <ModuleDetailShell
        backButton={
          <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)} data-testid="button-back-clients" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Button>
        }
        title={clientName}
        subtitle={`${records.length} check-in${records.length !== 1 ? "s" : ""} · Avg: ${trend?.averageScore ? `${trend.averageScore}/5` : "—"}`}
        badges={
          trend?.churnRisk ? (
            <Badge className={`${BADGE_COLORS.red} gap-1`} data-testid="badge-churn-risk">
              <AlertTriangle className="w-3 h-3" /> Churn Risk
            </Badge>
          ) : undefined
        }
      >
        {trend?.churnRisk && (
          <ModuleAlertBanner variant="error" message={trend.churnMessage} className="mb-4" />
        )}

        <div className="space-y-3">
          {[...records].reverse().map((r) => (
            <Card key={r.id} data-testid={`card-record-${r.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{formatDate(r.check_in_date)} · {r.check_in_type}</p>
                    <ScoreDisplay score={r.satisfaction_score} />
                    {r.nps_score !== undefined && (
                      <p className="text-xs text-muted-foreground">NPS: {r.nps_score}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    {r.follow_up_required && <Badge className={BADGE_COLORS.amber}>Follow-up</Badge>}
                    {r.issues_resolved && <Badge className={BADGE_COLORS.green}>Resolved</Badge>}
                  </div>
                </div>
                {r.feedback_text && (
                  <p className="text-sm text-muted-foreground mt-2 italic">"{r.feedback_text}"</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ModuleDetailShell>
    );
  }

  // ── Dashboard view ───────────────────────────────────────────────────────
  return (
    <ModulePageShell
      title="Client Satisfaction"
      description="Track client check-ins, satisfaction scores, and churn risk"
      action={
        <Button onClick={() => setShowAddRecord(true)} data-testid="button-add-checkin" className="gap-2">
          <Plus className="w-4 h-4" /> Add Check-in
        </Button>
      }
    >
      <ModuleStatGrid cols={3} stats={[
        { label: "Avg Satisfaction", value: dashboard?.averageScore ? `${dashboard.averageScore}/5` : "—", color: "text-foreground" },
        { label: "Churn Risks",      value: dashboard?.churnRisks ?? 0, color: (dashboard?.churnRisks || 0) > 0 ? "text-red-500" : "text-foreground" },
        { label: "Open Concerns",    value: dashboard?.openConcerns ?? 0, color: (dashboard?.openConcerns || 0) > 0 ? "text-amber-500" : "text-foreground" },
      ]} />

      {showAddRecord && (
        <Card className="mb-6">
          <CardContent className="pt-4 space-y-4">
            <p className="text-base font-semibold text-foreground">Record Client Check-in</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Client</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                  <SelectTrigger data-testid="select-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName || c.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Check-in Type</Label>
                <Select value={form.check_in_type} onValueChange={(v) => setForm((f) => ({ ...f, check_in_type: v }))}>
                  <SelectTrigger data-testid="select-checkin-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="incident_triggered">Incident Triggered</SelectItem>
                    <SelectItem value="renewal_review">Renewal Review</SelectItem>
                    <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" data-testid="input-checkin-date" value={form.check_in_date} onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))} />
              </div>
              <div>
                <Label>Satisfaction Score (1–5)</Label>
                <Input type="number" min="1" max="5" step="0.5" data-testid="input-satisfaction-score" value={form.satisfaction_score} onChange={(e) => setForm((f) => ({ ...f, satisfaction_score: e.target.value }))} />
              </div>
              <div>
                <Label>NPS Score (0–10)</Label>
                <Input type="number" min="0" max="10" data-testid="input-nps-score" value={form.nps_score} onChange={(e) => setForm((f) => ({ ...f, nps_score: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Feedback</Label>
              <Textarea data-testid="textarea-feedback" value={form.feedback_text} onChange={(e) => setForm((f) => ({ ...f, feedback_text: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddRecord(false)} data-testid="button-cancel-checkin">Cancel</Button>
              <Button
                onClick={() => addRecordMutation.mutate(form)}
                disabled={addRecordMutation.isPending || !form.client_id || !form.check_in_date}
                data-testid="button-save-checkin"
              >
                {addRecordMutation.isPending ? "Saving..." : "Save Check-in"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {churnClients.length > 0 && (
        <ModuleAlertBanner
          variant="error"
          title="Churn Risk Detected"
          message={`${churnClients.map((c) => c.companyName || c.company_name).join(", ")} — satisfaction declining`}
        />
      )}

      {loadingDash ? (
        <ModuleSkeletonList count={3} height="h-16" />
      ) : clientRows.length === 0 ? (
        <ModuleEmptyState icon={BarChart3} title="No satisfaction records yet" />
      ) : (
        <div className="space-y-2">
          {clientRows.map((c) => {
            const scoreTrend = getScoreTrend(c.latest_score, c.previous_score);
            const isChurn = churnClients.some((x) => x.id === c.id);
            return (
              <Card key={c.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedClient(c.id)} data-testid={`card-client-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground" data-testid={`text-client-name-${c.id}`}>{c.companyName || c.company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Last check-in: {formatDate(c.last_check_in)} · {c.check_in_count} total
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ScoreDisplay score={c.latest_score} />
                      {scoreTrend && (
                        <div className={`flex items-center gap-0.5 text-xs ${scoreTrend.color}`}>
                          <scoreTrend.icon className="w-3 h-3" />
                          <span>{scoreTrend.label}</span>
                        </div>
                      )}
                      {isChurn && (
                        <Badge className={BADGE_COLORS.red} data-testid={`badge-churn-${c.id}`}>Churn Risk</Badge>
                      )}
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
