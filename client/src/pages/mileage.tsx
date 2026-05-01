import { useState, useMemo } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Car,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Pencil,
  Trash2,
  TrendingUp,
  DollarSign,
  MapPin,
  AlertTriangle,
  Info,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const IRS_RATE = 0.67;

const TRIP_TYPES = [
  { value: "client_visit", label: "Client Visit" },
  { value: "site_patrol", label: "Site Patrol" },
  { value: "training", label: "Training" },
  { value: "supply_run", label: "Supply Run" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  draft:     { label: "Draft",     variant: "secondary",    icon: <Pencil className="w-3 h-3" /> },
  submitted: { label: "Submitted", variant: "outline",      icon: <Clock className="w-3 h-3" /> },
  approved:  { label: "Approved",  variant: "default",      icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected:  { label: "Rejected",  variant: "destructive",  icon: <XCircle className="w-3 h-3" /> },
  paid:      { label: "Paid",      variant: "default",      icon: <DollarSign className="w-3 h-3" /> },
};

const REC_ICON: Record<string, React.ReactNode> = {
  action:       <AlertTriangle className="w-4 h-4 text-amber-500" />,
  alert:        <AlertTriangle className="w-4 h-4 text-red-500" />,
  insight:      <Info className="w-4 h-4 text-blue-500" />,
  optimization: <Lightbulb className="w-4 h-4 text-emerald-500" />,
};

interface MileageLog {
  id: string;
  workspaceId: string;
  employeeId: string;
  tripDate: string;
  startLocation?: string;
  endLocation?: string;
  purpose?: string;
  tripType?: string;
  miles: string;
  ratePerMile?: string;
  reimbursementAmount?: string;
  status?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
}

interface MileageSummary {
  totalMiles: string;
  totalReimbursement: string;
  pendingCount: number;
}

interface TrinityRec {
  type: string;
  priority: string;
  title: string;
  description: string;
  affectedEmployees?: string[];
  estimatedImpact?: string;
}

function LogFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: MileageLog | null;
  onSave: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!initial;

  const [form, setForm] = useState({
    tripDate: initial?.tripDate ? format(new Date(initial.tripDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    startLocation: initial?.startLocation || "",
    endLocation: initial?.endLocation || "",
    purpose: initial?.purpose || "",
    tripType: initial?.tripType || "other",
    miles: initial?.miles || "",
    ratePerMile: initial?.ratePerMile || String(IRS_RATE),
    notes: initial?.notes || "",
  });

  const estimated = useMemo(() => {
    const m = parseFloat(form.miles);
    const r = parseFloat(form.ratePerMile);
    return !isNaN(m) && !isNaN(r) ? (m * r).toFixed(2) : "0.00";
  }, [form.miles, form.ratePerMile]);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/mileage", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mileage"] });
      toast({ title: "Trip logged", description: "Mileage entry saved as draft." });
      onSave();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to save mileage log.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PATCH", `/api/mileage/${initial?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mileage"] });
      toast({ title: "Updated", description: "Mileage log updated." });
      onSave();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to update mileage log.", variant: "destructive" }),
  });

  function handleSave() {
    if (!form.miles || !form.tripDate) {
      toast({ title: "Required fields missing", description: "Date and miles are required.", variant: "destructive" });
      return;
    }
    if (isEdit) updateMutation.mutate(form);
    else createMutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Trip" : "Log a Trip"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.tripDate}
                onChange={e => setForm(f => ({ ...f, tripDate: e.target.value }))}
                data-testid="input-trip-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trip Type</Label>
              <Select value={form.tripType} onValueChange={v => setForm(f => ({ ...f, tripType: v }))}>
                <SelectTrigger data-testid="select-trip-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                placeholder="Start location"
                value={form.startLocation}
                onChange={e => setForm(f => ({ ...f, startLocation: e.target.value }))}
                data-testid="input-start-location"
              />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                placeholder="End location"
                value={form.endLocation}
                onChange={e => setForm(f => ({ ...f, endLocation: e.target.value }))}
                data-testid="input-end-location"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Input
              placeholder="Brief description of trip purpose"
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              data-testid="input-purpose"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Miles</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="0.0"
                value={form.miles}
                onChange={e => setForm(f => ({ ...f, miles: e.target.value }))}
                data-testid="input-miles"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate per Mile</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={String(IRS_RATE)}
                value={form.ratePerMile}
                onChange={e => setForm(f => ({ ...f, ratePerMile: e.target.value }))}
                data-testid="input-rate-per-mile"
              />
            </div>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Estimated reimbursement</span>
            <span className="font-semibold tabular-nums">${estimated}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              data-testid="input-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-log"
          >
            {(createMutation.isPending || updateMutation.isPending) ? "Saving…" : isEdit ? "Update" : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject Mileage Log</AlertDialogTitle>
          <AlertDialogDescription>Provide a reason for rejection. The employee will be able to revise and resubmit.</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Rejection reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="mt-2"
          data-testid="input-rejection-reason"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => reason && onConfirm(reason)}
            className="bg-destructive text-destructive-foreground"
            data-testid="button-confirm-reject"
          >
            Reject
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TrinityPanel({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [result, setResult] = useState<{ recommendations: TrinityRec[]; summary: any } | null>(null);
  const [expanded, setExpanded] = useState(true);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ai-brain/actions/execute", {
      actionId: "mileage.recommend",
      payload: { workspaceId, lookbackDays: 30 },
    }),
    onSuccess: (data) => {
      if (data?.data?.recommendations) {
        setResult(data.data);
      } else {
        toast({ title: "Trinity", description: data?.message || "Analysis complete." });
      }
    },
    onError: () => toast({ title: "Error", description: "Trinity analysis failed.", variant: "destructive" }),
  });

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Trinity Mileage Analysis</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <Button variant="ghost" size="icon" onClick={() => setExpanded(e => !e)} data-testid="button-toggle-trinity">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              data-testid="button-run-trinity"
            >
              {mutation.isPending ? "Analyzing…" : result ? "Re-analyze" : "Run Analysis"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {result && expanded && (
        <CardContent className="space-y-3">
          {result.summary && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
                <div className="font-semibold tabular-nums">{parseFloat(String(result.summary.totalMiles || 0)).toFixed(1)} mi</div>
                <div className="text-muted-foreground">Total miles</div>
              </div>
              <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
                <div className="font-semibold tabular-nums">${parseFloat(String(result.summary.totalReimbursement || 0)).toFixed(2)}</div>
                <div className="text-muted-foreground">Reimbursement</div>
              </div>
              <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
                <div className="font-semibold">{result.summary.pendingApproval ?? 0}</div>
                <div className="text-muted-foreground">Pending</div>
              </div>
            </div>
          )}

          {result.recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recommendations at this time. Mileage logs look good.</p>
          ) : (
            <div className="space-y-2">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="rounded-md border bg-card p-3 space-y-1" data-testid={`trinity-rec-${i}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {REC_ICON[rec.type] || <Info className="w-4 h-4" />}
                    <span className="text-sm font-medium flex-1">{rec.title}</span>
                    <Badge variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "outline" : "secondary"} className="text-xs">
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
                  {rec.estimatedImpact && (
                    <p className="text-xs font-medium text-primary">Impact: {rec.estimatedImpact}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function MileagePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editLog, setEditLog] = useState<MileageLog | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const workspaceId = (user as any)?.currentWorkspaceId || (user as any)?.workspaceId || "";
  const role = (user as any)?.workspaceRole || (user as any)?.role || "";
  const platformRole = (user as any)?.platformRole || "";
  const isManager = ["manager", "department_manager", "org_manager", "co_owner", "org_owner", "supervisor"].includes(role)
    || ["root_admin", "deputy_admin", "sysop", "support_manager"].includes(platformRole);

  const { data, isLoading } = useQuery<{ logs: MileageLog[]; summary: MileageSummary }>({
    queryKey: ["/api/mileage", { status: statusFilter !== "all" ? statusFilter : undefined }],
  });

  const logs = data?.logs || [];
  const summary = data?.summary;

  const submitMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/mileage/${id}/submit`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/mileage"] }); toast({ title: "Submitted for approval" }); },
    onError: () => toast({ title: "Error", description: "Failed to submit.", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/mileage/${id}/approve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/mileage"] }); toast({ title: "Approved" }); },
    onError: () => toast({ title: "Error", description: "Failed to approve.", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiRequest("POST", `/api/mileage/${id}/reject`, { reason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/mileage"] }); setRejectOpen(false); toast({ title: "Rejected" }); },
    onError: () => toast({ title: "Error", description: "Failed to reject.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mileage/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/mileage"] }); toast({ title: "Deleted" }); },
    onError: () => toast({ title: "Error", description: "Failed to delete.", variant: "destructive" }),
  });

  function openEdit(log: MileageLog) {
    setEditLog(log);
    setFormOpen(true);
  }

  function openReject(id: string) {
    setRejectTargetId(id);
    setRejectOpen(true);
  }

  const STATUS_OPTIONS = ["all", "draft", "submitted", "approved", "rejected", "paid"];

  const pageConfig: CanvasPageConfig = {
    id: 'mileage',
    title: 'Mileage Reimbursement',
    category: 'operations',
    showHeader: false,
    maxWidth: '6xl',
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Mileage Logs</h1>
          </div>
          <Button onClick={() => { setEditLog(null); setFormOpen(true); }} data-testid="button-add-trip">
            <Plus className="w-4 h-4 mr-1.5" />
            Log a Trip
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total Miles</span>
              </div>
              <p className="text-2xl font-semibold tabular-nums" data-testid="stat-total-miles">
                {isLoading ? "—" : parseFloat(summary?.totalMiles || "0").toFixed(1)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Reimbursement Value</span>
              </div>
              <p className="text-2xl font-semibold tabular-nums" data-testid="stat-total-reimbursement">
                {isLoading ? "—" : `$${parseFloat(summary?.totalReimbursement || "0").toFixed(2)}`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pending Approval</span>
              </div>
              <p className="text-2xl font-semibold tabular-nums" data-testid="stat-pending-count">
                {isLoading ? "—" : summary?.pendingCount ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Trinity panel — managers only */}
        {isManager && workspaceId && <TrinityPanel workspaceId={workspaceId} />}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Status:</span>
          {STATUS_OPTIONS.map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="capitalize"
              data-testid={`filter-${s}`}
            >
              {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
            </Button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading mileage logs…</div>
            ) : logs.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Car className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No mileage logs found.</p>
                <Button variant="outline" size="sm" onClick={() => { setEditLog(null); setFormOpen(true); }} data-testid="button-log-first-trip">
                  Log your first trip
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead className="text-right">Miles</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-36">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => {
                      const status = log.status || "draft";
                      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
                      const canEdit = ["draft", "rejected"].includes(status);
                      const canSubmit = ["draft", "rejected"].includes(status);
                      return (
                        <TableRow key={log.id} data-testid={`row-mileage-${log.id}`}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(log.tripDate), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.startLocation || log.endLocation ? (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[160px]">
                                  {[log.startLocation, log.endLocation].filter(Boolean).join(" → ")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">No route</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">
                            {log.purpose || <span className="text-muted-foreground text-xs italic">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {parseFloat(String(log.miles)).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            ${parseFloat(String(log.reimbursementAmount || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant} className="gap-1 text-xs">
                              {cfg.icon}
                              {cfg.label}
                            </Badge>
                            {log.rejectionReason && (
                              <p className="text-xs text-destructive mt-0.5 truncate max-w-[120px]" title={log.rejectionReason}>
                                {log.rejectionReason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {canEdit && (
                                <Button size="icon" variant="ghost" onClick={() => openEdit(log)} data-testid={`button-edit-${log.id}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {canSubmit && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => submitMutation.mutate(log.id)}
                                  disabled={submitMutation.isPending}
                                  data-testid={`button-submit-${log.id}`}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {isManager && status === "submitted" && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => approveMutation.mutate(log.id)}
                                    disabled={approveMutation.isPending}
                                    data-testid={`button-approve-${log.id}`}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => openReject(log.id)}
                                    data-testid={`button-reject-${log.id}`}
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                                  </Button>
                                </>
                              )}
                              {canEdit && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteMutation.mutate(log.id)}
                                  disabled={deleteMutation.isPending}
                                  data-testid={`button-delete-${log.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log/Edit dialog */}
      <LogFormDialog
        open={formOpen}
        onOpenChange={v => { setFormOpen(v); if (!v) setEditLog(null); }}
        initial={editLog}
        onSave={() => { setEditLog(null); }}
      />

      {/* Reject dialog */}
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={reason => {
          if (rejectTargetId) rejectMutation.mutate({ id: rejectTargetId, reason });
        }}
      />
    </CanvasHubPage>
  );
}
