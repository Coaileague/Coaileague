import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Building2, Users, FileText, AlertTriangle, ShieldCheck,
  DollarSign, Brain, Zap, Clock, RefreshCw, CheckCircle2, XCircle,
  Unlock, RotateCcw, Bell, UserCheck, ChevronRight, Activity, Search
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  inactive:  "bg-muted text-muted-foreground",
};

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-muted-foreground uppercase tracking-wide">
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function SupportConsoleWorkspacePage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const workspaceId = params.get("id") || "";
  const { toast } = useToast();

  const [actionDialog, setActionDialog] = useState<{ open: boolean; action?: string }>({ open: false });
  const [actionForm, setActionForm] = useState({
    actionType: "", targetEntityType: "user", targetEntityId: "", reason: ""
  });
  const [searchQuery, setSearchQuery] = useState("");

  const { data: wsDetails, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/admin/workspaces", workspaceId, "details"],
    queryFn: () => workspaceId
      ? apiRequest("GET", `/api/admin/workspaces/${workspaceId}/details`).then(r => r.json())
      : Promise.resolve(null),
    enabled: !!workspaceId,
  });

  const { data: orgState } = useQuery<any>({
    queryKey: ["/api/trinity/org-state", workspaceId],
    queryFn: () => workspaceId
      ? apiRequest("GET", `/api/trinity/org-state/${workspaceId}`).then(r => r.json())
      : Promise.resolve(null),
    enabled: !!workspaceId,
    refetchInterval: 120000,
  });

  const { data: actionRegistry } = useQuery<any[]>({
    queryKey: ["/api/support/actions/registry"],
  });

  const executeMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest("POST", "/api/support/actions/execute", payload).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Action executed", description: data.actionDescription });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/workspaces", workspaceId, "details"] });
      } else {
        toast({ title: "Action failed", description: data.error, variant: "destructive" });
      }
      setActionDialog({ open: false });
    },
    onError: () => toast({ title: "Error", description: "Failed to execute action", variant: "destructive" }),
  });

  const refreshOrgMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/trinity/org-state/${workspaceId}/refresh`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Refreshed", description: "Org state updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/trinity/org-state", workspaceId] });
    },
  });

  if (!workspaceId) {
    return (
      <div className="text-center p-12 text-muted-foreground">
        <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No workspace selected. Return to the support console and select a workspace.</p>
        <Button className="mt-4" onClick={() => setLocation("/admin/support-console")} data-testid="button-back-no-ws">
          Back to Console
        </Button>
      </div>
    );
  }

  const ws        = wsDetails?.workspace;
  const officers  = wsDetails?.officers ?? [];
  const shifts    = wsDetails?.activeShifts ?? [];
  const invoices  = wsDetails?.openInvoices ?? [];
  const incidents = wsDetails?.recentIncidents ?? [];
  const compliance = wsDetails?.complianceAlerts ?? [];
  const tickets   = wsDetails?.recentTickets ?? [];
  const trinityLog = wsDetails?.trinityActivity ?? [];

  const modeColors: Record<string, string> = {
    THRIVING: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    STABLE:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    AT_RISK:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    CRISIS:   "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    SURVIVAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  const filteredOfficers = officers.filter((o: any) =>
    !searchQuery || [o.first_name, o.last_name, o.email].join(" ").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            data-testid="button-back-workspace"
            onClick={() => setLocation("/admin/support-console")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {isLoading ? <Skeleton className="h-5 w-48" /> : (ws?.name || workspaceId)}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">{workspaceId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orgState?.mode && (
            <Badge className={modeColors[orgState.mode] || ""} data-testid="badge-org-mode">
              <Brain className="w-3 h-3 mr-1" />
              {orgState.mode} · {orgState.survivalScore}/100
            </Badge>
          )}
          <Button
            variant="outline"
            size="default"
            data-testid="button-refresh-workspace"
            onClick={() => { refetch(); refreshOrgMutation.mutate(); }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            data-testid="button-execute-action"
            onClick={() => setActionDialog({ open: true })}
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Execute Action
          </Button>
        </div>
      </div>

      {/* Trinity Org State Panel */}
      {orgState && (
        <Card className="border-purple-500/30 bg-purple-50/20 dark:bg-purple-900/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              Trinity Situational Assessment
            </CardTitle>
            <CardDescription className="text-xs">{orgState.modeRationale}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-2 mb-4">
              {Object.entries(orgState.domainScores || {}).map(([domain, score]: [string, any]) => {
                const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-500";
                return (
                  <div key={domain} className="text-center">
                    <p className={`text-lg font-bold ${color}`} data-testid={`score-${domain}`}>{score}</p>
                    <p className="text-xs text-muted-foreground capitalize">{domain.replace(/([A-Z])/g, ' $1').trim()}</p>
                  </div>
                );
              })}
            </div>
            {orgState.threatSignals?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Active Threats</p>
                {orgState.threatSignals.slice(0, 3).map((t: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs" data-testid={`threat-signal-${i}`}>
                    <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${
                      t.severity === 'critical' ? 'text-red-500' :
                      t.severity === 'high' ? 'text-orange-500' : 'text-yellow-500'
                    }`} />
                    <div>
                      <span className="font-medium">{t.signal}</span>
                      <span className="text-muted-foreground ml-1">— {t.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {orgState.priorityStack?.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Trinity Priority Stack</p>
                {orgState.priorityStack.slice(0, 4).map((p: any) => (
                  <div key={p.rank} className="flex items-center gap-2 text-xs" data-testid={`priority-item-${p.rank}`}>
                    <span className="font-mono text-muted-foreground w-4">{p.rank}.</span>
                    <span className="flex-1">{p.action}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{p.category}</Badge>
                    {p.trinityCanExecuteAutonomously && <Zap className="w-3 h-3 text-purple-500 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList data-testid="tabs-workspace">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="officers" data-testid="tab-officers">Officers ({officers.length})</TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial">Financial</TabsTrigger>
          <TabsTrigger value="trinity" data-testid="tab-trinity">Trinity Log</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Active Officers", value: officers.filter((o: any) => o.status === "active").length, icon: Users, color: "text-blue-500" },
              { label: "Open Shifts", value: shifts.length, icon: Clock, color: "text-yellow-500" },
              { label: "Open Invoices", value: invoices.length, icon: DollarSign, color: "text-green-500" },
              { label: "Compliance Alerts", value: compliance.length, icon: ShieldCheck, color: "text-orange-500" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                  <div>
                    <p className="text-2xl font-bold">{isLoading ? "—" : s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent tickets */}
          {tickets.length > 0 && (
            <Section title="Recent Support Tickets" icon={FileText}>
              <div className="space-y-2">
                {tickets.slice(0, 5).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-ws-ticket-${t.id}`}>
                    <Badge className={t.status === "escalated" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : ""}>
                      {t.status}
                    </Badge>
                    <span className="flex-1 truncate">{t.subject || t.description?.slice(0, 60)}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recent Incidents */}
          {incidents.length > 0 && (
            <Section title="Recent Incidents" icon={AlertTriangle}>
              <div className="space-y-2">
                {incidents.slice(0, 4).map((inc: any) => (
                  <div key={inc.id} className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-incident-${inc.id}`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${inc.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'}`} />
                    <span className="flex-1 truncate">{inc.description}</span>
                    <Badge variant="outline">{inc.status}</Badge>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </TabsContent>

        {/* Officers Tab */}
        <TabsContent value="officers" className="mt-4">
          <div className="mb-3 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-testid="input-officer-search"
              placeholder="Search officers…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredOfficers.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-3 p-4" data-testid={`row-officer-${o.id}`}>
                      <UserCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{o.first_name} {o.last_name}</p>
                        <p className="text-xs text-muted-foreground">{o.email}</p>
                      </div>
                      <Badge className={STATUS_BADGE[o.status] || ""} data-testid={`badge-officer-status-${o.id}`}>
                        {o.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">{o.role}</Badge>
                      {o.locked_until && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
                          Locked
                        </Badge>
                      )}
                    </div>
                  ))}
                  {filteredOfficers.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">No officers found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operations Tab */}
        <TabsContent value="operations" className="mt-4 space-y-4">
          <Section title="Active / Open Shifts" icon={Clock}>
            {shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open shifts.</p>
            ) : (
              <div className="space-y-2">
                {shifts.slice(0, 8).map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-shift-${s.id}`}>
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <span>{new Date(s.start_time).toLocaleString()} → {new Date(s.end_time).toLocaleTimeString()}</span>
                    </div>
                    <Badge variant={s.status === "unfilled" ? "destructive" : "outline"}>{s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Compliance Alerts" icon={ShieldCheck}>
            {compliance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compliance alerts.</p>
            ) : (
              <div className="space-y-2">
                {compliance.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-compliance-${c.id}`}>
                    <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{c.officer_name || "Officer"}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.document_type} — expires {new Date(c.expiration_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                      Expiring
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-4">
          <Section title="Open Invoices" icon={DollarSign}>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open invoices.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-invoice-${inv.id}`}>
                    <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{inv.invoice_number || inv.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {new Date(inv.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-semibold text-sm">
                      ${((inv.total_amount_cents || 0) / 100).toFixed(2)}
                    </span>
                    <Badge className={inv.status === "overdue"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"}>
                      {inv.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* Trinity Log Tab */}
        <TabsContent value="trinity" className="mt-4">
          <Section title="Trinity Activity Log" icon={Brain}>
            {trinityLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Trinity activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {trinityLog.map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-md border text-sm"
                    data-testid={`row-trinity-log-${i}`}>
                    <Activity className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">{entry.action}</p>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>

      {/* Execute Action Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={open => setActionDialog({ open })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Execute Support Action
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Action Type</Label>
              <Select
                value={actionForm.actionType}
                onValueChange={v => setActionForm(f => ({ ...f, actionType: v }))}
              >
                <SelectTrigger data-testid="select-action-type">
                  <SelectValue placeholder="Choose an action…" />
                </SelectTrigger>
                <SelectContent>
                  {(actionRegistry || []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                  {(!actionRegistry || actionRegistry.length === 0) && [
                    { id: "unlock_account", label: "Unlock Account" },
                    { id: "reset_clock_in_pin", label: "Reset Clock-In PIN" },
                    { id: "resend_welcome_email", label: "Resend Welcome Email" },
                    { id: "fix_notification_delivery", label: "Fix Notification Delivery" },
                    { id: "reset_onboarding", label: "Reset Onboarding Flow" },
                    { id: "reinstate_workspace_access", label: "Reinstate Workspace Access" },
                  ].map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Entity ID</Label>
              <Input
                data-testid="input-action-entity-id"
                placeholder="User ID, employee ID, or leave blank for workspace"
                value={actionForm.targetEntityId}
                onChange={e => setActionForm(f => ({ ...f, targetEntityId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Reason / Notes</Label>
              <Textarea
                data-testid="input-action-reason"
                placeholder="Describe why this action is being taken…"
                value={actionForm.reason}
                onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false })} data-testid="button-cancel-action">
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-action"
              disabled={!actionForm.actionType || executeMutation.isPending}
              onClick={() => executeMutation.mutate({
                workspaceId,
                actionType: actionForm.actionType,
                targetEntityType: actionForm.targetEntityType,
                targetEntityId: actionForm.targetEntityId || undefined,
                reason: actionForm.reason,
              })}
            >
              {executeMutation.isPending ? "Executing…" : "Execute Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
