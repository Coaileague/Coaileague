/**
 * PHASE 36 — Data Subject Requests Management Dashboard
 * Platform staff: see all DSRs, update status, SLA countdown, overdue flag
 * Managers: see workspace DSRs
 * Officers: see their own requests + submit new requests
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Shield, Plus, Clock, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, FileText, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/seo";

interface DataSubjectRequest {
  id: number;
  workspace_id: string;
  requestor_id: string;
  requestor_type: string;
  request_type: string;
  status: string;
  data_types_requested: string[] | null;
  requested_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  sla_deadline: string;
  handled_by: string | null;
  response_notes: string | null;
  export_url: string | null;
  export_expires_at: string | null;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Right to Access",
  portability: "Data Portability",
  erasure: "Right to Erasure",
  restriction: "Restrict Processing",
  correction: "Data Correction",
  objection: "Object to Processing",
};

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  in_progress: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  partially_fulfilled: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

// ── SLA Countdown ─────────────────────────────────────────────────────────────

function SLACountdown({ deadline, status }: { deadline: string; status: string }) {
  if (status === "completed" || status === "denied") {
    return <span className="text-xs text-muted-foreground">Closed</span>;
  }

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isOverdue = diffMs < 0;
  const isUrgent = !isOverdue && diffDays <= 5;

  if (isOverdue) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400" data-testid="sla-overdue">
        <AlertTriangle className="w-3 h-3" />
        Overdue by {Math.abs(diffDays)}d
      </span>
    );
  }

  if (isUrgent) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 dark:text-yellow-400" data-testid="sla-urgent">
        <Clock className="w-3 h-3" />
        {diffDays}d remaining
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="sla-ok">
      <Clock className="w-3 h-3" />
      {diffDays}d remaining
    </span>
  );
}

// ── Status updater dialog ──────────────────────────────────────────────────────

function UpdateStatusDialog({ dsr, canEdit }: { dsr: DataSubjectRequest; canEdit: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(dsr.status);
  const [notes, setNotes] = useState(dsr.response_notes ?? "");

  const mutation = useMutation({
    mutationFn: (data: { status: string; response_notes: string }) =>
      apiRequest("PATCH", `/api/privacy/requests/${dsr.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privacy/requests"] });
      toast({ title: "DSR updated", description: `Status changed to ${status}` });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  if (!canEdit) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-update-dsr-${dsr.id}`}>
          Update Status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update DSR #{dsr.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-dsr-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["received", "under_review", "approved", "in_progress", "completed", "denied", "partially_fulfilled"].map(s => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Response Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Explain the decision or action taken..."
              className="mt-1"
              data-testid="textarea-dsr-notes"
            />
          </div>
          <Button
            onClick={() => mutation.mutate({ status, response_notes: notes })}
            disabled={mutation.isPending}
            className="w-full"
            data-testid="button-confirm-dsr-update"
          >
            {mutation.isPending ? "Saving..." : "Save Update"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Submit new DSR dialog ─────────────────────────────────────────────────────

function SubmitDSRDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState("access");

  const mutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/privacy/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privacy/requests"] });
      toast({ title: "Request submitted", description: "You will be notified within 30 days." });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-submit-dsr">
          <Plus className="w-4 h-4 mr-2" />
          Submit Request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit a Data Subject Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Under GDPR and CCPA, you have the right to access, correct, port, or request erasure of your personal data.
            Requests are handled within 30 days.
          </p>
          <div>
            <Label>Request Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger data-testid="select-new-dsr-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-md">
            {requestType === "erasure" && (
              <p>Note: Some data must be retained for legal and regulatory purposes (e.g., payroll records per IRS requirements). Retained data will be explained in the response.</p>
            )}
            {requestType === "access" && (
              <p>We will compile all personal data we hold about you and provide a structured export within 30 days.</p>
            )}
            {requestType === "portability" && (
              <p>You will receive a machine-readable export (JSON) of your personal data.</p>
            )}
          </div>
          <Button
            onClick={() => mutation.mutate({ request_type: requestType })}
            disabled={mutation.isPending}
            className="w-full"
            data-testid="button-confirm-dsr-submit"
          >
            {mutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── DSR card ──────────────────────────────────────────────────────────────────

function DSRCard({ dsr, canEdit }: { dsr: DataSubjectRequest; canEdit: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = new Date(dsr.sla_deadline) < new Date() && !["completed", "denied"].includes(dsr.status);

  return (
    <Card
      className={isOverdue ? "border-red-300 dark:border-red-700" : ""}
      data-testid={`card-dsr-${dsr.id}`}
    >
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">DSR #{dsr.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[dsr.status] ?? ""}`}
              data-testid={`status-dsr-${dsr.id}`}>
              {dsr.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle className="w-3 h-3" />
                Overdue
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {REQUEST_TYPE_LABELS[dsr.request_type] ?? dsr.request_type}
            {" · "}
            <span className="text-xs">{new Date(dsr.requested_at).toLocaleDateString()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SLACountdown deadline={dsr.sla_deadline} status={dsr.status} />
          <UpdateStatusDialog dsr={dsr} canEdit={canEdit} />
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(e => !e)}
            data-testid={`button-expand-dsr-${dsr.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Requestor</p>
              <p className="font-mono text-xs">{dsr.requestor_id.slice(0, 12)}...</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p>{dsr.requestor_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SLA Deadline</p>
              <p>{new Date(dsr.sla_deadline).toLocaleDateString()}</p>
            </div>
            {dsr.acknowledged_at && (
              <div>
                <p className="text-xs text-muted-foreground">Acknowledged</p>
                <p>{new Date(dsr.acknowledged_at).toLocaleDateString()}</p>
              </div>
            )}
            {dsr.completed_at && (
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p>{new Date(dsr.completed_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {dsr.response_notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Response Notes</p>
              <p className="text-sm bg-muted/30 p-2 rounded-md">{dsr.response_notes}</p>
            </div>
          )}
          {dsr.export_url && dsr.export_expires_at && new Date(dsr.export_expires_at) > new Date() && (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <a
                href={dsr.export_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-emerald-700 dark:text-emerald-300 underline"
                data-testid={`link-dsr-download-${dsr.id}`}
              >
                Download export (expires {new Date(dsr.export_expires_at).toLocaleDateString()})
              </a>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DataSubjectRequests() {
  const { user } = useAuth();
  const role = (user as any)?.role ?? (user as any)?.workspaceRole ?? "officer";
  const isStaff = ["platform_admin", "platform_staff"].includes(role);
  const isManager = ["org_owner", "manager", "compliance_officer"].includes(role) || isStaff;

  const { data, isLoading } = useQuery<{ data: DataSubjectRequest[] }>({
    queryKey: ["/api/privacy/requests"],
  });

  const requests = data?.data ?? [];
  const overdueCount = requests.filter(r =>
    new Date(r.sla_deadline) < new Date() && !["completed", "denied"].includes(r.status)
  ).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <SEO
        title="Data Subject Requests | CoAIleague"
        description="Manage GDPR and CCPA data subject requests including access, erasure, and portability requests."
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Data Subject Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            {isStaff
              ? "Platform-wide GDPR/CCPA request management. 30-day SLA from receipt."
              : "Submit and track your privacy rights requests."}
          </p>
        </div>
        <SubmitDSRDialog />
      </div>

      {overdueCount > 0 && (
        <Card className="border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10" data-testid="overdue-alert">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">
              {overdueCount} request{overdueCount > 1 ? "s are" : " is"} past the 30-day SLA deadline and require immediate attention.
            </p>
          </CardContent>
        </Card>
      )}

      {isStaff && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", count: requests.length, icon: FileText },
            { label: "Pending", count: requests.filter(r => ["received", "under_review", "in_progress"].includes(r.status)).length, icon: Clock },
            { label: "Overdue", count: overdueCount, icon: AlertTriangle },
            { label: "Completed", count: requests.filter(r => r.status === "completed").length, icon: CheckCircle },
          ].map(stat => (
            <Card key={stat.label} data-testid={`stat-dsr-${stat.label.toLowerCase()}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <stat.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-semibold mt-1">{stat.count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-md bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card data-testid="empty-dsr">
          <CardContent className="pt-8 pb-8 text-center">
            <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No privacy requests yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Submit a request to access, correct, or delete personal data and it will appear here for tracking.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(dsr => (
            <DSRCard key={dsr.id} dsr={dsr} canEdit={isManager} />
          ))}
        </div>
      )}
    </div>
  );
}
