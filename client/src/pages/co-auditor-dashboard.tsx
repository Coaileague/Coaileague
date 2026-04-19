/**
 * Co-Auditor Dashboard — Section 27 wiring for the auditor portal
 * (priority #3 + #13 + #14 from the Completion Truth Document).
 *
 * End-to-end workflow, no new endpoints added:
 *
 *   1. On load, fetch GET /api/auditor/me; if ndaAccepted=false, a
 *      full-page modal blocks all content until the auditor types
 *      their signature and POSTs /api/auditor/nda/accept.
 *
 *   2. GET /api/auditor/me/workspaces renders the multi-tenant rollup.
 *      Each row shows company name, active-audit count, last-audit
 *      date, and a live compliance score badge.
 *
 *   3. Clicking a workspace opens the compliance drawer which fetches
 *      GET /api/auditor/compliance-score/:workspaceId — component
 *      breakdown (licensing/qualifications/inspections/insurance/
 *      incidents) + 90-day trend sparkline from
 *      GET /api/auditor/compliance-trend/:workspaceId.
 *
 *   4. "Flag finding" button in the drawer POSTs
 *      /api/auditor/flag/:workspaceId (severity + subject + body).
 *      "Past flags" list in the drawer reads
 *      GET /api/auditor/notifications/:workspaceId.
 *
 * Also preserves the original Audits view (opened/pending/closed) and
 * the "request new audit" form.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Bell, Calendar, FileText, Flag, Loader2, Plus, ShieldCheck, TrendingUp, X,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types mirroring server responses ────────────────────────────────────────

interface MeResponse {
  ok: boolean;
  auditorId?: string;
  ndaAccepted?: boolean;
  ndaVersion?: string;
}

interface Audit {
  id: string;
  workspace_id: string;
  license_number: string | null;
  status: string;
  opened_at: string;
  closes_at: string;
  closed_at: string | null;
  scope: string;
}

interface WorkspaceRollupRow {
  workspaceId: string;
  companyName: string | null;
  activeAudits: number;
  lastAuditAt: string | null;
}

interface ComplianceScore {
  workspaceId: string;
  score: number;
  components: {
    licensing: number;
    qualifications: number;
    inspections: number;
    insurance: number;
    incidents: number;
  };
  notes: string[];
}

interface TrendPoint {
  score: number;
  recordedAt: string;
}

interface RegulatorNotification {
  id: string;
  severity: 'info' | 'warning' | 'violation' | 'critical';
  subject: string;
  body: string;
  created_at: string;
}

// ─── NDA gate modal ──────────────────────────────────────────────────────────

function NdaGate({
  version,
  onAccepted,
}: {
  version: string;
  onAccepted: () => void;
}): JSX.Element {
  const { toast } = useToast();
  const [signatureName, setSignatureName] = useState("");
  const mut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auditor/nda/accept", { signatureName }),
    onSuccess: () => {
      toast({ title: "NDA accepted", description: "Portal access unlocked." });
      onAccepted();
    },
    onError: (err: any) => {
      toast({ title: "Could not record acceptance", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={() => { /* cannot dismiss — NDA is a gate */ }}>
      <DialogContent className="max-w-2xl" data-testid="dialog-nda-gate">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Auditor Non-Disclosure Agreement
          </DialogTitle>
          <DialogDescription>
            Version {version}. You must accept before viewing tenant data.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto text-sm space-y-2 border rounded-md p-3 bg-muted/30">
          <p>
            By signing below, you (the "Auditor") agree that data accessed
            through this portal is the confidential property of the Licensed
            Company and CoAIleague LLC. You may use it only for the purpose
            of the authorized regulatory audit. You must not redistribute,
            publish, or share this data outside the scope of the authorizing
            action.
          </p>
          <p>
            Every action is logged in an immutable audit trail. Your
            signature is captured with timestamp, IP address, and User-Agent
            for regulatory defensibility. Full terms: docs/legal/AUDITOR_NDA_TEMPLATE.md.
          </p>
        </div>
        <div>
          <Label htmlFor="nda-signature">Sign by typing your full legal name</Label>
          <Input
            id="nda-signature"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="e.g. Jane Smith"
            data-testid="input-nda-signature"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || signatureName.trim().length < 2}
            data-testid="button-accept-nda"
          >
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            I Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tiny sparkline SVG (dep-free) ───────────────────────────────────────────

function Sparkline({ points }: { points: TrendPoint[] }): JSX.Element {
  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground">No trend data yet.</p>;
  }
  const w = 240;
  const h = 48;
  const xs = points.map((_, i) => (i / Math.max(1, points.length - 1)) * w);
  const ys = points.map((p) => h - (p.score / 100) * h);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-label="90-day compliance trend">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1={0} y1={h} x2={w} y2={h} stroke="currentColor" strokeOpacity={0.15} />
    </svg>
  );
}

// ─── Workspace detail drawer (score + trend + flag + notifications) ─────────

function WorkspaceDrawer({
  workspaceId,
  companyName,
  open,
  onOpenChange,
}: {
  workspaceId: string | null;
  companyName: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: score } = useQuery<{ ok: boolean } & ComplianceScore>({
    queryKey: ["/api/auditor/compliance-score", workspaceId],
    enabled: !!workspaceId && open,
  });

  const { data: trend } = useQuery<{ ok: boolean; trend: TrendPoint[] }>({
    queryKey: ["/api/auditor/compliance-trend", workspaceId],
    enabled: !!workspaceId && open,
  });

  const { data: notifs } = useQuery<{ ok: boolean; notifications: RegulatorNotification[] }>({
    queryKey: ["/api/auditor/notifications", workspaceId],
    enabled: !!workspaceId && open,
  });

  // Flag form state
  const [severity, setSeverity] = useState<'info' | 'warning' | 'violation' | 'critical'>('warning');
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const flagMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/auditor/flag/${workspaceId}`, { severity, subject, body }),
    onSuccess: () => {
      toast({ title: "Finding flagged", description: "Tenant owner has been notified." });
      setSubject(""); setBody(""); setSeverity('warning');
      qc.invalidateQueries({ queryKey: ["/api/auditor/notifications", workspaceId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to flag", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto" data-testid="sheet-workspace-detail">
        <SheetHeader>
          <SheetTitle>{companyName || workspaceId || "Workspace"}</SheetTitle>
          <SheetDescription>Compliance detail, trend, and flagged findings.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="score" className="mt-4">
          <TabsList>
            <TabsTrigger value="score" data-testid="tab-workspace-score">Score</TabsTrigger>
            <TabsTrigger value="trend" data-testid="tab-workspace-trend">Trend</TabsTrigger>
            <TabsTrigger value="flag" data-testid="tab-workspace-flag">Flag finding</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-workspace-history">Past flags</TabsTrigger>
          </TabsList>

          <TabsContent value="score" className="space-y-3">
            {!score ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Composite score</span>
                    <span
                      className={
                        score.score >= 80 ? "text-emerald-600" :
                        score.score >= 60 ? "text-amber-600" : "text-red-600"
                      }
                      data-testid="workspace-score"
                    >
                      {score.score}/100
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.entries(score.components).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="capitalize">{k}</span>
                      <Badge variant={v >= 80 ? "secondary" : v >= 60 ? "outline" : "destructive"}>
                        {v}%
                      </Badge>
                    </div>
                  ))}
                  {score.notes.length > 0 && (
                    <div className="mt-3 border-t pt-2 text-xs text-muted-foreground space-y-1">
                      {score.notes.map((n, i) => (
                        <div key={i}>• {n}</div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="trend">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> 90-day trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Sparkline points={trend?.trend ?? []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flag" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4" /> Flag a finding
                </CardTitle>
                <CardDescription>
                  The tenant owner is notified via in-app + email. The flag
                  is logged permanently in the regulator-notification table.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Severity</Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                    <SelectTrigger data-testid="select-flag-severity"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="violation">Violation</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="flag-subject">Subject</Label>
                  <Input id="flag-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short headline" data-testid="input-flag-subject" />
                </div>
                <div>
                  <Label htmlFor="flag-body">Details</Label>
                  <Textarea id="flag-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Cite the statute / rule and explain the finding." data-testid="input-flag-body" />
                </div>
                <Button
                  onClick={() => flagMut.mutate()}
                  disabled={flagMut.isPending || subject.length < 3 || body.length < 5}
                  data-testid="button-submit-flag"
                >
                  {flagMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit flag
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Past flags for this workspace
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notifs?.notifications?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None on file.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {notifs?.notifications?.map((n) => (
                      <li key={n.id} className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{n.subject}</span>
                          <Badge variant={
                            n.severity === 'critical' || n.severity === 'violation' ? "destructive"
                            : n.severity === 'warning' ? "secondary" : "outline"
                          }>
                            {n.severity}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{n.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─── Workspace rollup card (with live score badge) ──────────────────────────

function WorkspaceRow({
  ws,
  onOpen,
}: {
  ws: WorkspaceRollupRow;
  onOpen: (ws: WorkspaceRollupRow) => void;
}): JSX.Element {
  const { data: scoreResp } = useQuery<{ ok: boolean } & ComplianceScore>({
    queryKey: ["/api/auditor/compliance-score", ws.workspaceId],
  });
  const score = scoreResp?.score;

  return (
    <button
      type="button"
      onClick={() => onOpen(ws)}
      className="w-full text-left border border-slate-800 hover:border-slate-600 rounded-lg p-3 transition"
      data-testid={`workspace-row-${ws.workspaceId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{ws.companyName || ws.workspaceId}</div>
          <div className="text-xs text-slate-500 mt-1 font-mono">{ws.workspaceId.slice(0, 24)}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
            <span>Active audits: {ws.activeAudits}</span>
            {ws.lastAuditAt && <span>Last: {new Date(ws.lastAuditAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {score !== undefined ? (
            <div>
              <div className={
                score >= 80 ? "text-2xl font-bold text-emerald-400" :
                score >= 60 ? "text-2xl font-bold text-amber-400" : "text-2xl font-bold text-red-400"
              }>
                {score}
              </div>
              <div className="text-[10px] uppercase text-slate-500 tracking-wider">Compliance</div>
            </div>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Main dashboard ─────────────────────────────────────────────────────────

export default function CoAuditorDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: me, refetch: refetchMe, isLoading: meLoading } = useQuery<MeResponse>({
    queryKey: ["/api/auditor/me"],
  });

  const needsAuth = !meLoading && me && !me.ok;
  if (needsAuth) {
    setLocation("/co-auditor/login");
  }

  const ndaAccepted = me?.ndaAccepted === true;

  const { data: workspacesResp } = useQuery<{ ok: boolean; workspaces: WorkspaceRollupRow[] }>({
    queryKey: ["/api/auditor/me/workspaces"],
    enabled: ndaAccepted,
  });

  const { data: auditsResp } = useQuery<{ ok: boolean; audits: Audit[] }>({
    queryKey: ["/api/auditor/me/audits"],
    enabled: ndaAccepted,
  });

  const workspaces = workspacesResp?.workspaces ?? [];
  const audits = auditsResp?.audits ?? [];

  const [showRequest, setShowRequest] = useState(false);
  const [drawerWorkspaceId, setDrawerWorkspaceId] = useState<string | null>(null);
  const [drawerCompany, setDrawerCompany] = useState<string | null>(null);

  // Request-new-audit form
  const [reqWorkspaceId, setReqWorkspaceId] = useState("");
  const [reqLicense, setReqLicense] = useState("");
  const [reqOrderDoc, setReqOrderDoc] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  const requestMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/auditor/audits", {
        workspaceId: reqWorkspaceId,
        licenseNumber: reqLicense || undefined,
        orderDocUrl: reqOrderDoc || undefined,
        notes: reqNotes || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Audit request queued" });
      setShowRequest(false);
      setReqWorkspaceId(""); setReqLicense(""); setReqOrderDoc(""); setReqNotes("");
      qc.invalidateQueries({ queryKey: ["/api/auditor/me/audits"] });
      qc.invalidateQueries({ queryKey: ["/api/auditor/me/workspaces"] });
    },
    onError: (err: any) => {
      toast({ title: "Request failed", description: err?.message, variant: "destructive" });
    },
  });

  async function logout(): Promise<void> {
    await apiRequest("POST", "/api/auditor/logout", {});
    setLocation("/co-auditor/login");
  }

  if (meLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {me?.ok && !ndaAccepted && me.ndaVersion && (
        <NdaGate version={me.ndaVersion} onAccepted={() => refetchMe()} />
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold">Auditor portal</h1>
              <p className="text-slate-400 text-sm">Read &amp; print only — Co-League Compliance Concierge</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRequest((s) => !s)} className="border-slate-700" data-testid="button-request-audit">
              <Plus className="w-4 h-4 mr-2" /> Request new audit
            </Button>
            <Button variant="ghost" onClick={logout}>Sign out</Button>
          </div>
        </header>

        {showRequest && (
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Request a new audit window</CardTitle>
              <CardDescription className="text-slate-400">
                Submit the workspace ID + license number you've been authorized to audit. Trinity queues it for tenant review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Workspace ID</Label><Input value={reqWorkspaceId} onChange={(e) => setReqWorkspaceId(e.target.value)} className="bg-slate-800 border-slate-700" data-testid="input-req-workspace" /></div>
              <div><Label>License number</Label><Input value={reqLicense} onChange={(e) => setReqLicense(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              <div><Label>Order document URL</Label><Input value={reqOrderDoc} onChange={(e) => setReqOrderDoc(e.target.value)} className="bg-slate-800 border-slate-700" /></div>
              <div><Label>Notes</Label><Textarea value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} className="bg-slate-800 border-slate-700" rows={3} /></div>
              <Button onClick={() => requestMut.mutate()} disabled={!reqWorkspaceId || requestMut.isPending} className="bg-emerald-600 hover:bg-emerald-500">
                {requestMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit request
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="workspaces">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="workspaces" data-testid="tab-workspaces">Workspaces ({workspaces.length})</TabsTrigger>
            <TabsTrigger value="audits" data-testid="tab-audits">Audits ({audits.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="workspaces">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Licensed workspaces</CardTitle>
                <CardDescription className="text-slate-400">
                  Every company you have (or had) an audit with. Click a row to see the compliance breakdown and flag findings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspaces.length === 0 ? (
                  <p className="text-slate-400">No workspaces on file yet. Request an audit to get started.</p>
                ) : (
                  <div className="space-y-2">
                    {workspaces.map((ws) => (
                      <WorkspaceRow
                        key={ws.workspaceId}
                        ws={ws}
                        onOpen={(w) => { setDrawerWorkspaceId(w.workspaceId); setDrawerCompany(w.companyName); }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audits">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle>Your audits</CardTitle>
              </CardHeader>
              <CardContent>
                {audits.length === 0 ? (
                  <p className="text-slate-400">No audits on file.</p>
                ) : (
                  <div className="space-y-3">
                    {audits.map((a) => (
                      <div key={a.id} className="border border-slate-800 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-mono text-sm text-slate-400">{a.id}</div>
                            <div className="font-semibold mt-1">License: {a.license_number || "—"}</div>
                            <div className="text-sm text-slate-400">Workspace: {a.workspace_id}</div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                              <Calendar className="w-3 h-3" />
                              Opened {new Date(a.opened_at).toLocaleDateString()} · Closes {new Date(a.closes_at).toLocaleDateString()}
                            </div>
                          </div>
                          <Badge className={
                            a.status === 'closed' ? 'bg-slate-700' :
                            a.status === 'pending_review' ? 'bg-amber-700' :
                            'bg-emerald-700'
                          }>
                            {a.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-slate-600 text-center">
          Every action is recorded in the auditor session log for regulatory defensibility.
        </p>
      </div>

      <WorkspaceDrawer
        workspaceId={drawerWorkspaceId}
        companyName={drawerCompany}
        open={!!drawerWorkspaceId}
        onOpenChange={(v) => { if (!v) setDrawerWorkspaceId(null); }}
      />
    </div>
  );
}
