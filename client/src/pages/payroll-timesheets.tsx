import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, CheckCircle2, XCircle, Clock, Calendar, ChevronRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription } from "@/components/ui/universal-modal";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { MANAGER_ROLES } from "@shared/lib/rbac/roleDefinitions";
import type { WorkspaceRole } from "@/hooks/useWorkspaceAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Timesheet {
  id: string;
  workspaceId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  employeeFirstName: string | null;
  employeeLastName: string | null;
}

interface TimesheetEntry {
  id: string;
  timesheetId: string;
  entryDate: string;
  hoursWorked: string;
  notes: string | null;
}

interface TimesheetDetail extends Timesheet {
  entries: TimesheetEntry[];
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  workspaceRole?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
  submitted: { label: "Submitted", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_VARIANTS[status] ?? STATUS_VARIANTS.draft;
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

function isManagerRole(role: WorkspaceRole): boolean {
  return (MANAGER_ROLES as string[]).includes(role);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PayrollTimesheets() {
  const { toast } = useToast();
  const { workspaceRole } = useWorkspaceAccess();
  const canManage = isManagerRole(workspaceRole);

  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ─── Queries ───────────────────────────────────────────────────────────

  const timesheetsQuery = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
    queryFn: async () => {
      const res = await fetch("/api/timesheets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load timesheets");
      return res.json();
    },
  });

  const detailQuery = useQuery<TimesheetDetail>({
    queryKey: ["/api/timesheets", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load timesheet");
      return res.json();
    },
  });

  const employeesQuery = useQuery<{ data: Employee[] }, Error, Employee[]>({
    queryKey: ["/api/employees"],
    enabled: canManage,
    queryFn: async () => {
      const res = await fetch("/api/employees", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employees");
      return res.json();
    },
    select: (r) => r?.data ?? [],
  });

  // ─── Mutations ─────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}/submit`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", selectedId] });
      toast({ title: "Timesheet Submitted", description: "Your timesheet has been submitted for approval." });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Submit Failed", description: e.message }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to approve timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", selectedId] });
      toast({ title: "Timesheet Approved", description: "The timesheet has been approved." });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Approve Failed", description: e.message }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/timesheets/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to reject timesheet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", selectedId] });
      setShowRejectModal(false);
      setRejectReason("");
      toast({ title: "Timesheet Rejected", description: "The timesheet has been rejected." });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Reject Failed", description: e.message }),
  });

  // ─── Selected timesheet ─────────────────────────────────────────────────

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  const backToList = () => {
    setView("list");
    setSelectedId(null);
    setRejectReason("");
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const pageConfig: CanvasPageConfig = {
    id: "payroll-timesheets",
    title: "Payroll Timesheets",
    subtitle: canManage
      ? "Create, review, and approve employee weekly timesheets"
      : "View and submit your weekly timesheets",
    category: "operations",
  };

  if (view === "detail" && selectedId) {
    return (
      <CanvasHubPage config={pageConfig}>
        <TimesheetDetailView
          timesheetId={selectedId}
          detail={detailQuery.data ?? null}
          isLoading={detailQuery.isLoading}
          canManage={canManage}
          onBack={backToList}
          onSubmit={() => submitMutation.mutate(selectedId)}
          onApprove={() => approveMutation.mutate(selectedId)}
          onRejectOpen={() => setShowRejectModal(true)}
          isActing={submitMutation.isPending || approveMutation.isPending}
        />
        {/* Reject modal */}
        <UniversalModal open={showRejectModal} onOpenChange={setShowRejectModal}>
          <UniversalModalContent>
            <UniversalModalHeader>
              <UniversalModalTitle>Reject Timesheet</UniversalModalTitle>
              <UniversalModalDescription>
                Provide a reason for rejection. The employee will be notified.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason for Rejection</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Explain why this timesheet is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  data-testid="input-reject-reason"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                  disabled={rejectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectReason.trim() || rejectMutation.isPending}
                  data-testid="button-confirm-reject"
                  onClick={() => rejectMutation.mutate({ id: selectedId, reason: rejectReason })}
                >
                  {rejectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Reject Timesheet
                </Button>
              </div>
            </div>
          </UniversalModalContent>
        </UniversalModal>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {timesheetsQuery.data && (
            <p className="text-sm text-muted-foreground">
              {timesheetsQuery.data.length} timesheet{timesheetsQuery.data.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          data-testid="button-new-timesheet"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Timesheet
        </Button>
      </div>

      {/* List */}
      {timesheetsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !timesheetsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Timesheets Yet</h3>
            <p className="text-muted-foreground mb-4">
              {canManage
                ? "Create a timesheet to start tracking weekly hours."
                : "No timesheets have been created for you yet."}
            </p>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-first">
              <Plus className="mr-2 h-4 w-4" />
              New Timesheet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {timesheetsQuery.data.map((ts) => (
            <Card
              key={ts.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openDetail(ts.id)}
              data-testid={`card-timesheet-${ts.id}`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      {canManage && (ts.employeeFirstName || ts.employeeLastName) && (
                        <p className="font-medium text-sm truncate">
                          {ts.employeeFirstName} {ts.employeeLastName}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {ts.periodStart} – {ts.periodEnd}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium">{Number(ts.totalHours).toFixed(1)} hrs</span>
                    <StatusBadge status={ts.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      <CreateTimesheetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        canManage={canManage}
        employees={employeesQuery.data ?? []}
        onCreated={(id) => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
          openDetail(id);
        }}
      />
    </CanvasHubPage>
  );
}

// ─── Create Timesheet Modal ─────────────────────────────────────────────────

function CreateTimesheetModal({
  open,
  onClose,
  canManage,
  employees,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  employees: Employee[];
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, periodStart, periodEnd, notes: notes || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create timesheet");
      }
      return res.json() as Promise<Timesheet>;
    },
    onSuccess: (ts) => {
      toast({ title: "Timesheet Created", description: "Draft timesheet created. Add daily hours." });
      onCreated(ts.id);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Create Failed", description: e.message }),
  });

  // When period start changes, auto-set end to +6 days (standard week)
  const handleStartChange = (val: string) => {
    setPeriodStart(val);
    if (val) {
      const d = new Date(val);
      d.setDate(d.getDate() + 6);
      setPeriodEnd(d.toISOString().split("T")[0]);
    }
  };

  return (
    <UniversalModal open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <UniversalModalContent>
        <UniversalModalHeader>
          <UniversalModalTitle>New Timesheet</UniversalModalTitle>
          <UniversalModalDescription>
            Create a weekly timesheet. After creation you can add daily hours.
          </UniversalModalDescription>
        </UniversalModalHeader>
        <div className="space-y-4 mt-4">
          {canManage && employees.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="employee-select">Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="employee-select" data-testid="select-employee">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-start">Period Start</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => handleStartChange(e.target.value)}
                data-testid="input-period-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-end">Period End</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                data-testid="input-period-end"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any notes about this pay period…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                !periodStart ||
                !periodEnd ||
                (canManage && employees.length > 0 && !employeeId)
              }
              onClick={() => mutation.mutate()}
              data-testid="button-create-timesheet"
            >
              {mutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Create Timesheet</>
              )}
            </Button>
          </div>
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

// ─── Timesheet Detail View ──────────────────────────────────────────────────

function TimesheetDetailView({
  timesheetId,
  detail,
  isLoading,
  canManage,
  onBack,
  onSubmit,
  onApprove,
  onRejectOpen,
  isActing,
}: {
  timesheetId: string;
  detail: TimesheetDetail | null;
  isLoading: boolean;
  canManage: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onRejectOpen: () => void;
  isActing: boolean;
}) {
  const { toast } = useToast();

  // Build a complete list of days for the period
  const days = useMemo(() => {
    if (!detail) return [];
    return eachDayOfInterval({
      start: parseISO(detail.periodStart),
      end: parseISO(detail.periodEnd),
    });
  }, [detail?.periodStart, detail?.periodEnd]);

  // Local hour state for editing
  const [hourMap, setHourMap] = useState<Record<string, string>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Initialise hour map when detail loads
  useEffect(() => {
    if (!detail) return;
    const hm: Record<string, string> = {};
    const nm: Record<string, string> = {};
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const entry = detail.entries.find((e) => e.entryDate === key);
      hm[key] = entry ? String(Number(entry.hoursWorked)) : "0";
      nm[key] = entry?.notes ?? "";
    }
    setHourMap(hm);
    setNoteMap(nm);
    setIsDirty(false);
  }, [detail?.id, detail?.entries?.length]);

  const totalHours = useMemo(
    () => Object.values(hourMap).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [hourMap],
  );

  const saveEntriesMutation = useMutation({
    mutationFn: async () => {
      const entries = days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        return { date: key, hours: Number(hourMap[key]) || 0, notes: noteMap[key] || undefined };
      });
      const res = await fetch(`/api/timesheets/${timesheetId}/entries`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save hours");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets", timesheetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setIsDirty(false);
      toast({ title: "Hours Saved", description: `Total: ${totalHours.toFixed(1)} hours.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Save Failed", description: e.message }),
  });

  if (isLoading || !detail) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isLocked = detail.status !== "draft";
  const canSubmit = detail.status === "draft";
  const canApproveOrReject = canManage && detail.status === "submitted";

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
            ← Back to list
          </Button>
          <h2 className="text-xl font-semibold">
            {detail.employeeFirstName} {detail.employeeLastName}
          </h2>
          <p className="text-muted-foreground text-sm">
            Period: {detail.periodStart} – {detail.periodEnd}
          </p>
        </div>
        <StatusBadge status={detail.status} />
      </div>

      {/* Hours grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Hours</CardTitle>
          {!isLocked && (
            <CardDescription>Enter hours for each day. Max 16h/day · Max 60h/week.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayLabel = format(d, "EEEE, MMM d");
              return (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-36 text-sm font-medium shrink-0">{dayLabel}</span>
                  <Input
                    type="number"
                    min="0"
                    max="16"
                    step="0.5"
                    className="w-24"
                    value={hourMap[key] ?? "0"}
                    disabled={isLocked}
                    data-testid={`input-hours-${key}`}
                    onChange={(e) => {
                      setHourMap((prev) => ({ ...prev, [key]: e.target.value }));
                      setIsDirty(true);
                    }}
                  />
                  <span className="text-sm text-muted-foreground">hrs</span>
                  {!isLocked && (
                    <Input
                      type="text"
                      placeholder="Notes (optional)"
                      className="flex-1 text-sm"
                      value={noteMap[key] ?? ""}
                      onChange={(e) => {
                        setNoteMap((prev) => ({ ...prev, [key]: e.target.value }));
                        setIsDirty(true);
                      }}
                    />
                  )}
                </div>
              );
            })}
            {/* Total row */}
            <div className="flex items-center gap-4 pt-3 border-t">
              <span className="w-36 text-sm font-bold shrink-0">Total</span>
              <span
                className="w-24 text-sm font-bold text-center"
                data-testid="text-total-hours"
              >
                {totalHours.toFixed(1)}
              </span>
              <span className="text-sm font-bold text-muted-foreground">hrs</span>
            </div>
          </div>

          {/* Save button for draft */}
          {!isLocked && isDirty && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => saveEntriesMutation.mutate()}
                disabled={saveEntriesMutation.isPending}
                data-testid="button-save-hours"
              >
                {saveEntriesMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                ) : "Save Hours"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection reason */}
      {detail.status === "rejected" && detail.rejectionReason && (
        <Card className="border-destructive/50">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-destructive mb-1">Rejection Reason</p>
            <p className="text-sm text-muted-foreground">{detail.rejectionReason}</p>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {canSubmit && (
          <Button
            onClick={onSubmit}
            disabled={isActing || saveEntriesMutation.isPending}
            data-testid="button-submit-timesheet"
          >
            {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
            Submit for Approval
          </Button>
        )}
        {canApproveOrReject && (
          <>
            <Button
              onClick={onApprove}
              disabled={isActing}
              data-testid="button-approve-timesheet"
            >
              {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={onRejectOpen}
              disabled={isActing}
              data-testid="button-reject-timesheet"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </>
        )}
        {detail.status === "approved" && (
          <div className="flex items-center gap-2 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Approved</span>
          </div>
        )}
      </div>
    </div>
  );
}
