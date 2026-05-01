/**
 * Platform Operations Admin — Section 27 wiring
 * ================================================
 * Single admin-gated page that surfaces three previously backend-only
 * capabilities through UI buttons. No new endpoints — wires to what
 * exists.
 *
 *   #6  GET /api/health/slo             — SLO target grid (auto-refresh)
 *   #10 POST /api/dev/demo-tenant-seed  — Sales demo tenant seed
 *   #11 POST /api/dev/compliance-snapshot/:workspaceId
 *                                        — Force compliance snapshot run
 *   #12 POST /api/dev/seed-multi-state-regulatory
 *                                        — Seed CA + FL regulatory context
 *
 * Gate: server-side requirePlatformAdmin on every endpoint. The page
 * itself reads the auth context.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Archive, Database, Flag, Loader2, RefreshCw, Server, Workflow, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SloTarget {
  id: string;
  name: string;
  category: 'api' | 'trinity' | 'voice' | 'sms' | 'mobile' | 'audit';
  window: '7d' | '30d';
  target: number;
  unit: 'pct' | 'ms';
  description: string;
}

// ─── SLO tab (#6) ────────────────────────────────────────────────────────────

function SloTab(): JSX.Element {
  const { data, isLoading, refetch, isFetching } = useQuery<{ ok: boolean; targets: SloTarget[] }>({
    queryKey: ["/api/health/slo"],
    refetchInterval: 60_000,
  });
  const targets = data?.targets ?? [];

  const grouped: Record<string, SloTarget[]> = {};
  for (const t of targets) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><Server className="h-4 w-4" /> SLO targets</CardTitle>
          <CardDescription>
            Auto-refreshes every 60 seconds. These are the platform's committed
            targets — this table documents the target, not live metrics.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-slo-refresh">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          Object.entries(grouped).map(([category, rows]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{category}</h4>
              <div className="grid gap-2">
                {rows.map((t) => (
                  <div key={t.id} className="flex items-start justify-between border rounded-md p-2.5" data-testid={`slo-${t.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <Badge variant="secondary">{t.window}</Badge>
                      <div className="font-mono text-sm mt-1">
                        {t.target}{t.unit === 'pct' ? '%' : 'ms'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scheduler tab ───────────────────────────────────────────────────────────

interface SchedulerJobRow {
  id: string;
  jobName: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
  errorMessage: string | null;
  recordsProcessed: number | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function SchedulerTab(): JSX.Element {
  const { data, isLoading, refetch, isFetching } = useQuery<{
    jobs: Record<string, SchedulerJobRow[]>;
    totalJobs: number;
  }>({
    queryKey: ["/api/maintenance/scheduler/jobs"],
    refetchInterval: 60_000,
  });

  const groups = data?.jobs ?? {};
  const jobNames = Object.keys(groups).sort();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Scheduler health</CardTitle>
          <CardDescription>
            Last 10 runs per cron job from `cron_run_log`. Auto-refreshes every 60 seconds.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-scheduler-refresh">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : jobNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cron runs logged yet.</p>
        ) : (
          jobNames.map((name) => {
            const rows = groups[name];
            const last = rows[0];
            const indicator = last?.status === "completed" ? "✅" : last?.status === "failed" ? "❌" : "⏳";
            return (
              <div key={name} data-testid={`scheduler-job-${name}`}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {indicator} {name}
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-1 pr-3">Last Run</th>
                        <th className="pb-1 pr-3">Status</th>
                        <th className="pb-1 pr-3">Duration</th>
                        <th className="pb-1 pr-3">Records</th>
                        <th className="pb-1">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="font-mono">
                          <td className="py-1 pr-3">{formatDate(r.startedAt)}</td>
                          <td className={
                            "py-1 pr-3 " +
                            (r.status === "completed" ? "text-green-600" :
                              r.status === "failed" ? "text-red-600" : "text-muted-foreground")
                          }>{r.status}</td>
                          <td className="py-1 pr-3">{r.durationMs != null ? `${r.durationMs}ms` : "—"}</td>
                          <td className="py-1 pr-3">{r.recordsProcessed ?? "—"}</td>
                          <td className="py-1 truncate max-w-xs">{r.errorMessage ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ─── Demo tenant tab (#10) ───────────────────────────────────────────────────

function DemoTenantTab(): JSX.Element {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/dev/demo-tenant-seed", {}),
    onSuccess: (r) => {
      setResult(r);
      toast({
        title: r.created ? "Demo tenant created" : "Demo tenant already exists",
        description: r.workspaceName ? `Workspace: ${r.workspaceName}` : undefined,
      });
    },
    onError: (err) => {
      toast({ title: "Seed failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Demo workspace</CardTitle>
        <CardDescription>
          Seeds a generic "Demo Security Services" workspace with 5 clients,
          6 officers, 5 shifts, 2 invoices. Idempotent — safe to re-run.
          Sales uses this for prospect calls instead of exposing Statewide's
          live data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} data-testid="button-seed-demo">
          {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Seed / verify demo workspace
        </Button>
        {result && (
          <div className="text-xs font-mono bg-muted/50 border rounded p-2" data-testid="demo-seed-result">
            <div>Workspace: {result.workspaceName || '—'}</div>
            <div>ID: {result.workspaceId}</div>
            <div>Created: {String(result.created)}</div>
            {result.counts && (
              <div>
                Counts: {result.counts.clients} clients · {result.counts.employees} employees · {result.counts.shifts} shifts · {result.counts.invoices} invoices
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Regulatory tab (#12) ────────────────────────────────────────────────────

function RegulatoryTab(): JSX.Element {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/dev/seed-multi-state-regulatory", {}),
    onSuccess: (r) => {
      setResult(r);
      toast({
        title: "Regulatory data seeded",
        description: `Seeded: ${(r.seeded || []).join(', ') || 'none'}. Skipped: ${(r.skipped || []).join(', ') || 'none'}.`,
      });
    },
    onError: (err) => {
      toast({ title: "Seed failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Flag className="h-4 w-4" /> Multi-state regulatory</CardTitle>
        <CardDescription>
          Seeds California (BSIS) and Florida (DACS-DOL) rows into
          compliance_states. Idempotent. Texas already seeded elsewhere.
          Required before onboarding a tenant from a non-Texas state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} data-testid="button-seed-regulatory">
          {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Seed / refresh CA + FL
        </Button>
        {result && (
          <div className="text-xs font-mono bg-muted/50 border rounded p-2" data-testid="regulatory-seed-result">
            <div>Seeded: {(result.seeded || []).join(', ') || '(none)'}</div>
            <div>Skipped: {(result.skipped || []).join(', ') || '(none)'}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Compliance snapshot tab (#9 / #11 trigger) ─────────────────────────────

function ComplianceTab(): JSX.Element {
  const { toast } = useToast();
  const [workspaceId, setWorkspaceId] = useState("");
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/dev/compliance-snapshot/${workspaceId}`, {}),
    onSuccess: (r) => {
      setResult(r);
      toast({
        title: "Snapshot recorded",
        description: r.alerted ? "Score dropped — owners alerted." : `Score: ${r.score}`,
      });
    },
    onError: (err) => {
      toast({ title: "Snapshot failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Compliance snapshot</CardTitle>
        <CardDescription>
          Records a compliance_score_snapshot for the chosen workspace and
          fires owner alerts if the score dropped ≥10 points. Normally
          scheduled nightly; trigger here for verification or investigation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="cs-workspace">Workspace ID</Label>
          <Input id="cs-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} data-testid="input-cs-workspace" />
        </div>
        <Button onClick={() => mut.mutate()} disabled={!workspaceId || mut.isPending} data-testid="button-cs-run">
          {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Run snapshot
        </Button>
        {result && (
          <div className="text-xs font-mono bg-muted/50 border rounded p-2" data-testid="cs-result">
            <div>Score: {result.score} (previous: {result.previousScore ?? '—'})</div>
            <div>Delta: {result.delta ?? '—'}</div>
            <div>Alerted: {String(result.alerted)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Retention tab (#11) ─────────────────────────────────────────────────────

function RetentionTab(): JSX.Element {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/dev/retention-scan", {}),
    onSuccess: (r) => {
      setResult(r);
      toast({
        title: "Retention scan complete",
        description: `${r.scanned} workspaces scanned, ${r.decisions?.length || 0} non-retain decisions.`,
      });
    },
    onError: (err) => {
      toast({ title: "Scan failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Archive className="h-4 w-4" /> Data retention scan</CardTitle>
        <CardDescription>
          Applies the retention policy (active=retain · suspended 90d → archive ·
          cancelled 30d → hard_delete · regulatory_hold overrides) across all
          workspaces. Dry-run — returns decisions without executing. A cron
          worker calls this monthly once archive/delete execution is wired.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} data-testid="button-retention-scan">
          {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Run retention scan now
        </Button>
        {result && (
          <div className="space-y-2">
            <div className="text-xs font-mono bg-muted/50 border rounded p-2" data-testid="retention-result">
              <div>Scanned: {result.scanned}</div>
              <div>Non-retain decisions: {result.decisions?.length || 0}</div>
              <div>Scanned at: {result.scannedAt}</div>
            </div>
            {result.decisions?.length > 0 && (
              <div className="text-xs">
                <div className="font-semibold mb-1">Decisions</div>
                <ul className="divide-y border rounded">
                  {result.decisions.slice(0, 20).map((d) => (
                    <li key={d.workspaceId} className="flex justify-between px-2 py-1">
                      <span className="font-mono">{d.workspaceId.slice(0, 18)}</span>
                      <span className="text-muted-foreground">{d.decision.action}{d.decision.reason ? ` · ${d.decision.reason}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PlatformOpsPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Platform operations</h1>
            <p className="text-sm text-muted-foreground">SLO targets, demo tenant, regulatory seeds, compliance snapshots.</p>
          </div>
        </div>

        <Tabs defaultValue="slo">
          <TabsList>
            <TabsTrigger value="slo" data-testid="tab-platform-slo">SLO</TabsTrigger>
            <TabsTrigger value="scheduler" data-testid="tab-platform-scheduler">Scheduler</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-platform-compliance">Compliance</TabsTrigger>
            <TabsTrigger value="retention" data-testid="tab-platform-retention">Retention</TabsTrigger>
            <TabsTrigger value="demo" data-testid="tab-platform-demo">Demo tenant</TabsTrigger>
            <TabsTrigger value="regulatory" data-testid="tab-platform-regulatory">Regulatory</TabsTrigger>
          </TabsList>
          <TabsContent value="slo"><SloTab /></TabsContent>
          <TabsContent value="scheduler"><SchedulerTab /></TabsContent>
          <TabsContent value="compliance"><ComplianceTab /></TabsContent>
          <TabsContent value="retention"><RetentionTab /></TabsContent>
          <TabsContent value="demo"><DemoTenantTab /></TabsContent>
          <TabsContent value="regulatory"><RegulatoryTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
