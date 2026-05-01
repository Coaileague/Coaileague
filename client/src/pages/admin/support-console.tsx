import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Ticket, Users, Building2, AlertTriangle, CheckCircle2,
  Clock, Zap, ShieldAlert, RefreshCw, Unlock, RotateCcw,
  Bell, FileText, UserCheck, ArrowRight, ChevronRight
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  escalated: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
};

function SupportDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; workspaceId?: string }>({ open: false });
  const [actionForm, setActionForm] = useState({ actionType: "", targetEntityType: "user", targetEntityId: "", reason: "" });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<any>({
    queryKey: ["/api/support/escalated"],
    refetchInterval: 30000
  });

  const { data: queueData } = useQuery<any>({
    queryKey: ["/api/support/priority-queue"],
    refetchInterval: 30000
  });

  const { data: searchResults } = useQuery<any[]>({
    queryKey: ["/api/admin/search", searchQuery],
    queryFn: () => searchQuery.length >= 2
      ? apiRequest("GET", `/api/admin/search?q=${encodeURIComponent(searchQuery)}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: searchQuery.length >= 2
  });

  const { data: actionRegistry } = useQuery<any[]>({
    queryKey: ["/api/support/actions/registry"]
  });

  const workspaceDetailQuery = useQuery<any>({
    queryKey: ["/api/admin/workspaces", selectedWorkspace?.workspaceId || selectedWorkspace?.id, "details"],
    queryFn: () => {
      const wsId = selectedWorkspace?.workspaceId || selectedWorkspace?.id;
      return wsId
        ? apiRequest("GET", `/api/admin/workspaces/${wsId}/details`).then(r => r.json())
        : Promise.resolve(null);
    },
    enabled: !!(selectedWorkspace?.workspaceId || selectedWorkspace?.id)
  });

  const executeMutation = useMutation({
    mutationFn: (payload) => apiRequest("POST", "/api/support/actions/execute", payload).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Action executed", description: data.actionDescription });
        setActionDialog({ open: false });
        setActionForm({ actionType: "", targetEntityType: "user", targetEntityId: "", reason: "" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/workspaces"] });
      } else {
        toast({ title: "Action failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const escalatedTickets = ticketsData?.tickets || ticketsData || [];
  const priorityQueue = queueData?.queue || queueData || [];

  const openCount = Array.isArray(escalatedTickets) ? escalatedTickets.filter((t) => t.status === 'open' || t.status === 'escalated').length : 0;

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Support Console</h1>
          <p className="text-sm text-muted-foreground">Platform-wide support operations — Trinity + Human Agents</p>
        </div>
        <Button
          data-testid="button-execute-action"
          onClick={() => setActionDialog({ open: true })}
          size="default"
        >
          <Zap className="w-4 h-4 mr-2" />
          Execute Action
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open Tickets", value: openCount, icon: Ticket, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Priority Queue", value: Array.isArray(priorityQueue) ? priorityQueue.length : 0, icon: AlertTriangle, color: "text-red-600 dark:text-red-400" },
          { label: "Actions Registry", value: actionRegistry?.length || 14, icon: Zap, color: "text-blue-600 dark:text-blue-400" },
          { label: "System Actors", value: 5, icon: ShieldAlert, color: "text-green-600 dark:text-green-400" }
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
              <div>
                <div className="text-xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="tickets" className="flex-1">
        <TabsList className="gap-1">
          <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets</TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">Search</TabsTrigger>
          <TabsTrigger value="actions" data-testid="tab-actions">Action Registry</TabsTrigger>
          <TabsTrigger value="workspace" data-testid="tab-workspace" disabled={!selectedWorkspace}>
            {selectedWorkspace ? `Workspace: ${(selectedWorkspace.workspace_name || selectedWorkspace.workspaceName || selectedWorkspace.name || '').slice(0, 20)}` : "Workspace"}
          </TabsTrigger>
        </TabsList>

        {/* TICKETS TAB */}
        <TabsContent value="tickets" className="mt-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Escalated & Open Tickets</CardTitle>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-refresh-tickets"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/support/escalated"] })}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading tickets...</div>
              ) : Array.isArray(escalatedTickets) && escalatedTickets.length > 0 ? (
                <div className="divide-y">
                  {escalatedTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex flex-wrap items-start gap-2 py-3 hover-elevate cursor-pointer rounded-md px-2"
                      data-testid={`ticket-row-${ticket.id}`}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        if (ticket.workspace_id) setSelectedWorkspace({ workspaceId: ticket.workspace_id });
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                          <Badge className={PRIORITY_COLORS[ticket.priority || 'normal']} variant="outline">
                            {ticket.priority || 'normal'}
                          </Badge>
                          <Badge className={STATUS_COLORS[ticket.status || 'open']} variant="outline">
                            {ticket.status}
                          </Badge>
                          {(ticket.assigned_to_trinity || ticket.assigned_to === 'trinity-ai' || ticket.assignedTo === 'trinity-ai') && (
                            <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400">
                              Trinity Working
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ticket.category} · {new Date(ticket.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-view-ticket-${ticket.id}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  No escalated tickets — queue is clear.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEARCH TAB */}
        <TabsContent value="search" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Platform-Wide Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search employees, workspaces, tickets by name or email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  data-testid="input-platform-search"
                />
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="divide-y border rounded-md">
                  {searchResults.map((r: any, i) => (
                    <div
                      key={`${r.entity_type}-${r.id}-${i}`}
                      className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
                      data-testid={`search-result-${i}`}
                      onClick={() => {
                        if (r.entity_type === 'workspace' || r.workspace_id) {
                          setSelectedWorkspace(r);
                        }
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        {r.entity_type === 'employee' && <Users className="w-4 h-4" />}
                        {r.entity_type === 'workspace' && <Building2 className="w-4 h-4" />}
                        {r.entity_type === 'support_ticket' && <Ticket className="w-4 h-4" />}
                        {r.entity_type === 'user' && <UserCheck className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.entity_type} · {r.workspace_name || 'Platform'}
                        </p>
                      </div>
                      {r.deep_link && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No results for "{searchQuery}"</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTION REGISTRY TAB */}
        <TabsContent value="actions" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Support Action Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {(actionRegistry || []).map((action) => (
                  <div key={action.actionType} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono">{action.actionType}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{action.category}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-run-action-${action.actionType}`}
                      onClick={() => {
                        setActionForm(f => ({ ...f, actionType: action.actionType }));
                        setActionDialog({ open: true });
                      }}
                    >
                      Run
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WORKSPACE DEEP-DIVE TAB */}
        <TabsContent value="workspace" className="mt-3">
          {selectedWorkspace ? (
            <WorkspaceDeepDive
              workspaceId={selectedWorkspace.workspaceId || selectedWorkspace.id}
              data={workspaceDetailQuery.data}
              isLoading={workspaceDetailQuery.isLoading}
              onExecuteAction={(wsId) => setActionDialog({ open: true, workspaceId: wsId })}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Select a workspace from Search or Tickets to see its details here.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Ticket detail dialog */}
      {selectedTicket && (
        <Dialog open={!!selectedTicket} onOpenChange={(o) => !o && setSelectedTicket(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-muted-foreground">{selectedTicket.ticket_number}</span>
                <Badge className={STATUS_COLORS[selectedTicket.status || 'open']} variant="outline">
                  {selectedTicket.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="font-semibold">{selectedTicket.subject}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Category:</span> {selectedTicket.category || '—'}</div>
                <div><span className="text-muted-foreground">Priority:</span> {selectedTicket.priority}</div>
                <div><span className="text-muted-foreground">Trinity:</span> {(selectedTicket.assigned_to_trinity || selectedTicket.assigned_to === 'trinity-ai' || selectedTicket.assignedTo === 'trinity-ai') ? <span className="text-amber-600 dark:text-amber-400 font-medium">Locked — Working</span> : 'No'}</div>
                <div><span className="text-muted-foreground">Attempted:</span> {selectedTicket.trinity_attempted ? 'Yes' : 'No'}</div>
              </div>
              {selectedTicket.description && (
                <div className="text-sm bg-muted rounded-md p-3">{selectedTicket.description}</div>
              )}
              {selectedTicket.trinity_transcript && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Trinity Transcript</p>
                  <div className="text-xs bg-muted rounded-md p-3 font-mono whitespace-pre-wrap max-h-32 overflow-auto">{selectedTicket.trinity_transcript}</div>
                </div>
              )}
              {selectedTicket.escalation_reason && (
                <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{selectedTicket.escalation_reason}</span>
                </div>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              <Button
                variant="outline"
                data-testid="button-view-workspace"
                onClick={() => {
                  if (selectedTicket.workspace_id) setSelectedWorkspace({ workspaceId: selectedTicket.workspace_id });
                  setSelectedTicket(null);
                }}
              >
                View Workspace
              </Button>
              <Button
                data-testid="button-execute-from-ticket"
                onClick={() => {
                  setActionDialog({ open: true, workspaceId: selectedTicket.workspace_id });
                  setSelectedTicket(null);
                }}
              >
                Execute Action
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Execute action dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(o) => !o && setActionDialog({ open: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Execute Support Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Action Type</Label>
              <Select
                value={actionForm.actionType}
                onValueChange={v => setActionForm(f => ({ ...f, actionType: v }))}
              >
                <SelectTrigger data-testid="select-action-type">
                  <SelectValue placeholder="Select an action..." />
                </SelectTrigger>
                <SelectContent>
                  {(actionRegistry || []).map((a) => (
                    <SelectItem key={a.actionType} value={a.actionType}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Workspace ID</Label>
              <Input
                value={actionDialog.workspaceId || ""}
                onChange={e => setActionDialog(d => ({ ...d, workspaceId: e.target.value }))}
                placeholder="Workspace ID"
                data-testid="input-workspace-id"
              />
            </div>
            <div>
              <Label>Target Entity Type</Label>
              <Select
                value={actionForm.targetEntityType}
                onValueChange={v => setActionForm(f => ({ ...f, targetEntityType: v }))}
              >
                <SelectTrigger data-testid="select-target-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="shift">Shift</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="notification">Notification</SelectItem>
                  <SelectItem value="form_invitation">Form Invitation</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Entity ID</Label>
              <Input
                value={actionForm.targetEntityId}
                onChange={e => setActionForm(f => ({ ...f, targetEntityId: e.target.value }))}
                placeholder="ID of the entity to act on"
                data-testid="input-target-entity-id"
              />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={actionForm.reason}
                onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Document why this action is being taken..."
                data-testid="textarea-reason"
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="button-cancel-action"
              onClick={() => setActionDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-action"
              disabled={!actionForm.actionType || !actionDialog.workspaceId || !actionForm.reason || executeMutation.isPending}
              onClick={() => executeMutation.mutate({
                actionType: actionForm.actionType,
                workspaceId: actionDialog.workspaceId,
                targetEntityType: actionForm.targetEntityType,
                targetEntityId: actionForm.targetEntityId || undefined,
                reason: actionForm.reason
              })}
            >
              {executeMutation.isPending ? "Executing..." : "Execute Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkspaceDeepDive({ workspaceId, data, isLoading, onExecuteAction }: {
  workspaceId: string;
  data: any;
  isLoading: boolean;
  onExecuteAction: (wsId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
        <Building2 className="w-10 h-10 mx-auto opacity-50 animate-pulse" />
        <p className="font-medium text-foreground">Loading workspace details</p>
        <p>Pulling operators, active shifts, invoices, and recent support activity for this organization.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
        <Building2 className="w-10 h-10 mx-auto opacity-50" />
        <p className="font-medium text-foreground">Workspace details unavailable</p>
        <p>
          This workspace may still be provisioning, or the detail snapshot could not be loaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
          <div>
            <p className="font-semibold">{data.workspace?.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{workspaceId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{data.workspace?.status}</Badge>
            {data.subscription && <Badge variant="outline">{data.subscription.plan_type}</Badge>}
            <Button
              size="sm"
              data-testid="button-workspace-execute-action"
              onClick={() => onExecuteAction(workspaceId)}
            >
              <Zap className="w-3 h-3 mr-1" />
              Action
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Officers", value: data.officers?.length || 0, icon: Users },
          { label: "Active Shifts", value: data.activeShifts?.length || 0, icon: Clock },
          { label: "Open Invoices", value: data.openInvoices?.length || 0, icon: FileText },
          { label: "Compliance Alerts", value: data.complianceAlerts?.count || 0, icon: AlertTriangle }
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-2 py-3 px-4">
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-lg font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Officers + Tickets side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {(data.officers || []).slice(0, 8).map((officer) => (
                <div key={officer.id} className="flex items-center gap-2 text-sm" data-testid={`officer-row-${officer.id}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${officer.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="flex-1 truncate">{officer.first_name} {officer.last_name}</span>
                  <span className="text-xs text-muted-foreground">{officer.role}</span>
                  {officer.locked_until && new Date(officer.locked_until) > new Date() && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs" variant="outline">
                      <Unlock className="w-2 h-2 mr-1" />locked
                    </Badge>
                  )}
                </div>
              ))}
              {(data.officers || []).length > 8 && (
                <p className="text-xs text-muted-foreground pt-1">+{data.officers.length - 8} more officers</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Support Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {(data.recentSupportTickets || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent tickets</p>
            ) : (
              <div className="space-y-2">
                {(data.recentSupportTickets ?? []).slice(0, 6).map((t) => (
                  <div key={t.id} className="text-sm" data-testid={`ws-ticket-${t.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                      <Badge className={STATUS_COLORS[t.status] || ''} variant="outline">{t.status}</Badge>
                    </div>
                    <p className="truncate text-xs mt-0.5">{t.subject}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trinity Activity */}
      {data.trinityActivity && data.trinityActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Support Actions (Trinity)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {(data.trinityActivity ?? []).slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${a.success !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1">
                    <span className="font-mono text-muted-foreground">{a.action_type}</span>
                    {a.action_description && <p className="text-muted-foreground truncate">{a.action_description}</p>}
                  </div>
                  <span className="text-muted-foreground flex-shrink-0">{new Date(a.executed_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const Icon = ({ name, className }: any) => <span className={className}>●</span>;

export default function SupportConsolePage() {
  return <SupportDashboard />;
}
