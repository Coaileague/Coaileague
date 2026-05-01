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
import { ArrowLeftRight, Calendar, Clock, CheckCircle2, XCircle, Store, Plus, User } from "lucide-react";

type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled" | "manager_approved" | "manager_rejected";

interface ShiftTrade {
  id: string;
  requesting_officer_id: string;
  requested_shift_id: string;
  offered_shift_id?: string;
  target_officer_id?: string;
  status: TradeStatus;
  reason?: string;
  manager_note?: string;
  requester_first_name?: string;
  requester_last_name?: string;
  target_first_name?: string;
  target_last_name?: string;
  start_time?: string;
  end_time?: string;
  site_name?: string;
  created_at: string;
}

interface Availability {
  id: string;
  officer_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  effective_from?: string;
  effective_until?: string;
}

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const STATUS_CONFIG: Record<TradeStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500" },
  accepted: { label: "Accepted", color: "bg-blue-500" },
  rejected: { label: "Rejected", color: "bg-red-500" },
  cancelled: { label: "Cancelled", color: "bg-slate-500" },
  manager_approved: { label: "Approved", color: "bg-green-500" },
  manager_rejected: { label: "Denied", color: "bg-red-600" },
};

function TradeCard({ trade, onApprove, onReject }: {
  trade: ShiftTrade;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[trade.status] || { label: trade.status, color: "bg-slate-500" };
  return (
    <Card data-testid={`card-trade-${trade.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
                {trade.requester_first_name} {trade.requester_last_name}
              </span>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {trade.target_first_name ? `${trade.target_first_name} ${trade.target_last_name}` : "Open Marketplace"}
              </span>
            </div>
            {trade.site_name && (
              <p className="text-xs text-muted-foreground mt-1">{trade.site_name}</p>
            )}
            {trade.start_time && (
              <p className="text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3 inline mr-1" />
                {new Date(trade.start_time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
            {trade.reason && (
              <p className="text-xs text-muted-foreground mt-1 italic">"{trade.reason}"</p>
            )}
            {trade.manager_note && (
              <p className="text-xs text-muted-foreground mt-1">Manager note: {trade.manager_note}</p>
            )}
          </div>
          <Badge className={`${cfg.color} text-white shrink-0`}>{cfg.label}</Badge>
        </div>

        {(trade.status === "pending" || trade.status === "accepted") && (onApprove || onReject) && (
          <div className="flex gap-2 mt-3">
            {onApprove && (
              <Button size="default" onClick={() => onApprove(trade.id)} data-testid={`button-approve-trade-${trade.id}`}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
            )}
            {onReject && (
              <Button size="default" variant="outline" onClick={() => onReject(trade.id)} data-testid={`button-reject-trade-${trade.id}`}>
                <XCircle className="h-4 w-4 mr-1" /> Deny
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AvailabilityRow({ avail, onDelete }: { avail: Availability; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0 flex-wrap" data-testid={`row-avail-${avail.id}`}>
      <span className="text-sm font-medium w-24 shrink-0">{DAY_NAMES[avail.day_of_week]}</span>
      <span className="text-sm text-muted-foreground">{avail.start_time} – {avail.end_time}</span>
      <Badge variant={avail.is_available ? "default" : "secondary"} className="shrink-0">
        {avail.is_available ? "Available" : "Unavailable"}
      </Badge>
      <Button size="icon" variant="ghost" onClick={() => onDelete(avail.id)} className="ml-auto shrink-0"
        data-testid={`button-delete-avail-${avail.id}`}>
        <XCircle className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AddAvailabilityDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: "1", startTime: "08:00", endTime: "16:00", isAvailable: "true" });

  const createMutation = useMutation({
    mutationFn: (data) => apiRequest("POST", "/api/shift-trading/availability", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-trading/availability"] });
      setOpen(false);
      onCreated();
      toast({ title: "Availability saved" });
    },
    onError: () => toast({ title: "Error saving availability", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="default" variant="outline" data-testid="button-add-availability">
          <Plus className="h-4 w-4 mr-2" /> Add Availability
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Set Availability</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <Select value={form.dayOfWeek} onValueChange={v => setForm(f => ({ ...f, dayOfWeek: v }))}>
            <SelectTrigger data-testid="select-day-of-week">
              <SelectValue placeholder="Day of Week" />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Start Time</label>
              <Input data-testid="input-start-time" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End Time</label>
              <Input data-testid="input-end-time" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          <Select value={form.isAvailable} onValueChange={v => setForm(f => ({ ...f, isAvailable: v }))}>
            <SelectTrigger data-testid="select-availability">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Available</SelectItem>
              <SelectItem value="false">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button data-testid="button-submit-availability" onClick={() => createMutation.mutate({
          dayOfWeek: parseInt(form.dayOfWeek),
          startTime: form.startTime,
          endTime: form.endTime,
          isAvailable: form.isAvailable === "true",
        })} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving..." : "Save Availability"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function ShiftTradingPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"marketplace" | "trades" | "availability">("marketplace");

  const { data: marketplace, isLoading: mktLoading } = useQuery<ShiftTrade[]>({
    queryKey: ["/api/shift-trading/marketplace"],
  });

  const { data: trades, isLoading: tradesLoading } = useQuery<ShiftTrade[]>({
    queryKey: ["/api/shift-trading/trades"],
  });

  const { data: availability, isLoading: availLoading } = useQuery<Availability[]>({
    queryKey: ["/api/shift-trading/availability"],
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/shift-trading/trades/${id}/manager-approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-trading/trades"] });
      toast({ title: "Trade approved — shifts swapped" });
    },
    onError: () => toast({ title: "Error approving trade", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/shift-trading/trades/${id}/manager-reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-trading/trades"] });
      toast({ title: "Trade denied" });
    },
    onError: (error: Error) => {
      toast({
        title: 'Deny Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const acceptTradeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/shift-trading/trades/${id}/accept`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-trading/marketplace"] });
      toast({ title: "You accepted this trade — awaiting manager approval" });
    },
    onError: () => toast({ title: "Error accepting trade", variant: "destructive" }),
  });

  const deleteAvailMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/shift-trading/availability/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/shift-trading/availability"] }); toast({ title: "Availability removed" }); },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const pendingApprovals = (trades || []).filter(t => t.status === "accepted");
  const allTrades = trades || [];

  const tabs = [
    { key: "marketplace", label: "Marketplace", icon: Store },
    { key: "trades", label: `Requests ${pendingApprovals.length > 0 ? `(${pendingApprovals.length})` : ""}`, icon: ArrowLeftRight },
    { key: "availability", label: "My Availability", icon: Calendar },
  ] as const;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h1 className="text-xl font-bold">Shift Trading</h1>
        <p className="text-sm text-muted-foreground">Marketplace, trade requests, and availability management</p>

        <div className="flex gap-1 mt-4">
          {tabs.map(t => (
            <Button
              key={t.key}
              size="default"
              variant={tab === t.key ? "default" : "ghost"}
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
            >
              <t.icon className="h-4 w-4 mr-2" /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "marketplace" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Open Shift Trades</h2>
              <Badge variant="secondary">{(marketplace?.length ?? 0)} open</Badge>
            </div>
            {mktLoading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-md animate-pulse" />)}
              </div>
            ) : (marketplace?.length ?? 0) === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No open trades available</p>
              </div>
            ) : (
              marketplace?.map(trade => (
                <Card key={trade.id} data-testid={`card-market-${trade.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-medium text-sm">{trade.requester_first_name} {trade.requester_last_name}</p>
                        {trade.site_name && <p className="text-xs text-muted-foreground">{trade.site_name}</p>}
                        {trade.start_time && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(trade.start_time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        )}
                        {trade.reason && <p className="text-xs text-muted-foreground italic mt-1">"{trade.reason}"</p>}
                      </div>
                      <Button size="default" onClick={() => acceptTradeMutation.mutate(trade.id)}
                        disabled={acceptTradeMutation.isPending}
                        data-testid={`button-accept-market-${trade.id}`}>
                        Accept Trade
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === "trades" && (
          <div className="space-y-3">
            {pendingApprovals.length > 0 && (
              <div className="mb-4">
                <h2 className="text-sm font-semibold mb-2 text-amber-600">Needs Manager Approval ({pendingApprovals.length})</h2>
                <div className="space-y-2">
                  {pendingApprovals.map(trade => (
                    <TradeCard key={trade.id} trade={trade}
                      onApprove={id => approveMutation.mutate(id)}
                      onReject={id => rejectMutation.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            )}
            <h2 className="text-sm font-semibold">All Trade Requests</h2>
            {tradesLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-md animate-pulse" />)}
              </div>
            ) : allTrades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowLeftRight className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No trade requests</p>
              </div>
            ) : (
              allTrades.map(trade => <TradeCard key={trade.id} trade={trade} />)
            )}
          </div>
        )}

        {tab === "availability" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">My Weekly Availability</h2>
              <AddAvailabilityDialog onCreated={() => {}} />
            </div>

            {availLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (availability?.length ?? 0) === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No availability set</p>
                <p className="text-xs mt-1">Add your weekly availability to help managers schedule you effectively.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-4">
                  {availability?.map(a => (
                    <AvailabilityRow key={a.id} avail={a} onDelete={id => deleteAvailMutation.mutate(id)} />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
