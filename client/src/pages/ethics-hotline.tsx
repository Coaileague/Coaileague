import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Shield, Eye, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import {
  DsPageWrapper,
  DsPageHeader,
  DsStatCard,
  DsTabBar,
  DsSectionCard,
  DsDataRow,
  DsBadge,
  DsButton
} from "@/components/ui/ds-components";

function timeAgo(ts: string) {
  if (!ts) return "—";
  try { return format(new Date(ts), "MMM d, yyyy"); } catch { return ts; }
}

const SEVERITY_COLORS: Record<string, "danger" | "warning" | "info" | "muted"> = { 
  critical: "danger", 
  high: "warning", 
  medium: "info", 
  low: "muted" 
};

export default function EthicsHotline() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspaceId;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [viewReport, setViewReport] = useState<any>(null);
  const [followupToken, setFollowupToken] = useState("");
  const [publicForm, setPublicForm] = useState({ category: "policy_violation", severity: "medium", description: "", siteName: "", reporterEmail: "" });
  const [publicResult, setPublicResult] = useState<any>(null);
  const [followupResult, setFollowupResult] = useState<any>(null);

  const reports = useQuery<any>({ queryKey: ["/api/ethics/reports", { workspaceId }], enabled: !!workspaceId });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["/api/ethics"] }); }

  const submitPublicReport = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ethics/report", { ...data, workspaceId }),
    onSuccess: (d: any) => { setPublicResult(d); toast({ title: "Report submitted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveReport = useMutation({
    mutationFn: ({ id, status, resolution }: any) => apiRequest("PATCH", `/api/ethics/reports/${id}`, { status, resolution, workspaceId }),
    onSuccess: () => { invalidate(); setViewReport(null); toast({ title: "Report updated" }); },
  });

  const [followupLoading, setFollowupLoading] = useState(false);

  const checkFollowup = async () => {
    if (!followupToken.trim()) return;
    setFollowupLoading(true);
    setFollowupResult(null);
    try {
      const r = await apiRequest("GET", `/api/ethics/followup/${followupToken.trim()}`, null);
      const data = await r.json();
      setFollowupResult(data);
    } catch (err) {
      toast({ title: "Report not found", description: "No report matched the provided token.", variant: "destructive" });
    } finally {
      setFollowupLoading(false);
    }
  };

  const pending = reports.data?.reports?.filter((r: any) => r.status === "pending") || [];
  const reviewing = reports.data?.reports?.filter((r: any) => r.status === "reviewing") || [];
  const resolved = reports.data?.reports?.filter((r: any) => r.status === "resolved") || [];

  const tabs = [
    { id: "dashboard", label: "Reports Dashboard" },
    { id: "submit", label: "Submit Report" },
    { id: "followup", label: "Follow Up" }
  ];

  return (
    <DsPageWrapper className="max-w-4xl mx-auto">
      <DsPageHeader 
        title="Ethics Hotline" 
        subtitle="Anonymous reporting, AI triage, and resolution tracking"
        data-testid="text-ethics-title"
      />

      <DsTabBar 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        className="mb-6"
      />

      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <DsStatCard label="Pending" value={pending.length} color="danger" />
            <DsStatCard label="Under Review" value={reviewing.length} color="warning" />
            <DsStatCard label="Resolved" value={resolved.length} color="success" />
          </div>

          <DsSectionCard title="Anonymous Reports">
            {reports.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : reports.data?.reports?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports submitted yet.</p>
            ) : (
              <div className="space-y-1">
                {reports.data?.reports?.map((r: any) => (
                  <DsDataRow key={r.id} data-testid={`row-ethics-${r.id}`} interactive onClick={() => setViewReport(r)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] opacity-70">#{r.report_code}</span>
                        <DsBadge color={SEVERITY_COLORS[r.severity] || "muted"}>{r.severity}</DsBadge>
                        <DsBadge color={r.status === "pending" ? "danger" : r.status === "resolved" ? "success" : "warning"}>{r.status}</DsBadge>
                        <span className="text-[11px] uppercase tracking-wider opacity-60">{r.category?.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-sm line-clamp-1 opacity-90">{r.description}</p>
                      <p className="text-[10px] opacity-50 mt-1">{timeAgo(r.created_at)}</p>
                    </div>
                    <DsButton variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </DsButton>
                  </DsDataRow>
                ))}
              </div>
            )}
          </DsSectionCard>
        </div>
      )}

      {activeTab === "submit" && (
        <div className="max-w-2xl mx-auto w-full">
          {!publicResult ? (
            <DsSectionCard title="Submit Anonymous Report">
              <p className="text-xs text-muted-foreground mb-4">Your report is completely anonymous. No personal information is stored unless you choose to provide it.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium opacity-70">Category</label>
                    <Select value={publicForm.category} onValueChange={v => setPublicForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger data-testid="select-ethics-category" className="bg-transparent border-[var(--ds-border)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
                        {["harassment","discrimination","safety","fraud","policy_violation","retaliation","theft","other"].map(c => (
                          <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium opacity-70">Severity</label>
                    <Select value={publicForm.severity} onValueChange={v => setPublicForm(p => ({ ...p, severity: v }))}>
                      <SelectTrigger className="bg-transparent border-[var(--ds-border)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
                        {["low","medium","high","critical"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium opacity-70">Site / location (optional)</label>
                  <Input 
                    placeholder="Site / location" 
                    value={publicForm.siteName} 
                    onChange={e => setPublicForm(p => ({ ...p, siteName: e.target.value }))}
                    className="bg-transparent border-[var(--ds-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium opacity-70">Description</label>
                  <Textarea
                    data-testid="input-ethics-description"
                    placeholder="Describe the issue in detail. Include dates, times, and names if safe to do so. (minimum 10 characters)"
                    value={publicForm.description}
                    onChange={e => setPublicForm(p => ({ ...p, description: e.target.value }))}
                    className="min-h-[120px] bg-transparent border-[var(--ds-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium opacity-70">Contact email (optional)</label>
                  <Input 
                    type="email" 
                    placeholder="Contact email (for follow-up only)" 
                    value={publicForm.reporterEmail} 
                    onChange={e => setPublicForm(p => ({ ...p, reporterEmail: e.target.value }))} 
                    className="bg-transparent border-[var(--ds-border)]"
                  />
                </div>
                <DsButton
                  data-testid="button-submit-ethics"
                  className="w-full"
                  onClick={() => submitPublicReport.mutate(publicForm)}
                  disabled={publicForm.description.length < 10 || submitPublicReport.isPending}
                >
                  {submitPublicReport.isPending ? "Submitting…" : "Submit Confidential Report"}
                </DsButton>
              </div>
            </DsSectionCard>
          ) : (
            <DsSectionCard className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-[var(--ds-success)] mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Report Submitted</h3>
              <p className="text-sm text-muted-foreground mb-6">{publicResult.message}</p>
              <div className="rounded-lg bg-[var(--ds-navy-light)] p-4 text-left space-y-3 border border-[var(--ds-border)] mb-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Report Code</p>
                  <p className="font-mono text-sm font-bold">{publicResult.reportCode}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Follow-up Token</p>
                  <p className="font-mono text-sm text-[var(--ds-gold)]">{publicResult.followUpToken}</p>
                </div>
                <p className="text-[10px] opacity-60">Save your follow-up token to check the status of your report.</p>
              </div>
              <DsButton variant="outline" onClick={() => { setPublicResult(null); setPublicForm(p => ({ ...p, description: "" })); }}>
                Submit Another Report
              </DsButton>
            </DsSectionCard>
          )}
        </div>
      )}

      {activeTab === "followup" && (
        <div className="max-w-2xl mx-auto w-full">
          <DsSectionCard title="Check Report Status">
            <p className="text-xs text-muted-foreground mb-4">Enter your follow-up token to check the status of your anonymous report.</p>
            <div className="flex gap-2 mb-8">
              <Input
                data-testid="input-followup-token"
                placeholder="Enter follow-up token"
                value={followupToken}
                onChange={e => setFollowupToken(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") checkFollowup(); }}
                className="font-mono bg-transparent border-[var(--ds-border)]"
              />
              <DsButton
                data-testid="button-check-followup"
                onClick={checkFollowup}
                disabled={!followupToken.trim() || followupLoading}
              >
                {followupLoading ? "Checking…" : "Check"}
              </DsButton>
            </div>

            {followupResult && (() => {
              const steps = [
                { key: "submitted", label: "Submitted" },
                { key: "under_review", label: "Under Review" },
                { key: "resolved", label: "Resolved" },
              ];
              const statusOrder: Record<string, number> = { pending: 0, reviewing: 1, under_review: 1, in_progress: 1, resolved: 2, closed: 2 };
              const currentStep = statusOrder[followupResult.status] ?? 0;
              
              return (
                <div className="space-y-8">
                  <div className="relative flex justify-between items-center px-8">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-[var(--ds-border)] z-0" />
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-[var(--ds-gold)] transition-all duration-500 z-0" style={{ width: `${(currentStep / 2) * 100}%` }} />
                    
                    {steps.map((step, i) => {
                      const done = i < currentStep;
                      const active = i === currentStep;
                      return (
                        <div key={step.key} className="relative z-10 flex flex-col items-center">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
                            done ? "bg-[var(--ds-gold)] border-[var(--ds-gold)] text-black" : 
                            active ? "bg-[var(--ds-navy)] border-[var(--ds-gold)] text-[var(--ds-gold)] shadow-[0_0_12px_var(--ds-gold-glow)]" : 
                            "bg-[var(--ds-navy)] border-[var(--ds-border)] text-[var(--ds-text-muted)]"
                          )}>
                            {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                          </div>
                          <span className={cn(
                            "absolute top-10 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider",
                            active ? "text-[var(--ds-gold)]" : "text-[var(--ds-text-muted)]"
                          )}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4">
                    <DsSectionCard className="border-[var(--ds-border)] bg-[var(--ds-navy-light)]">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--ds-border)]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold">#{followupResult.report_code}</span>
                          <DsBadge color={followupResult.status === "resolved" || followupResult.status === "closed" ? "success" : "warning"}>
                            {followupResult.status?.replace(/_/g, " ")}
                          </DsBadge>
                        </div>
                        <span className="text-[10px] opacity-50">{timeAgo(followupResult.created_at)}</span>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-50">Category</span>
                          <span className="font-medium uppercase tracking-wider">{followupResult.category?.replace(/_/g, " ")}</span>
                        </div>
                        {followupResult.resolution && (
                          <div className="p-3 rounded-lg bg-black/20 border border-[var(--ds-gold-border)]">
                            <p className="text-[10px] font-bold text-[var(--ds-gold)] uppercase tracking-widest mb-2">Resolution Statement</p>
                            <p className="text-sm opacity-90 leading-relaxed">{followupResult.resolution}</p>
                            {followupResult.resolved_at && (
                              <p className="text-[9px] opacity-40 mt-3">Resolved on {timeAgo(followupResult.resolved_at)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </DsSectionCard>
                  </div>
                </div>
              );
            })()}
          </DsSectionCard>
        </div>
      )}

      <UniversalModal open={!!viewReport} onOpenChange={v => !v && setViewReport(null)}>
        <UniversalModalContent className="max-w-lg bg-[var(--ds-navy-mid)] border-[var(--ds-border)] text-[var(--ds-text-primary)]">
          <UniversalModalHeader>
            <UniversalModalTitle style={{ fontFamily: 'var(--ds-font-display)' }}>
              Report Details — {viewReport?.report_code}
            </UniversalModalTitle>
          </UniversalModalHeader>
          {viewReport && (
            <div className="space-y-6 pt-4">
              <div className="flex gap-2 flex-wrap">
                <DsBadge color={SEVERITY_COLORS[viewReport.severity] || "muted"}>{viewReport.severity}</DsBadge>
                <DsBadge color={viewReport.status === "pending" ? "danger" : viewReport.status === "resolved" ? "success" : "warning"}>{viewReport.status}</DsBadge>
                <span className="text-xs uppercase tracking-widest opacity-60 ml-1">{viewReport.category?.replace(/_/g, " ")}</span>
              </div>
              
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Report Description</p>
                <div className="p-4 rounded-lg bg-black/20 text-sm leading-relaxed opacity-90 whitespace-pre-wrap">
                  {viewReport.description}
                </div>
              </div>

              {viewReport.ai_summary && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-trinity)]">AI Analysis</p>
                  <div className="p-4 rounded-lg bg-[var(--ds-trinity-glow)] border border-[var(--ds-trinity-glow)] text-sm leading-relaxed opacity-90">
                    {viewReport.ai_summary}
                    <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[10px] opacity-60">
                      <span>Routed to: {viewReport.ai_routing?.replace(/_/g, " ")}</span>
                      <span>Severity Score: {viewReport.ai_severity_score}</span>
                    </div>
                  </div>
                </div>
              )}

              {viewReport.status !== "resolved" && (
                <div className="space-y-3 pt-4 border-t border-[var(--ds-border)]">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70 text-center">Manage Resolution</p>
                  <div className="flex gap-3">
                    <DsButton variant="outline" className="flex-1" onClick={() => resolveReport.mutate({ id: viewReport.id, status: "reviewing" })}>
                      Under Review
                    </DsButton>
                    <DsButton className="flex-1" onClick={() => resolveReport.mutate({ id: viewReport.id, status: "resolved", resolution: "Investigated and addressed per policy." })}>
                      Mark Resolved
                    </DsButton>
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <DsButton variant="ghost" onClick={() => setViewReport(null)}>Close</DsButton>
              </div>
            </div>
          )}
        </UniversalModalContent>
      </UniversalModal>
    </DsPageWrapper>
  );
}
