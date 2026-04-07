import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, ClipboardList, Clock, CheckCircle2, AlertCircle, FileText, Play, Camera } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-slate-500", icon: FileText },
  pending_assignment: { label: "Pending", color: "bg-yellow-500", icon: Clock },
  active: { label: "Active", color: "bg-blue-500", icon: Play },
  completed: { label: "Completed", color: "bg-green-500", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-500", icon: AlertCircle },
  billed: { label: "Billed", color: "bg-purple-500", icon: FileText },
};

const WORK_ORDER_TYPES = [
  "special_assignment", "escort", "investigation", "event_security", "emergency_deployment", "other"
];

interface WorkOrder {
  id: string;
  title: string;
  work_order_type: string;
  status: string;
  description?: string;
  location?: string;
  estimated_hours?: string;
  actual_hours?: string;
  billing_rate?: string;
  billing_amount?: string;
  assigned_officer_ids?: string[];
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-slate-500", icon: FileText };
  return (
    <Badge className={`${cfg.color} text-white gap-1`}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function CreateWorkOrderDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", workOrderType: "special_assignment", description: "",
    location: "", estimatedHours: "", billingRate: "",
    scheduledStart: "", scheduledEnd: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/work-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setOpen(false);
      setForm({ title: "", workOrderType: "special_assignment", description: "", location: "", estimatedHours: "", billingRate: "", scheduledStart: "", scheduledEnd: "" });
      onCreated();
      toast({ title: "Work order created" });
    },
    onError: () => toast({ title: "Error", description: "Could not create work order.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="default" data-testid="button-create-work-order">
          <Plus className="h-4 w-4 mr-2" /> New Work Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <Input data-testid="input-wo-title" placeholder="Title *" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Select value={form.workOrderType} onValueChange={v => setForm(f => ({ ...f, workOrderType: v }))}>
            <SelectTrigger data-testid="select-wo-type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {WORK_ORDER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea data-testid="input-wo-description" placeholder="Description" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <Input data-testid="input-wo-location" placeholder="Location" value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input data-testid="input-wo-hours" type="number" placeholder="Est. Hours" value={form.estimatedHours}
              onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} />
            <Input data-testid="input-wo-billing-rate" type="number" placeholder="Billing Rate/hr" value={form.billingRate}
              onChange={e => setForm(f => ({ ...f, billingRate: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Scheduled Start</label>
              <Input data-testid="input-wo-start" type="datetime-local" value={form.scheduledStart}
                onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Scheduled End</label>
              <Input data-testid="input-wo-end" type="datetime-local" value={form.scheduledEnd}
                onChange={e => setForm(f => ({ ...f, scheduledEnd: e.target.value }))} />
            </div>
          </div>
        </div>
        <Button data-testid="button-submit-wo" onClick={() => createMutation.mutate({
          ...form,
          estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
          billingRate: form.billingRate ? parseFloat(form.billingRate) : undefined,
          scheduledStart: form.scheduledStart || undefined,
          scheduledEnd: form.scheduledEnd || undefined,
        })} disabled={!form.title || createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create Work Order"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderCard({ wo, onSelect }: { wo: WorkOrder; onSelect: (w: WorkOrder) => void }) {
  return (
    <Card
      data-testid={`card-wo-${wo.id}`}
      className="cursor-pointer hover-elevate"
      onClick={() => onSelect(wo)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate" data-testid={`text-wo-title-${wo.id}`}>{wo.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{wo.work_order_type.replace(/_/g, " ")}</p>
          </div>
          <StatusBadge status={wo.status} />
        </div>
        {wo.location && <p className="text-xs text-muted-foreground mt-2">{wo.location}</p>}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          {wo.estimated_hours && <span><Clock className="h-3 w-3 inline mr-1" />{wo.estimated_hours}h</span>}
          {wo.billing_rate && <span>${wo.billing_rate}/hr</span>}
          {wo.scheduled_start && <span>Starts {new Date(wo.scheduled_start).toLocaleDateString()}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkOrderDetailPanel({ wo }: { wo: WorkOrder }) {
  const { toast } = useToast();

  const activateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/work-orders/${wo.id}/activate`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] }); toast({ title: "Work order activated" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/work-orders/${wo.id}/complete`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] }); toast({ title: "Work order completed" }); },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const { data: evidence } = useQuery<any[]>({
    queryKey: ["/api/work-orders", wo.id, "evidence"],
    queryFn: () => fetch(`/api/work-orders/${wo.id}/evidence`, { credentials: "include" }).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <StatusBadge status={wo.status} />

      <div className="grid gap-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{wo.work_order_type.replace(/_/g, " ")}</span></div>
        {wo.location && <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{wo.location}</span></div>}
        {wo.estimated_hours && <div className="flex justify-between"><span className="text-muted-foreground">Est. Hours</span><span>{wo.estimated_hours}h</span></div>}
        {wo.actual_hours && <div className="flex justify-between"><span className="text-muted-foreground">Actual Hours</span><span>{wo.actual_hours}h</span></div>}
        {wo.billing_rate && <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>${wo.billing_rate}/hr</span></div>}
        {wo.scheduled_start && <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{new Date(wo.scheduled_start).toLocaleString()}</span></div>}
        {wo.scheduled_end && <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{new Date(wo.scheduled_end).toLocaleString()}</span></div>}
      </div>

      {wo.description && (
        <div className="text-sm text-muted-foreground border rounded-md p-2">{wo.description}</div>
      )}

      {(evidence?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">Evidence ({evidence!.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {evidence!.map((e: any) => (
              <div key={e.id} className="text-xs border rounded-md p-2">
                <Camera className="h-3 w-3 inline mr-1" />
                {e.evidence_type} — {new Date(e.captured_at).toLocaleDateString()}
                {e.notes && <p className="text-muted-foreground mt-1">{e.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(wo.status === "draft" || wo.status === "pending_assignment") && (
          <Button size="default" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}
            data-testid="button-activate-wo">
            <Play className="h-4 w-4 mr-1" />
            {activateMutation.isPending ? "Activating..." : "Activate"}
          </Button>
        )}
        {wo.status === "active" && (
          <Button size="default" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
            data-testid="button-complete-wo">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {completeMutation.isPending ? "Completing..." : "Mark Complete"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function WorkOrdersPage() {
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data, isLoading } = useQuery<{ workOrders: WorkOrder[]; total: number }>({
    queryKey: ["/api/work-orders"],
  });

  const { data: analytics } = useQuery<any>({
    queryKey: ["/api/work-orders/analytics/summary"],
  });

  const workOrders = data?.workOrders || [];
  const filtered = workOrders.filter(w => {
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    const matchType = typeFilter === "all" || w.work_order_type === typeFilter;
    return matchStatus && matchType;
  });

  const countByStatus = workOrders.reduce((acc, w) => {
    acc[w.status] = (acc[w.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Work Orders</h1>
            <p className="text-sm text-muted-foreground">Special assignments, escorts, event security</p>
          </div>
          <CreateWorkOrderDialog onCreated={() => {}} />
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {Object.entries(STATUS_CONFIG).slice(0, 4).map(([status, cfg]) => (
            <Card key={status}>
              <CardContent className="p-3 flex items-center gap-2">
                <cfg.icon className={`h-5 w-5 shrink-0 ${status === "draft" ? "text-slate-500" : status === "pending_assignment" ? "text-yellow-500" : status === "active" ? "text-blue-500" : "text-green-500"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  <p className="font-bold text-sm" data-testid={`text-count-${status}`}>{countByStatus[status] ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter" className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger data-testid="select-type-filter" className="w-44">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {WORK_ORDER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="grid gap-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No work orders found.</p>
            <p className="text-xs mt-1">Create your first work order to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(wo => <WorkOrderCard key={wo.id} wo={wo} onSelect={setSelectedWO} />)}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedWO} onOpenChange={open => !open && setSelectedWO(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedWO?.title}</DialogTitle>
          </DialogHeader>
          {selectedWO && <WorkOrderDetailPanel wo={selectedWO} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
